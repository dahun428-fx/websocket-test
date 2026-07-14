import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { closeDatabase, initializeDatabase } from "../database/database";
import { messageRepository } from "./messageRepository";
import type { ChatMessage } from "../types/messages";

function createMessage(index: number): ChatMessage {
    return {
        type: "chat",
        nickname: "neo",
        room_id: "room-1",
        message: `message-${index}`,
        createdAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("messageRepository", () => {
    let testDirectory: string;

    beforeAll(async () => {
        testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
        await initializeDatabase(path.join(testDirectory, "messages.db"));
    });

    beforeEach(async () => {
        await messageRepository.clear();
    });

    afterAll(async () => {
        await closeDatabase();
        await rm(testDirectory, { recursive: true, force: true });
    });

    it("stores messages by room and returns a copy", async () => {
        await messageRepository.save("room-1", createMessage(1));
        const messages = await messageRepository.get("room-1");

        messages.pop();

        await expect(messageRepository.get("room-1")).resolves.toHaveLength(1);
        await expect(messageRepository.get("room-2")).resolves.toEqual([]);
    });

    it("keeps only the latest 100 messages in a room", async () => {
        for (let index = 0; index < 101; index += 1) {
            await messageRepository.save("room-1", createMessage(index));
        }

        const messages = await messageRepository.get("room-1");
        expect(messages).toHaveLength(100);
        expect(messages[0]?.message).toBe("message-1");
    });
});
