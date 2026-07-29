import type { ApplicationEvent } from "../application/events/applicationEvent";

import { serializeApplicationEvent } from "./applicationEventSerializer";
import type { OutboxRepository } from "./outboxRepository";

export interface OutboxEventPublisher {
  enqueue(event: ApplicationEvent): Promise<void>;
}

interface CreateOutboxEventPublisherOptions {
  outboxRepository: OutboxRepository;
  now?: () => Date;
}

export function createOutboxEventPublisher(
  options: CreateOutboxEventPublisherOptions,
): OutboxEventPublisher {
  const now = options.now ?? (() => new Date());

  return {
    async enqueue(event) {
      const createdAt = now().toISOString();

      await options.outboxRepository.create({
        id: event.eventId,
        eventName: event.name,
        payload: serializeApplicationEvent(event),
        occurredAt: event.occurredAt,
        availableAt: createdAt,
        createdAt,
      });
    },
  };
}
