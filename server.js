const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3008;

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

const wss = new WebSocket.Server({ server });

function sendJson(ws, payload) {
    if (ws.readyState !== WebSocket.OPEN) {
        console.error(
            "WebSocket이 열린 상태가 아니므로 메시지를 전송할 수 없습니다.",
        );
        return;
    }

    ws.send(JSON.stringify(payload));
}

function broadcast(payload) {
    const json = JSON.stringify(payload);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

wss.on("connection", (ws) => {
    /*
     * 이 ws 객체는 현재 연결된 브라우저 하나를 의미합니다.
     * 연결별로 닉네임을 저장합니다.
     */
    ws.nickname = null;

    console.log("새로운 클라이언트 연결");
    console.log("현재 WebSocket 연결 수:", wss.clients.size);

    sendJson(ws, {
        type: "connection",
        message: "서버에 연결되었습니다.",
        createdAt: new Date().toISOString(),
    });

    ws.on("message", (rawMessage) => {
        const text = rawMessage.toString();

        console.log("수신한 원본 메시지:", text);

        let data;

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

        /*
         * 닉네임 등록 메시지
         *
         * {
         *   type: "register",
         *   nickname: "다훈"
         * }
         */
        if (data.type === "register") {
            if (ws.nickname) {
                sendJson(ws, {
                    type: "error",
                    message: "이미 닉네임이 등록되어 있습니다.",
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

            const nickname = data.nickname.trim();

            if (!nickname) {
                sendJson(ws, {
                    type: "error",
                    message: "닉네임을 입력하세요.",
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

            ws.nickname = nickname;

            console.log(`닉네임 등록 완료: ${ws.nickname}`);

            sendJson(ws, {
                type: "register-success",
                nickname: ws.nickname,
                message: `${ws.nickname} 닉네임으로 등록되었습니다.`,
                createdAt: new Date().toISOString(),
            });

            broadcast({
                type: "notification",
                message: `${ws.nickname}님이 입장했습니다.`,
                createdAt: new Date().toISOString(),
            });

            return;
        }

        /*
         * 채팅 메시지
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
                    message: "메시지는 1000자 이하로 입력하세요.",
                    createdAt: new Date().toISOString(),
                });

                return;
            }

            const chatMessage = {
                type: "chat",
                nickname: ws.nickname,
                message,
                createdAt: new Date().toISOString(),
            };

            console.log("브로드캐스트할 채팅:", chatMessage);

            broadcast(chatMessage);
            return;
        }

        sendJson(ws, {
            type: "error",
            message: `지원하지 않는 메시지 타입입니다: ${data.type}`,
            createdAt: new Date().toISOString(),
        });
    });

    ws.on("close", () => {
        console.log("클라이언트 연결 종료");
        console.log("현재 WebSocket 연결 수:", wss.clients.size);

        if (ws.nickname) {
            broadcast({
                type: "notification",
                message: `${ws.nickname}님이 퇴장했습니다.`,
                createdAt: new Date().toISOString(),
            });
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket 연결 에러:", error);
    });
});

server.listen(PORT, () => {
    console.log(`서버 실행: http://localhost:${PORT}`);
});