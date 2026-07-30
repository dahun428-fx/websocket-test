export interface PresenceRecord {
  connectionId: string;
  userId: string;
  serverId: string;
  connectedAt: string;
  lastSeenAt: string;
  roomId: string | null;
}

export interface PresenceRepository {
  register(record: PresenceRecord): Promise<void>;
  refresh(input: {
    connectionId: string;
    lastSeenAt: string;
  }): Promise<boolean>;
  joinRoom(input: {
    connectionId: string;
    roomId: string;
  }): Promise<void>;
  leaveRoom(input: {
    connectionId: string;
    roomId: string;
  }): Promise<void>;
  unregister(input: {
    connectionId: string;
    userId: string;
    roomId: string | null;
  }): Promise<void>;
  findByConnectionId(connectionId: string): Promise<PresenceRecord | null>;
  isUserOnline(userId: string): Promise<boolean>;
}
