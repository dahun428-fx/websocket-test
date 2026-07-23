import type { ZodType } from "zod";
import type { Middleware } from "./middleware";
import { HttpError } from "../errors/httpError";

export function validateBody<T>(schema: ZodType<T>): Middleware {
    return async function validateBodyMiddleware(context, next): Promise<void> {
        const result = schema.safeParse(context.body);

        if (!result.success) {
            throw new HttpError({
                statusCode: 400,
                code: "VALIDATION_FAILED",
                message: "입력값이 올바르지 않습니다.",
                details: result.error.issues.map((issue) => {
                    return {
                        path: issue.path.join("."),
                        message: issue.message,
                    }
                })
            })
        }

        context.body = result.data
        await next();

    }
}