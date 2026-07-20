import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseConnection } from "../database/database";
import {
  createUserRepository,
  UserAlreadyExistsError,
  type UserRepository,
} from "./userRepository";

describe("createUserRepository", () => {
  let database: DatabaseConnection;
  let repository: UserRepository;
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "websocket-test-"));
    database = await openDatabase(path.join(testDirectory, "users.db"));
    repository = createUserRepository(database);
  });

  afterEach(async () => {
    await database.close();
    await rm(testDirectory, { recursive: true, force: true });
  });

  it("uses its injected database connection", async () => {
    await repository.create({
      id: "user-100",
      nickname: "neo",
      passwordHash: "hash",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(repository.findById("user-100")).resolves.toMatchObject({
      id: "user-100",
      nickname: "neo",
    });
  });

  it("maps concurrent duplicate inserts to a domain error", async () => {
    const input = {
      id: "user-100",
      nickname: "neo",
      passwordHash: "hash",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const results = await Promise.allSettled([
      repository.create(input),
      repository.create(input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({ reason: expect.any(UserAlreadyExistsError) });
  });
});
