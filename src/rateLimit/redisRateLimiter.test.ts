import type { RedisClientType } from "redis";
import { describe, expect, it, vi } from "vitest";

import {
  createRateLimitResult,
  createRedisRateLimiter,
} from "./redisRateLimiter";

describe("createRateLimitResult", () => {
  it("allows requests through the configured limit", () => {
    expect(createRateLimitResult({
      current: 3,
      limit: 5,
      ttlMs: 30_000,
      nowMs: 0,
    })).toEqual({
      allowed: true,
      limit: 5,
      current: 3,
      remaining: 2,
      retryAfterMs: 0,
      resetAt: "1970-01-01T00:00:30.000Z",
    });
  });

  it("blocks the sixth request and exposes the retry time", () => {
    expect(createRateLimitResult({
      current: 6,
      limit: 5,
      ttlMs: 30_000,
      nowMs: 0,
    })).toMatchObject({
      allowed: false,
      current: 6,
      remaining: 0,
      retryAfterMs: 30_000,
    });
  });
});

describe("createRedisRateLimiter", () => {
  it("increments and expires the fixed window atomically with Lua", async () => {
    const evalCommand = vi.fn().mockResolvedValue([1, 60_000]);
    const redis = {
      eval: evalCommand,
      del: vi.fn(),
    } as unknown as RedisClientType;
    const limiter = createRedisRateLimiter({ redis, now: () => 0 });

    await expect(limiter.consume({
      key: "app:test:rate-limit:login:ip:user",
      limit: 5,
      windowMs: 60_000,
    })).resolves.toMatchObject({ allowed: true, current: 1 });

    expect(evalCommand).toHaveBeenCalledOnce();
    expect(evalCommand.mock.calls[0]?.[0]).toContain("PEXPIRE");
    expect(evalCommand.mock.calls[0]?.[1]).toEqual({
      keys: ["app:test:rate-limit:login:ip:user"],
      arguments: ["60000"],
    });
  });

  it("rejects malformed Lua results", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(["not-a-number", 60_000]),
      del: vi.fn(),
    } as unknown as RedisClientType;

    await expect(createRedisRateLimiter({ redis }).consume({
      key: "key",
      limit: 5,
      windowMs: 60_000,
    })).rejects.toThrow("Redis rate limit result is invalid");
  });
});
