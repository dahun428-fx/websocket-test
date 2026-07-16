import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import {
    createAccessToken,
    verifyAccessToken,
} from "./tokenService";

describe("tokenService", () => {
    it("creates and verifies an access token", () => {
        process.env.JWT_SECRET = "test-secret";

        const token = createAccessToken("user-100", "neo");

        expect(verifyAccessToken(token)).toEqual({
            sub: "user-100",
            nickname: "neo",
        });
    });

    it("rejects a token without a string subject", () => {
        process.env.JWT_SECRET = "test-secret";
        const token = jwt.sign(
            { nickname: "neo" },
            process.env.JWT_SECRET,
        );

        expect(() => verifyAccessToken(token)).toThrow(
            "올바르지 않은 인증 토큰입니다.",
        );
    });

    it("requires JWT_SECRET", () => {
        delete process.env.JWT_SECRET;

        expect(() => createAccessToken("user-100")).toThrow(
            "JWT_SECRET 환경변수가 필요합니다.",
        );
    });
});
