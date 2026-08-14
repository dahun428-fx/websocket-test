import { describe, expect, it, vi } from "vitest";

import type { Cache } from "../../cache/cache";
import { createRedisKeys } from "../../infrastructure/redis/redisKeys";
import type { Logger } from "../../logging/logger";
import type { RoomRepository } from "../../repositories/roomRepository";
import { RoomAccessDeniedError } from "../errors/roomErrors";
import { createRenameRoomUseCase } from "./renameRoom";

function logger(): Logger {
  const value: Logger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => value),
  };
  return value;
}

function repository(): RoomRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      id: "room-1",
      name: "Old",
      createdBy: "user-1",
      createdAt: "2026-08-01T00:00:00.000Z",
    }),
    rename: vi.fn().mockResolvedValue(undefined),
  };
}

function cache(): Cache {
  return {
    get: vi.fn(), set: vi.fn(), delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createRenameRoomUseCase", () => {
  it("renames an owned room and invalidates its cache", async () => {
    const roomRepository = repository();
    const roomCache = cache();
    const redisKeys = createRedisKeys("test");
    const useCase = createRenameRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys,
      logger: logger(),
    });

    await useCase.execute({ roomId: "room-1", userId: "user-1", name: " New " });

    expect(roomRepository.rename).toHaveBeenCalledWith({ roomId: "room-1", name: "New" });
    expect(roomCache.delete).toHaveBeenCalledWith(redisKeys.roomCache("room-1"));
  });

  it("does not rename a room owned by another user", async () => {
    const roomRepository = repository();
    const roomCache = cache();
    const useCase = createRenameRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      logger: logger(),
    });

    await expect(useCase.execute({
      roomId: "room-1", userId: "user-2", name: "New",
    })).rejects.toBeInstanceOf(RoomAccessDeniedError);
    expect(roomRepository.rename).not.toHaveBeenCalled();
    expect(roomCache.delete).not.toHaveBeenCalled();
  });

  it("keeps a successful database rename when invalidation fails", async () => {
    const roomRepository = repository();
    const roomCache = cache();
    vi.mocked(roomCache.delete).mockRejectedValue(new Error("Redis down"));
    const useCase = createRenameRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      logger: logger(),
    });

    await expect(useCase.execute({
      roomId: "room-1", userId: "user-1", name: "New",
    })).resolves.toBeUndefined();
    expect(roomRepository.rename).toHaveBeenCalledOnce();
  });
});
