import WebSocket from "ws";

export interface ChatWebSocket extends WebSocket {
    nickname: string | null;
    room_id: string | null;
    messageQueue: Promise<void>;
    isClosing: boolean;
}
