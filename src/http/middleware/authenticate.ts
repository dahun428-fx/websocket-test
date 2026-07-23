import { TokenService } from "../../auth/tokenService";
import { HttpError } from "../errors/httpError";
import type { Middleware } from "./middleware";

interface AuthenticateOptions {
    tokenService: TokenService;
}

export function authenticate(options: AuthenticateOptions): Middleware {
    const { tokenService } = options

    return async function authenticateMiddleware(context, next): Promise<void> {
        const authorization = context.req.headers.authorization;

        if (!authorization || !authorization.startsWith("Bearer ")) {
            throw new HttpError({
                statusCode: 401,
                code: "AUTHENTICATION_REQUIRED",
                message: "인증이 필요합니다."
            })
        }

        const token = authorization.slice("Bearer ".length).trim();

        try {
            const payload = tokenService.verifyAccessToken(token)
            context.user = {
                userId: payload.sub,
                nickname: payload.nickname
            }
        } catch (error) {
            context.logger.warn("Access token verification failed", {
                error: error instanceof Error ? error.name : "unknown"
            });

            throw new HttpError({
                statusCode: 401,
                code: "INVALID_ACCESS_TOKEN",
                message: "Access Token 이 유효하지 않습니다."
            })
        }

        await next();
    }

}