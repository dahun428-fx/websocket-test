import { randomUUID } from "node:crypto";

import { createClient, type RedisClientType } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createRedisRateLimiter } from "./redisRateLimiter";

const redisUrl = process.env.TEST_REDIS_URL;

describe.runIf(Boolean(redisUrl))("RedisRateLimiter integration", () => {
  let redis: RedisClientType;
  const keys = new Set<string>();

  beforeAll(async () => {
    redis = createClient({ url: redisUrl });
    redis.on("error", () => undefined);
    await redis.connect();
  });

  afterEach(async () => {
    if (keys.size > 0) {
      await redis.del([...keys]);
      keys.clear();
    }
  });

  afterAll(async () => {
    if (redis?.isOpen) {
      await redis.close();
    }
  });

  function createKey(): string {
    const key = `test:rate-limit:${randomUUID()}`;
    keys.add(key);
    return key;
  }

  it("shares a five-request window across server instances", async () => {
    const serverA = createRedisRateLimiter({ redis });
    const serverB = createRedisRateLimiter({ redis });
    const key = createKey();

    for (let request = 1; request <= 3; request += 1) {
      await expect(serverA.consume({ key, limit: 5, windowMs: 60_000 }))
        .resolves.toMatchObject({ allowed: true, current: request });
    }
    for (let request = 4; request <= 5; request += 1) {
      await expect(serverB.consume({ key, limit: 5, windowMs: 60_000 }))
        .resolves.toMatchObject({ allowed: true, current: request });
    }

    await expect(serverB.consume({ key, limit: 5, windowMs: 60_000 }))
      .resolves.toMatchObject({
        allowed: false,
        current: 6,
        remaining: 0,
        retryAfterMs: expect.any(Number),
      });
    expect(await redis.pTTL(key)).toBeGreaterThan(0);
  });

  it("starts a new counter after the fixed window expires", async () => {
    const limiter = createRedisRateLimiter({ redis });
    const key = createKey();

    await limiter.consume({ key, limit: 1, windowMs: 100 });
    await expect(limiter.consume({ key, limit: 1, windowMs: 100 }))
      .resolves.toMatchObject({ allowed: false, current: 2 });
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    await expect(limiter.consume({ key, limit: 1, windowMs: 100 }))
      .resolves.toMatchObject({ allowed: true, current: 1 });
  });
});
