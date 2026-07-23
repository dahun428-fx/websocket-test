import type { Logger } from "../logging/logger";
import type { Application } from "./application";

export function registerShutdownSignals(application: Application, logger: Logger): void {
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shutdownPromise) return;
    shutdownPromise = application.stop(signal).catch((error: unknown) => {
      logger.error("Application shutdown failed", { signal, error });
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
