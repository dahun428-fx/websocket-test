import type { Logger } from "../logging/logger";
import type { PresenceRepository } from "./presenceRepository";

interface CreateResilientPresenceRepositoryOptions {
  primary: PresenceRepository;
  fallback: PresenceRepository;
  isPrimaryAvailable(): boolean;
  required: boolean;
  logger: Logger;
}

export function createResilientPresenceRepository(
  options: CreateResilientPresenceRepositoryOptions,
): PresenceRepository {
  async function execute<T>(
    operation: keyof PresenceRepository,
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (!options.isPrimaryAvailable()) {
      if (options.required) {
        throw new Error("Redis presence is required but unavailable.");
      }
      return fallback();
    }

    try {
      return await primary();
    } catch (error) {
      if (options.required) throw error;
      options.logger.warn("Redis presence operation failed; using local fallback", {
        operation,
        error,
      });
      return fallback();
    }
  }

  return {
    register: (record) => execute(
      "register",
      () => options.primary.register(record),
      () => options.fallback.register(record),
    ),
    refresh: (input) => execute(
      "refresh",
      () => options.primary.refresh(input),
      () => options.fallback.refresh(input),
    ),
    joinRoom: (input) => execute(
      "joinRoom",
      () => options.primary.joinRoom(input),
      () => options.fallback.joinRoom(input),
    ),
    leaveRoom: (input) => execute(
      "leaveRoom",
      () => options.primary.leaveRoom(input),
      () => options.fallback.leaveRoom(input),
    ),
    unregister: (input) => execute(
      "unregister",
      () => options.primary.unregister(input),
      () => options.fallback.unregister(input),
    ),
    findByConnectionId: (connectionId) => execute(
      "findByConnectionId",
      () => options.primary.findByConnectionId(connectionId),
      () => options.fallback.findByConnectionId(connectionId),
    ),
    isUserOnline: (userId) => execute(
      "isUserOnline",
      () => options.primary.isUserOnline(userId),
      () => options.fallback.isUserOnline(userId),
    ),
  };
}
