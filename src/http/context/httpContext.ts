import { IncomingMessage, ServerResponse } from "node:http";
import { AuthenticatedUser } from "../../service/authService";
import { Logger } from "../../logging/logger";

export interface HttpContext {
    req: IncomingMessage;
    res: ServerResponse;

    requestId: string;
    method: string;
    path: string;
    routePattern: string | null;

    query: URLSearchParams;
    params: Record<string, string>;

    body: unknown;
    user: AuthenticatedUser | null;

    logger: Logger;

    json(statusCode: number, body: unknown): void;
    setHeader(name: string, value: string): void;
}
