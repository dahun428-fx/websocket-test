import type { ChatMessage } from "../types/messages";

const roomMessages = new Map<string, ChatMessage[]>(); // room_id를 키로, 메시지 배열을 값으로 저장

const MAX_MESSAGES_PER_ROOM = 100; // 각 채팅방에 저장할 최대 메시지 수

/**
 * 특정 채팅방에 메시지를 저장합니다.
 */
function save(roomId: string, message: ChatMessage): void {
    const messages = roomMessages.get(roomId) || [];
    messages.push(message);

    if (messages.length > MAX_MESSAGES_PER_ROOM) {
        messages.shift(); // 가장 오래된 메시지를 제거
    }

    roomMessages.set(roomId, messages);
}

function get(roomId: string): ChatMessage[] {
    return [...(roomMessages.get(roomId)) || []];
}

export {
    save,
    get
};
