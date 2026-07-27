import { AsyncLocalStorage } from "node:async_hooks";

import type { UnitOfWork } from "../application/unitOfWork";
import type { Logger } from "../logging/logger";
import type { DatabaseConnection } from "./database";

export interface CreateSqliteUnitOfWorkOptions {
    database: DatabaseConnection;
    logger: Logger;
}

export function createSqliteUnitOfWork(options: CreateSqliteUnitOfWorkOptions): UnitOfWork {
    const { database, logger } = options;
    const transactionScope = new AsyncLocalStorage<boolean>();
    let queue: Promise<void> = Promise.resolve();

    async function run<T>(work: () => Promise<T>): Promise<T> {
        if (transactionScope.getStore()) {
            throw new Error("Nested transactions are not supported.");
        }

        const transaction = queue.then(
            () => transactionScope.run(true, async () => {
                await database.exec("BEGIN IMMEDIATE");

                try {
                    const result = await work();
                    await database.exec("COMMIT");
                    return result;
                } catch (error) {
                    try {
                        await database.exec("ROLLBACK");
                    } catch (rollbackError) {
                        logger.error("Transaction rollback failed", {
                            error: rollbackError,
                        });
                    }
                    throw error;
                }
            }),
        );
        queue = transaction.then(
            () => undefined,
            () => undefined,
        );
        return transaction;
    }

    return { run };
}
