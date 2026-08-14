import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { createRedisKeys } from "../../infrastructure/redis/redisKeys";
import { RateLimitExceededError } from "../../rateLimit/rateLimitError";
import type { RateLimiter } from "../../rateLimit/rateLimiter";
import type { HttpContext } from "../context/httpContext";
import { createLoginRateLimitMiddleware } from "./loginRateLimitMiddleware";

function createContext(headers: Record<string, string> = {}): HttpContext {
  const request = new EventEmitter() as IncomingMessage;
  Object.assign(request, {
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  });

  return {
    req: request,
    body: { userId: "  User-100  ", password: "secret" },
    setHeader: vi.fn(),
  } as unknown as HttpContext;
}

describe("createLoginRateLimitMiddleware", () => {
  it("uses the trusted client IP and normalized user ID, then resets on success", async () => {
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        limit: 5,
        current: 1,
        remaining: 4,
        retryAfterMs: 0,
        resetAt: "2026-08-14T00:01:00.000Z",
      }),
      reset: vi.fn().mockResolvedValue(undefined),
    };
    const context = createContext({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" });
    const next = vi.fn().mockResolvedValue(undefined);
    const middleware = createLoginRateLimitMiddleware({
      rateLimiter,
      redisKeys: createRedisKeys("app:test"),
      policy: { limit: 5, windowMs: 60_000 },
      trustProxy: true,
    });

    await middleware(context, next);

    expect(rateLimiter.consume).toHaveBeenCalledWith({
      key: "app:test:rate-limit:login:203.0.113.4:user-100",
      limit: 5,
      windowMs: 60_000,
    });
    expect(next).toHaveBeenCalledOnce();
    expect(rateLimiter.reset).toHaveBeenCalledWith(
      "app:test:rate-limit:login:203.0.113.4:user-100",
    );
  });

  it("returns rate-limit headers and throws before the handler when blocked", async () => {
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 5,
        current: 6,
        remaining: 0,
        retryAfterMs: 42_001,
        resetAt: "2026-08-14T00:01:00.000Z",
      }),
      reset: vi.fn(),
    };
    const context = createContext();
    const next = vi.fn();
    const middleware = createLoginRateLimitMiddleware({
      rateLimiter,
      redisKeys: createRedisKeys("app:test"),
      policy: { limit: 5, windowMs: 60_000 },
      trustProxy: false,
    });

    await expect(middleware(context, next)).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(context.setHeader).toHaveBeenCalledWith("Retry-After", "43");
    expect(context.setHeader).toHaveBeenCalledWith("RateLimit-Limit", "5");
    expect(context.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", "0");
    expect(next).not.toHaveBeenCalled();
    expect(rateLimiter.reset).not.toHaveBeenCalled();
  });

  it("does not reset failed login attempts", async () => {
    const rateLimiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        limit: 5,
        current: 1,
        remaining: 4,
        retryAfterMs: 0,
        resetAt: "2026-08-14T00:01:00.000Z",
      }),
      reset: vi.fn(),
    };
    const middleware = createLoginRateLimitMiddleware({
      rateLimiter,
      redisKeys: createRedisKeys("app:test"),
      policy: { limit: 5, windowMs: 60_000 },
      trustProxy: false,
    });

    await expect(middleware(createContext(), async () => {
      throw new Error("invalid credentials");
    })).rejects.toThrow("invalid credentials");
    expect(rateLimiter.reset).not.toHaveBeenCalled();
  });
});
