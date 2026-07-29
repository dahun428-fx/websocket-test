import type { AppConfig } from "../config";

export function createTestConfig(databasePath: string, port = 0): AppConfig {
  return {
    environment: "test",
    logging: { level: "info" },
    server: { host: "127.0.0.1", port },
    database: { path: databasePath },
    auth: {
      accessToken: { secret: "access-test-secret", expiresIn: "15m" },
      refreshToken: {
        secret: "refresh-test-secret",
        expiresIn: "7d",
        cookie: { name: "refresh_token", maxAgeSeconds: 604_800, secure: false },
      },
    },
    rateLimit: { maxAttempts: 10, windowMs: 60_000 },
    heartbeat: { interval_ms: 30_000, debug: false },
    outbox: {
      enabled: false,
      pollingIntervalMs: 1_000,
      batchSize: 20,
      maximumAttempts: 5,
      staleProcessingMs: 30_000,
      retryBaseDelayMs: 1_000,
      retryMaximumDelayMs: 60_000,
    },
    seed: {},
  };
}
