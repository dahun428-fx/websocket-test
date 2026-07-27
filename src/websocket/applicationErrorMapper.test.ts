import { describe, expect, it } from "vitest";

import { RoomNotFoundError } from "../application/errors/roomErrors";
import { mapApplicationErrorToWebSocket } from "./applicationErrorMapper";

describe("mapApplicationErrorToWebSocket", () => {
    it("preserves the application error contract", () => {
        expect(
            mapApplicationErrorToWebSocket(
                new RoomNotFoundError("room-1"),
                "2026-01-01T00:00:00.000Z",
            ),
        ).toEqual({
            type: "error",
            code: "ROOM_NOT_FOUND",
            message: "채팅방을 찾을 수 없습니다.",
            createdAt: "2026-01-01T00:00:00.000Z",
        });
    });
});
