import WebSocket, { WebSocketServer } from "ws";

import type { ServerMessage } from "../types/messages";
import type { ChatWebSocket } from "../types/websocket";

export interface RoomService {
    getUserCount(roomId: string): number;
    broadcastToRoom(roomId: string, payload: ServerMessage): number;
    getConnectionCount(roomId: string): number;
    getClients(roomId: string): ChatWebSocket[];
    join(ws: ChatWebSocket, roomId: string): string;
    leave(ws: ChatWebSocket | null | undefined): string | null;
}

function createRoomService(wss: WebSocketServer): RoomService {
    if (!wss || !wss.clients) {
        throw new Error(
            "createRoomService에는 WebSocket.Server 인스턴스가 필요합니다.",
        );
    }

    function getUserCount(roomId: string): number {
        const userIds = new Set<string>();

        wss.clients.forEach((client) => {
            const ws = client as ChatWebSocket;
            const isOpen = ws.readyState === WebSocket.OPEN;
            const isSameRoom = ws.room_id === roomId;

            if (isOpen && isSameRoom && ws.userId) {
                userIds.add(ws.userId);
            }
        });

        return userIds.size;
    }

    /**
     * 특정 방에 접속한 클라이언트들에게 데이터를 전송합니다.
     */
    function broadcastToRoom(roomId: string, payload: ServerMessage): number {
        if (!roomId) {
            return 0;
        }

        const json = JSON.stringify(payload);
        let sentCount = 0;

        wss.clients.forEach((client) => {
            const chatClient = client as ChatWebSocket;
            const isOpen =
                chatClient.readyState === WebSocket.OPEN;

            const isSameRoom =
                chatClient.room_id === roomId;

            if (!isOpen || !isSameRoom) {
                return;
            }

            chatClient.send(json);
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
    function getConnectionCount(roomId: string): number {
        if (!roomId) {
            return 0;
        }

        let count = 0;

        wss.clients.forEach((client) => {
            const chatClient = client as ChatWebSocket;
            if (
                chatClient.readyState === WebSocket.OPEN &&
                chatClient.room_id === roomId
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
    function getClients(roomId: string): ChatWebSocket[] {
        if (!roomId) {
            return [];
        }

        return [...wss.clients].filter((client): client is ChatWebSocket => {
            const chatClient = client as ChatWebSocket;
            return (
                chatClient.readyState === WebSocket.OPEN &&
                chatClient.room_id === roomId
            );
        });
    }

    /**
     * 현재 WebSocket 연결을 특정 방에 등록합니다.
     */
    function join(ws: ChatWebSocket, roomId: string): string {
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
    function leave(ws: ChatWebSocket | null | undefined): string | null {
        if (!ws) {
            return null;
        }

        const previousRoomId = ws.room_id;

        ws.room_id = null;

        return previousRoomId;
    }

    return {
        broadcastToRoom,
        getUserCount,
        getConnectionCount,
        getClients,
        join,
        leave,
    };
}

export default createRoomService;
