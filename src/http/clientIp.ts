import type { IncomingMessage } from "node:http";

interface GetClientIpOptions {
  trustProxy: boolean;
}

export function getClientIp(
  request: IncomingMessage,
  options: GetClientIpOptions,
): string {
  if (options.trustProxy) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const firstIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  return request.socket.remoteAddress ?? "unknown";
}
