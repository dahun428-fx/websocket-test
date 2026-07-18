import type { ChatHandler } from "../types/handler";
import type { NewChatMessage } from "../types/messages";

export const chatHandler: ChatHandler = {
  type: "chat",
  handle: async (ws, data, context) => {
    const {
      roomService,
      messageRepository,
      sendError,
      createTimestamp,
    } = context;

    const nickname = ws.nickname?.trim();
    const roomId = ws.room_id?.trim();

    if (!nickname) {
      await sendError(ws, "NICKNAME_NOT_REGISTERED");
      return false;
    }

    if (!roomId) {
      await sendError(ws, "ROOM_NOT_JOINED");
      return false;
    }

    const message = data.message.trim();

    if (!message) {
      await sendError(ws, "CHAT_REQUIRED");
      return false;
    }

    if (message.length > 1000) {
      await sendError(ws, "CHAT_TOO_LONG");
      return false;
    }

    const chatMessage: NewChatMessage = {
      type: "chat",
      nickname,
      room_id: roomId,
      message,
      createdAt: createTimestamp(),
    };

    console.log(`${roomId}방에 저장하고 브로드캐스트할 채팅:`, chatMessage);
    const savedChatMessage = await messageRepository.save(roomId, chatMessage);
    roomService.broadcastToRoom(roomId, savedChatMessage);
    return true;
  },
};
