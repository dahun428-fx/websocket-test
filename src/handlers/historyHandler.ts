import type { MessageRepository } from "../repositories/messageRepository";
import type { HistoryRequestMessage } from "../schemas/clientMessageSchema";
import type { SendError, SendJson } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

export interface HistoryHandlerDependencies {
  messageRepository: MessageRepository;
  sendJson: SendJson;
  sendError: SendError;
  createTimestamp(): string;
}

export function createHistoryHandler(dependencies: HistoryHandlerDependencies) {
  const { messageRepository, sendJson, sendError, createTimestamp } = dependencies;

  return async function handleHistory(
    socket: ChatWebSocket,
    data: HistoryRequestMessage,
  ): Promise<boolean> {
    const roomId = socket.room_id;
    if (!roomId) {
      await sendError(socket, "ROOM_NOT_JOINED");
      return false;
    }

    const page = await messageRepository.getBefore(roomId, data.before_id, data.limit);
    await sendJson(socket, {
      type: "history",
      room_id: roomId,
      messages: page.messages,
      hasMore: page.hasMore,
      nextBeforeId: page.nextBeforeId,
      createdAt: createTimestamp(),
    });
    return true;
  };
}
