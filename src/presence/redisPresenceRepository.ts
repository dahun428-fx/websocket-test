import type { RedisClientType } from "redis";
import { z } from "zod";

import type { RedisKeys } from "../infrastructure/redis/redisKeys";
import {
  parseRedisJson,
  serializeRedisJson,
} from "../infrastructure/redis/redisJson";
import type {
  PresenceRecord,
  PresenceRepository,
} from "./presenceRepository";

const presenceRecordSchema = z.object({
  connectionId: z.string().min(1),
  userId: z.string().min(1),
  serverId: z.string().min(1),
  connectedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  roomId: z.string().min(1).nullable(),
});

interface CreateRedisPresenceRepositoryOptions {
  client: RedisClientType;
  keys: RedisKeys;
  ttlSeconds: number;
}

export function createRedisPresenceRepository(
  options: CreateRedisPresenceRepositoryOptions,
): PresenceRepository {
  const { client, keys, ttlSeconds } = options;

  async function writeRecord(record: PresenceRecord): Promise<void> {
    await client.set(
      keys.presenceConnection(record.connectionId),
      serializeRedisJson(record),
      { EX: ttlSeconds },
    );
  }

  async function findByConnectionId(
    connectionId: string,
  ): Promise<PresenceRecord | null> {
    const raw = await client.get(keys.presenceConnection(connectionId));
    return raw ? parseRedisJson(raw, presenceRecordSchema) : null;
  }

  async function register(record: PresenceRecord): Promise<void> {
    const transaction = client
      .multi()
      .set(
        keys.presenceConnection(record.connectionId),
        serializeRedisJson(record),
        { EX: ttlSeconds },
      )
      .sAdd(keys.presenceUser(record.userId), record.connectionId)
      .expire(keys.presenceUser(record.userId), ttlSeconds);

    if (record.roomId) {
      transaction
        .sAdd(keys.roomConnections(record.roomId), record.connectionId)
        .expire(keys.roomConnections(record.roomId), ttlSeconds);
    }
    await transaction.exec();
  }

  async function refresh(input: {
    connectionId: string;
    lastSeenAt: string;
  }): Promise<boolean> {
    const existing = await findByConnectionId(input.connectionId);
    if (!existing) return false;

    const next = {
      ...existing,
      lastSeenAt: input.lastSeenAt,
    };
    const transaction = client
      .multi()
      .set(
        keys.presenceConnection(input.connectionId),
        serializeRedisJson(next),
        { EX: ttlSeconds },
      )
      .expire(keys.presenceUser(existing.userId), ttlSeconds);

    if (existing.roomId) {
      transaction.expire(
        keys.roomConnections(existing.roomId),
        ttlSeconds,
      );
    }
    await transaction.exec();
    return true;
  }

  async function joinRoom(input: {
    connectionId: string;
    roomId: string;
  }): Promise<void> {
    const existing = await findByConnectionId(input.connectionId);
    if (!existing) return;

    const transaction = client.multi();
    if (existing.roomId && existing.roomId !== input.roomId) {
      transaction.sRem(
        keys.roomConnections(existing.roomId),
        input.connectionId,
      );
    }
    transaction
      .set(
        keys.presenceConnection(input.connectionId),
        serializeRedisJson({ ...existing, roomId: input.roomId }),
        { EX: ttlSeconds },
      )
      .sAdd(keys.roomConnections(input.roomId), input.connectionId)
      .expire(keys.roomConnections(input.roomId), ttlSeconds);
    await transaction.exec();
  }

  async function leaveRoom(input: {
    connectionId: string;
    roomId: string;
  }): Promise<void> {
    const existing = await findByConnectionId(input.connectionId);
    if (!existing) return;

    await client
      .multi()
      .set(
        keys.presenceConnection(input.connectionId),
        serializeRedisJson({ ...existing, roomId: null }),
        { EX: ttlSeconds },
      )
      .sRem(keys.roomConnections(input.roomId), input.connectionId)
      .exec();
  }

  async function unregister(input: {
    connectionId: string;
    userId: string;
    roomId: string | null;
  }): Promise<void> {
    const transaction = client
      .multi()
      .del(keys.presenceConnection(input.connectionId))
      .sRem(keys.presenceUser(input.userId), input.connectionId);
    if (input.roomId) {
      transaction.sRem(
        keys.roomConnections(input.roomId),
        input.connectionId,
      );
    }
    await transaction.exec();
  }

  async function isUserOnline(userId: string): Promise<boolean> {
    const userKey = keys.presenceUser(userId);
    const connectionIds = await client.sMembers(userKey);
    if (connectionIds.length === 0) return false;

    const records = await client.mGet(
      connectionIds.map((connectionId) => (
        keys.presenceConnection(connectionId)
      )),
    );
    const staleConnectionIds = connectionIds.filter(
      (_, index) => records[index] === null,
    );
    if (staleConnectionIds.length > 0) {
      await client.sRem(userKey, staleConnectionIds);
    }
    return records.some((record) => record !== null);
  }

  return {
    register,
    refresh,
    joinRoom,
    leaveRoom,
    unregister,
    findByConnectionId,
    isUserOnline,
  };
}
