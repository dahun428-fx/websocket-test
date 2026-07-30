import type { DatabaseConnection } from "../database/database";
import type {
  ChatMessage,
  MessageHistoryPage,
  NewChatMessage,
} from "../types/messages";

interface MessageRow {
  id: number;
  room_id: string;
  nickname: string;
  message: string;
  created_at: string;
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    type: "chat",
    id: row.id,
    room_id: row.room_id,
    nickname: row.nickname,
    message: row.message,
    createdAt: row.created_at,
  };
}

function toHistoryPage(rows: MessageRow[], limit: number): MessageHistoryPage {
  const hasMore = rows.length > limit;
  const selectedRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = selectedRows.reverse().map(toChatMessage);

  return {
    messages,
    hasMore,
    nextBeforeId: hasMore ? (messages[0]?.id ?? null) : null,
  };
}

export interface MessageRepository {
  save(roomId: string, message: NewChatMessage): Promise<ChatMessage>;
  findById(messageId: string): Promise<ChatMessage | null>;
  get(roomId: string): Promise<MessageHistoryPage>;
  getBefore(
    roomId: string,
    beforeId: number,
    limit: number,
  ): Promise<MessageHistoryPage>;
}

export function createMessageRepository(
  database: DatabaseConnection,
): MessageRepository {
  async function save(
    roomId: string,
    message: NewChatMessage,
  ): Promise<ChatMessage> {
    const result = await database.run(
      `
        INSERT INTO messages (room_id, nickname, message, created_at)
        VALUES (?, ?, ?, ?)
      `,
      roomId,
      message.nickname,
      message.message,
      message.createdAt,
    );

    if (typeof result.lastID !== "number") {
      throw new Error("저장된 메시지 ID를 확인할 수 없습니다.");
    }

    return { ...message, id: result.lastID };
  }

  async function get(roomId: string): Promise<MessageHistoryPage> {
    const limit = 100;
    const rows = await database.all<MessageRow[]>(
      `
        SELECT id, room_id, nickname, message, created_at
        FROM messages
        WHERE room_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      roomId,
      limit + 1,
    );

    return toHistoryPage(rows, limit);
  }

  async function findById(messageId: string): Promise<ChatMessage | null> {
    if (!/^[1-9]\d*$/.test(messageId)) return null;
    const row = await database.get<MessageRow>(
      `SELECT id, room_id, nickname, message, created_at
       FROM messages
       WHERE id = ?`,
      Number(messageId),
    );
    return row ? toChatMessage(row) : null;
  }

  async function getBefore(
    roomId: string,
    beforeId: number,
    limit: number,
  ): Promise<MessageHistoryPage> {
    const rows = await database.all<MessageRow[]>(
      `
        SELECT id, room_id, nickname, message, created_at
        FROM messages
        WHERE room_id = ? AND id < ?
        ORDER BY id DESC
        LIMIT ?
      `,
      roomId,
      beforeId,
      limit + 1,
    );

    return toHistoryPage(rows, limit);
  }

  return { save, findById, get, getBefore };
}
