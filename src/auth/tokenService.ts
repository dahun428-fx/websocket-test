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

export interface TokenServiceOptions {
  accessTokenSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenSecret: string;
  refreshTokenExpiresIn: string;
}

export interface TokenService {
  createAccessToken(userId: string, nickname: string): string;
  createRefreshToken(userId: string): CreatedRefreshToken;
  verifyAccessToken(token: string): AccessTokenPayload;
  verifyRefreshToken(token: string): RefreshTokenPayload;
}

export function createTokenService(options: TokenServiceOptions): TokenService {
  function createAccessToken(userId: string, nickname: string): string {
    const payload: AccessTokenPayload = { sub: userId, nickname, type: "access" };
    return jwt.sign(payload, options.accessTokenSecret, {
      expiresIn: options.accessTokenExpiresIn as SignOptions["expiresIn"],
    });
  }

  function createRefreshToken(userId: string): CreatedRefreshToken {
    const tokenId = crypto.randomUUID();
    const payload: RefreshTokenPayload = { sub: userId, tokenId, type: "refresh" };
    const token = jwt.sign(payload, options.refreshTokenSecret, {
      expiresIn: options.refreshTokenExpiresIn as SignOptions["expiresIn"],
    });
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (typeof decoded?.exp !== "number") {
      throw new Error("Refresh Token 만료 시간을 확인할 수 없습니다.");
    }
    return { token, tokenId, expiresAt: new Date(decoded.exp * 1_000).toISOString() };
  }

  function verifyAccessToken(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, options.accessTokenSecret) as JwtPayload & AccessTokenPayload;
    if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.nickname !== "string") {
      throw new Error("올바르지 않은 인증 토큰입니다.");
    }
    return { sub: payload.sub, nickname: payload.nickname, type: "access" };
  }

  function verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = jwt.verify(token, options.refreshTokenSecret) as JwtPayload & RefreshTokenPayload;
    if (payload.type !== "refresh" || typeof payload.sub !== "string" || typeof payload.tokenId !== "string") {
      throw new Error("올바르지 않은 Refresh Token입니다.");
    }
    return { sub: payload.sub, tokenId: payload.tokenId, type: "refresh" };
  }

  return { createAccessToken, createRefreshToken, verifyAccessToken, verifyRefreshToken };
}
