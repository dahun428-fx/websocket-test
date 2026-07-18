import { getDatabase } from "../database/database";
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
  const { id, room_id, nickname, message, created_at: createdAt } = row;

  return {
    type: "chat",
    id,
    room_id,
    nickname,
    message,
    createdAt,
  };
}

export interface MessageRepository {
  save: (
    roomId: string,
    message: NewChatMessage,
  ) => Promise<ChatMessage>;

  get: (roomId: string) => Promise<MessageHistoryPage>;

  getBefore: (
    roomId: string,
    beforeId: number,
    limit: number,
  ) => Promise<MessageHistoryPage>;

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
  );

  if (typeof result.lastID !== "number") {
    throw new Error("저장된 메시지 ID를 확인할 수 없습니다.");
  }

  return {
    ...message,
    id: result.lastID,
  };
}

async function get(roomId: string): Promise<MessageHistoryPage> {
  const db = getDatabase();
  const limit = 100;

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
      ORDER BY id DESC
      LIMIT ?
    `,
    roomId,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const selectedRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = selectedRows.reverse().map(toChatMessage);

  return {
    messages,
    hasMore,
    nextBeforeId: hasMore ? (messages[0]?.id ?? null) : null,
  };
}

async function getBefore(
  roomId: string,
  beforeId: number,
  limit: number,
): Promise<MessageHistoryPage> {
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
        AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `,
    roomId,
    beforeId,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const selectedRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = selectedRows.reverse().map(toChatMessage);

  return {
    messages,
    hasMore,
    nextBeforeId: hasMore ? (messages[0]?.id ?? null) : null,
  };
}

async function clear(): Promise<void> {
  const db = getDatabase();

  await db.run(`
    DELETE FROM messages
  `);
}

export const messageRepository: MessageRepository = {
  save,
  get,
  getBefore,
  clear,
};
