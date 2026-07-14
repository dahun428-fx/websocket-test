import { getDatabase } from "../database/database";
import type { ChatMessage, NewChatMessage } from "../types/messages";

interface MessageRow {
    id: number;
    room_id: string;
    nickname: string;
    message: string;
    created_at: string;
}

export interface MessageRepository {
    save: (
        roomId: string,
        message: NewChatMessage,
    ) => Promise<ChatMessage>;

    get: (
        roomId: string,
    ) => Promise<ChatMessage[]>;

    clear: () => Promise<void>;
}


async function save(
    roomId: string,
    message: NewChatMessage,
): Promise<ChatMessage> {

    const db = getDatabase();

    const result = await db.run(
        `
        INSERT INTO messages (
            room_id,
            nickname,
            message,
            created_at
        )
        VALUES (?, ?, ?, ?)
        `,
        roomId,
        message.nickname,
        message.message,
        message.createdAt,
    )

    if (typeof result.lastID !== "number") {
        throw new Error("저장된 메시지 ID를 확인할 수 없습니다.");
    }

    return {
        ...message,
        id: result.lastID,
    };
}

async function get(
    roomId: string,
): Promise<ChatMessage[]> {

    const db = getDatabase();

    const rows = await db.all<MessageRow[]>(
        `
        SELECT
            id,
            room_id,
            nickname,
            message,
            created_at
        FROM messages
        WHERE room_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        `,
        roomId,
    );


    return rows
        .reverse()
        .map((row) => ({
            type: "chat",
            id: row.id,
            room_id: row.room_id,
            nickname: row.nickname,
            message: row.message,
            createdAt: row.created_at,
        }));
}

async function clear(): Promise<void> {

    const db = getDatabase();

    await db.run(`
        DELETE FROM messages
    `);
}


export const messageRepository:
    MessageRepository = {
    save,
    get,
    clear,
};
