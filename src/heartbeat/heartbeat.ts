import WebSocket, { type WebSocketServer } from "ws";

import type { ChatWebSocket } from "../types/websocket";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
type HeartbeatEvent = "ping" | "pong";

export function resolveHeartbeatIntervalMs(value: string | undefined): number {
    const intervalMs = Number(value);

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        return DEFAULT_HEARTBEAT_INTERVAL_MS;
    }

    return intervalMs;
}

export function logHeartbeat(event: HeartbeatEvent, ws: ChatWebSocket): void {
    if (process.env.HEARTBEAT_DEBUG !== "true") {
        return;
    }

    const direction = event === "ping" ? "전송" : "수신";
    console.debug(`[heartbeat] ${event} ${direction}`, {
        nickname: ws.nickname,
        roomId: ws.room_id,
    });
}

export function runHeartbeat(wss: WebSocketServer): void {
    wss.clients.forEach((client) => {
        const ws = client as ChatWebSocket;

        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }

        if (!ws.isAlive) {
            console.warn(
                "Heartbeat 응답이 없어 연결을 종료합니다.",
                {
                    nickname: ws.nickname,
                    roomId: ws.room_id,
                },
            );
            ws.terminate();
            return;
        }

        ws.isAlive = false;
        logHeartbeat("ping", ws);
        ws.ping();
    });
}

export function startHeartbeat(
    wss: WebSocketServer,
    intervalMs: number,
): NodeJS.Timeout {
    return setInterval(() => runHeartbeat(wss), intervalMs);
}
