import type { ClientMessage } from "../schemas/clientMessageSchema";
import type { MessageHandlers } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

export function dispatchMessage(
  socket: ChatWebSocket,
  message: ClientMessage,
  handlers: MessageHandlers,
): Promise<boolean> {
  switch (message.type) {
    case "register":
      return handlers.register(socket, message);
    case "chat":
      return handlers.chat(socket, message);
    case "history-request":
      return handlers.history(socket, message);
  }
}
