import type { DatabaseConnection } from "../database/database";

export interface SaveRefreshTokenInput {
    tokenId: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
}

export interface RefreshTokenRecord {
    tokenId: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
    revokedAt: string | null;
}

interface RefreshTokenRow {
    token_id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    created_at: string;
    revoked_at: string | null;
}

function mapRow(row: RefreshTokenRow): RefreshTokenRecord {
    const { user_id, token_hash, token_id, expires_at, created_at, revoked_at } = row;
    return {
        tokenId: token_id,
        userId: user_id,
        tokenHash: token_hash,
        expiresAt: expires_at,
        createdAt: created_at,
        revokedAt: revoked_at
    }
}

export interface RefreshTokenRepository {
    findByTokenId(tokenId: string): Promise<RefreshTokenRecord | null>
    save(input: SaveRefreshTokenInput): Promise<string>;
    revoke(tokenId: string): Promise<boolean>
}

export function createRefreshTokenRepository(database: DatabaseConnection): RefreshTokenRepository {

    async function findByTokenId(
        tokenId: string,
    ): Promise<RefreshTokenRecord | null> {

        const row =
            await database.get<RefreshTokenRow>(
                `
            SELECT
            token_id,
            user_id,
            token_hash,
            expires_at,
            created_at,
            revoked_at
            FROM refresh_tokens
            WHERE token_id = ?
        `,
                tokenId,
            );

        return row
            ? mapRow(row)
            : null;
    }

    async function save(
        input: SaveRefreshTokenInput,
    ): Promise<string> {
        try {
            await database.run(
                `
                    INSERT INTO refresh_tokens (
                        token_id,
                        user_id,
                        token_hash,
                        expires_at,
                        created_at,
                        revoked_at
                    )
                    VALUES (?, ?, ?, ?, ?, NULL)
                `,
                input.tokenId,
                input.userId,
                input.tokenHash,
                input.expiresAt,
                input.createdAt,
            );
        } catch (error) {
            throw error;
        }
        return input.tokenHash
    }

    async function revoke(tokenId: string): Promise<boolean> {
        const result = await database.run(
            `
            UPDATE refresh_tokens
            SET revoked_at = ?
            WHERE token_id = ?
                AND revoked_at IS NULL
            `,
            new Date().toISOString(),
            tokenId,
        );
        return result.changes === 1;
    }

    return { findByTokenId, save, revoke }
}
