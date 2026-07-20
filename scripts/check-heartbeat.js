const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");

const HEARTBEAT_INTERVAL_MS = 100;
const CHECK_TIMEOUT_MS = 5_000;

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : null;

            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (port === null) {
                    reject(new Error("검사용 포트를 할당하지 못했습니다."));
                    return;
                }

                resolve(port);
            });
        });
    });
}

function waitForServer(serverProcess) {
    return new Promise((resolve, reject) => {
        let output = "";

        const handleOutput = (chunk) => {
            output += chunk.toString();
            if (output.includes("서버 실행:")) {
                resolve();
            }
        };

        serverProcess.stdout.on("data", handleOutput);
        serverProcess.stderr.on("data", handleOutput);
        serverProcess.once("exit", (code) => {
            reject(
                new Error(
                    `검사용 서버가 준비되기 전에 종료되었습니다. (code=${code})\n${output}`,
                ),
            );
        });
    });
}

function waitForOpen(socket) {
    return new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
    });
}

function rejectAfter(timeoutMs) {
    return new Promise((_, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${timeoutMs}ms 안에 heartbeat 검사가 끝나지 않았습니다.`));
        }, timeoutMs);
        timer.unref();
    });
}

function resolveAfter(timeoutMs) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        timer.unref();
    });
}

async function stopServer(serverProcess) {
    if (!serverProcess || serverProcess.exitCode !== null) {
        return;
    }

    serverProcess.kill("SIGTERM");
    await Promise.race([
        once(serverProcess, "exit"),
        resolveAfter(3_000),
    ]);

    if (serverProcess.exitCode === null) {
        serverProcess.kill("SIGKILL");
    }
}

async function main() {
    const projectRoot = path.resolve(__dirname, "..");
    const tempDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), "websocket-heartbeat-check-"),
    );
    const port = await getAvailablePort();
    const url = `ws://127.0.0.1:${port}`;
    let serverProcess;
    let healthyClient;
    let silentClient;

    try {
    serverProcess = spawn(process.execPath, [path.join(projectRoot, "dist/main.js")], {
            cwd: tempDirectory,
            env: {
                ...process.env,
                PORT: String(port),
                HEARTBEAT_INTERVAL_MS: String(HEARTBEAT_INTERVAL_MS),
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        await Promise.race([
            waitForServer(serverProcess),
            rejectAfter(CHECK_TIMEOUT_MS),
        ]);

        healthyClient = new WebSocket(url);
        silentClient = new WebSocket(url, { autoPong: false });

        let healthyPingCount = 0;
        let silentPingCount = 0;
        healthyClient.on("ping", () => {
            healthyPingCount += 1;
        });
        silentClient.on("ping", () => {
            silentPingCount += 1;
        });

        const silentClientClosed = once(silentClient, "close");
        await Promise.all([waitForOpen(healthyClient), waitForOpen(silentClient)]);
        await Promise.race([silentClientClosed, rejectAfter(CHECK_TIMEOUT_MS)]);

        if (healthyPingCount === 0 || healthyClient.readyState !== WebSocket.OPEN) {
            throw new Error("정상 클라이언트가 pong 후 연결을 유지하지 못했습니다.");
        }

        if (silentPingCount === 0) {
            throw new Error("무응답 클라이언트가 서버 ping을 받지 못했습니다.");
        }

        console.log(`서버 heartbeat 주기: ${HEARTBEAT_INTERVAL_MS}ms`);
        console.log("정상 클라이언트는 ping 수신 후 자동 pong으로 연결 유지");
        console.log("무응답 클라이언트는 ping 수신 후 pong 없음으로 서버가 연결 종료");
    } finally {
        if (healthyClient?.readyState === WebSocket.OPEN) {
            healthyClient.close();
        }
        if (silentClient?.readyState === WebSocket.OPEN) {
            silentClient.terminate();
        }
        await stopServer(serverProcess);
        await fs.rm(tempDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("Heartbeat 검사 실패:", error);
    process.exitCode = 1;
});
