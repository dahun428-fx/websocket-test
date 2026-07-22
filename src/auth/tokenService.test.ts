import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import {
  createTokenService,
} from "./tokenService";

function createTestTokenService() {
  return createTokenService({
    accessTokenSecret: "access-test-secret",
    accessTokenExpiresIn: "15m",
    refreshTokenSecret: "refresh-test-secret",
    refreshTokenExpiresIn: "7d",
  });
}

describe("tokenService", () => {
  it("creates and verifies an access token", () => {
    const tokenService = createTestTokenService();
    const token = tokenService.createAccessToken("user-100", "neo");

    expect(tokenService.verifyAccessToken(token)).toEqual({
      sub: "user-100",
      nickname: "neo",
      type: "access",
    });
  });

  it("uses the explicitly supplied secrets instead of process.env", () => {
    const tokenService = createTokenService({
      accessTokenSecret: "configured-access-secret",
      accessTokenExpiresIn: "15m",
      refreshTokenSecret: "configured-refresh-secret",
      refreshTokenExpiresIn: "7d",
    });

    const token = tokenService.createAccessToken("user-100", "neo");

    expect(tokenService.verifyAccessToken(token)).toMatchObject({ sub: "user-100" });
  });

  it("rejects a token without a string subject", () => {
    const tokenService = createTestTokenService();
    const token = jwt.sign(
      { nickname: "neo" },
      "access-test-secret",
    );

    expect(() => tokenService.verifyAccessToken(token)).toThrow(
      "올바르지 않은 인증 토큰입니다.",
    );
  });

  it("creates and verifies a refresh token with an expiration", () => {
    const tokenService = createTestTokenService();

    const created = tokenService.createRefreshToken("user-100");

    expect(created.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(tokenService.verifyRefreshToken(created.token)).toEqual({
      sub: "user-100",
      tokenId: created.tokenId,
      type: "refresh",
    });
  });
});
