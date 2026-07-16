import type { ErrorCode } from "../errors/errorMessages";
export type {
    ChatInputMessage,
    ClientMessage,
    HistoryRequestMessage,
    RegisterMessage,
} from "../schemas/clientMessageSchema";

export interface ConnectionMessage {
    type: "connection";
    message: string;
    createdAt: string;
}

export interface RegisterSuccessMessage {
    type: "register-success";
    userId: string;
    nickname: string;
    room_id: string;
    roomConnectionCount: number;
    roomUserCount: number;
    message: string;
    createdAt: string;
}
export interface NewChatMessage {
    type: "chat";
    nickname: string;
    room_id: string;
    message: string;
    createdAt: string;
}

export interface ChatMessage extends NewChatMessage {
    id: number;
}

export interface HistoryMessage {
    type: "history";
    room_id: string;
    messages: ChatMessage[];
    createdAt: string;
    hasMore: boolean;
    nextBeforeId: number | null;
}

export interface MessageHistoryPage {
    messages: ChatMessage[];
    hasMore: boolean;
    nextBeforeId: number | null;
}

export interface NotificationMessage {
    type: "notification";
    room_id: string;
    roomConnectionCount: number;
    roomUserCount: number;
    message: string;
    createdAt: string;
}

export interface UserNotificationMessage {
    type: "user-notification";
    message: string;
    createdAt: string;
}

export interface ErrorMessage {
    type: "error";
    code: ErrorCode;
    message: string;
    createdAt: string;
}

export type ServerMessage =
    | ConnectionMessage
    | RegisterSuccessMessage
    | HistoryMessage
    | ChatMessage
    | NotificationMessage
    | UserNotificationMessage
    | ErrorMessage;
