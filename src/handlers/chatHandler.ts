import type { ChatHandler } from "../types/handler";
import type { ChatMessage } from "../types/messages";

export const chatHandler: ChatHandler = {
    type: 'chat',
    handle: (
        ws,
        data,
        context,
    ) => {
        const {
            roomService,
            messageRepository,
            sendError,
            createTimestamp,
        } = context;
        if (!ws.nickname) {
            sendError(ws, "NICKNAME_NOT_REGISTERED");
            return false;
        }
        if (!ws.room_id) {
            sendError(ws, "ROOM_NOT_JOINED");
            return false;
        }

        const message = data.message.trim();
        if (!message) {
            sendError(ws, "CHAT_REQUIRED");
            return false;
        }
        if (message.length > 1000) {
            sendError(ws, "CHAT_TOO_LONG");
            return false;
        }

        const chatMessage: ChatMessage = {
            type: "chat",
            nickname: ws.nickname,
            room_id: ws.room_id,
            message,
            createdAt: createTimestamp(),
        };
        console.log(`${ws.room_id}방에 저장하고 브로드캐스트할 채팅:`, chatMessage);
        messageRepository.save(ws.room_id, chatMessage);
        roomService.broadcastToRoom(ws.room_id, chatMessage);
        return true;
    }
};
