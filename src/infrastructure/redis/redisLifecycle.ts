import type { RedisConfig } from "../../config/config";
import type { Logger } from "../../logging/logger";
import type { RedisClients } from "./redisClients";

export interface RedisLifecycle {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  isAvailable(): boolean;
}

interface CreateRedisLifecycleOptions {
  clients: RedisClients;
  config: Pick<RedisConfig, "enabled" | "required">;
  logger: Logger;
}

export function createRedisLifecycle(
  options: CreateRedisLifecycleOptions,
): RedisLifecycle {
  const { clients, config, logger } = options;
  let started = false;
  let startPromise: Promise<boolean> | null = null;
  let stopPromise: Promise<void> | null = null;

  async function connectClients(): Promise<boolean> {
    if (!config.enabled) {
      logger.info("Redis is disabled; local realtime mode is active");
      return false;
    }

    try {
      await Promise.all([
        clients.command.connect(),
        clients.publisher.connect(),
        clients.subscriber.connect(),
      ]);
      started = true;
      logger.info("Redis clients connected");
      return true;
    } catch (error) {
      await closeAllClients(clients);
      logger.error("Redis startup connection failed", {
        required: config.required,
        error,
      });

      if (config.required) {
        throw error;
      }

      logger.warn("Redis unavailable; continuing in degraded local mode");
      return false;
    }
  }

  function start(): Promise<boolean> {
    if (started) {
      return Promise.resolve(true);
    }
    startPromise ??= connectClients();
    return startPromise;
  }

  function stop(): Promise<void> {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = (async () => {
      await startPromise?.catch(() => false);
      await closeAllClients(clients);
      started = false;
      logger.info("Redis clients closed");
    })();

    return stopPromise;
  }

  function isAvailable(): boolean {
    return (
      started &&
      clients.command.isReady &&
      clients.publisher.isReady &&
      clients.subscriber.isReady
    );
  }

  return { start, stop, isAvailable };
}

async function closeAllClients(clients: RedisClients): Promise<void> {
  await Promise.allSettled([
    closeClient(clients.subscriber),
    closeClient(clients.publisher),
    closeClient(clients.command),
  ]);
}

async function closeClient(client: RedisClients["command"]): Promise<void> {
  if (client.isOpen) {
    await client.close();
  }
}
