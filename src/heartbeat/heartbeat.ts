import WebSocket, { type WebSocketServer } from "ws";

import type { ChatWebSocket } from "../types/websocket";

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
        ws.ping();
    });
}

export function startHeartbeat(
    wss: WebSocketServer,
    intervalMs: number,
): NodeJS.Timeout {
    return setInterval(() => runHeartbeat(wss), intervalMs);
}
