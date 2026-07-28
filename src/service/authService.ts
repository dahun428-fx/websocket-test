import {
  verifyPassword as defaultVerifyPassword,
} from "../auth/passwordService";
import crypto from "node:crypto";

import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from "../application/errors/authErrors";
import type { UnitOfWork } from "../application/unitOfWork";
import { hashRefreshToken } from "../auth/refreshTokenHash";
import {
  type CreatedRefreshToken,
  type TokenService,
} from "../auth/tokenService";
import type { RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import type { UserRepository } from "../repositories/userRepository";

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

export interface RefreshTokenCommand {
  refreshToken: string;
}

export interface AuthService {
  login(command: LoginCommand): Promise<AuthResult>;
  refresh(command: RefreshTokenCommand): Promise<AuthResult>;
  logout(command: RefreshTokenCommand): Promise<void>;
}

export interface AuthServiceDependencies {
  verifyPassword(password: string, hash: string): Promise<boolean>;
  createAccessToken(userId: string, nickname: string): string;
  createRefreshToken(userId: string): CreatedRefreshToken;
  verifyRefreshToken: TokenService["verifyRefreshToken"];
}

export interface CreateAuthServiceOptions {
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
  tokenService: TokenService;
  unitOfWork: UnitOfWork;
  passwordService?: Pick<AuthServiceDependencies, "verifyPassword">;
}

export function createAuthService(
  options: CreateAuthServiceOptions,
): AuthService {
  const {
    userRepository,
    refreshTokenRepository,
    tokenService,
    unitOfWork,
  } = options;
  const dependencies: AuthServiceDependencies = {
    verifyPassword: defaultVerifyPassword,
    createAccessToken: tokenService.createAccessToken,
    createRefreshToken: tokenService.createRefreshToken,
    verifyRefreshToken: tokenService.verifyRefreshToken,
    ...options.passwordService,
  };

  function prepareTokens(user: { id: string; nickname: string }) {
    const refresh = dependencies.createRefreshToken(user.id);
    return {
      result: {
        accessToken: dependencies.createAccessToken(user.id, user.nickname),
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
        user: { userId: user.id, nickname: user.nickname },
      },
      record: {
        tokenId: refresh.tokenId,
        tokenHash: hashRefreshToken(refresh.token),
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: refresh.expiresAt,
      },
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

    const prepared = prepareTokens(user);
    await unitOfWork.run(
      () => refreshTokenRepository.save(prepared.record),
    );
    return prepared.result;
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

    const prepared = prepareTokens(user);
    await unitOfWork.run(async () => {
      if (!await refreshTokenRepository.revoke(storedToken.tokenId)) {
        throw new RefreshTokenReusedError(storedToken.tokenId);
      }
      await refreshTokenRepository.save(prepared.record);
    });

    return prepared.result;
  }

  async function logout(command: RefreshTokenCommand): Promise<void> {
    let payload;
    try {
      payload = dependencies.verifyRefreshToken(command.refreshToken);
    } catch {
      // An expired or malformed cookie still needs to be cleared by the handler.
      return;
    }

    await unitOfWork.run(
      () => refreshTokenRepository.revoke(payload.tokenId),
    );
  }

  return { login, refresh, logout };
}
