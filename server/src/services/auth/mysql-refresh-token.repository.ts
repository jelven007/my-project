import type { Pool, ResultSetHeader } from "mysql2/promise";

import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "./token.service.js";

export class MysqlRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async save(record: RefreshTokenRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked)
       VALUES (?, ?, ?, ?)`,
      [record.userId, record.tokenHash, record.expiresAt, record.revoked ? 1 : 0],
    );
  }

  async rotate(
    previousHash: string,
    replacement: RefreshTokenRecord,
    now: Date,
  ): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE refresh_tokens
         SET revoked = 1
         WHERE token_hash = ? AND revoked = 0 AND expires_at > ?`,
        [previousHash, now],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked)
         VALUES (?, ?, ?, 0)`,
        [replacement.userId, replacement.tokenHash, replacement.expiresAt],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.pool.execute(
      "UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0",
      [tokenHash],
    );
  }
}
