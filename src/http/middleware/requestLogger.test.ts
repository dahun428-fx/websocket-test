import { describe, expect, it, vi } from "vitest";

import type { HttpContext } from "../context/httpContext";
import { requestLogger } from "./requestLogger";

describe("requestLogger", () => {
    it("logs request start and completion", async () => {
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(),
        };
        const context = {
            logger,
            res: { statusCode: 201 },
        } as unknown as HttpContext;

        await requestLogger()(context, async () => undefined);

        expect(logger.info).toHaveBeenNthCalledWith(1, "HTTP request started");
        expect(logger.info).toHaveBeenNthCalledWith(2, "HTTP request completed", {
            statusCode: 201,
            durationMs: expect.any(Number),
        });
    });
});
