import { describe, expect, it, vi } from "vitest";

import { dispatchMessage } from "./messageDispatcher";
import type { MessageHandlerContext } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

describe("dispatchMessage", () => {
    it("routes a chat message to the chat handler", () => {
        const context: MessageHandlerContext = {
            roomService: {
                broadcastToRoom: vi.fn(), getConnectionCount: vi.fn(), getClients: vi.fn(),
                join: vi.fn(), leave: vi.fn(),
            },
            messageRepository: { save: vi.fn(), get: vi.fn(() => []), clear: vi.fn() },
            sendJson: vi.fn(() => true), sendError: vi.fn(() => true),
            sendRoomHistory: vi.fn(() => true), createTimestamp: vi.fn(() => "timestamp"),
        };
        const socket = { nickname: null, room_id: null } as ChatWebSocket;

        dispatchMessage(socket, { type: "chat", message: "hello" }, context);

        expect(context.sendError).toHaveBeenCalledWith(socket, "NICKNAME_NOT_REGISTERED");
    });
});
