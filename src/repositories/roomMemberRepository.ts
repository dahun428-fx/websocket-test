import type { DatabaseConnection } from "../database/database";

export type RoomMemberRole = "owner" | "member";

export interface RoomMember {
  roomId: string;
  userId: string;
  role: RoomMemberRole;
  joinedAt: string;
}

export interface AddRoomMemberInput extends RoomMember {}

export interface RoomMemberRepository {
  add(input: AddRoomMemberInput): Promise<RoomMember>;
  find(roomId: string, userId: string): Promise<RoomMember | null>;
}

interface RoomMemberRow {
  room_id: string;
  user_id: string;
  role: RoomMemberRole;
  joined_at: string;
}

function mapRoomMember(row: RoomMemberRow): RoomMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  };
}

export function createRoomMemberRepository(
  database: DatabaseConnection,
): RoomMemberRepository {
  async function add(input: AddRoomMemberInput): Promise<RoomMember> {
    await database.run(
      `
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, ?, ?)
      `,
      input.roomId,
      input.userId,
      input.role,
      input.joinedAt,
    );
    return { ...input };
  }

  async function find(
    roomId: string,
    userId: string,
  ): Promise<RoomMember | null> {
    const row = await database.get<RoomMemberRow>(
      `
        SELECT room_id, user_id, role, joined_at
        FROM room_members
        WHERE room_id = ? AND user_id = ?
      `,
      roomId,
      userId,
    );
    return row ? mapRoomMember(row) : null;
  }

  return { add, find };
}
