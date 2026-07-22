import type {
    IncomingMessage,
} from "node:http";

export function getCookie(
    req: IncomingMessage,
    name: string,
): string | null {
    const rawCookie =
        req.headers.cookie;

    if (!rawCookie) {
        return null;
    }

    const cookies =
        rawCookie.split(";");

    for (const cookie of cookies) {
        const [key, ...valueParts] =
            cookie.trim().split("=");

        if (key === name) {
            try {
                return decodeURIComponent(valueParts.join("="));
            } catch {
                return null;
            }
        }
    }

    return null;
}
