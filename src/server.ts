import http, { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import WebSocket, { RawData, WebSocketServer } from "ws";

import * as messageRepository from "./repositories/messageRepository";
import createRoomService from "./service/roomService";
import type { ChatWebSocket } from "./types/websocket";
import type {
    ChatMessage,
    RegisterMessage,
    ServerMessage,
} from "./types/messages";
import { parseClientMessage } from "./parser/messageParser";

const PORT = process.env.PORT ?? 3008;

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

function sendError(ws: ChatWebSocket, message: string): boolean {
    return sendJson(ws, { type: "error", message, createdAt: createTimestamp() });
}

function sendRoomHistory(ws: ChatWebSocket, roomId: string): boolean {
    return sendJson(ws, {
        type: "history",
        room_id: roomId,
        messages: messageRepository.get(roomId),
        createdAt: createTimestamp(),
    });
}

function handleRegister(ws: ChatWebSocket, data: RegisterMessage): boolean {
    if (ws.nickname || ws.room_id) {
        sendError(ws, "이미 닉네임을 등록하고 방에 입장한 상태입니다.");
        return false;
    }

    if (typeof data.nickname !== "string") {
        sendError(ws, "닉네임은 문자열이어야 합니다.");
        return false;
    }

    if (typeof data.room_id !== "string") {
        sendError(ws, "방 ID는 문자열이어야 합니다.");
        return false;
    }

    const nickname = data.nickname.trim();
    const roomId = data.room_id.trim();
    if (!nickname) {
        sendError(ws, "닉네임을 입력하세요.");
        return false;
    }
    if (!roomId) {
        sendError(ws, "방 ID를 입력하세요.");
        return false;
    }
    if (nickname.length > 20) {
        sendError(ws, "닉네임은 20자 이하로 입력하세요.");
        return false;
    }
    if (roomId.length > 20) {
        sendError(ws, "방 ID는 20자 이하로 입력하세요.");
        return false;
    }

    const registerMessage: RegisterMessage = {
        type: "register",
        nickname,
        room_id: roomId,
    };
    ws.nickname = registerMessage.nickname;
    roomService.join(ws, registerMessage.room_id);

    const joinedRoomId = ws.room_id;
    if (!joinedRoomId) {
        return false;
    }

    const roomConnectionCount = roomService.getConnectionCount(joinedRoomId);
    console.log(`등록 완료: nickname=${ws.nickname}, room_id=${joinedRoomId}`);
    console.log(`${joinedRoomId}방 연결 수:`, roomConnectionCount);

    sendJson(ws, {
        type: "register-success",
        nickname: ws.nickname,
        room_id: joinedRoomId,
        roomConnectionCount,
        message: `${joinedRoomId}방에 ${ws.nickname} 닉네임으로 입장했습니다.`,
        createdAt: createTimestamp(),
    });
    sendRoomHistory(ws, joinedRoomId);
    roomService.broadcastToRoom(joinedRoomId, {
        type: "notification",
        room_id: joinedRoomId,
        message: `${ws.nickname}님이 입장했습니다.`,
        roomConnectionCount,
        createdAt: createTimestamp(),
    });
    return true;
}

function handleChat(ws: ChatWebSocket, data: ChatMessage): boolean {
    if (!ws.nickname) {
        sendError(ws, "먼저 닉네임을 등록하세요.");
        return false;
    }
    if (!ws.room_id) {
        sendError(ws, "먼저 채팅방에 입장하세요.");
        return false;
    }
    if (typeof data.message !== "string") {
        sendError(ws, "메시지는 문자열이어야 합니다.");
        return false;
    }

    const message = data.message.trim();
    if (!message) {
        sendError(ws, "메시지를 입력하세요.");
        return false;
    }
    if (message.length > 1000) {
        sendError(ws, "메시지는 1000자 이하로 입력하세요.");
        return false;
    }

    const chatMessage: ChatMessage = {
        type: "chat",
        nickname: ws.nickname,
        room_id: ws.room_id,
        message,
        createdAt: createTimestamp(),
    };
    console.log(`${ws.room_id}방에 저장하고 브로드캐스트할 채팅:`, chatMessage);
    messageRepository.save(ws.room_id, chatMessage);
    roomService.broadcastToRoom(ws.room_id, chatMessage);
    return true;
}

function rawDataToText(rawMessage: RawData): string {
    if (Array.isArray(rawMessage)) {
        return Buffer.concat(rawMessage).toString();
    }
    if (rawMessage instanceof ArrayBuffer) {
        return new TextDecoder().decode(rawMessage);
    }
    return rawMessage.toString();
}


function handleMessage(ws: ChatWebSocket, rawMessage: RawData): void {
    const data = parseClientMessage(rawMessage);
    if (!data) return;

    switch (data.type) {
        case "register":
            handleRegister(ws, data);
            return;
        case "chat":
            handleChat(ws, data);
            return;
        default:
            sendError(ws, `지원하지 않는 메시지 타입입니다: ${data.type}`);
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
