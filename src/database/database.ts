import { promises as fs } from "node:fs";
import path from "node:path";

import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

export type DatabaseConnection = Database<sqlite3.Database, sqlite3.Statement>;

function getDefaultDatabasePath(): string {
  return path.join(process.cwd(), "data", "chat.db");
}

async function initializeSchema(database: DatabaseConnection): Promise<void> {
  await database.exec("PRAGMA foreign_keys = ON");
  const foreignKeys = await database.get<{ foreign_keys: number }>(
    "PRAGMA foreign_keys",
  );
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error("SQLite foreign keys are disabled.");
  }

  await database.exec("BEGIN IMMEDIATE");

  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `);
    await database.exec(`
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        joined_at TEXT NOT NULL,
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id)
          REFERENCES rooms(id)
          ON DELETE CASCADE,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `);
    await database.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await database.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `);

    await database.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_room_id
      ON messages (room_id, id)
    `);
    await database.exec("COMMIT");
  } catch (error) {
    await database.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function openDatabase(
  databasePath = getDefaultDatabasePath(),
): Promise<DatabaseConnection> {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });

  const database = await open({
    filename: databasePath,
    driver: sqlite3.Database,
  });

  try {
    await initializeSchema(database);
    return database;
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }
}
