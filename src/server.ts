import http, { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import WebSocket, { RawData, WebSocketServer } from "ws";

import { messageRepository } from "./repositories/messageRepository";
import createRoomService from "./service/roomService";
import type { ChatWebSocket } from "./types/websocket";
import type {
    ServerMessage,
} from "./types/messages";
import type { MessageHandlerContext } from "./types/handler";
import { parseClientMessage } from "./parser/messageParser";
import { dispatchMessage } from "./dispatcher/messageDispatcher";
import { enqueueMessage } from "./queue/messageQueue";
import { ERROR_MESSAGES } from "./errors/errorMessages";
import type { ErrorCode } from "./errors/errorMessages";

const PORT = process.env.PORT ?? 3009;

const server = http.createServer(
    (_req: IncomingMessage, res: ServerResponse) => {
        const filePath = path.join(__dirname, "..", "public", "index.html");

        fs.readFile(filePath, (error, data) => {
            if (error) {
                console.error("index.html 읽기 실패:", error);
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Server Error");
                return;
            }

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data);
        });
    },
);

const wss = new WebSocketServer({ server });
const roomService = createRoomService(wss);

function sendJson(ws: ChatWebSocket, payload: ServerMessage): Promise<void> {
    return new Promise((resolve, reject) => {
        if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket이 열린 상태가 아니므로 메시지를 전송할 수 없습니다."));
            return;
        }

        ws.send(JSON.stringify(payload), (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function createTimestamp(): string {
    return new Date().toISOString();
}

function sendError(ws: ChatWebSocket, code: ErrorCode): Promise<void> {
    return sendJson(ws, {
        type: "error",
        code,
        message: ERROR_MESSAGES[code],
        createdAt: createTimestamp(),
    });
}

async function sendErrorSafely(
    ws: ChatWebSocket,
    code: ErrorCode,
): Promise<void> {
    try {
        await sendError(ws, code);
    } catch (error) {
        console.error("오류 응답 전송 실패:", error);
    }
}

async function sendRoomHistory(ws: ChatWebSocket, roomId: string): Promise<void> {
    const messages = await messageRepository.get(roomId);
    return sendJson(ws, {
        type: "history",
        room_id: roomId,
        messages,
        createdAt: createTimestamp(),
    });
}

const messageHandlerContext: MessageHandlerContext = {
    roomService,
    messageRepository,
    sendJson,
    sendError,
    sendRoomHistory,
    createTimestamp,
};

async function handleMessage(ws: ChatWebSocket, rawMessage: RawData): Promise<void> {
    const data = parseClientMessage(rawMessage);
    if (!data) {
        await sendErrorSafely(ws, "MESSAGE_PARSE_FAILED");
        return;
    }
    try {
        await dispatchMessage(ws, data, messageHandlerContext);
    } catch (error) {
        console.error("메시지 처리 중 오류 발생:", error);
        await sendErrorSafely(ws, "INTERNAL_SERVER_ERROR");
    }
}

function handleClose(ws: ChatWebSocket): void {
    const nickname = ws.nickname;
    const roomId = ws.room_id;
    roomService.leave(ws);
    console.log("클라이언트 연결 종료");
    console.log("현재 전체 WebSocket 연결 수:", wss.clients.size);

    if (!nickname || !roomId) return;

    const roomConnectionCount = roomService.getConnectionCount(roomId);
    console.log(`${roomId}방 연결 수:`, roomConnectionCount);
    roomService.broadcastToRoom(roomId, {
        type: "notification",
        room_id: roomId,
        message: `${nickname}님이 퇴장했습니다.`,
        roomConnectionCount,
        createdAt: createTimestamp(),
    });
}

wss.on("connection", (connection) => {
    const ws = connection as ChatWebSocket;
    ws.nickname = null;
    ws.room_id = null;
    ws.messageQueue = Promise.resolve();
    ws.isClosing = false;
    console.log("새로운 클라이언트 연결");
    console.log("현재 전체 WebSocket 연결 수:", wss.clients.size);
    void sendJson(ws, {
        type: "connection",
        message: "서버에 연결되었습니다.",
        createdAt: createTimestamp(),
    }).catch((error) => {
        console.error("연결 안내 메시지 전송 실패:", error);
    });
    ws.on("message", (rawMessage) => {
        enqueueMessage(ws, () => handleMessage(ws, rawMessage), async (error) => {
                console.error("메시지 queue 처리 실패:", error);
                await sendErrorSafely(ws, "INTERNAL_SERVER_ERROR");
        });
    });
    ws.on("close", () => {
        ws.isClosing = true;
        handleClose(ws);
    });
    ws.on("error", (error) => console.error("WebSocket 연결 에러:", error));
});

server.listen(PORT, () => {
    console.log(`서버 실행: http://localhost:${PORT}`);
});
