import { beforeEach, describe, expect, it } from "vitest";

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
    beforeEach(() => messageRepository.clear());

    it("stores messages by room and returns a copy", () => {
        messageRepository.save("room-1", createMessage(1));
        const messages = messageRepository.get("room-1");

        messages.pop();

        expect(messageRepository.get("room-1")).toHaveLength(1);
        expect(messageRepository.get("room-2")).toEqual([]);
    });

    it("keeps only the latest 100 messages in a room", () => {
        for (let index = 0; index < 101; index += 1) {
            messageRepository.save("room-1", createMessage(index));
        }

        const messages = messageRepository.get("room-1");
        expect(messages).toHaveLength(100);
        expect(messages[0]?.message).toBe("message-1");
    });
});
