import { describe, expect, it, vi } from "vitest";

import type { OutboxEventPublisher } from "../../outbox/outboxEventPublisher";
import type { RoomMemberRepository } from "../../repositories/roomMemberRepository";
import type { RoomRepository } from "../../repositories/roomRepository";
import { createCreateRoomUseCase } from "./createRoom";

describe("createCreateRoomUseCase domain events", () => {
  it("enqueues RoomCreated in the room and owner transaction", async () => {
    let committed = false;
    const enqueue = vi.fn(async () => {
      expect(committed).toBe(false);
    });
    const outboxEventPublisher: OutboxEventPublisher = {
      enqueue,
    };
    const roomRepository: RoomRepository = {
      create: vi.fn(async (input) => input),
      findById: vi.fn(async () => null),
    };
    const roomMemberRepository: RoomMemberRepository = {
      add: vi.fn(async (input) => input),
      find: vi.fn(async () => null),
    };
    const useCase = createCreateRoomUseCase({
      roomRepository,
      roomMemberRepository,
      unitOfWork: {
        run: async (work) => {
          const result = await work();
          committed = true;
          return result;
        },
      },
      outboxEventPublisher,
      runtime: {
        createId: () => "room-1",
        now: () => new Date("2026-07-27T00:00:00.000Z"),
      },
    });

    await useCase.execute({
      userId: "user-1",
      name: "테스트 방",
    });

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: "RoomCreated",
      payload: {
        roomId: "room-1",
        ownerId: "user-1",
        name: "테스트 방",
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    }));
  });
});
