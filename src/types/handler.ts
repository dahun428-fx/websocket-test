import type {
    ClientMessage,
    RegisterMessage,
    ServerMessage,
} from "./messages";

import type { ChatWebSocket } from "./websocket";
import type { RoomService } from "../service/roomService";

export interface MessageHandlerContext {
    roomService: RoomService;

    sendJson: (
        ws: ChatWebSocket,
        payload: ServerMessage,
    ) => boolean;

    sendError: (
        ws: ChatWebSocket,
        message: string,
    ) => boolean;

    sendRoomHistory: (
        ws: ChatWebSocket,
        roomId: string,
    ) => boolean;

    createTimestamp: () => string;
}

export interface RegisterHandler {
    type: 'register';
    handle: (
        ws: ChatWebSocket,
        message: RegisterMessage,
        context: MessageHandlerContext,
    ) => void;
}

export interface ChatHandler {
    type: 'chat';
    handle: (
        ws: ChatWebSocket,
        message: ClientMessage,
        context: MessageHandlerContext,
    ) => void;
}

export type MessageHandler = RegisterHandler | ChatHandler;

export type MessageType = ClientMessage['type'];