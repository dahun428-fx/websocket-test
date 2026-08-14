import { describe, expect, it, vi } from "vitest";

import type { Cache } from "../../cache/cache";
import { createRedisKeys } from "../../infrastructure/redis/redisKeys";
import type { Logger } from "../../logging/logger";
import type { RoomRepository } from "../../repositories/roomRepository";
import { RoomNotFoundError } from "../errors/roomErrors";
import { createGetRoomUseCase } from "./getRoom";

const room = {
  id: "room-1",
  name: "Backend",
  createdBy: "user-1",
  createdAt: "2026-08-01T00:00:00.000Z",
};
const result = {
  id: room.id,
  name: room.name,
  ownerId: room.createdBy,
  createdAt: room.createdAt,
};

function logger(): Logger {
  const value: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => value),
  };
  return value;
}

function cache(overrides: Partial<Cache> = {}): Cache {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function repository(found: typeof room | null = room): RoomRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(found),
    rename: vi.fn(),
  };
}

describe("createGetRoomUseCase", () => {
  it("returns a valid cache hit without querying the repository", async () => {
    const roomCache = cache({ get: vi.fn().mockResolvedValue(result) });
    const roomRepository = repository();
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
    expect(roomRepository.findById).not.toHaveBeenCalled();
  });

  it("queries the database and fills the cache after a miss", async () => {
    const roomCache = cache();
    const roomRepository = repository();
    const redisKeys = createRedisKeys("test");
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys,
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
    expect(roomRepository.findById).toHaveBeenCalledWith("room-1");
    expect(roomCache.set).toHaveBeenCalledWith(
      redisKeys.roomCache("room-1"),
      result,
      { ttlSeconds: 300 },
    );
  });

  it("falls back to the database when cache reading fails", async () => {
    const roomCache = cache({ get: vi.fn().mockRejectedValue(new Error("Redis down")) });
    const roomRepository = repository();
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
    expect(roomRepository.findById).toHaveBeenCalledOnce();
  });

  it("returns database data when cache writing fails", async () => {
    const roomCache = cache({ set: vi.fn().mockRejectedValue(new Error("Redis down")) });
    const roomRepository = repository();
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
  });

  it("ignores malformed cached data and refreshes it from the database", async () => {
    const roomCache = cache({ get: vi.fn().mockResolvedValue({ id: 123 }) });
    const roomRepository = repository();
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
    expect(roomRepository.findById).toHaveBeenCalledOnce();
  });

  it("ignores a cached room stored under the wrong key", async () => {
    const roomCache = cache({
      get: vi.fn().mockResolvedValue({ ...result, id: "room-2" }),
    });
    const roomRepository = repository();
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("room-1")).resolves.toEqual(result);
    expect(roomRepository.findById).toHaveBeenCalledOnce();
  });

  it("throws RoomNotFoundError without negative caching", async () => {
    const roomCache = cache();
    const roomRepository = repository(null);
    const useCase = createGetRoomUseCase({
      roomRepository,
      cache: roomCache,
      redisKeys: createRedisKeys("test"),
      cacheTtlSeconds: 300,
      logger: logger(),
    });

    await expect(useCase.execute("missing")).rejects.toBeInstanceOf(RoomNotFoundError);
    expect(roomCache.set).not.toHaveBeenCalled();
  });
});
