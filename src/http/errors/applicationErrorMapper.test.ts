import { describe, expect, it } from "vitest";

import { InvalidCredentialsError } from "../../application/errors/authErrors";
import { RoomAccessDeniedError } from "../../application/errors/roomErrors";
import { mapApplicationErrorToHttp } from "./applicationErrorMapper";
import { RateLimitExceededError } from "../../rateLimit/rateLimitError";

describe("mapApplicationErrorToHttp", () => {
    it("maps a rate-limit error to 429 with retry details", () => {
        expect(mapApplicationErrorToHttp(new RateLimitExceededError({
            retryAfterMs: 42_000,
            resetAt: "2026-08-14T00:01:00.000Z",
        }))).toEqual({
            statusCode: 429,
            code: "RATE_LIMIT_EXCEEDED",
            message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            details: {
                retryAfterMs: 42_000,
                resetAt: "2026-08-14T00:01:00.000Z",
            },
        });
    });
    it("maps invalid credentials to 401", () => {
        expect(mapApplicationErrorToHttp(new InvalidCredentialsError())).toEqual({
            statusCode: 401,
            code: "INVALID_CREDENTIALS",
            message: "아이디 또는 비밀번호가 올바르지 않습니다.",
            details: undefined,
        });
    });

    it("maps room access denial to 403", () => {
        expect(
            mapApplicationErrorToHttp(new RoomAccessDeniedError("room-1", "user-1")),
        ).toMatchObject({
            statusCode: 403,
            code: "ROOM_ACCESS_DENIED",
        });
    });
});
