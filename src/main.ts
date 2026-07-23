import "dotenv/config";
import { createConfig } from "./config";

import { createApplication, createApplicationContainer, registerShutdownSignals } from "./application";
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

  const container = await createApplicationContainer({ config, logger });
  const application = createApplication(container);
  registerShutdownSignals(application, logger);
  await application.start();
}

void main().catch((error: unknown) => {
  bootstrapLogger.error("Server startup failed", { error });
  process.exitCode = 1;
});
