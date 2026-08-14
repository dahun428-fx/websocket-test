import type { RedisClientType } from "redis";

import type {
  ConsumeRateLimitInput,
  RateLimiter,
  RateLimitResult,
} from "./rateLimiter";

const FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])

if current == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return { current, ttl }
`;

interface CreateRedisRateLimiterOptions {
  redis: RedisClientType;
  now?: () => number;
}

export function createRateLimitResult(input: {
  current: number;
  limit: number;
  ttlMs: number;
  nowMs: number;
}): RateLimitResult {
  const ttlMs = Math.max(input.ttlMs, 0);
  const allowed = input.current <= input.limit;

  return {
    allowed,
    limit: input.limit,
    current: input.current,
    remaining: Math.max(input.limit - input.current, 0),
    retryAfterMs: allowed ? 0 : ttlMs,
    resetAt: new Date(input.nowMs + ttlMs).toISOString(),
  };
}

export function createRedisRateLimiter(
  options: CreateRedisRateLimiterOptions,
): RateLimiter {
  const now = options.now ?? Date.now;

  async function consume(input: ConsumeRateLimitInput): Promise<RateLimitResult> {
    const result = await options.redis.eval(FIXED_WINDOW_SCRIPT, {
      keys: [input.key],
      arguments: [String(input.windowMs)],
    });

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("Unexpected Redis rate limit result.");
    }

    const current = Number(result[0]);
    const ttlMs = Number(result[1]);
    if (!Number.isFinite(current) || !Number.isFinite(ttlMs)) {
      throw new Error("Redis rate limit result is invalid.");
    }

    return createRateLimitResult({
      current,
      limit: input.limit,
      ttlMs,
      nowMs: now(),
    });
  }

  async function reset(key: string): Promise<void> {
    await options.redis.del(key);
  }

  return { consume, reset };
}
