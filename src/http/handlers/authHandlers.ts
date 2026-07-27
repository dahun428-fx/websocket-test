import type { LoginInput } from "../../schemas/loginSchema";
import type { SignupRequest } from "../../schemas/signupSchema";
import type { AuthResult, AuthService } from "../../service/authService";
import {
    clearRefreshTokenCookie,
    createRefreshTokenCookie,
    getCookie,
    type RefreshTokenCookieOptions,
} from "../cookieUtils";
import type { HttpContext } from "../context/httpContext";
import { HttpError } from "../errors/httpError";
import type { RouteHandler } from "../middleware/middleware";

export interface LoginRateLimitOptions {
    maxAttempts: number;
    windowMs: number;
}

export interface AuthHandlerRuntimeOptions {
    now?: () => number;
}

export interface CreateAuthHandlersOptions {
    authService: AuthService;
    loginRateLimit: LoginRateLimitOptions;
    refreshTokenCookie: RefreshTokenCookieOptions;
    runtime?: AuthHandlerRuntimeOptions;
}

export interface AuthHandlers {
    login: RouteHandler;
    signup: RouteHandler;
    refresh: RouteHandler;
    logout: RouteHandler;
}

interface RateLimitEntry {
    attempts: number;
    resetAt: number;
}

function createLoginLimiter(options: LoginRateLimitOptions, now: () => number) {
    const entries = new Map<string, RateLimitEntry>();

    return {
        consume(key: string): number | null {
            const currentTime = now();
            const current = entries.get(key);
            const entry = !current || current.resetAt <= currentTime
                ? { attempts: 0, resetAt: currentTime + options.windowMs }
                : current;

            if (entry.attempts >= options.maxAttempts) {
                return Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000));
            }

            entry.attempts += 1;
            entries.set(key, entry);
            return null;
        },
        reset(key: string): void {
            entries.delete(key);
        },
    };
}

function sendAuthResult(
    context: HttpContext,
    statusCode: number,
    result: AuthResult,
    cookieOptions: RefreshTokenCookieOptions,
    now: () => number,
): void {
    const { refreshToken, refreshTokenExpiresAt, ...responseBody } = result;
    context.setHeader("Cache-Control", "no-store");
    context.setHeader(
        "Set-Cookie",
        createRefreshTokenCookie(refreshToken, refreshTokenExpiresAt, cookieOptions, now),
    );
    context.json(statusCode, responseBody);
}

export function createAuthHandlers(options: CreateAuthHandlersOptions): AuthHandlers {
    const { authService, loginRateLimit, refreshTokenCookie, runtime = {} } = options;
    const now = runtime.now ?? Date.now;
    const limiter = createLoginLimiter(loginRateLimit, now);

    const login: RouteHandler = async (context) => {
        const input = context.body as LoginInput;
        const remoteAddress = context.req.socket.remoteAddress ?? "unknown";
        const ipKey = `ip:${remoteAddress}`;
        const accountKey = `account:${remoteAddress}:${input.userId}`;

        context.logger.info("Login attempt", { userId: input.userId });
        const retryAfter = limiter.consume(ipKey) ?? limiter.consume(accountKey);
        if (retryAfter !== null) {
            throw new HttpError({
                statusCode: 429,
                code: "LOGIN_RATE_LIMITED",
                message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
                headers: {
                    "Cache-Control": "no-store",
                    "Retry-After": String(retryAfter),
                },
            });
        }

        const result = await authService.login(input.userId, input.password);
        if (!result) {
            context.logger.warn("Login failed", {
                userId: input.userId,
                reason: "invalid_credentials",
            });
            throw new HttpError({
                statusCode: 401,
                code: "INVALID_CREDENTIALS",
                message: "사용자 ID 또는 비밀번호가 올바르지 않습니다.",
                headers: { "Cache-Control": "no-store" },
            });
        }

        limiter.reset(accountKey);
        context.logger.info("Login succeeded", { userId: result.user.userId });
        sendAuthResult(context, 200, result, refreshTokenCookie, now);
    };

    const signup: RouteHandler = async (context) => {
        const result = await authService.signup(context.body as SignupRequest);
        if (!result.success) {
            throw new HttpError({
                statusCode: 409,
                code: "USER_ID_ALREADY_EXISTS",
                message: "이미 사용 중인 사용자 ID입니다.",
            });
        }

        sendAuthResult(context, 201, result.data, refreshTokenCookie, now);
    };

    const refresh: RouteHandler = async (context) => {
        const token = getCookie(context.req, refreshTokenCookie.name);
        if (!token) {
            throw new HttpError({
                statusCode: 401,
                code: "REFRESH_TOKEN_REQUIRED",
                message: "Refresh Token이 없습니다.",
                headers: { "Cache-Control": "no-store" },
            });
        }

        const result = await authService.refresh(token);
        if (!result) {
            throw new HttpError({
                statusCode: 401,
                code: "INVALID_REFRESH_TOKEN",
                message: "Refresh Token이 유효하지 않습니다.",
                headers: {
                    "Cache-Control": "no-store",
                    "Set-Cookie": clearRefreshTokenCookie(refreshTokenCookie),
                },
            });
        }

        sendAuthResult(context, 200, result, refreshTokenCookie, now);
    };

    const logout: RouteHandler = async (context) => {
        const token = getCookie(context.req, refreshTokenCookie.name);
        if (token) {
            await authService.logout(token);
        }
        context.setHeader("Cache-Control", "no-store");
        context.setHeader("Set-Cookie", clearRefreshTokenCookie(refreshTokenCookie));
        context.json(204, undefined);
    };

    return { login, signup, refresh, logout };
}
