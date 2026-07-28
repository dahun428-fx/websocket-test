import type { Logger } from "../../logging/logger";
import type { EventBus } from "./eventBus";

export interface RegisterEventHandlersOptions {
  eventBus: EventBus;
  logger: Logger;
}

export function registerEventHandlers(
  options: RegisterEventHandlersOptions,
): Array<() => void> {
  const { eventBus, logger } = options;

  return [
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
  ];
}
