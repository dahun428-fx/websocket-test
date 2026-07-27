import type { DatabaseConnection } from "../database/database";

export class DuplicateUserIdRepositoryError extends Error {
  constructor(
    readonly userId: string,
    options: { cause?: unknown } = {},
  ) {
    super("User ID already exists.", { cause: options.cause });
    this.name = "DuplicateUserIdRepositoryError";
  }
}

function isSqliteUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  if (
    code === "SQLITE_CONSTRAINT_PRIMARYKEY"
    || code === "SQLITE_CONSTRAINT_UNIQUE"
  ) {
    return true;
  }

  return code === "SQLITE_CONSTRAINT"
    && error instanceof Error
    && /(?:UNIQUE|PRIMARY KEY) constraint failed/i.test(error.message);
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
      if (isSqliteUniqueConstraintError(error)) {
        throw new DuplicateUserIdRepositoryError(input.id, { cause: error });
      }
      throw error;
    }

    return { ...input };
  }

  return { findById, create };
}
