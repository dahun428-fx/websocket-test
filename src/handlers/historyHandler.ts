import type { HistoryHandler } from "../types/handler";

export const historyHandler: HistoryHandler = {
    type: 'history-request',
    handle: async (
        ws, data, context,
    ) => {
        const {
            sendJson, messageRepository, sendError, createTimestamp
        } = context;

        const roomId = ws.room_id;

        if (!roomId) {
            await sendError(ws, "ROOM_NOT_JOINED");
            return false;
        }

        const historyPage = await messageRepository.getBefore(
            roomId, data.before_id, data.limit
        );

        await sendJson(ws, {
            type: "history",
            room_id: roomId,
            messages: historyPage.messages,
            hasMore: historyPage.hasMore,
            nextBeforeId: historyPage.nextBeforeId,
            createdAt: createTimestamp(),
        });

        return true;
    }
};
