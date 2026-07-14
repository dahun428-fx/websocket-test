import { describe, expect, it, vi } from "vitest";

import { enqueueMessage } from "./messageQueue";
import type { ChatWebSocket } from "../types/websocket";

function createSocket(): ChatWebSocket {
    return {
        isClosed: false,
        messageQueue: Promise.resolve(),
    } as ChatWebSocket;
}

describe("enqueueMessage", () => {
    it("skips queued work after the connection starts closing", async () => {
        const socket = createSocket();
        let resolveFirstTask: (() => void) | undefined;
        const firstTask = vi.fn(() => new Promise<void>((resolve) => {
            resolveFirstTask = resolve;
        }));
        const queuedTask = vi.fn(async () => undefined);
        const onError = vi.fn(async () => undefined);

        enqueueMessage(socket, firstTask, onError);
        enqueueMessage(socket, queuedTask, onError);

        await vi.waitFor(() => expect(firstTask).toHaveBeenCalledOnce());
        socket.isClosed = true;
        resolveFirstTask?.();

        await socket.messageQueue;
        expect(queuedTask).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it("reports task errors while the connection remains open", async () => {
        const socket = createSocket();
        const error = new Error("failed");
        const onError = vi.fn(async () => undefined);

        enqueueMessage(socket, async () => {
            throw error;
        }, onError);

        await socket.messageQueue;
        expect(onError).toHaveBeenCalledWith(error);
    });
});
