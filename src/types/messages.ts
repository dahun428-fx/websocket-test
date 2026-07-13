export interface RegisterMessage {
    type: "register";
    nickname: string;
    room_id: string;
}

export interface ChatInputMessage {
    type: "chat";
    message: string;
}

export interface ConnectionMessage {
    type: "connection";
    message: string;
    createdAt: string;
}

export interface RegisterSuccessMessage {
    type: "register-success";
    nickname: string;
    room_id: string;
    roomConnectionCount: number;
    message: string;
    createdAt: string;
}

export interface ChatMessage {
    type: "chat";
    nickname: string;
    room_id: string;
    message: string;
    createdAt: string;
}

export interface HistoryMessage {
    type: "history";
    room_id: string;
    messages: ChatMessage[];
    createdAt: string;
}

export interface NotificationMessage {
    type: "notification";
    room_id: string;
    roomConnectionCount: number;
    message: string;
    createdAt: string;
}

export interface ErrorMessage {
    type: "error";
    message: string;
    createdAt: string;
}

export type ServerMessage =
    | ConnectionMessage
    | RegisterSuccessMessage
    | HistoryMessage
    | ChatMessage
    | NotificationMessage
    | ErrorMessage;

export type ClientMessage =
    | RegisterMessage
    | ChatInputMessage;
