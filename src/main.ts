import "dotenv/config";

import path from "node:path";

import { createApplication } from "./application";
import { resolveHeartbeatIntervalMs } from "./heartbeat/heartbeat";

async function main(): Promise<void> {
  const application = await createApplication({
    databasePath: process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "chat.db"),
    host: process.env.HOST ?? "0.0.0.0",
    heartbeatIntervalMs: resolveHeartbeatIntervalMs(process.env.HEARTBEAT_INTERVAL_MS),
  });
  const port = await application.start(Number(process.env.PORT) || 3010);
  console.log(`서버 실행: http://localhost:${port}`);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} 신호 수신, 서버 종료 중...`);
    await application.stop();
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch((error) => {
      console.error("서버 종료 실패:", error);
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
}

void main().catch((error: unknown) => {
  console.error("서버 시작 실패:", error);
  process.exitCode = 1;
});
