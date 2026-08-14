import type { RedisClientType } from "redis";
import { describe, expect, it, vi } from "vitest";

import { createRedisCache } from "./redisCache";

describe("createRedisCache", () => {
  it("returns null for a cache miss", async () => {
    const redis = { get: vi.fn().mockResolvedValue(null) } as unknown as RedisClientType;

    await expect(createRedisCache({ redis }).get("room-key")).resolves.toBeNull();
  });

  it("serializes values with the configured TTL", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    const redis = { set } as unknown as RedisClientType;

    await createRedisCache({ redis }).set(
      "room-key",
      { id: "room-1", name: "Backend" },
      { ttlSeconds: 300 },
    );

    expect(set).toHaveBeenCalledWith(
      "room-key",
      JSON.stringify({ id: "room-1", name: "Backend" }),
      { EX: 300 },
    );
  });

  it("deletes a cache key", async () => {
    const del = vi.fn().mockResolvedValue(1);
    const redis = { del } as unknown as RedisClientType;

    await createRedisCache({ redis }).delete("room-key");

    expect(del).toHaveBeenCalledWith("room-key");
  });
});
