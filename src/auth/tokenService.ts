import jwt from "jsonwebtoken";

import type { AuthTokenPayload } from "../types/auth";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET 환경변수가 필요합니다.");
  }

  return secret;
}

export function createAccessToken(
  userId: string,
  nickname?: string,
): string {
  const payload: AuthTokenPayload = {
    sub: userId,
    nickname,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "1h",
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.sub !== "string"
  ) {
    throw new Error("올바르지 않은 인증 토큰입니다.");
  }

  return {
    sub: decoded.sub,
    nickname:
      typeof decoded.nickname === "string" ? decoded.nickname : undefined,
  };
}
