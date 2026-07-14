import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { closeDatabase, initializeDatabase } from "../database/database";
import { messageRepository } from "./messageRepository";
import type { NewChatMessage } from "../types/messages";

function createMessage(index: number): NewChatMessage {
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
        const savedMessage = await messageRepository.save("room-1", createMessage(1));
        const historyPage = await messageRepository.get("room-1");

        expect(savedMessage.id).toBeGreaterThan(0);
        expect(historyPage.messages[0]?.id).toBe(savedMessage.id);
        historyPage.messages.pop();

        await expect(messageRepository.get("room-1")).resolves.toMatchObject({
            messages: [expect.anything()], hasMore: false, nextBeforeId: null,
        });
        await expect(messageRepository.get("room-2")).resolves.toEqual({
            messages: [], hasMore: false, nextBeforeId: null,
        });
    });

    it("keeps only the latest 100 messages in a room", async () => {
        for (let index = 0; index < 101; index += 1) {
            await messageRepository.save("room-1", createMessage(index));
        }

        const historyPage = await messageRepository.get("room-1");
        expect(historyPage.messages).toHaveLength(100);
        expect(historyPage.hasMore).toBe(true);
        expect(historyPage.nextBeforeId).toBe(historyPage.messages[0]?.id);
        expect(historyPage.messages.every((message) => message.id > 0)).toBe(true);
        expect(historyPage.messages[0]?.message).toBe("message-1");
    });

    it("returns an older page using an ID cursor", async () => {
        const first = await messageRepository.save("room-1", createMessage(1));
        const second = await messageRepository.save("room-1", createMessage(2));
        const third = await messageRepository.save("room-1", createMessage(3));

        const historyPage = await messageRepository.getBefore("room-1", third.id, 1);

        expect(historyPage.messages.map((message) => message.id)).toEqual([second.id]);
        expect(historyPage.hasMore).toBe(true);
        expect(historyPage.nextBeforeId).toBe(second.id);
        expect(first.id).toBeLessThan(second.id);
    });
});
