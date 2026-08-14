import { ApplicationError } from "../application/errors/applicationError";

interface RateLimitExceededErrorOptions {
  retryAfterMs: number;
  resetAt: string;
}

export class RateLimitExceededError extends ApplicationError {
  readonly retryAfterMs: number;
  readonly resetAt: string;

  constructor(options: RateLimitExceededErrorOptions) {
    super({
      code: "RATE_LIMIT_EXCEEDED",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      details: {
        retryAfterMs: options.retryAfterMs,
        resetAt: options.resetAt,
      },
    });

    this.retryAfterMs = options.retryAfterMs;
    this.resetAt = options.resetAt;
  }
}
