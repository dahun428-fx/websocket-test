import type { Middleware, RouteHandler } from "../middleware/middleware";

export type HttpMethod = | "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDefinition {
    method: HttpMethod;
    path: string;
    middleware: Middleware[];
    handler: RouteHandler;
}
