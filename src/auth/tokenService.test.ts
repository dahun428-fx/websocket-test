import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./tokenService";

describe("tokenService", () => {
  it("creates and verifies an access token", () => {
    process.env.JWT_ACCESS_SECRET = "access-test-secret";

    const token = createAccessToken("user-100", "neo");

    expect(verifyAccessToken(token)).toEqual({
      sub: "user-100",
      nickname: "neo",
      type: "access",
    });
  });

  it("rejects a token without a string subject", () => {
    process.env.JWT_ACCESS_SECRET = "access-test-secret";
    const token = jwt.sign(
      { nickname: "neo" },
      process.env.JWT_ACCESS_SECRET,
    );

    expect(() => verifyAccessToken(token)).toThrow(
      "올바르지 않은 인증 토큰입니다.",
    );
  });

  it("requires JWT_ACCESS_SECRET", () => {
    delete process.env.JWT_ACCESS_SECRET;

    expect(() => createAccessToken("user-100", "neo")).toThrow(
      "JWT ACCESS_SECRET 환경변수가 필요합니다.",
    );
  });

  it("creates and verifies a refresh token with an expiration", () => {
    process.env.JWT_REFRESH_SECRET = "refresh-test-secret";

    const created = createRefreshToken("user-100");

    expect(created.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(verifyRefreshToken(created.token)).toEqual({
      sub: "user-100",
      tokenId: created.tokenId,
      type: "refresh",
    });
  });
});
