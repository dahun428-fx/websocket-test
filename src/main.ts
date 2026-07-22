import "dotenv/config";
import { createConfig } from "./config";

import { createApplication } from "./application";
import { createJsonLogger } from "./logging/jsonLogger";

const bootstrapLogger = createJsonLogger({
  minimumLevel: "info",
  baseContext: { application: "chat-backend" },
});

async function main(): Promise<void> {
  const config = createConfig();
  const logger = createJsonLogger({
    minimumLevel: config.logging.level,
    baseContext: {
      application: "chat-backend",
      environment: config.environment,
    },
  });

  const application = await createApplication({
    config,
  });
  const port = await application.start();
  logger.info("Server started", { port });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Server shutdown started", { signal });
    await application.stop();
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch((error) => {
      logger.error("Server shutdown failed", { error });
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
}

void main().catch((error: unknown) => {
  bootstrapLogger.error("Server startup failed", { error });
  process.exitCode = 1;
});
