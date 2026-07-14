import type { ChatMessage } from "../types/messages";

const MAX_MESSAGES_PER_ROOM = 100;

const roomMessages = new Map<string, ChatMessage[]>();

function save(
    roomId: string,
    message: ChatMessage,
): void {
    const messages =
        roomMessages.get(roomId) ?? [];

    messages.push(message);

    if (
        messages.length >
        MAX_MESSAGES_PER_ROOM
    ) {
        messages.shift();
    }

    roomMessages.set(
        roomId,
        messages,
    );
}

function get(
    roomId: string,
): ChatMessage[] {
    const messages =
        roomMessages.get(roomId) ?? [];

    return [...messages];
}

function clear(): void {
    roomMessages.clear();
}

export interface MessageRepository {
    save: (
        roomId: string,
        message: ChatMessage,
    ) => void;

    get: (
        roomId: string,
    ) => ChatMessage[];

    clear: () => void;
}

export const messageRepository:
    MessageRepository = {
    save,
    get,
    clear,
};