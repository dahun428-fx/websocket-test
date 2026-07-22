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
      HEARTBEAT_INTERVAL_MS: "45000",
    }));

    expect(config.server.port).toBe(4010);
    expect(config.auth.refreshToken.cookie.maxAgeSeconds).toBe(3600);
    expect(config.rateLimit).toEqual({ maxAttempts: 7, windowMs: 120000 });
    expect(config.heartbeat.interval_ms).toBe(45000);
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
});
