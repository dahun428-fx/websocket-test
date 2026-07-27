import type { HttpContext } from "../context/httpContext";

export interface HttpErrorOptions {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
    cause?: unknown;
    headers?: Record<string, string>;
}

export class HttpError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;
    readonly headers: Record<string, string>;

    constructor(options: HttpErrorOptions) {
        super(options.message, { cause: options.cause });
        this.name = "HttpError";
        this.statusCode = options.statusCode;
        this.code = options.code;
        this.details = options.details;
        this.headers = options.headers ?? {};
    }
}

export function handleHttpError(context: HttpContext, error: unknown): void {
    if (context.res.writableEnded) {
        return;
    }

    if (error instanceof HttpError) {
        context.logger.warn("HTTP request rejected", {
            statusCode: error.statusCode,
            errorCode: error.code,
        });
        for (const [name, value] of Object.entries(error.headers)) {
            context.setHeader(name, value);
        }
        context.json(error.statusCode, {
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
                requestId: context.requestId,
            },
        });
        return;
    }

    context.logger.error("Unhandled HTTP error", { error });
    context.json(500, {
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "서버 내부 오류가 발생했습니다.",
            requestId: context.requestId,
        },
    });
}
