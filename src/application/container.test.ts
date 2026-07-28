import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTestContainer } from "../test/createTestContainer";
import { createApplication, type Application } from "./application";

describe("Application container", () => {
  let application: Application | undefined;
  let testDirectory: string | undefined;

  afterEach(async () => {
    await application?.stop("test_cleanup");
    if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  });

  it("assembles the application dependencies", async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "container-test-"));
    const container = await createTestContainer(path.join(testDirectory, "container.db"));

    expect(container.repositories.userRepository).toBeDefined();
    expect(container.repositories.messageRepository).toBeDefined();
    expect(container.repositories.refreshTokenRepository).toBeDefined();
    expect(container.repositories.roomRepository).toBeDefined();
    expect(container.repositories.roomMemberRepository).toBeDefined();
    expect(container.unitOfWork).toBeDefined();
    expect(container.services.authService).toBeDefined();
    expect(container.services.roomService).toBeDefined();
    expect(container.useCases.createRoom).toBeDefined();
    expect(container.useCases.createUser).toBeDefined();
    expect(container.servers.httpServer).toBeDefined();
    expect(container.servers.webSocketServer).toBeDefined();
    expect(container.runtimes.chatRuntime).toBeDefined();

    application = createApplication(container);
  });

  it("starts and stops the assembled application", async () => {
    testDirectory = await mkdtemp(path.join(os.tmpdir(), "container-test-"));
    const container = await createTestContainer(path.join(testDirectory, "lifecycle.db"));
    application = createApplication(container);

    const port = await application.start();
    expect(port).toBeGreaterThan(0);
    expect(container.servers.httpServer.listening).toBe(true);

    await application.stop("test");
    expect(container.servers.httpServer.listening).toBe(false);
  });
});
