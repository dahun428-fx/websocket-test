const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const messageRepository = require(
    "./repositories/messageRepository",
);

const createRoomService = require(
    "./service/roomService",
);

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
            console.error(
                "index.html 읽기 실패:",
                error,
            );

            res.writeHead(500, {
                "Content-Type":
                    "text/plain; charset=utf-8",
            });

            res.end("Server Error");
            return;
        }

        res.writeHead(200, {
            "Content-Type":
                "text/html; charset=utf-8",
        });

        res.end(data);
    });
});

/**
 * 기존 HTTP 서버를 이용해
 * WebSocket 서버를 생성합니다.
 */
const wss = new WebSocket.Server({
    server,
});

const roomService = createRoomService(wss);

/**
 * 특정 WebSocket 연결 하나에
 * JSON 데이터를 전송합니다.
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
 * 현재 시간을 ISO 문자열로 반환합니다.
 */
function createTimestamp() {
    return new Date().toISOString();
}

/**
 * 특정 연결에 에러 메시지를 전송합니다.
 */
function sendError(ws, message) {
    return sendJson(ws, {
        type: "error",
        message,
        createdAt: createTimestamp(),
    });
}

/**
 * 특정 방의 기존 채팅 내역을
 * 현재 사용자에게만 전송합니다.
 */
async function sendRoomHistory(ws, roomId) {
    const messages =
        await messageRepository.get(roomId);

    return sendJson(ws, {
        type: "history",
        room_id: roomId,
        messages,
        createdAt: createTimestamp(),
    });
}

/**
 * 닉네임 등록 및 방 입장을 처리합니다.
 */
function handleRegister(ws, data) {
    if (ws.nickname || ws.room_id) {
        sendError(
            ws,
            "이미 닉네임을 등록하고 방에 입장한 상태입니다.",
        );

        return false;
    }

    if (typeof data.nickname !== "string") {
        sendError(
            ws,
            "닉네임은 문자열이어야 합니다.",
        );

        return false;
    }

    if (typeof data.room_id !== "string") {
        sendError(
            ws,
            "방 ID는 문자열이어야 합니다.",
        );

        return false;
    }

    const nickname = data.nickname.trim();
    const roomId = data.room_id.trim();

    if (!nickname) {
        sendError(
            ws,
            "닉네임을 입력하세요.",
        );

        return false;
    }

    if (!roomId) {
        sendError(
            ws,
            "방 ID를 입력하세요.",
        );

        return false;
    }

    if (nickname.length > 20) {
        sendError(
            ws,
            "닉네임은 20자 이하로 입력하세요.",
        );

        return false;
    }

    if (roomId.length > 20) {
        sendError(
            ws,
            "방 ID는 20자 이하로 입력하세요.",
        );

        return false;
    }

    /**
     * 모든 검증이 끝난 뒤
     * 연결 객체에 사용자 정보를 저장합니다.
     */
    ws.nickname = nickname;
    roomService.join(ws, roomId);

    const roomConnectionCount =
        roomService.getConnectionCount(
            ws.room_id,
        );

    console.log(
        `등록 완료: nickname=${ws.nickname}, room_id=${ws.room_id}`,
    );

    console.log(
        `${ws.room_id}방 연결 수:`,
        roomConnectionCount,
    );

    /**
     * 현재 사용자에게만
     * 등록 성공 응답을 보냅니다.
     */
    sendJson(ws, {
        type: "register-success",
        nickname: ws.nickname,
        room_id: ws.room_id,
        roomConnectionCount,
        message:
            `${ws.room_id}방에 ${ws.nickname} 닉네임으로 입장했습니다.`,
        createdAt: createTimestamp(),
    });

    /**
     * 현재 사용자에게
     * 기존 채팅 내역을 전송합니다.
     */
    sendRoomHistory(
        ws,
        ws.room_id,
    );

    /**
     * 같은 방 사용자들에게
     * 입장 알림을 전송합니다.
     */
    roomService.broadcastToRoom(
        ws.room_id,
        {
            type: "notification",
            room_id: ws.room_id,
            message:
                `${ws.nickname}님이 입장했습니다.`,
            roomConnectionCount,
            createdAt: createTimestamp(),
        },
    );

    return true;
}

/**
 * 채팅 메시지를 처리합니다.
 */
