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
        messageRepository: {
            save: vi.fn(async (_roomId, message) => ({ ...message, id: 1 })),
            get: vi.fn(async () => []),
            clear: vi.fn(async () => undefined),
        },
        sendJson: vi.fn(async () => undefined),
        sendError: vi.fn(async () => undefined),
        sendRoomHistory: vi.fn(async () => undefined),
        createTimestamp: vi.fn(() => "2026-01-01T00:00:00.000Z"),
    };
}

function createSocket(): ChatWebSocket {
    return { nickname: null, room_id: null } as ChatWebSocket;
}

describe("message handlers", () => {
    it("rejects chat before registration with a stable error code", async () => {
        const context = createContext();

        await expect(chatHandler.handle(createSocket(), { type: "chat", message: "hello" }, context))
            .resolves.toBe(false);
        expect(context.sendError).toHaveBeenCalledWith(expect.anything(), "NICKNAME_NOT_REGISTERED");
    });

    it("stores and broadcasts a chat message using trusted socket state", async () => {
        const context = createContext();
        const socket = createSocket();
        socket.nickname = "neo";
        socket.room_id = "room-1";

        await expect(chatHandler.handle(socket, { type: "chat", message: " hello " }, context))
            .resolves.toBe(true);
        expect(context.messageRepository.save).toHaveBeenCalledWith("room-1", expect.objectContaining({
            nickname: "neo", room_id: "room-1", message: "hello",
        }));
        expect(context.roomService.broadcastToRoom).toHaveBeenCalledOnce();
    });

    it("does not broadcast when message persistence fails", async () => {
        const context = createContext();
        const socket = createSocket();
        socket.nickname = "neo";
        socket.room_id = "room-1";
        context.messageRepository.save = vi.fn(async () => {
            throw new Error("storage unavailable");
        });

        await expect(chatHandler.handle(socket, {
            type: "chat", message: "hello",
        }, context)).rejects.toThrow("storage unavailable");
        expect(context.roomService.broadcastToRoom).not.toHaveBeenCalled();
    });

    it("registers a valid user and sends registration responses", async () => {
        const context = createContext();
        const socket = createSocket();

        await expect(registerHandler.handle(socket, {
            type: "register", nickname: " neo ", room_id: " room-1 ",
        }, context)).resolves.toBe(true);
        expect(socket).toMatchObject({ nickname: "neo", room_id: "room-1" });
        expect(context.sendJson).toHaveBeenCalledWith(socket, expect.objectContaining({ type: "register-success" }));
        expect(context.sendRoomHistory).toHaveBeenCalledWith(socket, "room-1");
    });

    it("returns error codes for invalid or repeated registration", async () => {
        const context = createContext();
        const socket = createSocket();

        await expect(registerHandler.handle(socket, {
            type: "register", nickname: " ", room_id: "room-1",
        }, context)).resolves.toBe(false);
        expect(context.sendError).toHaveBeenLastCalledWith(socket, "NICKNAME_REQUIRED");

        socket.nickname = "neo";
        await expect(registerHandler.handle(socket, {
            type: "register", nickname: "trinity", room_id: "room-1",
        }, context)).resolves.toBe(false);
        expect(context.sendError).toHaveBeenLastCalledWith(socket, "ALREADY_REGISTERED");
    });

    it("does not announce an entry after the connection closes during history delivery", async () => {
        const context = createContext();
        const socket = createSocket();
        let resolveHistory: (() => void) | undefined;
        context.sendRoomHistory = vi.fn(() => new Promise<void>((resolve) => {
            resolveHistory = resolve;
        }));

        const registration = registerHandler.handle(socket, {
            type: "register", nickname: "neo", room_id: "room-1",
        }, context);

        await vi.waitFor(() => {
            expect(context.sendJson).toHaveBeenCalledOnce();
            expect(context.sendRoomHistory).toHaveBeenCalledOnce();
        });
        expect(context.roomService.broadcastToRoom).not.toHaveBeenCalled();

        socket.nickname = null;
        socket.room_id = null;
        resolveHistory?.();

        await expect(registration).resolves.toBe(false);
        expect(context.roomService.broadcastToRoom).not.toHaveBeenCalled();
    });
});
