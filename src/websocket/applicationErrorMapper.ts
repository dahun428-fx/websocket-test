import type { ApplicationError } from "../application/errors/applicationError";
import type { ErrorMessage } from "../types/messages";

export function mapApplicationErrorToWebSocket(
    error: ApplicationError,
    createdAt: string,
): ErrorMessage {
    return {
        type: "error",
        code: error.code,
        message: error.message,
        createdAt,
    };
}
