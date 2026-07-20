import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";
import type { SendError } from "../types/handler";
import type { ChatInputMessage, NewChatMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";

export interface ChatHandlerDependencies {
  roomService: RoomService;
  messageRepository: MessageRepository;
  sendError: SendError;
  createTimestamp(): string;
}

export function createChatHandler(dependencies: ChatHandlerDependencies) {
  const { roomService, messageRepository, sendError, createTimestamp } = dependencies;

  return async function handleChat(
    socket: ChatWebSocket,
    data: ChatInputMessage,
  ): Promise<boolean> {
    const nickname = socket.nickname?.trim();
    const roomId = socket.room_id?.trim();

    if (!nickname) {
      await sendError(socket, "NICKNAME_NOT_REGISTERED");
      return false;
    }
    if (!roomId) {
      await sendError(socket, "ROOM_NOT_JOINED");
      return false;
    }

    const message = data.message.trim();
    if (!message) {
      await sendError(socket, "CHAT_REQUIRED");
      return false;
    }
    if (message.length > 1000) {
      await sendError(socket, "CHAT_TOO_LONG");
      return false;
    }

    const chatMessage: NewChatMessage = {
      type: "chat",
      nickname,
      room_id: roomId,
      message,
      createdAt: createTimestamp(),
    };
    const savedMessage = await messageRepository.save(roomId, chatMessage);
    roomService.broadcastToRoom(roomId, savedMessage);
    return true;
  };
}
