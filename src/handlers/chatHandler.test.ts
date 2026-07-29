import { describe, expect, it, vi } from "vitest";

import type { OutboxEventPublisher } from "../outbox/outboxEventPublisher";
import { createChatHandler } from "./chatHandler";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import type { ChatWebSocket } from "../types/websocket";

describe("createChatHandler domain events", () => {
  it("enqueues MessageCreated with persistence without message content", async () => {
    const calls: string[] = [];
    const enqueue = vi.fn<OutboxEventPublisher["enqueue"]>(async (event) => {
      calls.push("enqueue");
      expect(event).toEqual(expect.objectContaining({
        name: "MessageCreated",
        payload: {
          messageId: "42",
          roomId: "room-1",
          userId: "user-1",
          createdAt: "2026-07-27T00:00:00.000Z",
        },
      }));
      expect(event.payload).not.toHaveProperty("content");
      expect(event.payload).not.toHaveProperty("message");
      expect(event.payload).not.toHaveProperty("token");
    });
    const messageRepository: MessageRepository = {
      save: vi.fn(async (_roomId, message) => {
        calls.push("save");
        return { ...message, id: 42 };
      }),
      get: vi.fn(),
      getBefore: vi.fn(),
    };
    const roomService = {
      broadcastToRoom: vi.fn(() => {
        calls.push("broadcast");
      }),
    } as unknown as RoomService;
    const handler = createChatHandler({
      roomService,
      messageRepository,
      unitOfWork: {
        run: async (work) => work(),
      },
      outboxEventPublisher: { enqueue },
      sendError: vi.fn(),
      createTimestamp: () => "2026-07-27T00:00:00.000Z",
    });

    const handled = await handler({
      userId: "user-1",
      nickname: "다훈",
      room_id: "room-1",
    } as ChatWebSocket, {
      type: "chat",
      message: "안녕하세요",
    });

    expect(handled).toBe(true);
    expect(calls).toEqual(["save", "enqueue", "broadcast"]);
  });
});
