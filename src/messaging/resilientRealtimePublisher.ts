import type { Logger } from "../logging/logger";
import type { RealtimeEvent } from "./realtimeEvent";
import type { RealtimePublisher } from "./realtimePublisher";

interface CreateResilientRealtimePublisherOptions {
  publisher: RealtimePublisher;
  enabled: boolean;
  required: boolean;
  isAvailable(): boolean;
  logger: Logger;
}

export function createResilientRealtimePublisher(
  options: CreateResilientRealtimePublisherOptions,
): RealtimePublisher {
  return {
    async publish(event: RealtimeEvent): Promise<void> {
      if (!options.enabled) return;

      if (!options.isAvailable()) {
        if (options.required) {
          throw new Error("Redis realtime publisher is required but unavailable.");
        }
        options.logger.warn("Redis realtime publisher unavailable", {
          eventId: event.eventId,
          eventType: event.type,
        });
        return;
      }

      try {
        await options.publisher.publish(event);
      } catch (error) {
        if (options.required) throw error;
        options.logger.warn("Redis realtime publish failed", {
          eventId: event.eventId,
          eventType: event.type,
          error,
        });
      }
    },
  };
}
