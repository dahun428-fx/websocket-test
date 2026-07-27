import type { DatabaseConnection } from "../database/database";

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateRoomInput {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface RoomRepository {
  create(input: CreateRoomInput): Promise<Room>;
  findById(roomId: string): Promise<Room | null>;
}

interface RoomRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function createRoomRepository(
  database: DatabaseConnection,
): RoomRepository {
  async function create(input: CreateRoomInput): Promise<Room> {
    await database.run(
      `
        INSERT INTO rooms (id, name, created_by, created_at)
        VALUES (?, ?, ?, ?)
      `,
      input.id,
      input.name,
      input.createdBy,
      input.createdAt,
    );
    return { ...input };
  }

  async function findById(roomId: string): Promise<Room | null> {
    const row = await database.get<RoomRow>(
      `
        SELECT id, name, created_by, created_at
        FROM rooms
        WHERE id = ?
      `,
      roomId,
    );
    return row ? mapRoom(row) : null;
  }

  return { create, findById };
}
