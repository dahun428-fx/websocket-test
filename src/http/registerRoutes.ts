import type { TokenService } from "../auth/tokenService";
import type { CreateUserUseCase } from "../application/user/createUser";
import type { GetRoomUseCase } from "../application/room/getRoom";
import type { RenameRoomUseCase } from "../application/room/renameRoom";
import { loginSchema } from "../schemas/loginSchema";
import { signupRequestSchema } from "../schemas/signupSchema";
import { renameRoomSchema } from "../schemas/renameRoomSchema";
import type { AuthService } from "../service/authService";
import {
    createAuthHandlers,
    type AuthHandlerRuntimeOptions,
} from "./handlers/authHandlers";
import { livenessHandler } from "./handlers/livenessHandler";
import { createPublicIndexHandler } from "./handlers/publicIndexHandler";
import { createReadinessHandler } from "./handlers/readinessHandler";
import { createRoomHandlers } from "./handlers/roomHandlers";
import { authenticate } from "./middleware/authenticate";
import { parseJsonBody } from "./middleware/parseJsonBody";
import { validateBody } from "./middleware/validateBody";
import type { Middleware } from "./middleware/middleware";
import type { HttpRouter } from "./router/router";
import type { RefreshTokenCookieOptions } from "./cookieUtils";
import type { ReadinessService } from "../health/readinessService";

export interface RegisterRoutesOptions {
    router: HttpRouter;
    authService: AuthService;
    createUserUseCase: CreateUserUseCase;
    getRoomUseCase: GetRoomUseCase;
    renameRoomUseCase: RenameRoomUseCase;
    tokenService: TokenService;
    publicIndexPath: string;
    maxBodyBytes: number;
    loginRateLimitMiddleware: Middleware;
    refreshTokenCookie: RefreshTokenCookieOptions;
    readinessService: ReadinessService;
    runtime?: AuthHandlerRuntimeOptions;
}

export function registerRoutes(options: RegisterRoutesOptions): void {
    const handlers = createAuthHandlers({
        authService: options.authService,
        createUserUseCase: options.createUserUseCase,
        refreshTokenCookie: options.refreshTokenCookie,
        runtime: options.runtime,
    });
    const parseBody = parseJsonBody({ maximumBytes: options.maxBodyBytes });
    const roomHandlers = createRoomHandlers({
        getRoomUseCase: options.getRoomUseCase,
        renameRoomUseCase: options.renameRoomUseCase,
    });

    options.router.get("/", {
        handler: createPublicIndexHandler(options.publicIndexPath),
    });
    options.router.get("/health/live", {
        handler: livenessHandler,
    });
    options.router.get("/health/ready", {
        handler: createReadinessHandler(options.readinessService),
    });
    options.router.post("/login", {
        middleware: [
            parseBody,
            validateBody(loginSchema),
            options.loginRateLimitMiddleware,
        ],
        handler: handlers.login,
    });
    options.router.post("/signup", {
        middleware: [parseBody, validateBody(signupRequestSchema)],
        handler: handlers.signup,
    });
    options.router.post("/refresh", {
        handler: handlers.refresh,
    });
    options.router.post("/logout", {
        handler: handlers.logout,
    });
    options.router.get("/me", {
        middleware: [authenticate({ tokenService: options.tokenService })],
        handler: async (context) => {
            context.json(200, { user: context.user });
        },
    });
    options.router.get("/rooms/:roomId", {
        middleware: [authenticate({ tokenService: options.tokenService })],
        handler: roomHandlers.get,
    });
    options.router.patch("/rooms/:roomId", {
        middleware: [
            authenticate({ tokenService: options.tokenService }),
            parseBody,
            validateBody(renameRoomSchema),
        ],
        handler: roomHandlers.rename,
    });
}