function handleChat(ws, data) {
    if (!ws.nickname) {
        sendError(
            ws,
            "먼저 닉네임을 등록하세요.",
        );

        return false;
    }

    if (!ws.room_id) {
        sendError(
            ws,
            "먼저 채팅방에 입장하세요.",
        );

        return false;
    }

    if (typeof data.message !== "string") {
        sendError(
            ws,
            "메시지는 문자열이어야 합니다.",
        );

        return false;
    }

    const message = data.message.trim();

    if (!message) {
        sendError(
            ws,
            "메시지를 입력하세요.",
        );

        return false;
    }

    if (message.length > 1000) {
        sendError(
            ws,
            "메시지는 1000자 이하로 입력하세요.",
        );

        return false;
    }

    /**
     * 클라이언트가 보낸 nickname이나 room_id는
     * 신뢰하지 않습니다.
     *
     * 서버에 저장된 연결 정보를 사용합니다.
     */
    const chatMessage = {
        type: "chat",
        nickname: ws.nickname,
        room_id: ws.room_id,
        message,
        createdAt: createTimestamp(),
    };

    console.log(
        `${ws.room_id}방에 저장하고 브로드캐스트할 채팅:`,
        chatMessage,
    );

    /**
     * 먼저 메시지를 저장합니다.
     */
    messageRepository.save(
        ws.room_id,
        chatMessage,
    );

    /**
     * 저장한 메시지를
     * 같은 방 사용자들에게 전송합니다.
     */
    roomService.broadcastToRoom(
        ws.room_id,
        chatMessage,
    );

    return true;
}

/**
 * 수신한 WebSocket 메시지를
 * JSON 객체로 변환합니다.
 */
function parseMessage(ws, rawMessage) {
    const text = rawMessage.toString();

    console.log(
        "수신한 원본 메시지:",
        text,
    );

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        console.error(
            "JSON 변환 실패:",
            error,
        );

        sendError(
            ws,
            "올바른 JSON 형식이 아닙니다.",
        );

        return null;
    }

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        sendError(
            ws,
            "올바른 메시지 객체가 아닙니다.",
        );

        return null;
    }

    if (typeof data.type !== "string") {
        sendError(
            ws,
            "메시지 type이 필요합니다.",
        );

        return null;
    }

    return data;
}

/**
 * 메시지 타입에 따라
 * 적절한 처리 함수로 전달합니다.
 */
function handleMessage(ws, rawMessage) {
    const data = parseMessage(
        ws,
        rawMessage,
    );

    if (!data) {
        return;
    }

    switch (data.type) {
        case "register":
            handleRegister(
                ws,
                data,
            );
            return;

        case "chat":
            handleChat(
                ws,
                data,
            );
            return;

        default:
            sendError(
                ws,
                `지원하지 않는 메시지 타입입니다: ${data.type}`,
            );
    }
}

/**
 * WebSocket 연결 종료를 처리합니다.
 */
function handleClose(ws) {
    const nickname = ws.nickname;
    const roomId = ws.room_id;

    /**
     * 연결의 방 상태를 정리합니다.
     *
     * close 이벤트 시점에는 wss.clients에서
     * 이미 제외되었거나 제외되는 중일 수 있습니다.
     */
    roomService.leave(ws);

    console.log(
        "클라이언트 연결 종료",
    );

    console.log(
        "현재 전체 WebSocket 연결 수:",
        wss.clients.size,
    );

    if (!nickname || !roomId) {
        return;
    }

    const roomConnectionCount =
        roomService.getConnectionCount(
            roomId,
        );

    console.log(
        `${roomId}방 연결 수:`,
        roomConnectionCount,
    );

    roomService.broadcastToRoom(
        roomId,
        {
            type: "notification",
            room_id: roomId,
            message:
                `${nickname}님이 퇴장했습니다.`,
            roomConnectionCount,
            createdAt: createTimestamp(),
        },
    );
}

/**
 * WebSocket 연결 이벤트
 */
wss.on("connection", (ws) => {
    /**
     * 연결 직후에는
     * 닉네임과 방 정보가 없습니다.
     */
    ws.nickname = null;
    ws.room_id = null;

    console.log(
        "새로운 클라이언트 연결",
    );

    console.log(
        "현재 전체 WebSocket 연결 수:",
        wss.clients.size,
    );

    sendJson(ws, {
        type: "connection",
        message:
            "서버에 연결되었습니다.",
        createdAt: createTimestamp(),
    });

    ws.on(
        "message",
        (rawMessage) => {
            handleMessage(
                ws,
                rawMessage,
            );
        },
    );

    ws.on(
        "close",
        () => {
            handleClose(ws);
        },
    );

    ws.on(
        "error",
        (error) => {
            console.error(
                "WebSocket 연결 에러:",
                error,
            );
        },
    );
});

/**
 * HTTP 및 WebSocket 서버 실행
 */
server.listen(PORT, () => {
    console.log(
        `서버 실행: http://localhost:${PORT}`,
    );
});