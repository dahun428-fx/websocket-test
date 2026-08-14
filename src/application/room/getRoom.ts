import { z } from "zod";

import type { Cache } from "../../cache/cache";
import type { RedisKeys } from "../../infrastructure/redis/redisKeys";
import type { Logger } from "../../logging/logger";
import type { RoomRepository } from "../../repositories/roomRepository";
import { RoomNotFoundError } from "../errors/roomErrors";

const getRoomResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
});

export type GetRoomResult = z.infer<typeof getRoomResultSchema>;

export interface GetRoomUseCase {
  execute(roomId: string): Promise<GetRoomResult>;
}

interface CreateGetRoomUseCaseOptions {
  roomRepository: RoomRepository;
  cache: Cache;
  redisKeys: RedisKeys;
  cacheTtlSeconds: number;
  logger: Logger;
}

export function createGetRoomUseCase(
  options: CreateGetRoomUseCaseOptions,
): GetRoomUseCase {
  async function execute(roomId: string): Promise<GetRoomResult> {
    const cacheKey = options.redisKeys.roomCache(roomId);

    try {
      const cached = await options.cache.get<unknown>(cacheKey);
      const parsed = getRoomResultSchema.safeParse(cached);
      if (parsed.success && parsed.data.id === roomId) {
        return parsed.data;
      }
      if (cached !== null) {
        options.logger.warn("Room cache payload is invalid", { roomId });
      }
    } catch (error) {
      options.logger.warn("Room cache read failed", {
        roomId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }

    const room = await options.roomRepository.findById(roomId);
    if (!room) {
      throw new RoomNotFoundError(roomId);
    }

    const result: GetRoomResult = {
      id: room.id,
      name: room.name,
      ownerId: room.createdBy,
      createdAt: room.createdAt,
    };

    try {
      await options.cache.set(cacheKey, result, {
        ttlSeconds: options.cacheTtlSeconds,
      });
    } catch (error) {
      options.logger.warn("Room cache write failed", {
        roomId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }

    return result;
  }

  return { execute };
}
