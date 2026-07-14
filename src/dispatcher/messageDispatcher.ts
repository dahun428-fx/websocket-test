import { chatHandler } from "../handlers/chatHandler";
import { registerHandler } from "../handlers/registerHandler";
import { MessageHandlerContext } from "../types/handler";
import { ClientMessage } from "../types/messages";
import { ChatWebSocket } from "../types/websocket";

export function dispatchMessage(ws: ChatWebSocket, message: ClientMessage, context: MessageHandlerContext): void {

    switch (message.type) {
        case "register":
            registerHandler.handle(ws, message, context);
            return;
        case "chat":
            chatHandler.handle(ws, message, context);
            return;
        default:
            return;
    }


}