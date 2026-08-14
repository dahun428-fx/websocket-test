import { describe, expect, it } from "vitest";

import { createConfig } from "./config";

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "r".repeat(32),
    ...overrides,
  };
}

describe("createConfig", () => {
  it("fails before startup when a required JWT secret is missing", () => {
    expect(() => createConfig(validEnvironment({ JWT_ACCESS_SECRET: undefined }))).toThrow(
      "JWT_ACCESS_SECRET",
    );
  });

  it("coerces numeric environment variables to numbers", () => {
    const config = createConfig(validEnvironment({
      PORT: "4010",
      REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS: "3600",
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: "7",
      AUTH_RATE_LIMIT_WINDOW_MS: "120000",
      RATE_LIMIT_FAIL_MODE: "closed",
      TRUST_PROXY: "true",
      HEARTBEAT_INTERVAL_MS: "45000",
      REDIS_PRESENCE_TTL_SECONDS: "60",
      REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS: "15000",
    }));

    expect(config.server.port).toBe(4010);
    expect(config.auth.refreshToken.cookie.maxAgeSeconds).toBe(3600);
    expect(config.server.trustProxy).toBe(true);
    expect(config.rateLimit).toEqual({
      maxAttempts: 7,
      windowMs: 120000,
      failMode: "closed",
    });
    expect(config.heartbeat.interval_ms).toBe(45000);
    expect(config.redis.presence).toEqual({
      ttlSeconds: 60,
      heartbeatIntervalMs: 15_000,
    });
  });

  it.each([
    ["development", false],
    ["test", false],
    ["production", true],
  ] as const)("maps %s environment settings", (environment, cookieSecure) => {
    const config = createConfig(validEnvironment({ NODE_ENV: environment, HEARTBEAT_DEBUG: "true" }));

    expect(config.environment).toBe(environment);
    expect(config.auth.refreshToken.cookie.secure).toBe(cookieSecure);
    expect(config.heartbeat.debug).toBe(true);
  });

  it("uses disabled optional Redis by default", () => {
    const config = createConfig(validEnvironment());

    expect(config.redis.enabled).toBe(false);
    expect(config.redis.required).toBe(false);
    expect(config.redis.keyPrefix).toBe("chat-app:development");
  });

  it("rejects invalid Redis presence heartbeat and TTL relation", () => {
    expect(() => createConfig(validEnvironment({
      REDIS_PRESENCE_TTL_SECONDS: "10",
      REDIS_PRESENCE_HEARTBEAT_INTERVAL_MS: "10000",
    }))).toThrow("Redis Presence heartbeat은 TTL보다 짧아야 합니다.");
  });

  it("rejects required Redis when Redis is disabled", () => {
    expect(() => createConfig(validEnvironment({
      REDIS_ENABLED: "false",
      REDIS_REQUIRED: "true",
    }))).toThrow("REDIS_REQUIRED=true이면 REDIS_ENABLED=true여야 합니다.");
  });
});
