import crypto from "node:crypto"
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type {
  AccessTokenPayload, AuthTokenPayload, RefreshTokenPayload
} from "../types/auth"

export interface CreatedRefreshToken {
  token: string;
  tokenId: string;
  expiresAt: string;
}

function getAccessToken(): string {
  const accessToken = process.env.JWT_ACCESS_SECRET;

  if (!accessToken) {
    throw new Error("JWT ACCESS_SECRET 환경변수가 필요합니다.");
  }

  return accessToken;
}

function getRefreshToken(): string {
  const refreshToken = process.env.JWT_REFRESH_SECRET;

  if (!refreshToken) {
    throw new Error("JWT REFRESH_SECRET 환경변수가 필요합니다.");
  }

  return refreshToken;
}

export function createAccessToken(
  userId: string,
  nickname: string,
): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    nickname,
    type: "access"
  };

  return jwt.sign(payload, getAccessToken(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"] ?? "15m"
  });
}

export function createRefreshToken(userId: string): CreatedRefreshToken {
  const tokenId = crypto.randomUUID();
  const payload: RefreshTokenPayload = {
    sub: userId,
    tokenId,
    type: "refresh"
  }
  const token = jwt.sign(payload, getRefreshToken(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"] ?? "7d"
  })
  const decoded = jwt.decode(token) as JwtPayload | null;

  if (typeof decoded?.exp !== "number") {
    throw new Error("Refresh Token 만료 시간을 확인할 수 없습니다.");
  }

  return {
    token,
    tokenId,
    expiresAt: new Date(decoded.exp * 1_000).toISOString(),
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getAccessToken()) as JwtPayload & AccessTokenPayload;

  if (
    payload.type !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.nickname !== "string"
  ) {
    throw new Error("올바르지 않은 인증 토큰입니다.");
  }

  return {
    sub: payload.sub,
    nickname: payload.nickname,
    type: "access",
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, getRefreshToken()) as JwtPayload & RefreshTokenPayload

  if (
    payload.type !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.tokenId !== "string"
  ) {
    throw new Error(
      "올바르지 않은 Refresh Token입니다.",
    );
  }

  return {
    sub: payload.sub,
    tokenId: payload.tokenId,
    type: "refresh",
  };
}
