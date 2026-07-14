import { chatHandler } from "../handlers/chatHandler";
import { historyHandler } from "../handlers/historyHandler";
import { registerHandler } from "../handlers/registerHandler";
import type { ClientMessage } from "../schemas/clientMessageSchema";
import type { MessageHandlerContext } from "../types/handler";
import type { ChatWebSocket } from "../types/websocket";

export async function dispatchMessage
    (ws: ChatWebSocket, message: ClientMessage, context: MessageHandlerContext): Promise<void> {

    switch (message.type) {
        case "register":
            await registerHandler.handle(ws, message, context);
            return;
        case "chat":
            await chatHandler.handle(ws, message, context);
            return;
        case "history-request":
            await historyHandler.handle(ws, message, context)
            return;
        default:
            return;
    }


}
