import type { HttpContext } from '../context/httpContext'
import { HttpError } from "../errors/httpError";
import { composeMiddleware } from '../middleware/composeMiddleware'
import type { Middleware, RouteHandler } from '../middleware/middleware'
import { matchRoute } from './routeMatcher';
import type { HttpMethod, RouteDefinition } from './types'

export interface RouteOptions {
    middleware?: Middleware[];
    handler: RouteHandler;
}

export interface HttpRouter {
    get(path: string, options: RouteOptions): void;
    post(path: string, options: RouteOptions): void;
    delete(path: string, options: RouteOptions): void;
    handle(context: HttpContext): Promise<boolean>;
}

export function createHttpRouter(): HttpRouter {
    const routes: RouteDefinition[] = [];

    function register(method: HttpMethod, path: string, options: RouteOptions): void {
        routes.push({
            method,
            path,
            middleware: options.middleware ?? [],
            handler: options.handler,
        })
    }

    async function handle(context: HttpContext): Promise<boolean> {
        const allowedMethods = new Set<HttpMethod>();

        for (const route of routes) {
            const match = matchRoute(route.path, context.path);
            if (!match.matched) {
                continue;
            }

            if (route.method !== context.method) {
                allowedMethods.add(route.method);
                continue;
            }

            context.params = match.params

            const composed = composeMiddleware(
                route.middleware, route.handler
            )
            await composed(context);
            return true;
        }

        if (allowedMethods.size > 0) {
            const allow = [...allowedMethods].join(", ");
            throw new HttpError({
                statusCode: 405,
                code: "METHOD_NOT_ALLOWED",
                message: "허용되지 않은 HTTP 메서드입니다.",
                headers: { Allow: allow },
            });
        }

        return false;
    }
    return {
        get(path, options) {
            register("GET", path, options)
        },
        post(path, options) {
            register("POST", path, options)
        },
        delete(path, options) {
            register("DELETE", path, options)
        },
        handle
    }

}
