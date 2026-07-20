import type http from "node:http";

import WebSocket, { type RawData, WebSocketServer } from "ws";

import { dispatchMessage } from "../dispatcher/messageDispatcher";
import { ERROR_MESSAGES, type ErrorCode } from "../errors/errorMessages";
import { createChatHandler } from "../handlers/chatHandler";
import { createHistoryHandler } from "../handlers/historyHandler";
import { createRegisterHandler } from "../handlers/registerHandler";
import { logHeartbeat, startHeartbeat } from "../heartbeat/heartbeat";
import { parseClientMessage } from "../parser/messageParser";
import { enqueueMessage } from "../queue/messageQueue";
import type { MessageRepository } from "../repositories/messageRepository";
import createRoomService from "../service/roomService";
import type { MessageHandlers, SendError, SendJson } from "../types/handler";
import type { ServerMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";

export interface ChatDependencies {
  messageRepository: MessageRepository;
  heartbeatIntervalMs: number;
  maxPayloadBytes: number;
  createTimestamp?: () => string;
}

export interface ChatRuntime {
  close(): Promise<void>;
}

export function attachChatRuntime(
  server: http.Server,
  dependencies: ChatDependencies,
): ChatRuntime {
  const createTimestamp = dependencies.createTimestamp ?? (() => new Date().toISOString());
  const webSocketServer = new WebSocketServer({
    server,
    maxPayload: dependencies.maxPayloadBytes,
  });
  const roomService = createRoomService(webSocketServer);

  const sendJson: SendJson = (socket, payload) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket이 열린 상태가 아닙니다."));
      return;
    }
    socket.send(JSON.stringify(payload), (error) => error ? reject(error) : resolve());
  });

  const sendError: SendError = (socket, code) => sendJson(socket, {
    type: "error",
    code,
    message: ERROR_MESSAGES[code],
    createdAt: createTimestamp(),
  });

  async function sendErrorSafely(socket: ChatWebSocket, code: ErrorCode): Promise<void> {
    await sendError(socket, code).catch((error) => {
      console.error("오류 응답 전송 실패:", error);
    });
  }

  async function sendRoomHistory(socket: ChatWebSocket, roomId: string): Promise<void> {
    const page = await dependencies.messageRepository.get(roomId);
    await sendJson(socket, {
      type: "history",
      room_id: roomId,
      messages: page.messages,
      hasMore: page.hasMore,
      nextBeforeId: page.nextBeforeId,
      createdAt: createTimestamp(),
    });
  }

  const handlers: MessageHandlers = {
    register: createRegisterHandler({
      roomService,
      sendJson,
      sendError,
      sendRoomHistory,
      createTimestamp,
    }),
    chat: createChatHandler({
      roomService,
      messageRepository: dependencies.messageRepository,
      sendError,
      createTimestamp,
    }),
    history: createHistoryHandler({
      messageRepository: dependencies.messageRepository,
      sendJson,
      sendError,
      createTimestamp,
    }),
  };

  async function handleMessage(socket: ChatWebSocket, rawMessage: RawData): Promise<void> {
    const message = parseClientMessage(rawMessage);
    if (!message) {
      await sendErrorSafely(socket, "MESSAGE_PARSE_FAILED");
      return;
    }

    try {
      await dispatchMessage(socket, message, handlers);
    } catch (error) {
      console.error("메시지 처리 중 오류 발생:", error);
      await sendErrorSafely(socket, "INTERNAL_SERVER_ERROR");
    }
  }

  function handleClose(socket: ChatWebSocket): void {
    socket.isClosed = true;
    const nickname = socket.nickname;
    const roomId = roomService.leave(socket);
    if (!nickname || !roomId) return;

    roomService.broadcastToRoom(roomId, {
      type: "notification",
      room_id: roomId,
      message: `${nickname}님이 퇴장했습니다.`,
      roomConnectionCount: roomService.getConnectionCount(roomId),
      roomUserCount: roomService.getUserCount(roomId),
      createdAt: createTimestamp(),
    });
  }

  webSocketServer.on("connection", (connection) => {
    const socket = connection as ChatWebSocket;
    socket.userId = null;
    socket.nickname = null;
    socket.room_id = null;
    socket.messageQueue = Promise.resolve();
    socket.isClosed = false;
    socket.isAlive = true;

    const welcome: ServerMessage = {
      type: "connection",
      message: "서버에 연결되었습니다.",
      createdAt: createTimestamp(),
    };
    void sendJson(socket, welcome).catch((error) => {
      console.error("연결 안내 메시지 전송 실패:", error);
    });

    socket.on("message", (rawMessage) => {
      enqueueMessage(
        socket,
        () => handleMessage(socket, rawMessage),
        async (error) => {
          console.error("메시지 queue 처리 실패:", error);
          await sendErrorSafely(socket, "INTERNAL_SERVER_ERROR");
        },
      );
    });
    socket.on("pong", () => {
      socket.isAlive = true;
      logHeartbeat("pong", socket);
    });
    socket.on("close", () => handleClose(socket));
    socket.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
        console.error("WebSocket 연결 에러:", error);
      }
    });
  });

  const heartbeatTimer = startHeartbeat(webSocketServer, dependencies.heartbeatIntervalMs);
  let closed = false;

  return {
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      clearInterval(heartbeatTimer);
      webSocketServer.clients.forEach((client) => client.terminate());
      await new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
