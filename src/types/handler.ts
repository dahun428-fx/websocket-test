import type { ErrorCode } from "../errors/errorMessages";
import type { ClientMessage } from "../schemas/clientMessageSchema";
import type { ChatWebSocket } from "./websocket";
import type { ServerMessage } from "./messages";

export type SendJson = (
  socket: ChatWebSocket,
  payload: ServerMessage,
) => Promise<void>;

export type SendError = (
  socket: ChatWebSocket,
  code: ErrorCode,
) => Promise<void>;

export interface MessageHandlers {
  register: (socket: ChatWebSocket, message: Extract<ClientMessage, { type: "register" }>) => Promise<boolean>;
  chat: (socket: ChatWebSocket, message: Extract<ClientMessage, { type: "chat" }>) => Promise<boolean>;
  history: (socket: ChatWebSocket, message: Extract<ClientMessage, { type: "history-request" }>) => Promise<boolean>;
}
