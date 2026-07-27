import type {
    ApplicationError,
    ApplicationErrorCode,
} from "../../application/errors/applicationError";

export interface HttpErrorDescriptor {
    statusCode: number;
    code: ApplicationErrorCode;
    message: string;
    details?: unknown;
}

const STATUS_BY_ERROR_CODE: Readonly<Record<ApplicationErrorCode, number>> = {
    INVALID_CREDENTIALS: 401,
    USER_ALREADY_EXISTS: 409,
    INVALID_REFRESH_TOKEN: 401,
    REFRESH_TOKEN_REUSED: 401,
    ROOM_NOT_FOUND: 404,
    ROOM_ACCESS_DENIED: 403,
};

export function mapApplicationErrorToHttp(
    error: ApplicationError,
): HttpErrorDescriptor {
    return {
        statusCode: STATUS_BY_ERROR_CODE[error.code] ?? 400,
        code: error.code,
        message: error.message,
        details: error.details,
    };
}
