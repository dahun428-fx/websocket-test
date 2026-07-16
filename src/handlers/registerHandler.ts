import type { RegisterHandler } from "../types/handler";
import type { RegisterMessage } from "../types/messages";

export const registerHandler: RegisterHandler = {
    type: 'register',
    handle: async (
        ws,
        data,
        context,
    ) => {
        const { roomService, sendJson, sendError, sendRoomHistory, createTimestamp } = context;

        if (ws.userId || ws.nickname || ws.room_id) {
            await sendError(ws, "ALREADY_REGISTERED");
            return false;
        }
        const userId = data.userId.trim();
        const nickname = data.nickname.trim();
        const roomId = data.room_id.trim();
        if (!nickname) {
            await sendError(ws, "NICKNAME_REQUIRED");
            return false;
        }
        if (!roomId) {
            await sendError(ws, "ROOM_ID_REQUIRED");
            return false;
        }
        if (nickname.length > 20) {
            await sendError(ws, "NICKNAME_TOO_LONG");
            return false;
        }
        if (roomId.length > 20) {
            await sendError(ws, "ROOM_ID_TOO_LONG");
            return false;
        }

        const registerMessage: RegisterMessage = {
            type: "register",
            userId,
            nickname,
            room_id: roomId,
        };
        const joinedRoomId = roomService.join(ws, registerMessage.room_id);

        ws.userId = registerMessage.userId;
        ws.nickname = registerMessage.nickname;

        const roomConnectionCount = roomService.getConnectionCount(joinedRoomId);
        console.log(`등록 완료: nickname=${ws.nickname}, room_id=${joinedRoomId}`);
        console.log(`${joinedRoomId}방 연결 수:`, roomConnectionCount);

        const roomUserCount = roomService.getUserCount(joinedRoomId);


        await sendJson(ws, {
            type: "register-success",
            userId,
            nickname,
            room_id: joinedRoomId,
            roomConnectionCount,
            roomUserCount,
            message: `${joinedRoomId}방에 ${nickname} 닉네임으로 입장했습니다.`,
            createdAt: createTimestamp(),
        });
        await sendRoomHistory(ws, joinedRoomId);

        if (ws.nickname !== nickname || ws.room_id !== joinedRoomId) {
            return false;
        }

        roomService.broadcastToRoom(joinedRoomId, {
            type: "notification",
            room_id: joinedRoomId,
            message: `${nickname}님이 입장했습니다.`,
            roomConnectionCount,
            roomUserCount,
            createdAt: createTimestamp(),
        });
        return true;
    }
};
