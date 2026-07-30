import WebSocket from "ws";

export interface ChatWebSocket extends WebSocket {
    connectionId: string;
    connectedAt: string;
    userId: string | null;
    nickname: string | null;
    room_id: string | null;
    messageQueue: Promise<void>;
    isClosed: boolean;
    isAlive: boolean;
}
