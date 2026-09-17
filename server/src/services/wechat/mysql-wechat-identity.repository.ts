import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { UserConflictError, type UserRecord } from "../auth/user-auth.service.js";
import type { WechatIdentityRepository } from "./wechat-auth.service.js";
import type { WechatProfile } from "./wechat-provider.js";

interface IdentityUserRow extends RowDataPacket {
  id: number;
  phone: string;
  nickname: string;
  password_hash: string | null;
  status: number;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
}

function mapUser(row: IdentityUserRow): UserRecord {
  return {
    id: row.id.toString(),
    phone: row.phone,
    nickname: row.nickname,
    active: row.status === 1,
    failedLoginCount: row.failed_login_count,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.locked_until ? { lockedUntil: row.locked_until } : {}),
    ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {}),
  };
}

export class MysqlWechatIdentityRepository implements WechatIdentityRepository {
  constructor(private readonly pool: Pool) {}

  async findUser(providerUserId: string): Promise<UserRecord | undefined> {
    const [rows] = await this.pool.execute<IdentityUserRow[]>(
      `SELECT u.id, u.phone, u.nickname, u.password_hash, u.status,
              u.failed_login_count, u.locked_until, u.last_login_at
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'wechat' AND i.provider_user_id = ?
       LIMIT 1`,
      [providerUserId],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createUserWithIdentity(phone: string, profile: WechatProfile): Promise<UserRecord> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingUsers] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE phone = ? FOR UPDATE",
        [phone],
      );
      if (existingUsers.length > 0) throw new UserConflictError();

      const [userResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users (phone, nickname, password_hash) VALUES (?, ?, NULL)",
        [phone, profile.nickname],
      );
      await connection.execute(
        `INSERT INTO user_identities
          (user_id, provider, provider_user_id, union_id, profile_json)
         VALUES (?, 'wechat', ?, ?, ?)`,
        [
          userResult.insertId,
          profile.providerUserId,
          profile.unionId ?? null,
          JSON.stringify({
            nickname: profile.nickname,
            avatarUrl: profile.avatarUrl,
          }),
        ],
      );
      await connection.commit();
      return {
        id: userResult.insertId.toString(),
        phone,
        nickname: profile.nickname,
        active: true,
        failedLoginCount: 0,
      };
    } catch (error) {
      await connection.rollback();
      if (
        typeof error === "object" &&
        error !== null &&
        "errno" in error &&
        error.errno === 1062
      ) {
        throw new UserConflictError();
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}
