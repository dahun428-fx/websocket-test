import { describe, expect, it } from "vitest";

import { parseClientMessage } from "./messageParser";

describe("parseClientMessage", () => {
    it("parses and normalizes valid register and chat messages", () => {
        expect(parseClientMessage(Buffer.from('{"type":"register","token":" token ","room_id":" room-1 "}')))
            .toEqual({ type: "register", token: "token", room_id: "room-1" });
        expect(parseClientMessage(Buffer.from('{"type":"chat","message":" hello "}')))
            .toEqual({ type: "chat", message: "hello" });
    });

    it("rejects malformed JSON and invalid message shapes", () => {
        expect(parseClientMessage(Buffer.from("{"))).toBeNull();
        expect(parseClientMessage(Buffer.from('{"type":"chat","message":1}'))).toBeNull();
        expect(parseClientMessage(Buffer.from('{"type":"unknown"}'))).toBeNull();
        expect(parseClientMessage(Buffer.from(
            '{"type":"register","room_id":"room-1"}',
        ))).toBeNull();
        expect(parseClientMessage(Buffer.from(
            '{"type":"register","userId":"user-1","room_id":"room-1"}',
        ))).toBeNull();
        expect(parseClientMessage(Buffer.from(JSON.stringify({
            type: "register", token: "token", room_id: "x".repeat(21),
        })))).toBeNull();
    });

    it("parses a bounded history request", () => {
        expect(parseClientMessage(Buffer.from('{"type":"history-request","before_id":10}')))
            .toEqual({ type: "history-request", before_id: 10, limit: 30 });
        expect(parseClientMessage(Buffer.from('{"type":"history-request","before_id":0}')))
            .toBeNull();
    });
});
