import { describe, expect, it, vi } from "vitest";

import type { HttpContext } from "../context/httpContext";
import { handleHttpError, HttpError } from "./httpError";

function createContext() {
    const context = {
        requestId: "request-123",
        res: { writableEnded: false },
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(),
        },
        setHeader: vi.fn(),
        json: vi.fn(),
    } as unknown as HttpContext;
    return context;
}

describe("handleHttpError", () => {
    it("serializes expected HTTP errors with the request ID", () => {
        const context = createContext();

        handleHttpError(context, new HttpError({
            statusCode: 429,
            code: "RATE_LIMITED",
            message: "잠시 후 다시 시도하세요.",
            headers: { "Retry-After": "30" },
        }));

        expect(context.setHeader).toHaveBeenCalledWith("Retry-After", "30");
        expect(context.json).toHaveBeenCalledWith(429, {
            error: {
                code: "RATE_LIMITED",
                message: "잠시 후 다시 시도하세요.",
                details: undefined,
                requestId: "request-123",
            },
        });
    });

    it("does not expose unexpected errors", () => {
        const context = createContext();

        handleHttpError(context, new Error("database connection details"));

        expect(context.json).toHaveBeenCalledWith(500, {
            error: {
                code: "INTERNAL_SERVER_ERROR",
                message: "서버 내부 오류가 발생했습니다.",
                requestId: "request-123",
            },
        });
    });
});
