import { describe, expect, it } from "vitest";

import { InvalidCredentialsError } from "../../application/errors/authErrors";
import { RoomAccessDeniedError } from "../../application/errors/roomErrors";
import { mapApplicationErrorToHttp } from "./applicationErrorMapper";

describe("mapApplicationErrorToHttp", () => {
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
