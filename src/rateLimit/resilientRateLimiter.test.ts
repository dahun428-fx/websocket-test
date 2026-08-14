import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../logging/logger";
import type { RateLimiter } from "./rateLimiter";
import { createResilientRateLimiter } from "./resilientRateLimiter";

function createLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
}

function failingLimiter(): RateLimiter {
  return {
    consume: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    reset: vi.fn().mockRejectedValue(new Error("redis unavailable")),
  };
}

describe("createResilientRateLimiter", () => {
  it("uses the configured fallback without logging when Redis is disabled", async () => {
    const logger = createLogger();
    const limiter = createResilientRateLimiter({
      failMode: "open",
      logger,
      now: () => 0,
    });

    await expect(limiter.consume({ key: "key", limit: 5, windowMs: 60_000 }))
      .resolves.toMatchObject({ allowed: true, remaining: 5 });
    expect(logger.error).not.toHaveBeenCalled();
    await expect(limiter.reset("key")).resolves.toBeUndefined();
  });

  it("allows the request when Redis fails in open mode", async () => {
    const limiter = createResilientRateLimiter({
      primary: failingLimiter(),
      failMode: "open",
      logger: createLogger(),
      now: () => 0,
    });

    await expect(limiter.consume({ key: "sensitive-key", limit: 5, windowMs: 60_000 }))
      .resolves.toMatchObject({ allowed: true, remaining: 5 });
  });

  it("blocks the request when Redis fails in closed mode", async () => {
    const limiter = createResilientRateLimiter({
      primary: failingLimiter(),
      failMode: "closed",
      logger: createLogger(),
      now: () => 0,
    });

    await expect(limiter.consume({ key: "sensitive-key", limit: 5, windowMs: 60_000 }))
      .resolves.toMatchObject({ allowed: false, retryAfterMs: 60_000 });
  });
});
