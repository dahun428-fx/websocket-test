import type { Logger } from "../logging/logger";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import type { RealtimeEvent } from "./realtimeEvent";
import type { RealtimeEventHandler } from "./realtimeSubscriber";

interface CreateRealtimeEventHandlerOptions {
  serverId: string;
  messageRepository: MessageRepository;
  roomService: RoomService;
  logger: Logger;
}

export function createRealtimeEventHandler(
  options: CreateRealtimeEventHandlerOptions,
): RealtimeEventHandler {
  return async function handle(event: RealtimeEvent): Promise<void> {
    if (event.sourceServerId === options.serverId) return;

    switch (event.type) {
      case "message.broadcast": {
        const message = await options.messageRepository.findById(
          event.payload.messageId,
        );
        if (!message) {
          options.logger.warn("Realtime message target not found", {
            eventId: event.eventId,
            messageId: event.payload.messageId,
          });
          return;
        }
        options.roomService.broadcastToRoom(event.payload.roomId, message);
        return;
      }
      case "presence.changed":
        return;
    }
  };
}
