import type { IncomingMessage, ServerResponse } from "node:http";

import type { Logger } from "../../logging/logger";
import type { HttpContext } from "./httpContext";

export interface CreateHttpContextOptions {
    req: IncomingMessage;
    res: ServerResponse;
    requestId: string;
    logger: Logger;
}

export function createHttpContext(options: CreateHttpContextOptions): HttpContext {
    const { req, res, requestId, logger } = options;
    const url = new URL(req.url ?? "/", "http://localhost");

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");

    return {
        req,
        res,
        requestId,
        method: req.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        params: {},
        body: undefined,
        user: null,
        logger,
        json(statusCode, body) {
            if (res.writableEnded) {
                return;
            }

            res.statusCode = statusCode;

            if (statusCode === 204 || body === undefined) {
                res.end();
                return;
            }

            const serialized = JSON.stringify(body);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Content-Length", Buffer.byteLength(serialized));
            res.end(serialized);
        },
        setHeader(name, value) {
            res.setHeader(name, value);
        },
    };
}
