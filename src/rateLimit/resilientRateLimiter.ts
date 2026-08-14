import type { Logger } from "../logging/logger";
import type {
  ConsumeRateLimitInput,
  RateLimiter,
  RateLimitResult,
} from "./rateLimiter";

export type RateLimitFailMode = "open" | "closed";

interface CreateResilientRateLimiterOptions {
  primary?: RateLimiter;
  failMode: RateLimitFailMode;
  logger: Logger;
  now?: () => number;
}

export function createResilientRateLimiter(
  options: CreateResilientRateLimiterOptions,
): RateLimiter {
  const now = options.now ?? Date.now;

  function fallback(input: ConsumeRateLimitInput): RateLimitResult {
    const allowed = options.failMode === "open";
    return {
      allowed,
      limit: input.limit,
      current: allowed ? 0 : input.limit + 1,
      remaining: allowed ? input.limit : 0,
      retryAfterMs: allowed ? 0 : input.windowMs,
      resetAt: new Date(now() + input.windowMs).toISOString(),
    };
  }

  async function consume(input: ConsumeRateLimitInput): Promise<RateLimitResult> {
    if (!options.primary) {
      return fallback(input);
    }

    try {
      return await options.primary.consume(input);
    } catch (error) {
      options.logger.error("Rate limiter failed", {
        failMode: options.failMode,
        error: error instanceof Error ? error.name : "unknown",
      });

      return fallback(input);
    }
  }

  async function reset(key: string): Promise<void> {
    if (!options.primary) {
      return;
    }

    try {
      await options.primary.reset(key);
    } catch (error) {
      options.logger.warn("Rate limiter reset failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return { consume, reset };
}
