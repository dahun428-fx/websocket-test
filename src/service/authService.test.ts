import { describe, expect, it, vi } from "vitest";

import { createTokenService } from "../auth/tokenService";
import type { UnitOfWork } from "../application/unitOfWork";
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from "../application/errors/authErrors";
import type { RefreshTokenRepository } from "../repositories/refreshTokenRepository";
import type { UserRepository } from "../repositories/userRepository";
import { createAuthService } from "./authService";

const TEST_PASSWORD_HASH =
  "$2b$12$nqdy15ta1ILfCfH7nih9Tu5Vk3VVr/Mdp4Gu2ucu48iLUHvEouLu6";

function createUserRepository(): UserRepository {
  return {
    findById: vi.fn(async (userId) => {
      if (userId !== "user-100") {
        return null;
      }

      return {
        id: "user-100",
        nickname: "neo",
        passwordHash: TEST_PASSWORD_HASH,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    }),
    create: vi.fn(),
  };
}

function createTestTokenService() {
  return createTokenService({
    accessTokenSecret: "access-test-secret",
    accessTokenExpiresIn: "15m",
    refreshTokenSecret: "refresh-test-secret",
    refreshTokenExpiresIn: "7d",
  });
}

function createRefreshTokenRepository(): RefreshTokenRepository {
  return {
    findByTokenId: vi.fn(async () => null),
    save: vi.fn(async (input) => input.tokenHash),
    revoke: vi.fn(async () => true),
  };
}

function createImmediateUnitOfWork(): UnitOfWork {
  return {
    run: (work) => work(),
  };
}

describe("authService", () => {
  it("returns a login result with a verifiable access token for valid credentials", async () => {
    const tokenService = createTestTokenService();
    const userRepository = createUserRepository();
    const authService = createAuthService({
      userRepository,
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService,
      unitOfWork: createImmediateUnitOfWork(),
    });

    const result = await authService.login({
      userId: "user-100",
      password: "test1234",
    });

    expect(userRepository.findById).toHaveBeenCalledWith("user-100");
    expect(result).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
      user: {
        userId: "user-100",
        nickname: "neo",
      },
    });
    expect(tokenService.verifyAccessToken(result.accessToken)).toEqual({
      sub: "user-100",
      nickname: "neo",
      type: "access",
    });
  });

  it("throws InvalidCredentialsError for an unknown user", async () => {
    const verifyPassword = vi.fn(async () => false);
    const authService = createAuthService({
      userRepository: createUserRepository(),
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService: createTestTokenService(),
      unitOfWork: createImmediateUnitOfWork(),
      passwordService: { verifyPassword },
    });

    await expect(authService.login({
      userId: "unknown-user",
      password: "test1234",
    })).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith("test1234", expect.stringMatching(/^\$2b\$12\$/));
  });

  it("throws the same InvalidCredentialsError for an invalid password", async () => {
    const authService = createAuthService({
      userRepository: createUserRepository(),
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService: createTestTokenService(),
      unitOfWork: createImmediateUnitOfWork(),
    });

    await expect(authService.login({
      userId: "user-100",
      password: "wrong-password",
    })).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("throws InvalidRefreshTokenError for malformed tokens", async () => {
    const authService = createAuthService({
      userRepository: createUserRepository(),
      refreshTokenRepository: createRefreshTokenRepository(),
      tokenService: createTestTokenService(),
      unitOfWork: createImmediateUnitOfWork(),
    });

    await expect(authService.refresh({
      refreshToken: "malformed-token",
    })).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it("does not swallow repository failures during logout", async () => {
    const databaseError = new Error("database unavailable");
    const refreshTokenRepository = createRefreshTokenRepository();
    vi.mocked(refreshTokenRepository.revoke).mockRejectedValue(databaseError);
    const authService = createAuthService({
      userRepository: createUserRepository(),
      refreshTokenRepository,
      tokenService: createTestTokenService(),
      unitOfWork: createImmediateUnitOfWork(),
    });
    const login = await authService.login({
      userId: "user-100",
      password: "test1234",
    });

    await expect(authService.logout({
      refreshToken: login.refreshToken,
    })).rejects.toBe(databaseError);
  });

  it("rotates a refresh token once and revokes it on logout", async () => {
    const tokens = new Map<string, {
      tokenId: string;
      userId: string;
      tokenHash: string;
      expiresAt: string;
      createdAt: string;
      revokedAt: string | null;
    }>();
    const refreshTokenRepository: RefreshTokenRepository = {
      findByTokenId: vi.fn(async (tokenId) => tokens.get(tokenId) ?? null),
      save: vi.fn(async (input) => {
        tokens.set(input.tokenId, { ...input, revokedAt: null });
        return input.tokenHash;
      }),
      revoke: vi.fn(async (tokenId) => {
        const token = tokens.get(tokenId);
        if (!token || token.revokedAt) return false;
        token.revokedAt = new Date().toISOString();
        return true;
      }),
    };
    const authService = createAuthService({
      userRepository: createUserRepository(),
      refreshTokenRepository,
      tokenService: createTestTokenService(),
      unitOfWork: createImmediateUnitOfWork(),
    });

    const login = await authService.login({
      userId: "user-100",
      password: "test1234",
    });
    const refreshed = await authService.refresh({
      refreshToken: login.refreshToken,
    });

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    await expect(authService.refresh({
      refreshToken: login.refreshToken,
    })).rejects.toBeInstanceOf(RefreshTokenReusedError);

    await authService.logout({ refreshToken: refreshed.refreshToken });
    await expect(authService.refresh({
      refreshToken: refreshed.refreshToken,
    })).rejects.toBeInstanceOf(RefreshTokenReusedError);
  });
});
