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

function sendJson(ws: ChatWebSocket, payload: ServerMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
        console.error("WebSocket이 열린 상태가 아니므로 메시지를 전송할 수 없습니다.");
        return false;
    }

    ws.send(JSON.stringify(payload));
    return true;
}

function createTimestamp(): string {
    return new Date().toISOString();
}

function sendError(ws: ChatWebSocket, code: ErrorCode): boolean {
    return sendJson(ws, {
        type: "error",
        code,
        message: ERROR_MESSAGES[code],
        createdAt: createTimestamp(),
    });
}

function sendRoomHistory(ws: ChatWebSocket, roomId: string): boolean {
    return sendJson(ws, {
        type: "history",
        room_id: roomId,
        messages: messageRepository.get(roomId),
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

function handleMessage(ws: ChatWebSocket, rawMessage: RawData): void {
    const data = parseClientMessage(rawMessage);
    if (!data) {
        sendError(ws, "MESSAGE_PARSE_FAILED");
        return;
    }

    dispatchMessage(ws, data, messageHandlerContext);
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
    console.log("새로운 클라이언트 연결");
    console.log("현재 전체 WebSocket 연결 수:", wss.clients.size);
    sendJson(ws, {
        type: "connection",
        message: "서버에 연결되었습니다.",
        createdAt: createTimestamp(),
    });
    ws.on("message", (rawMessage) => handleMessage(ws, rawMessage));
    ws.on("close", () => handleClose(ws));
    ws.on("error", (error) => console.error("WebSocket 연결 에러:", error));
});

server.listen(PORT, () => {
    console.log(`서버 실행: http://localhost:${PORT}`);
});
