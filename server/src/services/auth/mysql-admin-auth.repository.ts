import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type {
  AdminAuthRepository,
  AdminRecord,
  AdminRefreshTokenRecord,
} from "./admin-auth.service.js";
import type { AdminRbacRepository } from "./admin-rbac.service.js";

interface AdminRow extends RowDataPacket {
  id: number;
  username: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: "active" | "disabled";
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  mfa_secret_encrypted: Buffer | null;
}

interface AuthorizationRow extends RowDataPacket {
  role_code: string;
  permission_code: string | null;
}

interface CountRow extends RowDataPacket {
  count: number;
}

export class MysqlAdminAuthRepository
  implements AdminAuthRepository, AdminRbacRepository
{
  constructor(private readonly pool: Pool) {}

  async findByLogin(login: string): Promise<AdminRecord | undefined> {
    const [rows] = await this.pool.execute<AdminRow[]>(
      `SELECT id, username, email, display_name, password_hash, status,
              failed_login_count, locked_until, last_login_at, mfa_secret_encrypted
       FROM admin_users
       WHERE username = ? OR email = ?
       LIMIT 1`,
      [login, login],
    );
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async findById(id: string): Promise<AdminRecord | undefined> {
    const [rows] = await this.pool.execute<AdminRow[]>(
      `SELECT id, username, email, display_name, password_hash, status,
              failed_login_count, locked_until, last_login_at, mfa_secret_encrypted
       FROM admin_users
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? this.hydrate(rows[0]) : undefined;
  }

  async recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE admin_users
       SET locked_until = CASE
             WHEN failed_login_count + 1 >= ? THEN ? ELSE locked_until
           END,
           failed_login_count = failed_login_count + 1
       WHERE id = ?`,
      [maxAttempts, new Date(now.getTime() + lockDurationMs), id],
    );
  }

  async recordSuccessfulLogin(id: string, now: Date): Promise<void> {
    await this.pool.execute(
      `UPDATE admin_users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = ?
       WHERE id = ?`,
      [now, id],
    );
  }

  async saveRefreshToken(record: AdminRefreshTokenRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO admin_refresh_tokens
       (admin_user_id, token_hash, expires_at, revoked, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.adminId,
        record.tokenHash,
        record.expiresAt,
        record.revoked ? 1 : 0,
        record.ip ?? null,
        record.userAgent ?? null,
      ],
    );
  }

  async rotateRefreshToken(
    previousHash: string,
    replacement: AdminRefreshTokenRecord,
    now: Date,
  ): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE admin_refresh_tokens
         SET revoked = 1
         WHERE token_hash = ? AND revoked = 0 AND expires_at > ?`,
        [previousHash, now],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `INSERT INTO admin_refresh_tokens
         (admin_user_id, token_hash, expires_at, revoked, ip, user_agent)
         VALUES (?, ?, ?, 0, ?, ?)`,
        [
          replacement.adminId,
          replacement.tokenHash,
          replacement.expiresAt,
          replacement.ip ?? null,
          replacement.userAgent ?? null,
        ],
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

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.pool.execute(
      "UPDATE admin_refresh_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0",
      [tokenHash],
    );
  }

  async revokeAllRefreshTokens(adminId: string): Promise<void> {
    await this.pool.execute(
      "UPDATE admin_refresh_tokens SET revoked = 1 WHERE admin_user_id = ? AND revoked = 0",
      [adminId],
    );
  }

  async getAuthorization(
    adminId: string,
  ): Promise<{ active: boolean; roles: string[]; permissions: string[] } | undefined> {
    const admin = await this.findById(adminId);
    if (!admin) return undefined;
    return {
      active: admin.active,
      roles: admin.roles,
      permissions: admin.permissions,
    };
  }

  async getPermissionsForRoles(roleCodes: string[]): Promise<string[]> {
    if (roleCodes.length === 0) return [];
    const placeholders = roleCodes.map(() => "?").join(", ");
    const [rows] = await this.pool.execute<AuthorizationRow[]>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code IN (${placeholders})`,
      roleCodes,
    );
    const foundRoles = new Set(rows.map((row) => row.role_code));
    if (foundRoles.size !== new Set(roleCodes).size) {
      throw new Error("Unknown role code");
    }
    return [
      ...new Set(
        rows.flatMap((row) =>
          row.permission_code === null ? [] : [row.permission_code],
        ),
      ),
    ];
  }

  async replaceRoles(adminId: string, roleCodes: string[]): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("DELETE FROM admin_user_roles WHERE admin_user_id = ?", [
        adminId,
      ]);
      for (const roleCode of roleCodes) {
        await connection.execute(
          `INSERT INTO admin_user_roles (admin_user_id, role_id)
           SELECT ?, id FROM roles WHERE code = ?`,
          [adminId, roleCode],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async countActiveSuperAdmins(): Promise<number> {
    const [rows] = await this.pool.execute<CountRow[]>(
      `SELECT COUNT(DISTINCT au.id) AS count
       FROM admin_users au
       JOIN admin_user_roles aur ON aur.admin_user_id = au.id
       JOIN roles r ON r.id = aur.role_id
       WHERE au.status = 'active' AND r.code = 'super_admin'`,
    );
    return rows[0]?.count ?? 0;
  }

  async disableAdmin(adminId: string): Promise<void> {
    await this.pool.execute(
      "UPDATE admin_users SET status = 'disabled' WHERE id = ?",
      [adminId],
    );
  }

  private async hydrate(row: AdminRow): Promise<AdminRecord> {
    const [authorizationRows] = await this.pool.execute<AuthorizationRow[]>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM admin_user_roles aur
       JOIN roles r ON r.id = aur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE aur.admin_user_id = ?`,
      [row.id],
    );
    return {
      id: row.id.toString(),
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      active: row.status === "active",
      failedLoginCount: row.failed_login_count,
      roles: [...new Set(authorizationRows.map((item) => item.role_code))],
      permissions: [
        ...new Set(
          authorizationRows.flatMap((item) =>
            item.permission_code === null ? [] : [item.permission_code],
          ),
        ),
      ],
      ...(row.locked_until === null ? {} : { lockedUntil: row.locked_until }),
      ...(row.last_login_at === null ? {} : { lastLoginAt: row.last_login_at }),
      ...(row.mfa_secret_encrypted === null
        ? {}
        : { mfaSecretEncrypted: row.mfa_secret_encrypted }),
    };
  }
}
