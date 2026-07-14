import { getDatabase } from "../database/database";
import type { ChatMessage } from "../types/messages";

interface MessageRow {
    room_id: string;
    nickname: string;
    message: string;
    created_at: string;
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


async function save(
    roomId: string,
    message: ChatMessage,
): Promise<void> {

    const db = getDatabase();

    await db.run(
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

}

async function get(
    roomId: string,
): Promise<ChatMessage[]> {

    const db = getDatabase();

    const rows = await db.all<MessageRow[]>(
        `
        SELECT
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