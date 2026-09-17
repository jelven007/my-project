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

export function createAdminUsersRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("users:read", audit), async (request, response) => {
    const { page, pageSize, offset } = pagination(request.query);
    const showPii = currentAdmin(response).permissions.includes("users:pii");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, phone, nickname, email, status, failed_login_count AS failedLoginCount,
              locked_until AS lockedUntil, last_login_at AS lastLoginAt,
              created_at AS createdAt
       FROM users ORDER BY created_at DESC, id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    response.json({
      items: rows.map((row) => ({
        ...row,
        phone: showPii ? row.phone : maskPhone(String(row.phone)),
      })),
      pagination: { page, pageSize },
    });
  });

  router.get("/:id", requirePermission("users:read", audit), async (request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, phone, nickname, email, status, failed_login_count AS failedLoginCount,
              locked_until AS lockedUntil, last_login_at AS lastLoginAt,
              created_at AS createdAt
       FROM users WHERE id = ? LIMIT 1`,
      [routeParam(request, "id")],
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");
    if (!currentAdmin(response).permissions.includes("users:pii")) {
      user.phone = maskPhone(String(user.phone));
    }
    response.json(user);
  });

  router.patch(
    "/:id/status",
    requirePermission("users:update", audit),
    async (request, response) => {
      const input = z.object({ active: z.boolean() }).parse(request.body);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute<ResultSetHeader>(
          "UPDATE users SET status = ? WHERE id = ?",
          [input.active ? 1 : 0, routeParam(request, "id")],
        );
        if (result.affectedRows !== 1) {
          throw new HttpError(404, "USER_NOT_FOUND", "用户不存在");
        }
        if (!input.active) {
          await connection.execute(
            "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0",
            [routeParam(request, "id")],
          );
        }
        await connection.commit();
        await audit.record({
          actorType: "admin",
          actorId: currentAdmin(response).id,
          action: "user.status.update",
          resourceType: "user",
          resourceId: routeParam(request, "id"),
          result: "success",
          ...auditContext(request),
          metadata: { active: input.active },
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

  router.post(
    "/:id/revoke-sessions",
    requirePermission("users:update", audit),
    async (request, response) => {
      await pool.execute(
        "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0",
        [routeParam(request, "id")],
      );
      await audit.record({
        actorType: "admin",
        actorId: currentAdmin(response).id,
        action: "user.sessions.revoke",
        resourceType: "user",
        resourceId: routeParam(request, "id"),
        result: "success",
        ...auditContext(request),
      });
      response.status(204).send();
    },
  );

  return router;
}
