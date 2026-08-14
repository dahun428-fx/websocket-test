export type ApplicationErrorCode =
    | "INVALID_CREDENTIALS"
    | "USER_ALREADY_EXISTS"
    | "INVALID_REFRESH_TOKEN"
    | "REFRESH_TOKEN_REUSED"
    | "INVALID_ROOM_NAME"
    | "ROOM_NOT_FOUND"
    | "ROOM_ACCESS_DENIED"
    | "RATE_LIMIT_EXCEEDED";

export interface ApplicationErrorOptions {
    code: ApplicationErrorCode;
    message: string;
    cause?: unknown;
    details?: unknown;
}

export abstract class ApplicationError extends Error {
    readonly code: ApplicationErrorCode;
    readonly details?: unknown;

    protected constructor(options: ApplicationErrorOptions) {
        super(options.message, { cause: options.cause });
        this.name = this.constructor.name;
        this.code = options.code;
        this.details = options.details;
    }
}
