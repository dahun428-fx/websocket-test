import { createApplicationContainer, type CreateApplicationContainerOptions } from "../application";
import type { AppConfig } from "../config";
import type { Logger } from "../logging/logger";
import { createTestConfig } from "./createTestConfig";

export function createSilentLogger(): Logger {
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() { return logger; },
  };
  return logger;
}

export function createTestContainer(
  databasePath: string,
  options: Omit<CreateApplicationContainerOptions, "config" | "logger"> & {
    config?: AppConfig;
  } = {},
) {
  return createApplicationContainer({
    ...options,
    config: options.config ?? createTestConfig(databasePath),
    logger: createSilentLogger(),
  });
}
