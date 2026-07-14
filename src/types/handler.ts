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
import type { HistoryRequestMessage } from "../schemas/clientMessageSchema";

export interface MessageHandlerContext {
    roomService: RoomService;
    messageRepository: MessageRepository;

    sendJson: (
        ws: ChatWebSocket,
        payload: ServerMessage,
    ) => Promise<void>;

    sendError: (
        ws: ChatWebSocket,
        code: ErrorCode,
    ) => Promise<void>;

    sendRoomHistory: (
        ws: ChatWebSocket,
        roomId: string,
    ) => Promise<void>;

    createTimestamp: () => string;
}

export interface RegisterHandler {
    type: 'register';
    handle: (
        ws: ChatWebSocket,
        message: RegisterMessage,
        context: MessageHandlerContext,
    ) => Promise<boolean>;
}

export interface ChatHandler {
    type: 'chat';
    handle: (
        ws: ChatWebSocket,
        message: ChatInputMessage,
        context: MessageHandlerContext,
    ) => Promise<boolean>;
}

export interface HistoryHandler {
    type: 'history-request',
    handle: (
        ws: ChatWebSocket,
        message: HistoryRequestMessage,
        context: MessageHandlerContext
    ) => Promise<boolean>;
}

export type MessageHandler = RegisterHandler | ChatHandler | HistoryHandler;

export type MessageType = ClientMessage['type'];
