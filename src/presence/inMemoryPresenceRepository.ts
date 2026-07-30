import type {
  PresenceRecord,
  PresenceRepository,
} from "./presenceRepository";

export function createInMemoryPresenceRepository(): PresenceRepository {
  const records = new Map<string, PresenceRecord>();

  return {
    async register(record) {
      records.set(record.connectionId, { ...record });
    },
    async refresh(input) {
      const record = records.get(input.connectionId);
      if (!record) return false;
      records.set(input.connectionId, {
        ...record,
        lastSeenAt: input.lastSeenAt,
      });
      return true;
    },
    async joinRoom(input) {
      const record = records.get(input.connectionId);
      if (record) {
        records.set(input.connectionId, {
          ...record,
          roomId: input.roomId,
        });
      }
    },
    async leaveRoom(input) {
      const record = records.get(input.connectionId);
      if (record?.roomId === input.roomId) {
        records.set(input.connectionId, { ...record, roomId: null });
      }
    },
    async unregister(input) {
      records.delete(input.connectionId);
    },
    async findByConnectionId(connectionId) {
      return records.get(connectionId) ?? null;
    },
    async isUserOnline(userId) {
      return [...records.values()].some((record) => record.userId === userId);
    },
  };
}
