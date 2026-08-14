import type { Cache } from "../../cache/cache";
import type { RedisKeys } from "../../infrastructure/redis/redisKeys";
import type { Logger } from "../../logging/logger";
import type { RoomRepository } from "../../repositories/roomRepository";
import {
  InvalidRoomNameError,
  RoomAccessDeniedError,
  RoomNotFoundError,
} from "../errors/roomErrors";

export interface RenameRoomCommand {
  roomId: string;
  userId: string;
  name: string;
}

export interface RenameRoomUseCase {
  execute(command: RenameRoomCommand): Promise<void>;
}

interface CreateRenameRoomUseCaseOptions {
  roomRepository: RoomRepository;
  cache: Cache;
  redisKeys: RedisKeys;
  logger: Logger;
}

export function createRenameRoomUseCase(
  options: CreateRenameRoomUseCaseOptions,
): RenameRoomUseCase {
  async function execute(command: RenameRoomCommand): Promise<void> {
    const name = command.name.trim();
    if (!name) {
      throw new InvalidRoomNameError();
    }

    const room = await options.roomRepository.findById(command.roomId);
    if (!room) {
      throw new RoomNotFoundError(command.roomId);
    }
    if (room.createdBy !== command.userId) {
      throw new RoomAccessDeniedError(command.roomId, command.userId);
    }

    await options.roomRepository.rename({ roomId: command.roomId, name });

    try {
      await options.cache.delete(options.redisKeys.roomCache(command.roomId));
    } catch (error) {
      options.logger.warn("Room cache invalidation failed", {
        roomId: command.roomId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return { execute };
}
