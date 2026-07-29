import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTokenService } from "../auth/tokenService";
import { createCreateRoomUseCase } from "../application/room/createRoom";
import { createUserUseCase } from "../application/user/createUser";
import { openDatabase, type DatabaseConnection } from "../database/database";
import { createSqliteUnitOfWork } from "../database/sqliteUnitOfWork";
import type { Logger } from "../logging/logger";
import { createRefreshTokenRepository } from "../repositories/refreshTokenRepository";
import { createRoomMemberRepository } from "../repositories/roomMemberRepository";
import { createRoomRepository } from "../repositories/roomRepository";
import { createUserRepository } from "../repositories/userRepository";
import { createSqliteOutboxRepository } from "./createSqliteOutboxRepository";
import { createOutboxEventPublisher } from "./outboxEventPublisher";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe("transactional outbox", () => {
  let database: DatabaseConnection;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "outbox-atomicity-"));
    database = await openDatabase(path.join(directory, "test.db"));
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  function createDependencies() {
    const userRepository = createUserRepository(database);
    const refreshTokenRepository = createRefreshTokenRepository(database);
    const outboxRepository = createSqliteOutboxRepository({ database });
    const unitOfWork = createSqliteUnitOfWork({
      database,
      logger: createLogger(),
    });
    const tokenService = createTokenService({
      accessTokenSecret: "outbox-access-secret-that-is-long-enough",
      accessTokenExpiresIn: "15m",
      refreshTokenSecret: "outbox-refresh-secret-that-is-long-enough",
      refreshTokenExpiresIn: "7d",
    });

    return {
      userRepository,
      refreshTokenRepository,
      outboxRepository,
      unitOfWork,
      tokenService,
    };
  }

  it("commits user data and UserCreated outbox event together", async () => {
    const dependencies = createDependencies();
    const useCase = createUserUseCase({
      ...dependencies,
      outboxEventPublisher: createOutboxEventPublisher({
        outboxRepository: dependencies.outboxRepository,
      }),
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
      runtime: {
        now: () => new Date("2026-07-28T00:00:00.000Z"),
      },
    });

    await useCase.execute({
      userId: "user-1",
      nickname: "다훈",
      password: "password1234",
    });

    await expect(
      dependencies.userRepository.findById("user-1"),
    ).resolves.not.toBeNull();
    const events = await dependencies.outboxRepository.findAvailable({
      now: "9999-12-31T23:59:59.999Z",
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventName).toBe("UserCreated");
  });

  it("rolls back user data when enqueueing the outbox event fails", async () => {
    const dependencies = createDependencies();
    const publisher = createOutboxEventPublisher({
      outboxRepository: dependencies.outboxRepository,
    });
    const useCase = createUserUseCase({
      ...dependencies,
      outboxEventPublisher: {
        async enqueue(event) {
          await publisher.enqueue(event);
          throw new Error("forced outbox failure");
        },
      },
      passwordService: {
        hashPassword: vi.fn(async () => "password-hash"),
      },
    });

    await expect(useCase.execute({
      userId: "user-rollback",
      nickname: "rollback",
      password: "password1234",
    })).rejects.toThrow("forced outbox failure");

    await expect(
      dependencies.userRepository.findById("user-rollback"),
    ).resolves.toBeNull();
    await expect(dependencies.outboxRepository.findAvailable({
      now: "9999-12-31T23:59:59.999Z",
      limit: 10,
    })).resolves.toEqual([]);
  });

  it("rolls back room and owner membership when outbox enqueue fails", async () => {
    const dependencies = createDependencies();
    await dependencies.userRepository.create({
      id: "owner-1",
      nickname: "owner",
      passwordHash: "password-hash",
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    const roomRepository = createRoomRepository(database);
    const roomMemberRepository = createRoomMemberRepository(database);
    const publisher = createOutboxEventPublisher({
      outboxRepository: dependencies.outboxRepository,
    });
    const useCase = createCreateRoomUseCase({
      roomRepository,
      roomMemberRepository,
      unitOfWork: dependencies.unitOfWork,
      outboxEventPublisher: {
        async enqueue(event) {
          await publisher.enqueue(event);
          throw new Error("forced room outbox failure");
        },
      },
      runtime: {
        createId: () => "room-rollback",
        now: () => new Date("2026-07-28T00:00:00.000Z"),
      },
    });

    await expect(useCase.execute({
      userId: "owner-1",
      name: "rollback room",
    })).rejects.toThrow("forced room outbox failure");

    await expect(roomRepository.findById("room-rollback")).resolves.toBeNull();
    await expect(roomMemberRepository.find(
      "room-rollback",
      "owner-1",
    )).resolves.toBeNull();
    await expect(dependencies.outboxRepository.findAvailable({
      now: "9999-12-31T23:59:59.999Z",
      limit: 10,
    })).resolves.toEqual([]);
  });
});
