import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { auditContext, currentAdmin, routeParam } from "./route-utils.js";

const dealerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  code: z.string().trim().min(2).max(50),
  province: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(300),
  phone: z.string().trim().min(5).max(20),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  businessHours: z.string().trim().min(1).max(100),
});

export function createAdminDealersRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("dealers:read", audit), async (_request, response) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, code, province, city, address, phone, longitude, latitude,
              business_hours AS businessHours, status, updated_at AS updatedAt
       FROM dealers ORDER BY city, name`,
    );
    response.json({ items: rows });
  });

  router.post("/", requirePermission("dealers:create", audit), async (request, response) => {
    const input = dealerSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO dealers
       (name, code, province, city, address, phone, longitude, latitude, business_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.code,
        input.province,
        input.city,
        input.address,
        input.phone,
        input.longitude ?? null,
        input.latitude ?? null,
        input.businessHours,
      ],
    );
    await audit.record({
      actorType: "admin",
      actorId: currentAdmin(response).id,
      action: "dealer.create",
      resourceType: "dealer",
      resourceId: result.insertId.toString(),
      result: "success",
      ...auditContext(request),
    });
    response.status(201).json({ id: result.insertId.toString() });
  });

  router.get("/:id", requirePermission("dealers:read", audit), async (request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM dealers WHERE id = ? LIMIT 1",
      [routeParam(request, "id")],
    );
    if (!rows[0]) throw new HttpError(404, "DEALER_NOT_FOUND", "经销商不存在");
    response.json(rows[0]);
  });

  router.put("/:id", requirePermission("dealers:update", audit), async (request, response) => {
    const input = dealerSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE dealers SET name = ?, code = ?, province = ?, city = ?, address = ?,
         phone = ?, longitude = ?, latitude = ?, business_hours = ?
       WHERE id = ?`,
      [
        input.name,
        input.code,
        input.province,
        input.city,
        input.address,
        input.phone,
        input.longitude ?? null,
        input.latitude ?? null,
        input.businessHours,
        routeParam(request, "id"),
      ],
    );
    if (result.affectedRows !== 1) {
      throw new HttpError(404, "DEALER_NOT_FOUND", "经销商不存在");
    }
    response.status(204).send();
  });

  router.patch(
    "/:id/status",
    requirePermission("dealers:update", audit),
    async (request, response) => {
      const input = z.object({ status: z.enum(["active", "inactive"]) }).parse(request.body);
      const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE dealers SET status = ? WHERE id = ?",
        [input.status, routeParam(request, "id")],
      );
      if (result.affectedRows !== 1) {
        throw new HttpError(404, "DEALER_NOT_FOUND", "经销商不存在");
      }
      await audit.record({
        actorType: "admin",
        actorId: currentAdmin(response).id,
        action: "dealer.status.update",
        resourceType: "dealer",
        resourceId: routeParam(request, "id"),
        result: "success",
        ...auditContext(request),
        metadata: { status: input.status },
      });
      response.status(204).send();
    },
  );

  return router;
}
