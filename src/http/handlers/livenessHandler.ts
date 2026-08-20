import type { HttpHandler } from "../httpHandler";

/**
 * "이 프로세스가 HTTP 요청에 응답할 수 있는가?"만 답한다.
 * 의존성(DB, Redis)을 보지 않으므로 서비스도, 팩토리도 필요 없다.
 */
export const livenessHandler: HttpHandler = async (context) => {
    context.json(200, {
        status: "alive",
        timestamp: new Date().toISOString(),
    });
};
