import { IncomingMessage, ServerResponse } from "http";
import { Logger } from "../../logging/logger";
import { HttpContext } from "./httpContext";

interface CreateHttpContextOptions {
    req: IncomingMessage;
    res: ServerResponse;
    requestId: string;
    logger: Logger;
}

export function createHttpContext(options: CreateHttpContextOptions): HttpContext {
    const { req, res, requestId, logger } = options

    const url = new URL(req.url ?? "/", "http://localhost")

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
        logger, json(statusCode, body) {
            if (res.writableEnded) {
                return;
            }
            const serialized = JSON.stringify(body);
            res.statusCode = statusCode;
            res.setHeader("Content-Type", "application/json; charset=utf-8")
            res.setHeader("Content-Length", Buffer.byteLength(serialized))
            res.end(serialized)
        },
        setHeader(name, value) {
            res.setHeader(name, value)
        }
    }
}