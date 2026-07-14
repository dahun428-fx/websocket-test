import WebSocket, { type WebSocketServer } from "ws";
import { describe, expect, it, vi } from "vitest";

import createRoomService from "./roomService";
import type { ChatWebSocket } from "../types/websocket";

function createClient(roomId: string | null, isOpen = true): ChatWebSocket {
    return {
        nickname: null,
        room_id: roomId,
        readyState: isOpen ? WebSocket.OPEN : WebSocket.CLOSED,
        send: vi.fn(),
    } as unknown as ChatWebSocket;
}

describe("roomService", () => {
    it("joins, leaves, counts, and returns only open clients in a room", () => {
        const first = createClient("room-1");
        const closed = createClient("room-1", false);
        const otherRoom = createClient("room-2");
        const wss = { clients: new Set([first, closed, otherRoom]) } as unknown as WebSocketServer;
        const service = createRoomService(wss);

        expect(service.getConnectionCount("room-1")).toBe(1);
        expect(service.getClients("room-1")).toEqual([first]);
        expect(service.join(first, " room-3 ")).toBe("room-3");
        expect(service.leave(first)).toBe("room-3");
        expect(first.room_id).toBeNull();
    });

    it("broadcasts only to open clients in the selected room", () => {
        const target = createClient("room-1");
        const closed = createClient("room-1", false);
        const otherRoom = createClient("room-2");
        const wss = { clients: new Set([target, closed, otherRoom]) } as unknown as WebSocketServer;
        const service = createRoomService(wss);

        const sent = service.broadcastToRoom("room-1", {
            type: "notification",
            room_id: "room-1",
            roomConnectionCount: 1,
            message: "joined",
            createdAt: "2026-01-01T00:00:00.000Z",
        });

        expect(sent).toBe(1);
        expect(target.send).toHaveBeenCalledOnce();
        expect(closed.send).not.toHaveBeenCalled();
        expect(otherRoom.send).not.toHaveBeenCalled();
    });
});
