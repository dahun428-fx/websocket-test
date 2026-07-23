import { HttpContext } from "../context/httpContext";
import { Middleware, RouteHandler } from "./middleware";

export function composeMiddleware(middlewareList: Middleware[], handler: RouteHandler): RouteHandler {
    return async function composed(
        context: HttpContext
    ): Promise<void> {
        let currentIndex = -1;

        async function dispatch(index: number): Promise<void> {
            if (index <= currentIndex) {
                throw new Error("next() was called multiple times")
            }

            currentIndex = index;

            const middleware = middlewareList[index]

            if (!middleware) {
                await handler(context);
                return;
            }

            await middleware(context, () => dispatch(index + 1))
        }
        await dispatch(0)
    }
}