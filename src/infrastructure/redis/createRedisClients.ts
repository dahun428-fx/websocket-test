import {
  createClient,
  type RedisClientType,
} from "redis";

import type { RedisConfig } from "../../config/config";
import type { Logger } from "../../logging/logger";
import type { RedisClients } from "./redisClients";

interface CreateRedisClientsOptions {
  config: RedisConfig;
  logger: Logger;
  runtime?: {
    random?: () => number;
  };
}

export function calculateReconnectDelayMs(input: {
  retries: number;
  baseDelayMs: number;
  maximumDelayMs: number;
  jitterMs: number;
}): number {
  const exponentialDelay = input.baseDelayMs * 2 ** input.retries;
  return Math.min(exponentialDelay, input.maximumDelayMs) + input.jitterMs;
}

export function createRedisClients(
  options: CreateRedisClientsOptions,
): RedisClients {
  const { config, logger } = options;
  const random = options.runtime?.random ?? Math.random;

  function createNamedClient(clientName: string): RedisClientType {
    const client = createClient({
      url: config.url,
      socket: {
        connectTimeout: config.connectTimeoutMs,
        reconnectStrategy(retries, cause) {
          if (retries >= config.reconnect.maximumRetries) {
            logger.error("Redis reconnect limit reached", {
              clientName,
              retries,
              error: cause,
            });
            return new Error(
              `Redis ${clientName} reconnect limit reached.`,
            );
          }

          return calculateReconnectDelayMs({
            retries,
            baseDelayMs: config.reconnect.baseDelayMs,
            maximumDelayMs: config.reconnect.maximumDelayMs,
            jitterMs: Math.floor(random() * 100),
          });
        },
      },
    });

    client.on("connect", () => {
      logger.info("Redis client connecting", { clientName });
    });
    client.on("ready", () => {
      logger.info("Redis client ready", { clientName });
    });
    client.on("reconnecting", () => {
      logger.warn("Redis client reconnecting", { clientName });
    });
    client.on("error", (error) => {
      logger.error("Redis client error", { clientName, error });
    });
    client.on("end", () => {
      logger.info("Redis client ended", { clientName });
    });

    return client;
  }

  return {
    command: createNamedClient("command"),
    publisher: createNamedClient("publisher"),
    subscriber: createNamedClient("subscriber"),
  };
}
