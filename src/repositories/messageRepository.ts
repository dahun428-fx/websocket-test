import type { ChatMessage } from "../types/messages";

const MAX_MESSAGES_PER_ROOM = 100;

const roomMessages = new Map<string, ChatMessage[]>();

async function save(
    roomId: string,
    message: ChatMessage,
): Promise<void> {
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

async function get(
    roomId: string,
): Promise<ChatMessage[]> {
    const messages =
        roomMessages.get(roomId) ?? [];
    return [...messages];
}

async function clear(): Promise<void> {
    roomMessages.clear();
}

export interface MessageRepository {
    save: (
        roomId: string,
        message: ChatMessage,
    ) => Promise<void>;

    get: (
        roomId: string,
    ) => Promise<ChatMessage[]>;

    clear: () => Promise<void>;
}

export const messageRepository:
    MessageRepository = {
    save,
    get,
    clear,
};