import { RegisterHandler } from "../types/handler";
import { RegisterMessage } from "../types/messages";

export const registerHandler: RegisterHandler = {
    type: 'register',
    handle: (
        ws,
        data,
        context,
    ) => {
        const { roomService, sendJson, sendError, sendRoomHistory, createTimestamp } = context;

        if (ws.nickname || ws.room_id) {
            sendError(ws, "이미 닉네임을 등록하고 방에 입장한 상태입니다.");
            return false;
        }

        const nickname = data.nickname.trim();
        const roomId = data.room_id.trim();
        if (!nickname) {
            sendError(ws, "닉네임을 입력하세요.");
            return false;
        }
        if (!roomId) {
            sendError(ws, "방 ID를 입력하세요.");
            return false;
        }
        if (nickname.length > 20) {
            sendError(ws, "닉네임은 20자 이하로 입력하세요.");
            return false;
        }
        if (roomId.length > 20) {
            sendError(ws, "방 ID는 20자 이하로 입력하세요.");
            return false;
        }

        const registerMessage: RegisterMessage = {
            type: "register",
            nickname,
            room_id: roomId,
        };
        ws.nickname = registerMessage.nickname;
        roomService.join(ws, registerMessage.room_id);

        const joinedRoomId = ws.room_id;
        if (!joinedRoomId) {
            return false;
        }

        const roomConnectionCount = roomService.getConnectionCount(joinedRoomId);
        console.log(`등록 완료: nickname=${ws.nickname}, room_id=${joinedRoomId}`);
        console.log(`${joinedRoomId}방 연결 수:`, roomConnectionCount);

        sendJson(ws, {
            type: "register-success",
            nickname: ws.nickname,
            room_id: joinedRoomId,
            roomConnectionCount,
            message: `${joinedRoomId}방에 ${ws.nickname} 닉네임으로 입장했습니다.`,
            createdAt: createTimestamp(),
        });
        sendRoomHistory(ws, joinedRoomId);
        roomService.broadcastToRoom(joinedRoomId, {
            type: "notification",
            room_id: joinedRoomId,
            message: `${ws.nickname}님이 입장했습니다.`,
            roomConnectionCount,
            createdAt: createTimestamp(),
        });
    }
}