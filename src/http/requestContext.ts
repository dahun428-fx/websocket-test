import crypto from "crypto"
import { IncomingMessage } from "http";

export interface RequestContext {
    requestId: string;
    method: string;
    path: string;
    startedAt: number;
}

export function createRequestContext(req: IncomingMessage): RequestContext {
    const incomingRequestId = req.headers['x-request-id'];
    const requestId = typeof incomingRequestId === "string" && incomingRequestId.trim() ? incomingRequestId.trim() : crypto.randomUUID()
    const url = new URL(req.url ?? "/", "http://localhost")

    return {
        requestId, method: req.method ?? "UNKNOWN",
        path: url.pathname,
        startedAt: performance.now()
    }
}