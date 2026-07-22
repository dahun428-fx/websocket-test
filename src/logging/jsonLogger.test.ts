import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createJsonLogger } from "./jsonLogger";

describe("createJsonLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a JSON log entry with base and child context", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createJsonLogger({
      minimumLevel: "info",
      baseContext: { application: "chat-backend" },
    }).child({ requestId: "request-123" });

    logger.info("HTTP request started", { path: "/login" });

    const entry = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({
      level: "info",
      message: "HTTP request started",
      application: "chat-backend",
      requestId: "request-123",
      path: "/login",
    });
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  it("filters entries below the configured minimum level", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createJsonLogger({ minimumLevel: "warn" });

    logger.info("not written");
    logger.warn("written");

    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      level: "warn",
      message: "written",
    });
  });
});
