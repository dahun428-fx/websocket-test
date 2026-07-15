import WebSocket, { type WebSocketServer } from "ws";
import { describe, expect, it, vi } from "vitest";

import { runHeartbeat } from "./heartbeat";
import type { ChatWebSocket } from "../types/websocket";

function createClient(options: {
    isAlive: boolean;
    readyState?: number;
}): ChatWebSocket {
    return {
        isAlive: options.isAlive,
        readyState: options.readyState ?? WebSocket.OPEN,
        nickname: null,
        room_id: null,
        ping: vi.fn(),
        terminate: vi.fn(),
    } as unknown as ChatWebSocket;
}

describe("runHeartbeat", () => {
    it("pings an alive open client and waits for its next pong", () => {
        const client = createClient({ isAlive: true });
        const wss = { clients: new Set([client]) } as unknown as WebSocketServer;

        runHeartbeat(wss);

        expect(client.ping).toHaveBeenCalledOnce();
        expect(client.terminate).not.toHaveBeenCalled();
        expect(client.isAlive).toBe(false);
    });

    it("terminates an open client that did not answer the previous ping", () => {
        const client = createClient({ isAlive: false });
        const wss = { clients: new Set([client]) } as unknown as WebSocketServer;

        runHeartbeat(wss);

        expect(client.terminate).toHaveBeenCalledOnce();
        expect(client.ping).not.toHaveBeenCalled();
    });

    it("ignores clients that are no longer open", () => {
        const client = createClient({
            isAlive: false,
            readyState: WebSocket.CLOSED,
        });
        const wss = { clients: new Set([client]) } as unknown as WebSocketServer;

        runHeartbeat(wss);

        expect(client.terminate).not.toHaveBeenCalled();
        expect(client.ping).not.toHaveBeenCalled();
    });
});
