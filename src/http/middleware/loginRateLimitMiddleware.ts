import type { RedisKeys } from "../../infrastructure/redis/redisKeys";
import { RateLimitExceededError } from "../../rateLimit/rateLimitError";
import type { RateLimiter } from "../../rateLimit/rateLimiter";
import type { LoginInput } from "../../schemas/loginSchema";
import { getClientIp } from "../clientIp";
import type { Middleware } from "./middleware";

interface LoginRateLimitPolicy {
  limit: number;
  windowMs: number;
}

interface CreateLoginRateLimitMiddlewareOptions {
  rateLimiter: RateLimiter;
  redisKeys: RedisKeys;
  policy: LoginRateLimitPolicy;
  trustProxy: boolean;
}

export function createLoginRateLimitMiddleware(
  options: CreateLoginRateLimitMiddlewareOptions,
): Middleware {
  return async function loginRateLimit(context, next): Promise<void> {
    const body = context.body as LoginInput;
    const normalizedLoginId = body.userId.trim().toLowerCase();
    const clientIp = getClientIp(context.req, {
      trustProxy: options.trustProxy,
    });
    const redisKey = options.redisKeys.loginRateLimit({
      clientIp,
      loginId: normalizedLoginId,
    });
    const result = await options.rateLimiter.consume({
      key: redisKey,
      limit: options.policy.limit,
      windowMs: options.policy.windowMs,
    });

    context.setHeader("RateLimit-Limit", String(result.limit));
    context.setHeader("RateLimit-Remaining", String(result.remaining));
    context.setHeader("RateLimit-Reset", result.resetAt);

    if (!result.allowed) {
      context.setHeader("Cache-Control", "no-store");
      context.setHeader(
        "Retry-After",
        String(Math.max(Math.ceil(result.retryAfterMs / 1_000), 1)),
      );
      throw new RateLimitExceededError({
        retryAfterMs: result.retryAfterMs,
        resetAt: result.resetAt,
      });
    }

    await next();
    await options.rateLimiter.reset(redisKey);
  };
}
