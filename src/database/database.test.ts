import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { openDatabase } from "./database";

describe("database lifecycle", () => {
    let testDirectory: string | undefined;

    afterEach(async () => {
        if (testDirectory) {
            await rm(testDirectory, { recursive: true, force: true });
            testDirectory = undefined;
        }
    });

    it("opens independent database connections", async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
        const first = await openDatabase(path.join(testDirectory, "first.db"));
        const second = await openDatabase(path.join(testDirectory, "second.db"));

        expect(second).not.toBe(first);
        await expect(first.get("SELECT 1 AS value")).resolves.toMatchObject({ value: 1 });
        await expect(second.get("SELECT 1 AS value")).resolves.toMatchObject({ value: 1 });

        await first.close();
        await second.close();
    });

    it("enables foreign key enforcement on every connection", async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
        const database = await openDatabase(path.join(testDirectory, "foreign-keys.db"));

        await expect(database.get("PRAGMA foreign_keys"))
            .resolves.toMatchObject({ foreign_keys: 1 });

        await database.close();
    });

    it("serializes concurrent schema initialization for the same file", async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
        const databasePath = path.join(testDirectory, "shared.db");

        const [first, second] = await Promise.all([
            openDatabase(databasePath),
            openDatabase(databasePath),
        ]);

        await expect(first.get("SELECT name FROM sqlite_master WHERE name = 'users'"))
            .resolves.toMatchObject({ name: "users" });
        await expect(second.get("SELECT name FROM sqlite_master WHERE name = 'messages'"))
            .resolves.toMatchObject({ name: "messages" });
        await first.close();
        await second.close();
    });

    it("can recover with a valid path after an open failure", async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));

        await expect(openDatabase(testDirectory)).rejects.toThrow();

        const database = await openDatabase(path.join(testDirectory, "recovered.db"));
        await expect(database.get("SELECT 1 AS value")).resolves.toMatchObject({ value: 1 });
        await database.close();
    });
});
