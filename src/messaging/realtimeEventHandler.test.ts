import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../logging/logger";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import { createRealtimeEventHandler } from "./realtimeEventHandler";
import type { RealtimeEvent } from "./realtimeEvent";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function createEvent(sourceServerId: string): RealtimeEvent {
  return {
    eventId: "d6251e49-e334-4f08-bc1f-08f68b2b9ca1",
    type: "message.broadcast",
    occurredAt: "2026-07-29T00:00:00.000Z",
    sourceServerId,
    payload: {
      messageId: "42",
      roomId: "room-1",
      userId: "user-1",
    },
  };
}

describe("createRealtimeEventHandler", () => {
  it("loads a remote message and broadcasts only to this server room", async () => {
    const message = {
      type: "chat" as const,
      id: 42,
      room_id: "room-1",
      nickname: "다훈",
      message: "안녕하세요",
      createdAt: "2026-07-29T00:00:00.000Z",
    };
    const messageRepository = {
      findById: vi.fn(async () => message),
    } as unknown as MessageRepository;
    const roomService = {
      broadcastToRoom: vi.fn(),
    } as unknown as RoomService;
    const handler = createRealtimeEventHandler({
      serverId: "server-b",
      messageRepository,
      roomService,
      logger: createLogger(),
    });

    await handler(createEvent("server-a"));

    expect(messageRepository.findById).toHaveBeenCalledWith("42");
    expect(roomService.broadcastToRoom).toHaveBeenCalledWith("room-1", message);
  });

  it("ignores the source server event to avoid duplicate local broadcast", async () => {
    const messageRepository = {
      findById: vi.fn(),
    } as unknown as MessageRepository;
    const roomService = {
      broadcastToRoom: vi.fn(),
    } as unknown as RoomService;
    const handler = createRealtimeEventHandler({
      serverId: "server-a",
      messageRepository,
      roomService,
      logger: createLogger(),
    });

    await handler(createEvent("server-a"));

    expect(messageRepository.findById).not.toHaveBeenCalled();
    expect(roomService.broadcastToRoom).not.toHaveBeenCalled();
  });
});
