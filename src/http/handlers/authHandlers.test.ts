import { describe, expect, it, vi } from "vitest";

import {
    InvalidCredentialsError,
    InvalidRefreshTokenError,
} from "../../application/errors/authErrors";
import type { CreateUserUseCase } from "../../application/user/createUser";
import type { AuthService } from "../../service/authService";
import type { HttpContext } from "../context/httpContext";
import { createAuthHandlers } from "./authHandlers";

function createContext(body: unknown, cookie?: string) {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
    };
    const context = {
        body,
        requestId: "request-123",
        req: {
            headers: cookie ? { cookie } : {},
            socket: { remoteAddress: "127.0.0.1" },
        },
        res: { statusCode: 200, writableEnded: false },
        logger,
        setHeader: vi.fn(),
        json: vi.fn(),
    } as unknown as HttpContext;

    return { context, logger };
}

function createAuthService(): AuthService {
    return {
        login: vi.fn(),
        refresh: vi.fn(),
        logout: vi.fn(),
    };
}

function createUserUseCase(): CreateUserUseCase {
    return {
        execute: vi.fn(),
    };
}

function createHandlers(
    authService: AuthService,
    maxAttempts = 5,
    userUseCase = createUserUseCase(),
) {
    return createAuthHandlers({
        authService,
        createUserUseCase: userUseCase,
        loginRateLimit: { maxAttempts, windowMs: 60_000 },
        refreshTokenCookie: {
            name: "refresh_token",
            maxAgeSeconds: 60_000,
            secure: false,
        },
        runtime: { now: () => 1_000 },
    });
}

describe("auth route handlers", () => {
    it("delegates signup to CreateUserUseCase", async () => {
        const authService = createAuthService();
        const userUseCase = createUserUseCase();
        vi.mocked(userUseCase.execute).mockResolvedValue({
            accessToken: "access-token",
            refreshToken: "refresh-token",
            refreshTokenExpiresAt: "2026-01-02T00:00:00.000Z",
            user: { userId: "user-100", nickname: "neo" },
        });
        const { context } = createContext({
            userId: "user-100",
            nickname: "neo",
            password: "never-log-this",
        });

        await createHandlers(authService, 5, userUseCase).signup(context);

        expect(userUseCase.execute).toHaveBeenCalledWith({
            userId: "user-100",
            nickname: "neo",
            password: "never-log-this",
        });
        expect(context.json).toHaveBeenCalledWith(201, {
            accessToken: "access-token",
            user: { userId: "user-100", nickname: "neo" },
        });
    });

    it("returns tokens safely without logging the password", async () => {
        const authService = createAuthService();
        vi.mocked(authService.login).mockResolvedValue({
            accessToken: "access-token",
            refreshToken: "refresh-token",
            refreshTokenExpiresAt: "2026-01-02T00:00:00.000Z",
            user: { userId: "user-100", nickname: "neo" },
        });
        const { context, logger } = createContext({
            userId: "user-100",
            password: "never-log-this",
        });

        await createHandlers(authService).login(context);

        expect(context.json).toHaveBeenCalledWith(200, {
            accessToken: "access-token",
            user: { userId: "user-100", nickname: "neo" },
        });
        expect(context.setHeader).toHaveBeenCalledWith(
            "Set-Cookie",
            expect.stringContaining("HttpOnly"),
        );
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain("never-log-this");
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("never-log-this");
    });

    it("limits repeated login attempts", async () => {
        const authService = createAuthService();
        vi.mocked(authService.login).mockRejectedValue(new InvalidCredentialsError());
        const handlers = createHandlers(authService, 1);
        const first = createContext({ userId: "user-100", password: "invalid-password" });
        const second = createContext({ userId: "user-100", password: "invalid-password" });

        await expect(handlers.login(first.context)).rejects.toMatchObject({
            code: "INVALID_CREDENTIALS",
        });
        await expect(handlers.login(second.context)).rejects.toMatchObject({
            code: "LOGIN_RATE_LIMITED",
            headers: { "Retry-After": "60" },
        });
        expect(authService.login).toHaveBeenCalledTimes(1);
    });

    it("clears an invalid refresh-token cookie", async () => {
        const authService = createAuthService();
        vi.mocked(authService.refresh).mockRejectedValue(new InvalidRefreshTokenError());
        const { context } = createContext(undefined, "refresh_token=invalid-token");

        await expect(createHandlers(authService).refresh(context))
            .rejects.toBeInstanceOf(InvalidRefreshTokenError);
        expect(context.setHeader).toHaveBeenCalledWith(
            "Set-Cookie",
            expect.stringContaining("Max-Age=0"),
        );
    });
});
