import {
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
} from "../auth/passwordService";
import crypto from "node:crypto";

import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
  UserAlreadyExistsError,
} from "../application/errors/authErrors";
import { hashRefreshToken } from "../auth/refreshTokenHash";
import {
  type CreatedRefreshToken,
  type TokenService,
} from "../auth/tokenService";
import type { RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import {
  DuplicateUserIdRepositoryError,
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

export interface LoginCommand {
  userId: string;
  password: string;
}

export interface SignupCommand {
  userId: string;
  nickname: string;
  password: string;
}

export interface RefreshTokenCommand {
  refreshToken: string;
}

export interface AuthService {
  login(command: LoginCommand): Promise<AuthResult>;
  signup(command: SignupCommand): Promise<AuthResult>;
  refresh(command: RefreshTokenCommand): Promise<AuthResult>;
  logout(command: RefreshTokenCommand): Promise<void>;
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

  async function login(command: LoginCommand): Promise<AuthResult> {
    const user = await userRepository.findById(command.userId);
    const passwordMatched = await dependencies.verifyPassword(
      command.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatched) {
      throw new InvalidCredentialsError();
    }

    return issueTokens(user);
  }

  async function signup(command: SignupCommand): Promise<AuthResult> {
    const passwordHash = await dependencies.hashPassword(command.password);

    try {
      const user = await userRepository.create({
        id: command.userId,
        nickname: command.nickname,
        passwordHash,
        createdAt: new Date().toISOString(),
      });

      return issueTokens(user);
    } catch (error) {
      if (error instanceof DuplicateUserIdRepositoryError) {
        throw new UserAlreadyExistsError(command.userId, { cause: error });
      }
      throw error;
    }
  }

  async function refresh(command: RefreshTokenCommand): Promise<AuthResult> {
    let payload;
    try {
      payload = dependencies.verifyRefreshToken(command.refreshToken);
    } catch (error) {
      throw new InvalidRefreshTokenError({ cause: error });
    }

    const storedToken = await refreshTokenRepository.findByTokenId(payload.tokenId);

    if (!storedToken) {
      throw new InvalidRefreshTokenError();
    }

    if (storedToken.revokedAt) {
      throw new RefreshTokenReusedError(storedToken.tokenId);
    }

    if (new Date(storedToken.expiresAt).getTime() <= Date.now()) {
      throw new InvalidRefreshTokenError();
    }

    const incomingHash = hashRefreshToken(command.refreshToken);

    if (storedToken.userId !== payload.sub || !hashesMatch(incomingHash, storedToken.tokenHash)) {
      throw new InvalidRefreshTokenError();
    }

    const user = await userRepository.findById(payload.sub);

    if (!user) {
      throw new InvalidRefreshTokenError();
    }

    if (!await refreshTokenRepository.revoke(storedToken.tokenId)) {
      throw new RefreshTokenReusedError(storedToken.tokenId);
    }

    return issueTokens(user);
  }

  async function logout(command: RefreshTokenCommand): Promise<void> {
    let payload;
    try {
      payload = dependencies.verifyRefreshToken(command.refreshToken);
    } catch {
      // An expired or malformed cookie still needs to be cleared by the handler.
      return;
    }

    await refreshTokenRepository.revoke(payload.tokenId);
  }

  return { login, signup, refresh, logout };
}
