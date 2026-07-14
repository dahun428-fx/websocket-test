import { promises as fs } from "node:fs";
import path from "node:path";

import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

let database: Database<sqlite3.Database, sqlite3.Statement> | null = null;

function getDefaultDatabasePath(): string {
    return path.join(process.cwd(), "data", "chat.db");
}

export async function initializeDatabase(
    databasePath = getDefaultDatabasePath(),
): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
    if (database) {
        return database;
    }

    await fs.mkdir(path.dirname(databasePath), { recursive: true });

    database = await open({
        filename: databasePath,
        driver: sqlite3.Database,
    });

    await database.exec(`
        PRAGMA foreign_keys = ON;
    `);

    await database.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            nickname TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    `);

    await database.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_created_at ON messages (room_id, created_at);
    `);

    console.log(
        `SQLite 데이터베이스 초기화 완료: ${databasePath}`,
    );

    return database;
}

export function getDatabase(): Database<sqlite3.Database, sqlite3.Statement> {
    if (!database) {
        throw new Error("Database has not been initialized. Call initializeDatabase() first.");
    }
    return database;
}

export async function closeDatabase(): Promise<void> {
    if (!database) {
        return;
    }
    await database.close();
    database = null;
    console.log("SQLite 데이터베이스 연결 종료");
}
