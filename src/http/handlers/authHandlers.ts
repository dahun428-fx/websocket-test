import type { LoginInput } from "../../schemas/loginSchema";
import type { SignupRequest } from "../../schemas/signupSchema";
import type { AuthResult, AuthService } from "../../service/authService";
import type {
    CreateUserResult,
    CreateUserUseCase,
} from "../../application/user/createUser";
import {
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    RefreshTokenReusedError,
} from "../../application/errors/authErrors";
import {
    clearRefreshTokenCookie,
    createRefreshTokenCookie,
    getCookie,
    type RefreshTokenCookieOptions,
} from "../cookieUtils";
import type { HttpContext } from "../context/httpContext";
import { HttpError } from "../errors/httpError";
import type { RouteHandler } from "../middleware/middleware";

export interface AuthHandlerRuntimeOptions {
    now?: () => number;
}

export interface CreateAuthHandlersOptions {
    authService: AuthService;
    createUserUseCase: CreateUserUseCase;
    refreshTokenCookie: RefreshTokenCookieOptions;
    runtime?: AuthHandlerRuntimeOptions;
}

export interface AuthHandlers {
    login: RouteHandler;
    signup: RouteHandler;
    refresh: RouteHandler;
    logout: RouteHandler;
}

function sendAuthResult(
    context: HttpContext,
    statusCode: number,
    result: AuthResult | CreateUserResult,
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
    const {
        authService,
        createUserUseCase,
        refreshTokenCookie,
        runtime = {},
    } = options;
    const now = runtime.now ?? Date.now;
    const login: RouteHandler = async (context) => {
        const input = context.body as LoginInput;

        context.logger.info("Login attempt", { userId: input.userId });

        let result: AuthResult;
        try {
            result = await authService.login({
                userId: input.userId,
                password: input.password,
            });
        } catch (error) {
            if (error instanceof InvalidCredentialsError) {
                context.logger.warn("Login failed", {
                    userId: input.userId,
                    reason: "invalid_credentials",
                });
                context.setHeader("Cache-Control", "no-store");
            }
            throw error;
        }

        context.logger.info("Login succeeded", { userId: result.user.userId });
        sendAuthResult(context, 200, result, refreshTokenCookie, now);
    };

    const signup: RouteHandler = async (context) => {
        const body = context.body as SignupRequest;
        const result = await createUserUseCase.execute({
            userId: body.userId,
            nickname: body.nickname,
            password: body.password,
        });
        sendAuthResult(context, 201, result, refreshTokenCookie, now);
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

        let result: AuthResult;
        try {
            result = await authService.refresh({ refreshToken: token });
        } catch (error) {
            if (
                error instanceof InvalidRefreshTokenError
                || error instanceof RefreshTokenReusedError
            ) {
                context.setHeader("Cache-Control", "no-store");
                context.setHeader(
                    "Set-Cookie",
                    clearRefreshTokenCookie(refreshTokenCookie),
                );
            }
            throw error;
        }

        sendAuthResult(context, 200, result, refreshTokenCookie, now);
    };

    const logout: RouteHandler = async (context) => {
        const token = getCookie(context.req, refreshTokenCookie.name);
        if (token) {
            await authService.logout({ refreshToken: token });
        }
        context.setHeader("Cache-Control", "no-store");
        context.setHeader("Set-Cookie", clearRefreshTokenCookie(refreshTokenCookie));
        context.json(204, undefined);
    };

    return { login, signup, refresh, logout };
}
