import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTokenService } from "../auth/tokenService";
import { openDatabase, type DatabaseConnection } from "../database/database";
import { createSqliteUnitOfWork } from "../database/sqliteUnitOfWork";
import {
  createRefreshTokenRepository,
  type RefreshTokenRepository,
} from "../repositories/refreshTokenRepository";
import { createUserRepository } from "../repositories/userRepository";
import { createAuthService } from "./authService";

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe("authService transactions", () => {
  let database: DatabaseConnection;
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "auth-transaction-"));
    database = await openDatabase(path.join(testDirectory, "auth.db"));
  });

  afterEach(async () => {
    await database.close();
    await rm(testDirectory, { recursive: true, force: true });
  });

  it("restores the previous refresh token when next-token persistence fails", async () => {
    const userRepository = createUserRepository(database);
    await userRepository.create({
      id: "user-1",
      nickname: "neo",
      passwordHash: "hash",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const actualTokens = createRefreshTokenRepository(database);
    let failSave = false;
    const refreshTokenRepository: RefreshTokenRepository = {
      ...actualTokens,
      save: async (input) => {
        if (failSave) {
          throw new Error("forced next-token save failure");
        }
        return actualTokens.save(input);
      },
    };
    const tokenService = createTokenService({
      accessTokenSecret: "access-transaction-secret",
      accessTokenExpiresIn: "15m",
      refreshTokenSecret: "refresh-transaction-secret",
      refreshTokenExpiresIn: "7d",
    });
    const unitOfWork = createSqliteUnitOfWork({
      database,
      logger: createLogger(),
    });
    const createService = (tokens: RefreshTokenRepository) => createAuthService({
      userRepository,
      refreshTokenRepository: tokens,
      tokenService,
      unitOfWork,
      passwordService: {
        verifyPassword: vi.fn(async () => true),
        hashPassword: vi.fn(async () => "hash"),
      },
    });
    const authService = createService(refreshTokenRepository);
    const login = await authService.login({
      userId: "user-1",
      password: "test1234",
    });
    const originalTokenId = tokenService.verifyRefreshToken(
      login.refreshToken,
    ).tokenId;

    failSave = true;
    await expect(authService.refresh({
      refreshToken: login.refreshToken,
    })).rejects.toThrow("forced next-token save failure");
    await expect(actualTokens.findByTokenId(originalTokenId)).resolves.toMatchObject({
      revokedAt: null,
    });

    const recovered = await createService(actualTokens).refresh({
      refreshToken: login.refreshToken,
    });
    expect(recovered.refreshToken).not.toBe(login.refreshToken);
  });

  it("rolls back user creation when initial token persistence fails", async () => {
    const userRepository = createUserRepository(database);
    const actualTokens = createRefreshTokenRepository(database);
    const failingTokens: RefreshTokenRepository = {
      ...actualTokens,
      save: async () => {
        throw new Error("forced initial-token save failure");
      },
    };
    const authService = createAuthService({
      userRepository,
      refreshTokenRepository: failingTokens,
      tokenService: createTokenService({
        accessTokenSecret: "access-signup-secret",
        accessTokenExpiresIn: "15m",
        refreshTokenSecret: "refresh-signup-secret",
        refreshTokenExpiresIn: "7d",
      }),
      unitOfWork: createSqliteUnitOfWork({
        database,
        logger: createLogger(),
      }),
      passwordService: {
        verifyPassword: vi.fn(async () => true),
        hashPassword: vi.fn(async () => "hash"),
      },
    });

    await expect(authService.signup({
      userId: "user-rollback",
      nickname: "rollback",
      password: "test1234",
    })).rejects.toThrow("forced initial-token save failure");
    await expect(userRepository.findById("user-rollback")).resolves.toBeNull();
  });
});
