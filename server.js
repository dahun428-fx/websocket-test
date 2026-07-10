const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3008;

/**
 * HTTP 서버
 *
 * 브라우저가 http://localhost:3008로 접속하면
 * public/index.html 파일을 반환합니다.
 */
const server = http.createServer((req, res) => {
    const filePath = path.join(
        __dirname,
        "public",
        "index.html",
    );

    fs.readFile(filePath, (error, data) => {
        if (error) {
            console.error("index.html 읽기 실패:", error);

            res.writeHead(500, {
                "Content-Type": "text/plain; charset=utf-8",
            });

            res.end("Server Error");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
        });

        res.end(data);
    });
});

/**
 * 기존 HTTP 서버를 이용해 WebSocket 서버를 생성합니다.
 *
 * http://localhost:3008
 * ws://localhost:3008
 *
 * 두 주소가 같은 포트를 사용합니다.
 */
const wss = new WebSocket.Server({ server });

/**
 * 특정 WebSocket 연결 하나에 JSON 데이터를 전송합니다.
 */
function sendJson(ws, payload) {
    if (ws.readyState !== WebSocket.OPEN) {
        console.error(
            "WebSocket이 열린 상태가 아니므로 메시지를 전송할 수 없습니다.",
        );
        return false;
    }

    ws.send(JSON.stringify(payload));

    return true;
}

/**
 * 특정 채팅방에 연결된 사용자에게만 데이터를 전송합니다.
 */
function broadcastToRoom(roomId, payload) {
    const json = JSON.stringify(payload);

    wss.clients.forEach((client) => {
        const isOpen =
            client.readyState === WebSocket.OPEN;

        const isSameRoom =
            client.room_id === roomId;

        if (isOpen && isSameRoom) {
            client.send(json);
        }
    });
}

/**
 * 현재 특정 방에 접속한 WebSocket 연결 수를 반환합니다.
 *
 * 아직 사람 수가 아니라 연결 수입니다.
 * 한 사람이 여러 탭을 열면 여러 명처럼 계산됩니다.
 */
