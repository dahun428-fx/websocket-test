import { describe, expect, it, vi } from "vitest";

import type { RedisConfig } from "../../config/config";
import type { Logger } from "../../logging/logger";
import {
  calculateReconnectDelayMs,
  createRedisClients,
} from "./createRedisClients";
import { createRedisKeys, createRedisChannels } from "./redisKeys";
import { createRedisLifecycle } from "./redisLifecycle";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function createRedisConfig(
  overrides: Partial<RedisConfig> = {},
): RedisConfig {
  return {
    enabled: true,
    required: false,
    url: "redis://127.0.0.1:1",
    keyPrefix: "chat:test",
    connectTimeoutMs: 50,
    commandTimeoutMs: 50,
    reconnect: {
      baseDelayMs: 10,
      maximumDelayMs: 100,
      maximumRetries: 0,
    },
    presence: {
      ttlSeconds: 30,
      heartbeatIntervalMs: 10_000,
    },
    ...overrides,
  };
}

describe("Redis infrastructure", () => {
  it("creates three named clients with mandatory error listeners", () => {
    const clients = createRedisClients({
      config: createRedisConfig(),
      logger: createLogger(),
    });

    expect(clients.command).not.toBe(clients.publisher);
    expect(clients.publisher).not.toBe(clients.subscriber);
    expect(clients.command.listenerCount("error")).toBeGreaterThan(0);
    expect(clients.publisher.listenerCount("error")).toBeGreaterThan(0);
    expect(clients.subscriber.listenerCount("error")).toBeGreaterThan(0);
  });

  it("calculates capped exponential reconnect delay with jitter", () => {
    expect(calculateReconnectDelayMs({
      retries: 0,
      baseDelayMs: 100,
      maximumDelayMs: 3_000,
      jitterMs: 20,
    })).toBe(120);
    expect(calculateReconnectDelayMs({
      retries: 10,
      baseDelayMs: 100,
      maximumDelayMs: 3_000,
      jitterMs: 50,
    })).toBe(3_050);
  });

  it("namespaces and encodes all keys and channels", () => {
    const keys = createRedisKeys("chat:test::");
    const channels = createRedisChannels("chat:test::");

    expect(keys.presenceConnection("connection:1"))
      .toBe("chat:test:presence:connection:connection%3A1");
    expect(keys.presenceUser("user/1"))
      .toBe("chat:test:presence:user:user%2F1");
    expect(keys.roomConnections("room 1"))
      .toBe("chat:test:room-connections:room%201");
    expect(channels.realtime).toBe("chat:test:realtime");
  });

  it("does not connect clients when Redis is disabled", async () => {
    const config = createRedisConfig({ enabled: false });
    const clients = createRedisClients({
      config,
      logger: createLogger(),
    });
    const lifecycle = createRedisLifecycle({
      clients,
      config,
      logger: createLogger(),
    });

    await expect(lifecycle.start()).resolves.toBe(false);
    expect(clients.command.isOpen).toBe(false);
    await lifecycle.stop();
  });

  it("continues in degraded mode when optional Redis is unavailable", async () => {
    const config = createRedisConfig();
    const logger = createLogger();
    const clients = createRedisClients({ config, logger });
    const lifecycle = createRedisLifecycle({ clients, config, logger });

    await expect(lifecycle.start()).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "Redis unavailable; continuing in degraded local mode",
    );
    await lifecycle.stop();
  });

  it("fails startup when required Redis is unavailable", async () => {
    const config = createRedisConfig({ required: true });
    const logger = createLogger();
    const clients = createRedisClients({ config, logger });
    const lifecycle = createRedisLifecycle({ clients, config, logger });

    await expect(lifecycle.start()).rejects.toThrow();
    await lifecycle.stop();
  });
});
