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
import { closeDatabase, initializeDatabase } from "./database/database";
import {
    logHeartbeat,
    resolveHeartbeatIntervalMs,
    startHeartbeat,
} from "./heartbeat/heartbeat";

const PORT = Number(process.env.PORT) || 3010;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = resolveHeartbeatIntervalMs(
    process.env.HEARTBEAT_INTERVAL_MS,
);

let isShuttingDown = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

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
    const historyPage = await messageRepository.get(roomId);
    const { messages, hasMore, nextBeforeId } = historyPage;
    return sendJson(ws, {
        type: "history",
        room_id: roomId,
        messages,
        hasMore,
        nextBeforeId,
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
    ws.isClosed = true;

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
    ws.userId = null;
    ws.nickname = null;
    ws.room_id = null;
    ws.messageQueue = Promise.resolve();
    ws.isClosed = false;
    ws.isAlive = true;
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

    ws.on("pong", () => {
        ws.isAlive = true;
        logHeartbeat("pong", ws);
    });

    ws.on("close", () => handleClose(ws));
    ws.on("error", (error) => console.error("WebSocket 연결 에러:", error));
});

async function startServer(): Promise<void> {
    try {
        await initializeDatabase();

        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(PORT, () => {
                server.off("error", reject);
                heartbeatTimer = startHeartbeat(wss, HEARTBEAT_INTERVAL_MS);
                console.log(`서버 실행: http://localhost:${PORT}`);
                resolve();
            });
        });
    } catch (error) {
        console.error("서버 시작 중 오류 발생:", error);
        await closeDatabase();
        throw error;
    }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    console.log(`\n${signal} 신호 수신, 서버 종료 중...`);

    wss.clients.forEach((client) => {
        client.close(1001, "Server shutting down");
    });

    const forceTerminateTimer = setTimeout(() => {
        wss.clients.forEach((client) => {
            client.terminate();
        });
    }, SHUTDOWN_TIMEOUT_MS);
    forceTerminateTimer.unref();

    try {
        await new Promise<void>((resolve, reject) => {
            wss.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        await closeDatabase();
    } catch (error) {
        console.error("서버 종료 실패:", error);
        process.exitCode = 1;
    } finally {
        clearTimeout(forceTerminateTimer);
    }
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

if (require.main === module) {
    void startServer().catch(() => {
        process.exitCode = 1;
    });
}

export { server, startServer, shutdown };
