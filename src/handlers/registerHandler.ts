import { TokenExpiredError } from "jsonwebtoken";

import { verifyAccessToken } from "../auth/tokenService";
import type { RegisterHandler } from "../types/handler";
import type { AuthTokenPayload } from "../types/auth";

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
        let tokenPayload: AuthTokenPayload;

        try {
            tokenPayload = verifyAccessToken(data.token);
        } catch (error) {
            if (error instanceof TokenExpiredError) {
                await sendError(ws, "ACCESS_TOKEN_EXPIRED");
                return false;
            }

            console.error("JWT 검증 실패:", error);
            await sendError(ws, "INVALID_ACCESS_TOKEN");
            return false;
        }

        const userId = tokenPayload.sub;
        const nickname = data.nickname;
        const roomId = data.room_id;
        const joinedRoomId = roomService.join(ws, roomId);

        ws.userId = userId;
        ws.nickname = nickname;

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
