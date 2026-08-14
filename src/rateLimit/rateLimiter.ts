export interface ConsumeRateLimitInput {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: string;
}

export interface RateLimiter {
  consume(input: ConsumeRateLimitInput): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}
