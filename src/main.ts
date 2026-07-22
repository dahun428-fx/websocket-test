import "dotenv/config";
import { createConfig } from "./config";

import { createApplication } from "./application";

async function main(): Promise<void> {
  const config = createConfig();

  const application = await createApplication({
    config,
  });
  const port = await application.start();
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
