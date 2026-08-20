import { randomUUID } from "node:crypto";

import WebSocket, { type RawData, type WebSocketServer } from "ws";

import { ApplicationError } from "../application/errors/applicationError";
import type { UnitOfWork } from "../application/unitOfWork";
import { dispatchMessage } from "../dispatcher/messageDispatcher";
import { ERROR_MESSAGES, type ErrorCode } from "../errors/errorMessages";
import { createChatHandler } from "../handlers/chatHandler";
import { createHistoryHandler } from "../handlers/historyHandler";
import { createRegisterHandler } from "../handlers/registerHandler";
import { logHeartbeat, startHeartbeat } from "../heartbeat/heartbeat";
import type { Logger } from "../logging/logger";
import type { OutboxEventPublisher } from "../outbox/outboxEventPublisher";
import {
  createPresenceHeartbeat,
  type PresenceHeartbeat,
} from "../presence/presenceHeartbeat";
import type { PresenceRepository } from "../presence/presenceRepository";
import { parseClientMessage } from "../parser/messageParser";
import { enqueueMessage } from "../queue/messageQueue";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import type { MessageHandlers, SendError, SendJson } from "../types/handler";
import type { ServerMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";
import type { AccessTokenPayload } from "../types/auth";
import { mapApplicationErrorToWebSocket } from "../websocket/applicationErrorMapper";
import type { ConnectionRegistry } from "../websocket/connectionRegistry";
import { Metrics } from "../metrics/metrics";

export interface ChatDependencies {
  messageRepository: MessageRepository;
  unitOfWork: UnitOfWork;
  outboxEventPublisher: OutboxEventPublisher;
  heartbeatIntervalMs: number;
  createTimestamp?: () => string;
  verifyAccessToken(token: string): AccessTokenPayload;
  heartbeatDebug: boolean;
  logger: Logger;
  roomService: RoomService;
  connectionRegistry: ConnectionRegistry;
  presenceRepository: PresenceRepository;
  presenceHeartbeatIntervalMs: number;
  serverId: string;
  metrics: Metrics;
}

export interface ChatRuntime {
  close(): Promise<void>;
}

export function attachChatRuntime(
  webSocketServer: WebSocketServer,
  dependencies: ChatDependencies,
): ChatRuntime {
  const createTimestamp = dependencies.createTimestamp ?? (() => new Date().toISOString());
  webSocketServer.on("error", (error) => {
    dependencies.logger.error("WebSocket server error", { error });
  });
  const roomService = dependencies.roomService;
  const presenceHeartbeats = new Map<string, PresenceHeartbeat>();
  const pendingPresenceTasks = new Set<Promise<void>>();

  function trackPresenceTask(task: Promise<void>): void {
    pendingPresenceTasks.add(task);
    void task.finally(() => pendingPresenceTasks.delete(task));
  }

  const sendJson: SendJson = (socket, payload) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      dependencies.metrics.webSocketMessageSendFailed("direct")

      reject(new Error("WebSocket이 열린 상태가 아닙니다."));
      return;
    }
    socket.send(JSON.stringify(payload), (error) => {
      if (error) {
        dependencies.metrics.webSocketMessageSendFailed("direct")
        reject(error)
        return;
      }
      dependencies.metrics.webSocketMessageSent("direct")
      resolve();
    });
  });

  const sendError: SendError = (socket, code) => sendJson(socket, {
    type: "error",
    code,
    message: ERROR_MESSAGES[code],
    createdAt: createTimestamp(),
  });

  async function sendErrorSafely(
    socket: ChatWebSocket,
    logger: Logger,
    code: ErrorCode,
  ): Promise<void> {
    await sendError(socket, code).catch((error) => {
      logger.error("WebSocket error response failed", { error });
    });
  }

  async function sendApplicationErrorSafely(
    socket: ChatWebSocket,
    logger: Logger,
    error: ApplicationError,
  ): Promise<void> {
    await sendJson(
      socket,
      mapApplicationErrorToWebSocket(error, createTimestamp()),
    ).catch((sendFailure) => {
      logger.error("WebSocket application error response failed", {
        error: sendFailure,
      });
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
      verifyAccessToken: dependencies.verifyAccessToken,
      onRegistered: async (socket) => {
        await dependencies.presenceRepository.register({
          connectionId: socket.connectionId,
          userId: socket.userId!,
          serverId: dependencies.serverId,
          connectedAt: socket.connectedAt,
          lastSeenAt: createTimestamp(),
          roomId: socket.room_id,
        });
        const heartbeat = createPresenceHeartbeat({
          record: () => ({
            connectionId: socket.connectionId,
            userId: socket.userId!,
            serverId: dependencies.serverId,
            connectedAt: socket.connectedAt,
            lastSeenAt: createTimestamp(),
            roomId: socket.room_id,
          }),
          intervalMs: dependencies.presenceHeartbeatIntervalMs,
          presenceRepository: dependencies.presenceRepository,
          logger: dependencies.logger,
        });
        presenceHeartbeats.set(socket.connectionId, heartbeat);
        heartbeat.start();
      },
    }),
    chat: createChatHandler({
      roomService,
      messageRepository: dependencies.messageRepository,
      unitOfWork: dependencies.unitOfWork,
      outboxEventPublisher: dependencies.outboxEventPublisher,
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

  async function handleMessage(
    socket: ChatWebSocket,
    logger: Logger,
    rawMessage: RawData,
  ): Promise<void> {
    const message = parseClientMessage(rawMessage);
    if (!message) {

      dependencies.metrics.webSocketMessageParseFailed();

      await sendErrorSafely(socket, logger, "MESSAGE_PARSE_FAILED");
      return;
    }

    try {
      await dispatchMessage(socket, message, handlers);
    } catch (error) {
      if (error instanceof ApplicationError) {
        dependencies.metrics.webSocketMessageHandlingFailed("application")

        logger.warn("WebSocket operation failed", {
          errorCode: error.code,
        });
        await sendApplicationErrorSafely(socket, logger, error);
        return;
      }

      dependencies.metrics.webSocketMessageHandlingFailed("unexpected")

      logger.error("WebSocket message handling failed", { error });
      await sendErrorSafely(socket, logger, "INTERNAL_SERVER_ERROR");
    }
  }

  async function handleClose(
    socket: ChatWebSocket,
    logger: Logger,
    closeCode: number,
  ): Promise<void> {
    socket.isClosed = true;
    logger.info("WebSocket disconnected", { closeCode });
    const nickname = socket.nickname;
    const userId = socket.userId;
    const roomId = roomService.leave(socket);
    dependencies.connectionRegistry.remove(socket.connectionId);
    dependencies.metrics.webSocketConnectionClosed();
    presenceHeartbeats.get(socket.connectionId)?.stop();
    presenceHeartbeats.delete(socket.connectionId);
    if (userId) {
      await dependencies.presenceRepository.unregister({
        connectionId: socket.connectionId,
        userId,
        roomId,
      });
    }
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
    socket.connectionId = randomUUID();
    socket.connectedAt = createTimestamp();
    socket.userId = null;
    socket.nickname = null;
    socket.room_id = null;
    socket.messageQueue = Promise.resolve();
    socket.isClosed = false;
    socket.isAlive = true;
    dependencies.connectionRegistry.add(socket);
    dependencies.metrics.webSocketConnectionOpened();
    const connectionLogger = dependencies.logger.child({ connectionId: socket.connectionId });

    connectionLogger.info("WebSocket connected");

    const welcome: ServerMessage = {
      type: "connection",
      message: "서버에 연결되었습니다.",
      createdAt: createTimestamp(),
    };
    void sendJson(socket, welcome).catch((error) => {
      connectionLogger.error("WebSocket welcome message failed", { error });
    });

    socket.on("message", (rawMessage) => {

      dependencies.metrics.webSocketMessageReceived();

      enqueueMessage(
        socket,
        () => handleMessage(socket, connectionLogger, rawMessage),
        async (error) => {
          connectionLogger.error("WebSocket message queue failed", { error });
          await sendErrorSafely(socket, connectionLogger, "INTERNAL_SERVER_ERROR");
        },
      );
    });
    socket.on("pong", () => {
      socket.isAlive = true;
      logHeartbeat("pong", socket, dependencies.logger, dependencies.heartbeatDebug);
    });
    socket.on("close", (closeCode) => {
      const task = handleClose(socket, connectionLogger, closeCode).catch(
        (error) => {
          connectionLogger.warn("WebSocket presence cleanup failed", { error });
        },
      );
      trackPresenceTask(task);
    });
    socket.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
        connectionLogger.error("WebSocket connection error", { error });
      }
    });
  });

  const heartbeatTimer = startHeartbeat(
    webSocketServer,
    dependencies.heartbeatIntervalMs,
    dependencies.logger,
    dependencies.heartbeatDebug,
  );
  let closed = false;

  return {
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      clearInterval(heartbeatTimer);
      for (const heartbeat of presenceHeartbeats.values()) heartbeat.stop();
      await dependencies.connectionRegistry.closeAll();
      webSocketServer.clients.forEach((client) => client.terminate());
      await Promise.allSettled([...pendingPresenceTasks]);
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
