import type { TokenService } from "../auth/tokenService";
import { loginSchema } from "../schemas/loginSchema";
import { signupRequestSchema } from "../schemas/signupSchema";
import type { AuthService } from "../service/authService";
import {
    createAuthHandlers,
    type AuthHandlerRuntimeOptions,
    type LoginRateLimitOptions,
} from "./handlers/authHandlers";
import { createPublicIndexHandler } from "./handlers/publicIndexHandler";
import { authenticate } from "./middleware/authenticate";
import { parseJsonBody } from "./middleware/parseJsonBody";
import { validateBody } from "./middleware/validateBody";
import type { HttpRouter } from "./router/router";
import type { RefreshTokenCookieOptions } from "./cookieUtils";

export interface RegisterRoutesOptions {
    router: HttpRouter;
    authService: AuthService;
    tokenService: TokenService;
    publicIndexPath: string;
    maxBodyBytes: number;
    loginRateLimit: LoginRateLimitOptions;
    refreshTokenCookie: RefreshTokenCookieOptions;
    runtime?: AuthHandlerRuntimeOptions;
}

export function registerRoutes(options: RegisterRoutesOptions): void {
    const handlers = createAuthHandlers({
        authService: options.authService,
        loginRateLimit: options.loginRateLimit,
        refreshTokenCookie: options.refreshTokenCookie,
        runtime: options.runtime,
    });
    const parseBody = parseJsonBody({ maximumBytes: options.maxBodyBytes });

    options.router.get("/", {
        handler: createPublicIndexHandler(options.publicIndexPath),
    });
    options.router.post("/login", {
        middleware: [parseBody, validateBody(loginSchema)],
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
}
