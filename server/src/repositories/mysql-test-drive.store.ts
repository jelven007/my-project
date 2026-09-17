import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import type { CreateTestDriveRequest, TestDrive } from "@xiaomi-car/contracts";

import {
  TestDriveError,
  type TestDriveStore,
} from "../services/test-drive.service.js";

interface TestDriveRow extends RowDataPacket {
  id: number;
  user_id: number;
  car_id: number;
  dealer_id: number;
  contact_name: string;
  contact_phone: string;
  preferred_date: string | Date;
  status: TestDrive["status"];
  notes: string | null;
  created_at: Date;
}

function mapRecord(row: TestDriveRow): TestDrive {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    carId: row.car_id.toString(),
    dealerId: row.dealer_id.toString(),
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    preferredDate:
      row.preferred_date instanceof Date
        ? row.preferred_date.toISOString().slice(0, 10)
        : row.preferred_date,
    status: row.status,
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: row.created_at,
  };
}

const columns = `
  id, user_id, car_id, dealer_id, contact_name, contact_phone,
  preferred_date, status, notes, created_at
`;

export class MysqlTestDriveStore implements TestDriveStore {
  constructor(private readonly pool: Pool) {}

  async create(
    userId: string,
    input: CreateTestDriveRequest,
    now: Date,
  ): Promise<TestDrive> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [available] = await connection.execute<RowDataPacket[]>(
        `SELECT c.id
         FROM cars c
         JOIN dealer_inventory i ON i.car_id = c.id
         JOIN dealers d ON d.id = i.dealer_id
         WHERE c.id = ? AND d.id = ? AND c.status = 'published'
           AND d.status = 'active' AND i.status = 'active'
         LIMIT 1`,
        [input.carId, input.dealerId],
      );
      if (available.length === 0) throw new TestDriveError("TEST_DRIVE_NOT_FOUND");

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO test_drives
          (user_id, car_id, dealer_id, contact_name, contact_phone,
           preferred_date, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
        [
          userId,
          input.carId,
          input.dealerId,
          input.contactName,
          input.contactPhone,
          input.preferredDate,
          input.notes ?? null,
          now,
        ],
      );
      await connection.execute(
        `INSERT INTO test_drive_status_history
          (test_drive_id, from_status, to_status, actor_type, actor_id, created_at)
         VALUES (?, NULL, 'submitted', 'user', ?, ?)`,
        [result.insertId, userId, now],
      );
      const record = await this.findForUser(connection, userId, result.insertId.toString());
      await connection.commit();
      if (!record) throw new TestDriveError("TEST_DRIVE_NOT_FOUND");
      return record;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listByUser(userId: string): Promise<TestDrive[]> {
    const [rows] = await this.pool.execute<TestDriveRow[]>(
      `SELECT ${columns} FROM test_drives
       WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
      [userId],
    );
    return rows.map(mapRecord);
  }

  async cancel(userId: string, id: string, now: Date): Promise<TestDrive> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const record = await this.findForUser(connection, userId, id, true);
      if (!record) throw new TestDriveError("TEST_DRIVE_NOT_FOUND");
      if (!["submitted", "contacted"].includes(record.status)) {
        throw new TestDriveError("TEST_DRIVE_TRANSITION_INVALID");
      }
      await connection.execute(
        "UPDATE test_drives SET status = 'cancelled', updated_at = ? WHERE id = ?",
        [now, id],
      );
      await connection.execute(
        `INSERT INTO test_drive_status_history
          (test_drive_id, from_status, to_status, actor_type, actor_id, created_at)
         VALUES (?, ?, 'cancelled', 'user', ?, ?)`,
        [id, record.status, userId, now],
      );
      record.status = "cancelled";
      await connection.commit();
      return record;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async findForUser(
    connection: PoolConnection,
    userId: string,
    id: string,
    lock = false,
  ): Promise<TestDrive | undefined> {
    const [rows] = await connection.execute<TestDriveRow[]>(
      `SELECT ${columns} FROM test_drives
       WHERE id = ? AND user_id = ?${lock ? " FOR UPDATE" : ""}`,
      [id, userId],
    );
    return rows[0] ? mapRecord(rows[0]) : undefined;
  }
}
