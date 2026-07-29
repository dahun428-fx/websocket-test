import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { UserAlreadyExistsError } from "../errors/authErrors";
import type { UnitOfWork } from "../unitOfWork";
import { createTokenService } from "../../auth/tokenService";
import { openDatabase, type DatabaseConnection } from "../../database/database";
import { createSqliteUnitOfWork } from "../../database/sqliteUnitOfWork";
import type { Logger } from "../../logging/logger";
import type { OutboxEventPublisher } from "../../outbox/outboxEventPublisher";
import {
  createRefreshTokenRepository,
  type RefreshTokenRepository,
} from "../../repositories/refreshTokenRepository";
import {
  createUserRepository,
  DuplicateUserIdRepositoryError,
  type UserRepository,
} from "../../repositories/userRepository";
import { createUserUseCase } from "./createUser";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function createOutboxPublisher(
  enqueue: OutboxEventPublisher["enqueue"] = async () => undefined,
): OutboxEventPublisher {
  return { enqueue };
}

function createTokenServiceForTest() {
  return createTokenService({
    accessTokenSecret: "access-create-user-secret",
    accessTokenExpiresIn: "15m",
    refreshTokenSecret: "refresh-create-user-secret",
    refreshTokenExpiresIn: "7d",
  });
}

function createRefreshTokens(): RefreshTokenRepository {
  return {
    findByTokenId: vi.fn(async () => null),
    save: vi.fn(async (input) => input.tokenHash),
    revoke: vi.fn(async () => true),
  };
}

describe("createUserUseCase", () => {
  it("creates a user and enqueues UserCreated before commit", async () => {
    let committed = false;
    const publish = vi.fn(async () => {
      expect(committed).toBe(false);
    });
    const userRepository: UserRepository = {
      findById: vi.fn(async () => null),
      create: vi.fn(async (input) => input),
    };
    const useCase = createUserUseCase({
      userRepository,
      refreshTokenRepository: createRefreshTokens(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: async (work) => {
          const result = await work();
          committed = true;
          return result;
        },
      },
      outboxEventPublisher: createOutboxPublisher(publish),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
      runtime: {
        now: () => new Date("2026-07-27T00:00:00.000Z"),
      },
    });

    const result = await useCase.execute({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    });

    expect(result).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
      user: {
        userId: "user-1",
        nickname: "다훈",
      },
    });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      name: "UserCreated",
      payload: {
        userId: "user-1",
        loginId: "user-1",
        nickname: "다훈",
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    }));
  });

  it("does not publish when the transaction fails", async () => {
    const publish = vi.fn(async () => undefined);
    const useCase = createUserUseCase({
      userRepository: {
        findById: vi.fn(async () => null),
        create: vi.fn(async (input) => input),
      },
      refreshTokenRepository: createRefreshTokens(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: async () => {
          throw new Error("database failure");
        },
      },
      outboxEventPublisher: createOutboxPublisher(publish),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(useCase.execute({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    })).rejects.toThrow("database failure");

    expect(publish).not.toHaveBeenCalled();
  });

  it("maps duplicate repository errors to UserAlreadyExistsError", async () => {
    const useCase = createUserUseCase({
      userRepository: {
        findById: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw new DuplicateUserIdRepositoryError("user-1");
        }),
      },
      refreshTokenRepository: createRefreshTokens(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: (work) => work(),
      },
      outboxEventPublisher: createOutboxPublisher(),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(useCase.execute({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    })).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("preserves unexpected repository failures", async () => {
    const databaseError = new Error("database unavailable");
    const useCase = createUserUseCase({
      userRepository: {
        findById: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw databaseError;
        }),
      },
      refreshTokenRepository: createRefreshTokens(),
      tokenService: createTokenServiceForTest(),
      unitOfWork: {
        run: (work) => work(),
      },
      outboxEventPublisher: createOutboxPublisher(),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(useCase.execute({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    })).rejects.toBe(databaseError);
  });
});

describe("createUserUseCase transaction", () => {
  let database: DatabaseConnection;
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "create-user-"));
    database = await openDatabase(path.join(testDirectory, "users.db"));
  });

  afterEach(async () => {
    await database.close();
    await rm(testDirectory, { recursive: true, force: true });
  });

  it("rolls back the user when initial refresh-token persistence fails", async () => {
    const userRepository = createUserRepository(database);
    const actualTokens = createRefreshTokenRepository(database);
    const failingTokens: RefreshTokenRepository = {
      ...actualTokens,
      save: async () => {
        throw new Error("forced initial-token save failure");
      },
    };
    const useCase = createUserUseCase({
      userRepository,
      refreshTokenRepository: failingTokens,
      tokenService: createTokenServiceForTest(),
      unitOfWork: createSqliteUnitOfWork({
        database,
        logger: createLogger(),
      }),
      outboxEventPublisher: createOutboxPublisher(),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(useCase.execute({
      userId: "user-rollback",
      nickname: "rollback",
      password: "test1234",
    })).rejects.toThrow("forced initial-token save failure");
    await expect(userRepository.findById("user-rollback")).resolves.toBeNull();
  });
});
