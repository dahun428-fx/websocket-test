import type { ChatWebSocket } from "../types/websocket";

type QueueTask = () => Promise<void>;
type QueueErrorHandler = (error: unknown) => Promise<void>;

export function enqueueMessage(
    ws: ChatWebSocket,
    task: QueueTask,
    onError: QueueErrorHandler,
): void {
    ws.messageQueue = ws.messageQueue
        .then(async () => {
            if (ws.isClosing) {
                return;
            }

            await task();
        })
        .catch(async (error) => {
            if (!ws.isClosing) {
                await onError(error);
            }
        });
}
