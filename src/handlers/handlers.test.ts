import { describe, expect, it, vi } from "vitest";

import { chatHandler } from "./chatHandler";
import { registerHandler } from "./registerHandler";
import type { MessageHandlerContext } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

function createContext(): MessageHandlerContext {
    return {
        roomService: {
            broadcastToRoom: vi.fn(() => 1),
            getConnectionCount: vi.fn(() => 1),
            getClients: vi.fn(() => []),
            join: vi.fn((ws, roomId) => {
                ws.room_id = roomId;
                return roomId;
            }),
            leave: vi.fn(() => null),
        },
        messageRepository: { save: vi.fn(), get: vi.fn(() => []), clear: vi.fn() },
        sendJson: vi.fn(() => true),
        sendError: vi.fn(() => true),
        sendRoomHistory: vi.fn(() => true),
        createTimestamp: vi.fn(() => "2026-01-01T00:00:00.000Z"),
    };
}

function createSocket(): ChatWebSocket {
    return { nickname: null, room_id: null } as ChatWebSocket;
}

describe("message handlers", () => {
    it("rejects chat before registration with a stable error code", () => {
        const context = createContext();

        expect(chatHandler.handle(createSocket(), { type: "chat", message: "hello" }, context)).toBe(false);
        expect(context.sendError).toHaveBeenCalledWith(expect.anything(), "NICKNAME_NOT_REGISTERED");
    });

    it("stores and broadcasts a chat message using trusted socket state", () => {
        const context = createContext();
        const socket = createSocket();
        socket.nickname = "neo";
        socket.room_id = "room-1";

        expect(chatHandler.handle(socket, { type: "chat", message: " hello " }, context)).toBe(true);
        expect(context.messageRepository.save).toHaveBeenCalledWith("room-1", expect.objectContaining({
            nickname: "neo", room_id: "room-1", message: "hello",
        }));
        expect(context.roomService.broadcastToRoom).toHaveBeenCalledOnce();
    });

    it("registers a valid user and sends registration responses", () => {
        const context = createContext();
        const socket = createSocket();

        expect(registerHandler.handle(socket, {
            type: "register", nickname: " neo ", room_id: " room-1 ",
        }, context)).toBe(true);
        expect(socket).toMatchObject({ nickname: "neo", room_id: "room-1" });
        expect(context.sendJson).toHaveBeenCalledWith(socket, expect.objectContaining({ type: "register-success" }));
        expect(context.sendRoomHistory).toHaveBeenCalledWith(socket, "room-1");
    });
});
