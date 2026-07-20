import type { DatabaseConnection } from "../database/database";

export class UserAlreadyExistsError extends Error {
  constructor(userId: string) {
    super(`이미 존재하는 사용자입니다: ${userId}`);
    this.name = "UserAlreadyExistsError";
  }
}

export interface User {
  id: string;
  nickname: string;
  passwordHash: string;
  createdAt: string;
}

export interface CreateUserInput {
  id: string;
  nickname: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}

interface UserRow {
  id: string;
  nickname: string;
  password_hash: string;
  created_at: string;
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    nickname: row.nickname,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export function createUserRepository(database: DatabaseConnection): UserRepository {
  async function findById(userId: string): Promise<User | null> {
    const row = await database.get<UserRow>(
      `
        SELECT id, nickname, password_hash, created_at
        FROM users
        WHERE id = ?
      `,
      userId,
    );

    return row ? mapUserRow(row) : null;
  }

  async function create(input: CreateUserInput): Promise<User> {
    try {
      await database.run(
        `
          INSERT INTO users (id, nickname, password_hash, created_at)
          VALUES (?, ?, ?, ?)
        `,
        input.id,
        input.nickname,
        input.passwordHash,
        input.createdAt,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        throw new UserAlreadyExistsError(input.id);
      }
      throw error;
    }

    return { ...input };
  }

  return { findById, create };
}
