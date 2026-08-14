import type { RedisClientType } from "redis";

import type { Cache } from "./cache";

interface CreateRedisCacheOptions {
  redis: RedisClientType;
}

export function createRedisCache(options: CreateRedisCacheOptions): Cache {
  async function get<T>(key: string): Promise<T | null> {
    const raw = await options.redis.get(key);
    return raw === null ? null : JSON.parse(raw) as T;
  }

  async function set<T>(
    key: string,
    value: T,
    setOptions: { ttlSeconds: number },
  ): Promise<void> {
    await options.redis.set(key, JSON.stringify(value), {
      EX: setOptions.ttlSeconds,
    });
  }

  async function deleteKey(key: string): Promise<void> {
    await options.redis.del(key);
  }

  return { get, set, delete: deleteKey };
}
