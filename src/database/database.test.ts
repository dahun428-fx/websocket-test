import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    closeDatabase,
    getDatabase,
    initializeDatabase,
} from "./database";

describe("database lifecycle", () => {
    let testDirectory: string | undefined;

    afterEach(async () => {
        await closeDatabase();
        if (testDirectory) {
            await rm(testDirectory, { recursive: true, force: true });
            testDirectory = undefined;
        }
    });

    it("initializes only once and closes safely more than once", async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
        const databasePath = path.join(testDirectory, "messages.db");

        const first = await initializeDatabase(databasePath);
        const second = await initializeDatabase(databasePath);

        expect(second).toBe(first);
        expect(getDatabase()).toBe(first);

        await closeDatabase();
        await expect(closeDatabase()).resolves.toBeUndefined();
    });
});
