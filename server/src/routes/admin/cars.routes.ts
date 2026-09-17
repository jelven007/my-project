import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { auditContext, currentAdmin, routeParam } from "./route-utils.js";

const carInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/u),
  name: z.string().trim().min(1).max(100),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10_000),
  priceFrom: z.number().int().nonnegative(),
  rangeKm: z.number().int().positive().max(2000),
  acceleration: z.number().positive().max(99),
  maxPowerPs: z.number().int().positive().max(5000),
  topSpeed: z.number().int().positive().max(1000),
  bodyType: z.string().trim().min(1).max(50),
  imageUrl: z.string().trim().min(1).max(1000).refine((value) => !/\.(svg|html?)($|\?)/iu.test(value)),
  gallery: z.array(z.string().max(1000)).max(30).default([]),
  highlights: z.array(z.unknown()).max(30).default([]),
  sortOrder: z.number().int().default(0),
});

export function createAdminCarsRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/", requirePermission("cars:read", audit), async (_request, response) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, slug, name, tagline, price_from AS priceFrom, range_km AS rangeKm,
              status, sort_order AS sortOrder, published_at AS publishedAt, updated_at AS updatedAt
       FROM cars ORDER BY sort_order, id`,
    );
    response.json({ items: rows });
  });

  router.post("/", requirePermission("cars:create", audit), async (request, response) => {
    const input = carInputSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO cars
       (slug, name, tagline, description, price_from, range_km, acceleration,
        max_power_ps, top_speed, body_type, image_url, gallery, highlights, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.name,
        input.tagline,
        input.description,
        input.priceFrom,
        input.rangeKm,
        input.acceleration,
        input.maxPowerPs,
        input.topSpeed,
        input.bodyType,
        input.imageUrl,
        JSON.stringify(input.gallery),
        JSON.stringify(input.highlights),
        input.sortOrder,
      ],
    );
    await audit.record({
      actorType: "admin",
      actorId: currentAdmin(response).id,
      action: "car.create",
      resourceType: "car",
      resourceId: result.insertId.toString(),
      result: "success",
      ...auditContext(request),
    });
    response.status(201).json({ id: result.insertId.toString() });
  });

  router.get("/:id", requirePermission("cars:read", audit), async (request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM cars WHERE id = ? LIMIT 1",
      [routeParam(request, "id")],
    );
    if (!rows[0]) throw new HttpError(404, "CAR_NOT_FOUND", "车型不存在");
    response.json(rows[0]);
  });

  router.put("/:id", requirePermission("cars:update", audit), async (request, response) => {
    const input = carInputSchema.parse(request.body);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE cars SET slug = ?, name = ?, tagline = ?, description = ?,
         price_from = ?, range_km = ?, acceleration = ?, max_power_ps = ?,
         top_speed = ?, body_type = ?, image_url = ?, gallery = ?, highlights = ?,
         sort_order = ?
       WHERE id = ?`,
      [
        input.slug,
        input.name,
        input.tagline,
        input.description,
        input.priceFrom,
        input.rangeKm,
        input.acceleration,
        input.maxPowerPs,
        input.topSpeed,
        input.bodyType,
        input.imageUrl,
        JSON.stringify(input.gallery),
        JSON.stringify(input.highlights),
        input.sortOrder,
        routeParam(request, "id"),
      ],
    );
    if (result.affectedRows !== 1) throw new HttpError(404, "CAR_NOT_FOUND", "车型不存在");
    await audit.record({
      actorType: "admin",
      actorId: currentAdmin(response).id,
      action: "car.update",
      resourceType: "car",
      resourceId: routeParam(request, "id"),
      result: "success",
      ...auditContext(request),
    });
    response.status(204).send();
  });

  for (const [path, status, action] of [
    ["publish", "published", "car.publish"],
    ["offline", "offline", "car.offline"],
  ] as const) {
    router.post(
      `/:id/${path}`,
      requirePermission("cars:publish", audit),
      async (request, response) => {
        const [result] = await pool.execute<ResultSetHeader>(
          `UPDATE cars SET status = ?, published_at = CASE
             WHEN ? = 'published' THEN CURRENT_TIMESTAMP(3) ELSE published_at END
           WHERE id = ?`,
          [status, status, routeParam(request, "id")],
        );
        if (result.affectedRows !== 1) {
          throw new HttpError(404, "CAR_NOT_FOUND", "车型不存在");
        }
        await audit.record({
          actorType: "admin",
          actorId: currentAdmin(response).id,
          action,
          resourceType: "car",
          resourceId: routeParam(request, "id"),
          result: "success",
          ...auditContext(request),
        });
        response.status(204).send();
      },
    );
  }
  return router;
}
