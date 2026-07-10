const WebSocket = require("ws");

function createRoomService(wss) {
    if (!wss || !wss.clients) {
        throw new Error(
            "createRoomService에는 WebSocket.Server 인스턴스가 필요합니다.",
        );
    }

    /**
     * 특정 방에 접속한 클라이언트들에게 데이터를 전송합니다.
     */
    function broadcastToRoom(roomId, payload) {
        if (!roomId) {
            return 0;
        }

        const json = JSON.stringify(payload);
        let sentCount = 0;

        wss.clients.forEach((client) => {
            const isOpen =
                client.readyState === WebSocket.OPEN;

            const isSameRoom =
                client.room_id === roomId;

            if (!isOpen || !isSameRoom) {
                return;
            }

            client.send(json);
            sentCount += 1;
        });

        return sentCount;
    }

    /**
     * 특정 방에 접속한 WebSocket 연결 수를 반환합니다.
     *
     * 사용자 수가 아니라 연결 수입니다.
     * 같은 사용자가 탭 두 개를 열면 2개로 계산됩니다.
     */
    function getConnectionCount(roomId) {
        if (!roomId) {
            return 0;
        }

        let count = 0;

        wss.clients.forEach((client) => {
            if (
                client.readyState === WebSocket.OPEN &&
                client.room_id === roomId
            ) {
                count += 1;
            }
        });

        return count;
    }

    /**
     * 특정 방에 접속한 WebSocket 연결 목록을 반환합니다.
     *
     * 원본 Set이 아니라 새로운 배열을 반환합니다.
     */
    function getClients(roomId) {
        if (!roomId) {
            return [];
        }

        return [...wss.clients].filter((client) => {
            return (
                client.readyState === WebSocket.OPEN &&
                client.room_id === roomId
            );
        });
    }

    /**
     * 현재 WebSocket 연결을 특정 방에 등록합니다.
     */
    function join(ws, roomId) {
        if (!ws) {
            throw new Error("WebSocket 연결이 필요합니다.");
        }

        if (typeof roomId !== "string") {
            throw new TypeError("roomId는 문자열이어야 합니다.");
        }

        const normalizedRoomId = roomId.trim();

        if (!normalizedRoomId) {
            throw new Error("roomId는 비어 있을 수 없습니다.");
        }

        ws.room_id = normalizedRoomId;

        return normalizedRoomId;
    }

    /**
     * 현재 연결에서 방 정보를 제거합니다.
     */
    function leave(ws) {
        if (!ws) {
            return null;
        }

        const previousRoomId = ws.room_id;

        ws.room_id = null;

        return previousRoomId;
    }

    return {
        broadcastToRoom,
        getConnectionCount,
        getClients,
        join,
        leave,
    };
}

module.exports = createRoomService;