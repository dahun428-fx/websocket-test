import type { RedisClientType } from "redis";

import type { Logger } from "../logging/logger";
import {
  deserializeRealtimeEvent,
  serializeRealtimeEvent,
  type RealtimeEvent,
} from "./realtimeEvent";
import type { RealtimePublisher } from "./realtimePublisher";
import type {
  RealtimeEventHandler,
  RealtimeSubscriber,
} from "./realtimeSubscriber";

interface CreateRedisRealtimeBusOptions {
  publisherClient: RedisClientType;
  subscriberClient: RedisClientType;
  channel: string;
  logger: Logger;
}

export interface RealtimeBus {
  publisher: RealtimePublisher;
  subscriber: RealtimeSubscriber;
}

export function createRedisRealtimeBus(
  options: CreateRedisRealtimeBusOptions,
): RealtimeBus {
  const {
    publisherClient,
    subscriberClient,
    channel,
    logger,
  } = options;
  let subscribed = false;

  async function publish(event: RealtimeEvent): Promise<void> {
    await publisherClient.publish(channel, serializeRealtimeEvent(event));
  }

  async function handleRawMessage(
    rawMessage: string,
    handler: RealtimeEventHandler,
  ): Promise<void> {
    try {
      await handler(deserializeRealtimeEvent(rawMessage));
    } catch (error) {
      logger.error("Redis realtime message handling failed", {
        channel,
        error,
      });
    }
  }

  async function start(handler: RealtimeEventHandler): Promise<void> {
    if (subscribed) return;
    await subscriberClient.subscribe(channel, (rawMessage) => {
      void handleRawMessage(rawMessage, handler);
    });
    subscribed = true;
    logger.info("Redis realtime subscriber started", { channel });
  }

  async function stop(): Promise<void> {
    if (!subscribed || !subscriberClient.isOpen) return;
    await subscriberClient.unsubscribe(channel);
    subscribed = false;
    logger.info("Redis realtime subscriber stopped", { channel });
  }

  return {
    publisher: { publish },
    subscriber: { start, stop },
  };
}
