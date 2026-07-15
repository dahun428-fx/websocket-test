import WebSocket, { type WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    logHeartbeat,
    resolveHeartbeatIntervalMs,
    runHeartbeat,
} from "./heartbeat";
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

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

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

describe("resolveHeartbeatIntervalMs", () => {
    it("uses 30 seconds when no interval is configured", () => {
        expect(resolveHeartbeatIntervalMs(undefined)).toBe(30_000);
    });

    it("uses a configured positive interval", () => {
        expect(resolveHeartbeatIntervalMs("250")).toBe(250);
    });

    it.each(["0", "-1", "not-a-number"])(
        "falls back to 30 seconds for invalid interval %s",
        (value) => {
            expect(resolveHeartbeatIntervalMs(value)).toBe(30_000);
        },
    );
});

describe("logHeartbeat", () => {
    it("does not log when heartbeat debugging is disabled", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const client = createClient({ isAlive: true });

        logHeartbeat("ping", client);

        expect(debug).not.toHaveBeenCalled();
    });

    it("logs ping and connection context when heartbeat debugging is enabled", () => {
        vi.stubEnv("HEARTBEAT_DEBUG", "true");
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const client = createClient({ isAlive: true });
        client.nickname = "neo";
        client.room_id = "room-1";

        logHeartbeat("ping", client);

        expect(debug).toHaveBeenCalledWith("[heartbeat] ping 전송", {
            nickname: "neo",
            roomId: "room-1",
        });
    });

    it("logs pong receipt when heartbeat debugging is enabled", () => {
        vi.stubEnv("HEARTBEAT_DEBUG", "true");
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const client = createClient({ isAlive: true });

        logHeartbeat("pong", client);

        expect(debug).toHaveBeenCalledWith("[heartbeat] pong 수신", {
            nickname: null,
            roomId: null,
        });
    });
});
