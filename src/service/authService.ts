import {
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
} from "../auth/passwordService";
import crypto from "node:crypto";

import { hashRefreshToken } from "../auth/refreshTokenHash";
import {
  type CreatedRefreshToken,
  type TokenService,
} from "../auth/tokenService";
import type { RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import {
  UserAlreadyExistsError,
  type UserRepository,
} from "../repositories/userRepository";

const DUMMY_PASSWORD_HASH =
  "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6";

export interface AuthenticatedUser {
  userId: string;
  nickname: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthenticatedUser;
}

export interface SignupInput {
  userId: string;
  nickname: string;
  password: string;
}

export type SignupResult =
  | { success: true; data: AuthResult }
  | { success: false; reason: "USER_ID_ALREADY_EXISTS" };

export interface AuthService {
  login(userId: string, password: string): Promise<AuthResult | null>;
  signup(input: SignupInput): Promise<SignupResult>;
  refresh(refreshToken: string): Promise<AuthResult | null>;
  logout(refreshToken: string): Promise<void>;
}

export interface AuthServiceDependencies {
  verifyPassword(password: string, hash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  createAccessToken(userId: string, nickname: string): string;
  createRefreshToken(userId: string): CreatedRefreshToken;
  verifyRefreshToken: TokenService["verifyRefreshToken"];
}

export interface CreateAuthServiceOptions {
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
  tokenService: TokenService;
  passwordService?: Partial<Pick<AuthServiceDependencies, "verifyPassword" | "hashPassword">>;
}

export function createAuthService(
  options: CreateAuthServiceOptions,
): AuthService {
  const { userRepository, refreshTokenRepository, tokenService } = options;
  const dependencies: AuthServiceDependencies = {
    verifyPassword: defaultVerifyPassword,
    hashPassword: defaultHashPassword,
    createAccessToken: tokenService.createAccessToken,
    createRefreshToken: tokenService.createRefreshToken,
    verifyRefreshToken: tokenService.verifyRefreshToken,
    ...options.passwordService,
  };

  async function issueTokens(user: { id: string; nickname: string }): Promise<AuthResult> {
    const refresh = dependencies.createRefreshToken(user.id);
    await refreshTokenRepository.save({
      tokenId: refresh.tokenId,
      tokenHash: hashRefreshToken(refresh.token),
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken: dependencies.createAccessToken(user.id, user.nickname),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
      user: { userId: user.id, nickname: user.nickname },
    };
  }

  function hashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length
      && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  async function login(userId: string, password: string): Promise<AuthResult | null> {
    const user = await userRepository.findById(userId);
    const passwordMatched = await dependencies.verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatched) {
      return null;
    }

    return issueTokens(user);
  }

  async function signup(input: SignupInput): Promise<SignupResult> {
    const passwordHash = await dependencies.hashPassword(input.password);

    try {
      const user = await userRepository.create({
        id: input.userId,
        nickname: input.nickname,
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: await issueTokens(user),
      };
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        return { success: false, reason: "USER_ID_ALREADY_EXISTS" };
      }
      throw error;
    }
  }

  async function refresh(refreshToken: string): Promise<AuthResult | null> {
    let payload;
    try {
      payload = dependencies.verifyRefreshToken(refreshToken)
    } catch {
      return null
    }

    const storedToken = await refreshTokenRepository.findByTokenId(payload.tokenId);

    if (!storedToken) return null;

    if (storedToken.revokedAt) {
      return null;
    }

    if (new Date(storedToken.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    const incomingHash = hashRefreshToken(refreshToken)

    if (storedToken.userId !== payload.sub || !hashesMatch(incomingHash, storedToken.tokenHash)) {
      return null;
    }

    const user = await userRepository.findById(payload.sub);

    if (!user) return null;

    if (!await refreshTokenRepository.revoke(storedToken.tokenId)) {
      return null;
    }

    return issueTokens(user);
  }

  async function logout(refreshToken: string): Promise<void> {
    try {
      const payload = dependencies.verifyRefreshToken(refreshToken);
      await refreshTokenRepository.revoke(payload.tokenId);
    } catch {
      // An expired or malformed cookie still needs to be cleared by the handler.
    }
  }

  return { login, signup, refresh, logout };
}
