import { describe, expect, it, vi } from "vitest";

import { dispatchMessage } from "./messageDispatcher";
import type { MessageHandlerContext } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

describe("dispatchMessage", () => {
    it("routes a chat message to the chat handler", async () => {
        const context: MessageHandlerContext = {
            roomService: {
                broadcastToRoom: vi.fn(), getConnectionCount: vi.fn(), getClients: vi.fn(),
                join: vi.fn(), leave: vi.fn(),
            },
            messageRepository: {
                save: vi.fn(async (_roomId, message) => ({ ...message, id: 1 })),
                get: vi.fn(async () => ({ messages: [], hasMore: false, nextBeforeId: null })),
                getBefore: vi.fn(async () => ({ messages: [], hasMore: false, nextBeforeId: null })),
                clear: vi.fn(async () => undefined),
            },
            sendJson: vi.fn(async () => undefined), sendError: vi.fn(async () => undefined),
            sendRoomHistory: vi.fn(async () => undefined), createTimestamp: vi.fn(() => "timestamp"),
        };
        const socket = { nickname: null, room_id: null } as ChatWebSocket;

        await dispatchMessage(socket, { type: "chat", message: "hello" }, context);

        expect(context.sendError).toHaveBeenCalledWith(socket, "NICKNAME_NOT_REGISTERED");
    });
});
