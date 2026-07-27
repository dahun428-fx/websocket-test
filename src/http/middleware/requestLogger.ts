import type { Middleware } from "./middleware";

export function requestLogger(): Middleware {
    return async function logRequest(context, next): Promise<void> {
        const startedAt = performance.now();
        context.logger.info("HTTP request started");

        try {
            await next();
        } finally {
            const durationMs = performance.now() - startedAt;
            context.logger.info("HTTP request completed", {
                statusCode: context.res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
            });
        }
    };
}
