import { ApplicationError } from "./applicationError";

export type AuthErrorCode =
    | "INVALID_CREDENTIALS"
    | "USER_ALREADY_EXISTS"
    | "INVALID_REFRESH_TOKEN"
    | "REFRESH_TOKEN_REUSED";

export class InvalidCredentialsError extends ApplicationError {
    constructor() {
        super({
            code: "INVALID_CREDENTIALS",
            message: "아이디 또는 비밀번호가 올바르지 않습니다.",
        });
    }
}

export class UserAlreadyExistsError extends ApplicationError {
    constructor(userId: string, options: { cause?: unknown } = {}) {
        super({
            code: "USER_ALREADY_EXISTS",
            message: "이미 존재하는 사용자입니다.",
            details: { userId },
            cause: options.cause,
        });
    }
}

export class InvalidRefreshTokenError extends ApplicationError {
    constructor(options: { cause?: unknown } = {}) {
        super({
            code: "INVALID_REFRESH_TOKEN",
            message: "Refresh Token이 유효하지 않습니다.",
            cause: options.cause,
        });
    }
}

export class RefreshTokenReusedError extends ApplicationError {
    constructor(tokenId: string) {
        super({
            code: "REFRESH_TOKEN_REUSED",
            message: "이미 사용된 Refresh Token입니다.",
            details: { tokenId },
        });
    }
}
