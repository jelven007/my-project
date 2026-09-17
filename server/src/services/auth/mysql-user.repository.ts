import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  type CreateUserInput,
  UserConflictError,
  type UserRecord,
  type UserRepository,
} from "./user-auth.service.js";

interface UserRow extends RowDataPacket {
  id: number;
  phone: string;
  nickname: string;
  password_hash: string | null;
  status: number;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id.toString(),
    phone: row.phone,
    nickname: row.nickname,
    active: row.status === 1,
    failedLoginCount: row.failed_login_count,
    ...(row.password_hash === null ? {} : { passwordHash: row.password_hash }),
    ...(row.locked_until === null ? {} : { lockedUntil: row.locked_until }),
    ...(row.last_login_at === null ? {} : { lastLoginAt: row.last_login_at }),
  };
}

export class MysqlUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByPhone(phone: string): Promise<UserRecord | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT id, phone, nickname, password_hash, status, failed_login_count,
              locked_until, last_login_at
       FROM users
       WHERE phone = ?
       LIMIT 1`,
      [phone],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT id, phone, nickname, password_hash, status, failed_login_count,
              locked_until, last_login_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO users (phone, nickname, password_hash)
         VALUES (?, ?, ?)`,
        [input.phone, input.nickname, input.passwordHash ?? null],
      );
      return {
        id: result.insertId.toString(),
        phone: input.phone,
        nickname: input.nickname,
        active: true,
        failedLoginCount: 0,
        ...(input.passwordHash === undefined ? {} : { passwordHash: input.passwordHash }),
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errno" in error &&
        error.errno === 1062
      ) {
        throw new UserConflictError();
      }
      throw error;
    }
  }

  async recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void> {
    const lockedUntil = new Date(now.getTime() + lockDurationMs);
    await this.pool.execute(
      `UPDATE users
       SET locked_until = CASE
             WHEN failed_login_count + 1 >= ? THEN ?
             ELSE locked_until
           END,
           failed_login_count = failed_login_count + 1
       WHERE id = ?`,
      [maxAttempts, lockedUntil, id],
    );
  }

  async recordSuccessfulLogin(id: string, now: Date): Promise<void> {
    await this.pool.execute(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = ?
       WHERE id = ?`,
      [now, id],
    );
  }
}
