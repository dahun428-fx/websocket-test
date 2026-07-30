import type { Logger } from "../../logging/logger";
import type { RealtimePublisher } from "../../messaging/realtimePublisher";
import type { EventBus } from "./eventBus";

export interface RegisterEventHandlersOptions {
  eventBus: EventBus;
  logger: Logger;
  realtimePublisher?: RealtimePublisher;
  serverId?: string;
}

export function registerEventHandlers(
  options: RegisterEventHandlersOptions,
): Array<() => void> {
  const { eventBus, logger } = options;

  const subscriptions = [
    eventBus.subscribe({
      eventName: "UserCreated",
      handlerName: "LogUserCreated",
      handler: async (event) => {
        logger.info("User created", {
          eventId: event.eventId,
          userId: event.payload.userId,
        });
      },
    }),
    eventBus.subscribe({
      eventName: "RoomCreated",
      handlerName: "LogRoomCreated",
      handler: async (event) => {
        logger.info("Room created", {
          eventId: event.eventId,
          roomId: event.payload.roomId,
          ownerId: event.payload.ownerId,
        });
      },
    }),
  ];

  if (options.realtimePublisher && options.serverId) {
    subscriptions.push(eventBus.subscribe({
      eventName: "MessageCreated",
      handlerName: "PublishMessageRealtime",
      handler: async (event) => {
        await options.realtimePublisher?.publish({
          eventId: event.eventId,
          type: "message.broadcast",
          occurredAt: event.occurredAt,
          sourceServerId: options.serverId!,
          payload: {
            messageId: event.payload.messageId,
            roomId: event.payload.roomId,
            userId: event.payload.userId,
          },
        });
      },
    }));
  }

  subscriptions.push(
    eventBus.subscribe({
      eventName: "MessageCreated",
      handlerName: "LogMessageCreated",
      handler: async (event) => {
        logger.info("Message created", {
          eventId: event.eventId,
          messageId: event.payload.messageId,
          roomId: event.payload.roomId,
          userId: event.payload.userId,
        });
      },
    }),
  );

  return subscriptions;
}
