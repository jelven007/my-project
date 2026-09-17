import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { auditContext, currentAdmin, routeParam } from "./route-utils.js";

const createSchema = z.object({
  dealerId: z.string().regex(/^\d+$/u),
  carId: z.string().regex(/^\d+$/u),
  totalQuantity: z.number().int().nonnegative(),
});
const updateSchema = z.object({
  totalQuantity: z.number().int().nonnegative(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});

export function createAdminInventoryRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("inventory:read", audit), async (_request, response) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT i.id, i.dealer_id AS dealerId, d.name AS dealerName, i.car_id AS carId,
              c.name AS carName, i.total_qty AS totalQuantity,
              i.reserved_qty AS reservedQuantity,
              i.total_qty - i.reserved_qty AS availableQuantity,
              i.version, i.status, i.updated_at AS updatedAt
       FROM dealer_inventory i
       JOIN dealers d ON d.id = i.dealer_id
       JOIN cars c ON c.id = i.car_id
       ORDER BY i.updated_at DESC, i.id DESC`,
    );
    response.json({ items: rows });
  });

  router.post("/", requirePermission("inventory:update", audit), async (request, response) => {
    const input = createSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO dealer_inventory (dealer_id, car_id, total_qty)
       SELECT d.id, c.id, ?
       FROM dealers d, cars c
       WHERE d.id = ? AND d.status = 'active'
         AND c.id = ? AND c.status = 'published'`,
      [input.totalQuantity, input.dealerId, input.carId],
    );
    if (result.affectedRows !== 1) {
      throw new HttpError(422, "INVENTORY_TARGET_INVALID", "车型或经销商不可用于库存");
    }
    response.status(201).json({ id: result.insertId.toString(), version: 1 });
  });

  router.put("/:id", requirePermission("inventory:update", audit), async (request, response) => {
    const input = updateSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE dealer_inventory
       SET total_qty = ?, status = ?, version = version + 1
       WHERE id = ? AND version = ? AND reserved_qty <= ?`,
      [
        input.totalQuantity,
        input.status,
        routeParam(request, "id"),
        input.version,
        input.totalQuantity,
      ],
    );
    if (result.affectedRows !== 1) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT version, reserved_qty FROM dealer_inventory WHERE id = ?",
        [routeParam(request, "id")],
      );
      if (!rows[0]) throw new HttpError(404, "INVENTORY_NOT_FOUND", "库存不存在");
      if (Number(rows[0].reserved_qty) > input.totalQuantity) {
        throw new HttpError(422, "INVENTORY_BELOW_RESERVED", "总库存不能低于已占用库存");
      }
      throw new HttpError(409, "INVENTORY_VERSION_CONFLICT", "库存已被其他管理员更新");
    }
    await audit.record({
      actorType: "admin",
      actorId: currentAdmin(response).id,
      action: "inventory.update",
      resourceType: "inventory",
      resourceId: routeParam(request, "id"),
      result: "success",
      ...auditContext(request),
      metadata: { totalQuantity: input.totalQuantity, previousVersion: input.version },
    });
    response.json({ version: input.version + 1 });
  });

  return router;
}
