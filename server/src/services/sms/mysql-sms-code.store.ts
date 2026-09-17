import { createHmac } from "node:crypto";

import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { SmsScene } from "@xiaomi-car/contracts";

import type { SmsCodeRecord, SmsCodeStore } from "./sms-code.service.js";

interface SmsCodeRow extends RowDataPacket {
  id: number;
  phone: string;
  scene: SmsScene;
  code_hash: string;
  expires_at: Date;
  consumed: number;
  verify_attempts: number;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export class MysqlSmsCodeStore implements SmsCodeStore {
  constructor(
    private readonly pool: Pool,
    private readonly phoneHashPepper: string,
  ) {}

  async save(record: SmsCodeRecord): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sms_codes
          (phone, code_hash, scene, send_status, expires_at, consumed, verify_attempts)
         VALUES (?, ?, ?, 'accepted', ?, 0, 0)`,
        [record.phone, record.codeHash, record.scene, record.expiresAt],
      );
      record.id = result.insertId.toString();

      await connection.execute(
        `INSERT INTO sms_deliveries
          (request_id, phone_masked, phone_hash, scene, provider, provider_message_id, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP(3))`,
        [
          record.providerRequestId,
          maskPhone(record.phone),
          createHmac("sha256", this.phoneHashPepper).update(record.phone).digest("hex"),
          record.scene,
          record.providerName,
          record.providerMessageId ?? null,
        ],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findLatest(phone: string, scene: SmsScene): Promise<SmsCodeRecord | undefined> {
    const [rows] = await this.pool.execute<SmsCodeRow[]>(
      `SELECT id, phone, scene, code_hash, expires_at, consumed, verify_attempts
       FROM sms_codes
       WHERE phone = ? AND scene = ?
       ORDER BY id DESC
       LIMIT 1`,
      [phone, scene],
    );
    const row = rows[0];
    if (!row) return undefined;

    return {
      id: row.id.toString(),
      phone: row.phone,
      scene: row.scene,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      consumed: row.consumed === 1,
      verifyAttempts: row.verify_attempts,
      providerRequestId: "",
      providerName: "",
    };
  }

  async incrementAttempts(record: SmsCodeRecord): Promise<void> {
    if (!record.id) throw new Error("Cannot update an SMS code without an id");
    await this.pool.execute(
      `UPDATE sms_codes
       SET verify_attempts = LEAST(5, verify_attempts + 1)
       WHERE id = ? AND consumed = 0`,
      [record.id],
    );
    record.verifyAttempts = Math.min(5, record.verifyAttempts + 1);
  }

  async consume(record: SmsCodeRecord): Promise<boolean> {
    if (!record.id) throw new Error("Cannot consume an SMS code without an id");
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE sms_codes
       SET consumed = 1
       WHERE id = ? AND consumed = 0 AND verify_attempts < 5`,
      [record.id],
    );
    if (result.affectedRows === 1) record.consumed = true;
    return result.affectedRows === 1;
  }
}
