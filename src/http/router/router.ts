import type { HttpContext } from '../context/httpContext'
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
        for (const route of routes) {
            if (route.method !== context.method) {
                continue;
            }

            const match = matchRoute(route.path, context.path);

            if (!match.matched) {
                continue;
            }

            context.params = match.params

            const composed = composeMiddleware(
                route.middleware, route.handler
            )
            await composed(context);
            return true;
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