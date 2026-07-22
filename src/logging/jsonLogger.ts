import process from "process";
import { LogContext, Logger } from "./logger";

type LogLevel = | "debug" | "info" | "warn" | "error";

interface JsonLoggerOptions {
    minimumLevel: | "debug" | "info" | "warn" | "error";
    baseContext?: LogContext;
}

const LOG_LEVEL_PRIOPITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}

function serializeError(error: unknown): unknown {
    if (!(error instanceof Error)) {
        return error;
    }
    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause
    }
}

function normalizeContext(context: LogContext): LogContext {
    const normalized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
        normalized[key] = value instanceof Error ? serializeError(value) : value;
    }
    return normalized
}

export function createJsonLogger(
    options: JsonLoggerOptions
): Logger {
    const baseContext = options.baseContext ?? {};

    function shouldLog(level: LogLevel): boolean {
        return (
            LOG_LEVEL_PRIOPITY[level] >= LOG_LEVEL_PRIOPITY[options.minimumLevel]
        )
    }

    function write(level: LogLevel, message: string, context: LogContext = {}): void {
        if (!shouldLog(level)) {
            return;
        }

        const entry = {
            timestamp: new Date().toISOString(), level, message, ...normalizeContext(baseContext), ...normalizeContext(context)
        }

        const serialized = JSON.stringify(entry)

        if (level === "error") {
            process.stderr.write(`${serialized}\n`)
            return;
        }
        process.stdout.write(`${serialized}\n`)
    }

    return {
        debug(message, context = {}) {
            write("debug", message, context)
        },
        info(message, context = {}) {
            write("info", message, context)
        },
        warn(message, context = {}) {
            write("warn", message, context)
        },
        error(message, context = {}) {
            write("error", message, context)
        },
        child(context = {}) {
            return createJsonLogger({
                ...options, baseContext: {
                    ...baseContext, ...context
                }
            })
        },
    }
}