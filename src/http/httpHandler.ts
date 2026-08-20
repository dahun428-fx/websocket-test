import type { RouteHandler } from "./middleware/middleware";

/**
 * Router에 등록되는 최종 핸들러 타입.
 * 미들웨어 체인의 끝에서 HttpContext 하나만 받아 응답을 쓴다.
 */
export type HttpHandler = RouteHandler;
