import { Middleware, RouteHandler } from "../middleware/middleware";
import { HttpContext } from "../context/httpContext";

export type HttpMethod = | "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDefinition {
    method: HttpMethod;
    path: string;
    middleware: Middleware[];
    handler: RouteHandler
}

export interface Router {
    get(path: string, ...handlers: [...Middleware[], RouteHandler]): void;
    post(path: string, ...handlers: [...Middleware[], RouteHandler]): void;
    delete(path: string, ...handlers: [...Middleware[], RouteHandler]): void;
    handle(context: HttpContext): Promise<boolean>
}
