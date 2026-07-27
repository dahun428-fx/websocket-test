import type {
    IncomingMessage,
} from "node:http";

export interface RefreshTokenCookieOptions {
    name: string;
    maxAgeSeconds: number;
    secure: boolean;
}

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

export function createRefreshTokenCookie(
    refreshToken: string,
    expiresAt: string,
    options: RefreshTokenCookieOptions,
    now: () => number = Date.now,
): string {
    const tokenMaxAge = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - now()) / 1_000),
    );
    const parts = [
        `${options.name}=${encodeURIComponent(refreshToken)}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Strict",
        `Max-Age=${Math.min(tokenMaxAge, options.maxAgeSeconds)}`,
    ];

    if (options.secure) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

export function clearRefreshTokenCookie(
    options: RefreshTokenCookieOptions,
): string {
    const parts = [
        `${options.name}=`,
        "HttpOnly",
        "Path=/",
        "SameSite=Strict",
        "Max-Age=0",
    ];

    if (options.secure) {
        parts.push("Secure");
    }

    return parts.join("; ");
}
