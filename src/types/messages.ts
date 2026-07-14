import { z } from "zod";

import type { ErrorCode } from "../errors/errorMessages";

export const registerMessageSchema = z.object({
    type: z.literal("register"),
    nickname: z.string(),
    room_id: z.string(),
});

export const chatInputMessageSchema = z.object({
    type: z.literal("chat"),
    message: z.string(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
    registerMessageSchema,
    chatInputMessageSchema,
]);

export type RegisterMessage = z.infer<typeof registerMessageSchema>;
export type ChatInputMessage = z.infer<typeof chatInputMessageSchema>;

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
    | ErrorMessage;

export type ClientMessage = z.infer<typeof clientMessageSchema>;
