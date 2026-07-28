import type { Logger } from "../../logging/logger";
import type { ApplicationEvent } from "./applicationEvent";
import type {
  EventBus,
  EventHandler,
  EventName,
  EventSubscription,
} from "./eventBus";

interface CreateInMemoryEventBusOptions {
  logger: Logger;
}

interface RegisteredHandler {
  handlerName: string;
  handler: (event: ApplicationEvent) => Promise<void>;
}

export function createInMemoryEventBus(options: CreateInMemoryEventBusOptions): EventBus {
  const { logger } = options;
  const handlers = new Map<EventName, Set<RegisteredHandler>>();

  function subscribe<TName extends EventName>(
    subscription: EventSubscription<TName>,
  ): () => void {
    const existingHandlers =
      handlers.get(subscription.eventName) ?? new Set<RegisteredHandler>();
    const registeredHandler: RegisteredHandler = {
      handlerName: subscription.handlerName,
      handler: subscription.handler as unknown as EventHandler<EventName>,
    };

    existingHandlers.add(registeredHandler);
    handlers.set(subscription.eventName, existingHandlers);

    return () => {
      existingHandlers.delete(registeredHandler);

      if (existingHandlers.size === 0) {
        handlers.delete(subscription.eventName);
      }
    };
  }

  async function publish(event: ApplicationEvent): Promise<void> {
    const eventHandlers = handlers.get(event.name);

    if (!eventHandlers || eventHandlers.size === 0) {
      logger.debug("Domain event has no subscribers", {
        eventId: event.eventId,
        eventName: event.name,
      });
      return;
    }

    logger.debug("Publishing domain event", {
      eventId: event.eventId,
      eventName: event.name,
      handlerCount: eventHandlers.size,
    });

    for (const subscription of [...eventHandlers]) {
      try {
        await subscription.handler(event);
      } catch (error) {
        logger.error("Domain event handler failed", {
          eventId: event.eventId,
          eventName: event.name,
          handlerName: subscription.handlerName,
          error,
        });
      }
    }
  }

  return {
    subscribe,
    publish,
  };
}
