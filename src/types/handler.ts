import type {
    ChatInputMessage,
    ClientMessage,
    RegisterMessage,
    ServerMessage,
} from "./messages";

import type { ChatWebSocket } from "./websocket";
import type { ErrorCode } from "../errors/errorMessages";
import type { MessageRepository } from "../repositories/messageRepository";
import type { RoomService } from "../service/roomService";

export interface MessageHandlerContext {
    roomService: RoomService;
    messageRepository: MessageRepository;

    sendJson: (
        ws: ChatWebSocket,
        payload: ServerMessage,
    ) => boolean;

    sendError: (
        ws: ChatWebSocket,
        code: ErrorCode,
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
    ) => boolean;
}

export interface ChatHandler {
    type: 'chat';
    handle: (
        ws: ChatWebSocket,
        message: ChatInputMessage,
        context: MessageHandlerContext,
    ) => boolean;
}

export type MessageHandler = RegisterHandler | ChatHandler;

export type MessageType = ClientMessage['type'];
