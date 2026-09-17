import { Router } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { assertOrderTransition, type OrderStatus } from "../../domain/order-state.js";
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

interface AdminOrderRow extends RowDataPacket {
  id: number;
  order_no: string;
  inventory_id: number;
  status: OrderStatus;
  contact_name: string;
  contact_phone: string;
}

const statusSchema = z.object({
  status: z.enum([
    "pending_confirmation",
    "confirmed",
    "cancelled",
    "expired",
    "completed",
  ]),
});

function safeCsv(value: unknown): string {
  const text = String(value ?? "");
  const protectedText = /^[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export function createAdminOrdersRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("orders:read", audit), async (request, response) => {
    const { page, pageSize, offset } = pagination(request.query);
    const admin = currentAdmin(response);
    const showPii = admin.permissions.includes("orders:pii");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.order_no AS orderNo, o.status, o.contact_name AS contactName,
              o.contact_phone AS contactPhone, o.created_at AS createdAt,
              c.name AS carName, d.name AS dealerName
       FROM orders o
       JOIN cars c ON c.id = o.car_id
       JOIN dealers d ON d.id = o.dealer_id
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    );
    response.json({
      items: rows.map((row) => ({
        ...row,
        contactPhone: showPii
          ? String(row.contactPhone)
          : maskPhone(String(row.contactPhone)),
      })),
      pagination: { page, pageSize },
    });
  });

  router.get(
    "/export",
    requirePermission("orders:export", audit),
    async (request, response) => {
      const admin = currentAdmin(response);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT order_no, status, contact_name, contact_phone, created_at
         FROM orders ORDER BY created_at DESC LIMIT 10000`,
      );
      const csv = [
        ["order_no", "status", "contact_name", "contact_phone", "created_at"],
        ...rows.map((row) => [
          row.order_no,
          row.status,
          row.contact_name,
          admin.permissions.includes("orders:pii")
            ? row.contact_phone
            : maskPhone(String(row.contact_phone)),
          row.created_at,
        ]),
      ]
        .map((line) => line.map(safeCsv).join(","))
        .join("\n");
      await audit.record({
        actorType: "admin",
        actorId: admin.id,
        action: "orders.export",
        resourceType: "orders",
        result: "success",
        ...auditContext(request),
        metadata: { count: rows.length },
      });
      response.type("text/csv").send(`\uFEFF${csv}`);
    },
  );

  router.get(
    "/:orderNo",
    requirePermission("orders:read", audit),
    async (request, response) => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.*, c.name AS car_name, d.name AS dealer_name
         FROM orders o
         JOIN cars c ON c.id = o.car_id
         JOIN dealers d ON d.id = o.dealer_id
         WHERE o.order_no = ? LIMIT 1`,
        [routeParam(request, "orderNo")],
      );
      const row = rows[0];
      if (!row) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
      if (!currentAdmin(response).permissions.includes("orders:pii")) {
        row.contact_phone = maskPhone(String(row.contact_phone));
      }
      response.json(row);
    },
  );

  router.patch(
    "/:orderNo",
    requirePermission("orders:update", audit),
    async (request, response) => {
      const input = statusSchema.parse(request.body);
      const admin = currentAdmin(response);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<AdminOrderRow[]>(
          `SELECT id, order_no, inventory_id, status, contact_name, contact_phone
           FROM orders WHERE order_no = ? FOR UPDATE`,
          [routeParam(request, "orderNo")],
        );
        const order = rows[0];
        if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "订单不存在");
        try {
          assertOrderTransition(order.status, input.status);
        } catch {
          throw new HttpError(409, "ORDER_TRANSITION_INVALID", "订单状态无法这样变更");
        }
        await connection.execute("UPDATE orders SET status = ? WHERE id = ?", [
          input.status,
          order.id,
        ]);
        if (input.status === "cancelled" || input.status === "expired") {
          await connection.execute(
            `UPDATE dealer_inventory
             SET reserved_qty = reserved_qty - 1, version = version + 1
             WHERE id = ? AND reserved_qty > 0`,
            [order.inventory_id],
          );
        }
        if (input.status === "completed") {
          await connection.execute(
            `UPDATE dealer_inventory
             SET total_qty = total_qty - 1, reserved_qty = reserved_qty - 1,
                 version = version + 1
             WHERE id = ? AND total_qty > 0 AND reserved_qty > 0`,
            [order.inventory_id],
          );
        }
        await connection.commit();
        await audit.record({
          actorType: "admin",
          actorId: admin.id,
          action: "order.status.update",
          resourceType: "order",
          resourceId: order.order_no,
          result: "success",
          ...auditContext(request),
          metadata: { before: order.status, after: input.status },
        });
        response.json({ orderNo: order.order_no, status: input.status });
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
