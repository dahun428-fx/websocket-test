import { describe, expect, it } from "vitest";

import { parseClientMessage } from "./messageParser";

describe("parseClientMessage", () => {
    it("parses valid register and chat messages", () => {
        expect(parseClientMessage(Buffer.from('{"type":"register","nickname":"neo","room_id":"room-1"}')))
            .toEqual({ type: "register", nickname: "neo", room_id: "room-1" });
        expect(parseClientMessage(Buffer.from('{"type":"chat","message":"hello"}')))
            .toEqual({ type: "chat", message: "hello" });
    });

    it("rejects malformed JSON and invalid message shapes", () => {
        expect(parseClientMessage(Buffer.from("{"))).toBeNull();
        expect(parseClientMessage(Buffer.from('{"type":"chat","message":1}'))).toBeNull();
        expect(parseClientMessage(Buffer.from('{"type":"unknown"}'))).toBeNull();
    });
});
