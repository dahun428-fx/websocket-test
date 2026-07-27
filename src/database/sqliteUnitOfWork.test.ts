import { describe, expect, it, vi } from "vitest";

import type { DatabaseConnection } from "./database";
import { createSqliteUnitOfWork } from "./sqliteUnitOfWork";

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe("createSqliteUnitOfWork", () => {
  it("commits successful work", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const unitOfWork = createSqliteUnitOfWork({
      database: { exec } as unknown as DatabaseConnection,
      logger: createLogger(),
    });

    await expect(unitOfWork.run(async () => "success")).resolves.toBe("success");
    expect(exec.mock.calls).toEqual([
      ["BEGIN IMMEDIATE"],
      ["COMMIT"],
    ]);
  });

  it("rolls back failed work and preserves the original error", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const unitOfWork = createSqliteUnitOfWork({
      database: { exec } as unknown as DatabaseConnection,
      logger: createLogger(),
    });
    const operationError = new Error("operation failed");

    await expect(
      unitOfWork.run(async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(exec.mock.calls).toEqual([
      ["BEGIN IMMEDIATE"],
      ["ROLLBACK"],
    ]);
  });

  it("logs rollback failures without hiding the operation error", async () => {
    const rollbackError = new Error("rollback failed");
    const exec = vi.fn(async (sql: string) => {
      if (sql === "ROLLBACK") {
        throw rollbackError;
      }
    });
    const logger = createLogger();
    const unitOfWork = createSqliteUnitOfWork({
      database: { exec } as unknown as DatabaseConnection,
      logger,
    });
    const operationError = new Error("operation failed");

    await expect(
      unitOfWork.run(async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(logger.error).toHaveBeenCalledWith("Transaction rollback failed", {
      error: rollbackError,
    });
  });

  it("serializes concurrent transactions", async () => {
    const events: string[] = [];
    const unitOfWork = createSqliteUnitOfWork({
      database: {
        exec: vi.fn(async (sql: string) => {
          events.push(sql);
        }),
      } as unknown as DatabaseConnection,
      logger: createLogger(),
    });
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = unitOfWork.run(async () => {
      events.push("first-work");
      await firstCanFinish;
    });
    const second = unitOfWork.run(async () => {
      events.push("second-work");
    });
    await vi.waitFor(() => {
      expect(events).toContain("first-work");
    });
    expect(events).not.toContain("second-work");

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual([
      "BEGIN IMMEDIATE",
      "first-work",
      "COMMIT",
      "BEGIN IMMEDIATE",
      "second-work",
      "COMMIT",
    ]);
  });

  it("rejects nested transactions without deadlocking", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const unitOfWork = createSqliteUnitOfWork({
      database: { exec } as unknown as DatabaseConnection,
      logger: createLogger(),
    });

    await expect(
      unitOfWork.run(() => unitOfWork.run(async () => undefined)),
    ).rejects.toThrow("Nested transactions are not supported.");
    expect(exec.mock.calls).toEqual([
      ["BEGIN IMMEDIATE"],
      ["ROLLBACK"],
    ]);
  });
});
