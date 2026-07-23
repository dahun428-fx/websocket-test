import { HttpContext } from "../context/httpContext";

export type Next = () => Promise<void>;
export type Middleware = (context: HttpContext, next: Next) => Promise<void>
export type RouteHandler = (context: HttpContext) => Promise<void>