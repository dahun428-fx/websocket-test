import { createServer, type Server } from "node:http";

import type { Logger } from "../logging/logger";
import { createHttpContext } from "./context/createHttpContext";
import { handleHttpError, HttpError } from "./errors/httpError";
import { requestLogger } from "./middleware/requestLogger";
import { createRequestContext } from "./requestContext";
import type { HttpRouter } from "./router/router";
import { Metrics } from "../metrics/metrics";
import { metricsMiddleware } from "./middleware/metricsMiddleware";

export interface CreateHttpServerOptions {
    router: HttpRouter;
    logger: Logger;
    metrics: Metrics;
}

export function createHttpServer(options: CreateHttpServerOptions): Server {
    const logRequest = requestLogger();
    const recordMetrics = metricsMiddleware(
        options.metrics,
    )

    return createServer((req, res) => {
        const request = createRequestContext(req);
        const logger = options.logger.child({
            requestId: request.requestId,
            method: request.method,
            path: request.path,
        });
        const context = createHttpContext({
            req,
            res,
            requestId: request.requestId,
            logger,
        });

        context.setHeader("X-Request-ID", request.requestId);

        void logRequest(context, async () => {
            await recordMetrics(context, async () => {
                try {
                    const handled = await options.router.handle(context);
                    if (!handled) {
                        throw new HttpError({
                            statusCode: 404,
                            code: "ROUTE_NOT_FOUND",
                            message: "요청한 경로를 찾을 수 없습니다.",
                        });
                    }
                } catch (error) {
                    handleHttpError(context, error);
                }
            })
        }).catch((error: unknown) => {
            logger.error("HTTP request pipeline failed", { error });
            if (!res.writableEnded) {
                handleHttpError(context, error);
            }
        });
    });
}