function getRoomConnectionCount(roomId) {
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

wss.on("connection", (ws) => {
    /**
     * 현재 ws 객체는 브라우저 WebSocket 연결 하나입니다.
     *
     * 연결 직후에는 닉네임과 방 정보가 없습니다.
     */
    ws.nickname = null;
    ws.room_id = null;

    console.log("새로운 클라이언트 연결");
    console.log(
        "현재 전체 WebSocket 연결 수:",
        wss.clients.size,
    );

    sendJson(ws, {
        type: "connection",
        message: "서버에 연결되었습니다.",
        createdAt: new Date().toISOString(),
    });

    ws.on("message", (rawMessage) => {
        const text = rawMessage.toString();

        console.log("수신한 원본 메시지:", text);

        let data;

        /**
         * WebSocket을 통해 들어온 JSON 문자열을
         * JavaScript 객체로 변환합니다.
         */
        try {
            data = JSON.parse(text);
        } catch (error) {
            console.error("JSON 변환 실패:", error);

            sendJson(ws, {
                type: "error",
                message: "올바른 JSON 형식이 아닙니다.",
                createdAt: new Date().toISOString(),
            });

            return;
        }

        /**
         * 기본 메시지 객체 검사
         */
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            sendJson(ws, {
                type: "error",
                message: "올바른 메시지 객체가 아닙니다.",
                createdAt: new Date().toISOString(),
            });

            return;
        }

        if (typeof data.type !== "string") {
            sendJson(ws, {
                type: "error",
                message: "메시지 type이 필요합니다.",
                createdAt: new Date().toISOString(),
            });

            return;
        }

        /**
         * 닉네임 등록 및 채팅방 입장
         *
         * 클라이언트가 보내는 데이터:
         *
         * {
         *   type: "register",
         *   nickname: "다훈",
         *   room_id: "room-1"
         * }
         */
        if (data.type === "register") {
            if (ws.nickname || ws.room_id) {
                sendJson(ws, {
                    type: "error",
                    message:
                        "이미 닉네임을 등록하고 방에 입장한 상태입니다.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (typeof data.nickname !== "string") {
                sendJson(ws, {
                    type: "error",
                    message: "닉네임은 문자열이어야 합니다.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (typeof data.room_id !== "string") {
                sendJson(ws, {
                    type: "error",
                    message: "방 ID는 문자열이어야 합니다.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            const nickname = data.nickname.trim();
            const roomId = data.room_id.trim();

            if (!nickname) {
                sendJson(ws, {
                    type: "error",
                    message: "닉네임을 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (!roomId) {
                sendJson(ws, {
                    type: "error",
                    message: "방 ID를 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (nickname.length > 20) {
                sendJson(ws, {
                    type: "error",
                    message: "닉네임은 20자 이하로 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (roomId.length > 20) {
                sendJson(ws, {
                    type: "error",
                    message: "방 ID는 20자 이하로 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            /**
             * 모든 검증이 끝난 후에
             * WebSocket 연결 객체에 사용자 정보를 저장합니다.
             */
            ws.nickname = nickname;
            ws.room_id = roomId;

            const roomConnectionCount =
                getRoomConnectionCount(ws.room_id);

            console.log(
                `등록 완료: nickname=${ws.nickname}, room_id=${ws.room_id}`,
            );

            console.log(
                `${ws.room_id}방 연결 수:`,
                roomConnectionCount,
            );

            /**
             * 닉네임을 등록한 현재 사용자에게만 성공 응답을 보냅니다.
             */
            sendJson(ws, {
                type: "register-success",
                nickname: ws.nickname,
                room_id: ws.room_id,
                roomConnectionCount,
                message:
                    `${ws.room_id}방에 ${ws.nickname} 닉네임으로 입장했습니다.`,
                createdAt: new Date().toISOString(),
            });

            /**
             * 같은 방 사용자에게만 입장 알림을 보냅니다.
             */
            broadcastToRoom(ws.room_id, {
                type: "notification",
                room_id: ws.room_id,
                message: `${ws.nickname}님이 입장했습니다.`,
                roomConnectionCount,
                createdAt: new Date().toISOString(),
            });

            return;
        }

        /**
         * 채팅 메시지 처리
         *
         * 클라이언트가 보내는 데이터:
         *
         * {
         *   type: "chat",
         *   message: "안녕하세요"
         * }
         */
        if (data.type === "chat") {
            if (!ws.nickname) {
                sendJson(ws, {
                    type: "error",
                    message: "먼저 닉네임을 등록하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (!ws.room_id) {
                sendJson(ws, {
                    type: "error",
                    message: "먼저 채팅방에 입장하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (typeof data.message !== "string") {
                sendJson(ws, {
                    type: "error",
                    message: "메시지는 문자열이어야 합니다.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            const message = data.message.trim();

            if (!message) {
                sendJson(ws, {
                    type: "error",
                    message: "메시지를 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            if (message.length > 1000) {
                sendJson(ws, {
                    type: "error",
                    message:
                        "메시지는 1000자 이하로 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            /**
             * 클라이언트가 보낸 nickname이나 room_id는 사용하지 않습니다.
             *
             * 서버의 현재 WebSocket 연결에 저장된 값을 사용합니다.
             */
            const chatMessage = {
                type: "chat",
                nickname: ws.nickname,
                room_id: ws.room_id,
                message,
                createdAt: new Date().toISOString(),
            };

            console.log(
                `${ws.room_id}방에 브로드캐스트할 채팅:`,
                chatMessage,
            );

            /**
             * 같은 room_id를 가진 연결에만 메시지를 전송합니다.
             */
            broadcastToRoom(ws.room_id, chatMessage);

            return;
        }

        /**
         * register, chat 외의 type이 들어온 경우
         */
        sendJson(ws, {
            type: "error",
            message:
                `지원하지 않는 메시지 타입입니다: ${data.type}`,
            createdAt: new Date().toISOString(),
        });
    });

    /**
     * 브라우저가 닫히거나 WebSocket 연결이 종료된 경우
     */
    ws.on("close", () => {
        const nickname = ws.nickname;
        const roomId = ws.room_id;

        console.log("클라이언트 연결 종료");
        console.log(
            "현재 전체 WebSocket 연결 수:",
            wss.clients.size,
        );

        if (nickname && roomId) {
            const roomConnectionCount =
                getRoomConnectionCount(roomId);

            console.log(
                `${roomId}방 연결 수:`,
                roomConnectionCount,
            );

            broadcastToRoom(roomId, {
                type: "notification",
                room_id: roomId,
                message: `${nickname}님이 퇴장했습니다.`,
                roomConnectionCount,
                createdAt: new Date().toISOString(),
            });
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket 연결 에러:", error);
    });
});

server.listen(PORT, () => {
    console.log(
        `서버 실행: http://localhost:${PORT}`,
    );
});