export interface RedisKeys {
  presenceUser(userId: string): string;
  presenceConnection(connectionId: string): string;
  roomConnections(roomId: string): string;
  loginRateLimit(input: { clientIp: string; loginId: string }): string;
  roomCache(roomId: string): string;
}

export interface RedisChannels {
  realtime: string;
}

export function createRedisKeys(prefix: string): RedisKeys {
  const normalizedPrefix = normalizePrefix(prefix);
  return {
    presenceUser: (userId) => joinKey(
      normalizedPrefix,
      "presence",
      "user",
      userId,
    ),
    presenceConnection: (connectionId) => joinKey(
      normalizedPrefix,
      "presence",
      "connection",
      connectionId,
    ),
    roomConnections: (roomId) => joinKey(
      normalizedPrefix,
      "room-connections",
      roomId,
    ),
    loginRateLimit: ({ clientIp, loginId }) => joinKey(
      normalizedPrefix,
      "rate-limit",
      "login",
      clientIp,
      loginId,
    ),
    roomCache: (roomId) => joinKey(
      normalizedPrefix,
      "cache",
      "room",
      roomId,
    ),
  };
}

export function createRedisChannels(prefix: string): RedisChannels {
  return {
    realtime: `${normalizePrefix(prefix)}:realtime`,
  };
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/:+$/, "");
}

function joinKey(prefix: string, ...parts: string[]): string {
  return [
    prefix,
    ...parts.map((part) => encodeURIComponent(part)),
  ].join(":");
}
