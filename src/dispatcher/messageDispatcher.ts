import { chatHandler } from "../handlers/chatHandler";
import { registerHandler } from "../handlers/registerHandler";
import { MessageHandlerContext } from "../types/handler";
import { ClientMessage } from "../types/messages";
import { ChatWebSocket } from "../types/websocket";

export async function dispatchMessage
    (ws: ChatWebSocket, message: ClientMessage, context: MessageHandlerContext): Promise<void> {

    switch (message.type) {
        case "register":
            await registerHandler.handle(ws, message, context);
            return;
        case "chat":
            await chatHandler.handle(ws, message, context);
            return;
        default:
            return;
    }


}