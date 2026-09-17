import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import {
  auditContext,
  currentAdmin,
  maskPhone,
  pagination,
  routeParam,
} from "./route-utils.js";

const statuses = ["submitted", "contacted", "scheduled", "completed", "cancelled"] as const;
type TestDriveStatus = (typeof statuses)[number];
const transitions: Record<TestDriveStatus, readonly TestDriveStatus[]> = {
  submitted: ["contacted", "cancelled"],
  contacted: ["scheduled", "cancelled"],
  scheduled: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
const updateSchema = z.object({
  status: z.enum(statuses),
  assignedAdminId: z.string().regex(/^\d+$/u).nullable().optional(),
  followUpNote: z.string().trim().max(1000).nullable().optional(),
});

export function createAdminTestDrivesRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("test_drive:read", audit), async (request, response) => {
    const { page, pageSize, offset } = pagination(request.query);
    const showPii = currentAdmin(response).permissions.includes("test_drive:pii");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT td.id, td.status, td.contact_name AS contactName,
              td.contact_phone AS contactPhone, td.preferred_date AS preferredDate,
              td.assigned_admin_id AS assignedAdminId, td.follow_up_note AS followUpNote,
              c.name AS carName, d.name AS dealerName, td.created_at AS createdAt
       FROM test_drives td
       JOIN cars c ON c.id = td.car_id
       JOIN dealers d ON d.id = td.dealer_id
       ORDER BY td.created_at DESC, td.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    response.json({
      items: rows.map((row) => ({
        ...row,
        contactPhone: showPii
          ? row.contactPhone
          : maskPhone(String(row.contactPhone)),
      })),
      pagination: { page, pageSize },
    });
  });

  router.get(
    "/export",
    requirePermission("test_drive:export", audit),
    async (request, response) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, status, contact_name, contact_phone, preferred_date, created_at
         FROM test_drives ORDER BY created_at DESC LIMIT 10000`,
      );
      await audit.record({
        actorType: "admin",
        actorId: currentAdmin(response).id,
        action: "test_drive.export",
        resourceType: "test_drive",
        result: "success",
        ...auditContext(request),
        metadata: { count: rows.length },
      });
      response.json({ items: rows });
    },
  );

  router.patch(
    "/:id",
    requirePermission("test_drive:update", audit),
    async (request, response) => {
      const input = updateSchema.parse(request.body);
      const admin = currentAdmin(response);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT status FROM test_drives WHERE id = ? FOR UPDATE",
          [routeParam(request, "id")],
        );
        const previous = rows[0]?.status as TestDriveStatus | undefined;
        if (!previous) throw new HttpError(404, "TEST_DRIVE_NOT_FOUND", "预约不存在");
        if (!transitions[previous].includes(input.status)) {
          throw new HttpError(
            409,
            "TEST_DRIVE_TRANSITION_INVALID",
            "预约状态无法这样变更",
          );
        }
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE test_drives
           SET status = ?, assigned_admin_id = COALESCE(?, assigned_admin_id),
               follow_up_note = COALESCE(?, follow_up_note)
           WHERE id = ?`,
          [
            input.status,
            input.assignedAdminId ?? admin.id,
            input.followUpNote ?? null,
            routeParam(request, "id"),
          ],
        );
        if (result.affectedRows !== 1) {
          throw new HttpError(404, "TEST_DRIVE_NOT_FOUND", "预约不存在");
        }
        await connection.execute(
          `INSERT INTO test_drive_status_history
           (test_drive_id, from_status, to_status, actor_type, actor_id)
           VALUES (?, ?, ?, 'admin', ?)`,
          [routeParam(request, "id"), previous, input.status, admin.id],
        );
        await connection.commit();
        await audit.record({
          actorType: "admin",
          actorId: admin.id,
          action: "test_drive.status.update",
          resourceType: "test_drive",
          resourceId: routeParam(request, "id"),
          result: "success",
          ...auditContext(request),
          metadata: { before: previous, after: input.status },
        });
        response.status(204).send();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  );
  return router;
}
