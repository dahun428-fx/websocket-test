import { randomUUID } from "node:crypto";

import { createClient, type RedisClientType } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createRedisCache } from "./redisCache";

const redisUrl = process.env.TEST_REDIS_URL;

describe.runIf(Boolean(redisUrl))("RedisCache integration", () => {
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

  it("stores JSON with TTL and deletes it", async () => {
    const cache = createRedisCache({ redis });
    const key = `test:cache:room:${randomUUID()}`;
    keys.add(key);
    const room = { id: "room-1", name: "Backend" };

    await cache.set(key, room, { ttlSeconds: 300 });

    await expect(cache.get(key)).resolves.toEqual(room);
    expect(await redis.ttl(key)).toBeGreaterThan(0);
    expect(await redis.ttl(key)).toBeLessThanOrEqual(300);

    await cache.delete(key);
    await expect(cache.get(key)).resolves.toBeNull();
  });
});
