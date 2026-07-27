import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteUnitOfWork } from "../../database/sqliteUnitOfWork";
import { openDatabase, type DatabaseConnection } from "../../database/database";
import {
  createRoomMemberRepository,
  type RoomMemberRepository,
} from "../../repositories/roomMemberRepository";
import { createRoomRepository } from "../../repositories/roomRepository";
import { createUserRepository } from "../../repositories/userRepository";
import { InvalidRoomNameError } from "../errors/roomErrors";
import { createCreateRoomUseCase } from "./createRoom";

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe("createCreateRoomUseCase", () => {
  let database: DatabaseConnection;
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "room-use-case-"));
    database = await openDatabase(path.join(testDirectory, "rooms.db"));
    await createUserRepository(database).create({
      id: "user-1",
      nickname: "owner",
      passwordHash: "hash",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  afterEach(async () => {
    await database.close();
    await rm(testDirectory, { recursive: true, force: true });
  });

  it("creates a room and its owner atomically", async () => {
    const roomRepository = createRoomRepository(database);
    const roomMemberRepository = createRoomMemberRepository(database);
    const useCase = createCreateRoomUseCase({
      roomRepository,
      roomMemberRepository,
      unitOfWork: createSqliteUnitOfWork({
        database,
        logger: createLogger(),
      }),
    });

    const result = await useCase.execute({
      userId: "user-1",
      name: "  테스트 방  ",
    });

    await expect(roomRepository.findById(result.roomId)).resolves.toMatchObject({
      id: result.roomId,
      name: "테스트 방",
      createdBy: "user-1",
    });
    await expect(
      roomMemberRepository.find(result.roomId, "user-1"),
    ).resolves.toMatchObject({
      role: "owner",
    });
  });

  it("rolls back the room when owner persistence fails", async () => {
    const roomRepository = createRoomRepository(database);
    const actualMembers = createRoomMemberRepository(database);
    const failingMembers: RoomMemberRepository = {
      ...actualMembers,
      add: (input) => actualMembers.add({
        ...input,
        userId: "missing-user",
      }),
    };
    const useCase = createCreateRoomUseCase({
      roomRepository,
      roomMemberRepository: failingMembers,
      unitOfWork: createSqliteUnitOfWork({
        database,
        logger: createLogger(),
      }),
      runtime: {
        createId: () => "room-rollback",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await expect(useCase.execute({
      userId: "user-1",
      name: "rollback room",
    })).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT" });
    await expect(roomRepository.findById("room-rollback")).resolves.toBeNull();
  });

  it("rejects an empty room name before starting a transaction", async () => {
    const unitOfWork = { run: vi.fn() };
    const useCase = createCreateRoomUseCase({
      roomRepository: createRoomRepository(database),
      roomMemberRepository: createRoomMemberRepository(database),
      unitOfWork,
    });

    await expect(useCase.execute({
      userId: "user-1",
      name: "   ",
    })).rejects.toBeInstanceOf(InvalidRoomNameError);
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });
});
