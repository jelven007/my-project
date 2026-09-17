import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import { auditContext, currentAdmin, routeParam } from "./route-utils.js";

interface ContentRow extends RowDataPacket {
  id: number;
  content_key: string;
  content_type: string;
  draft_payload: unknown;
  published_payload: unknown | null;
  version: number;
  status: "draft" | "published";
  published_at: Date | null;
  updated_at: Date;
}

const draftSchema = z.object({
  payload: z.unknown(),
  version: z.number().int().positive(),
});
const publishSchema = z.object({
  changeSummary: z.string().trim().max(300).optional(),
});
const rollbackSchema = z.object({
  version: z.number().int().positive(),
});

function json(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

export function createAdminContentRouter(pool: Pool, audit: AuditRecorder): Router {
  const router = Router();

  router.get("/:key", requirePermission("content:read", audit), async (request, response) => {
    const [rows] = await pool.execute<ContentRow[]>(
      `SELECT id, content_key, content_type, draft_payload, published_payload,
              version, status, published_at, updated_at
       FROM content_entries WHERE content_key = ? LIMIT 1`,
      [routeParam(request, "key")],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, "CONTENT_NOT_FOUND", "内容不存在");
    response.json({
      key: row.content_key,
      type: row.content_type,
      draftPayload: json(row.draft_payload),
      publishedPayload: row.published_payload === null ? null : json(row.published_payload),
      version: row.version,
      status: row.status,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    });
  });

  router.put("/:key", requirePermission("content:update", audit), async (request, response) => {
    const input = draftSchema.parse(request.body);
    const admin = currentAdmin(response);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE content_entries
       SET draft_payload = ?, version = version + 1, status = 'draft', updated_by = ?
       WHERE content_key = ? AND version = ?`,
      [JSON.stringify(input.payload), admin.id, routeParam(request, "key"), input.version],
    );
    if (result.affectedRows !== 1) {
      throw new HttpError(409, "CONTENT_VERSION_CONFLICT", "内容已被其他管理员更新");
    }
    await audit.record({
      actorType: "admin",
      actorId: admin.id,
      action: "content.update",
      resourceType: "content",
      resourceId: routeParam(request, "key"),
      result: "success",
      ...auditContext(request),
      metadata: { previousVersion: input.version },
    });
    response.json({ version: input.version + 1 });
  });

  router.post(
    "/:key/preview",
    requirePermission("content:preview", audit),
    async (request, response) => {
      const [rows] = await pool.execute<ContentRow[]>(
        "SELECT draft_payload, version FROM content_entries WHERE content_key = ? LIMIT 1",
        [routeParam(request, "key")],
      );
      const row = rows[0];
      if (!row) throw new HttpError(404, "CONTENT_NOT_FOUND", "内容不存在");
      response.json({ payload: json(row.draft_payload), version: row.version });
    },
  );

  router.post(
    "/:key/publish",
    requirePermission("content:publish", audit),
    async (request, response) => {
      const input = publishSchema.parse(request.body);
      const admin = currentAdmin(response);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<ContentRow[]>(
          `SELECT id, content_key, content_type, draft_payload, published_payload,
                  version, status, published_at, updated_at
           FROM content_entries WHERE content_key = ? FOR UPDATE`,
          [routeParam(request, "key")],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, "CONTENT_NOT_FOUND", "内容不存在");
        await connection.execute(
          `INSERT INTO content_versions
           (content_entry_id, version, payload, change_summary, published_by)
           VALUES (?, ?, ?, ?, ?)`,
          [
            row.id,
            row.version,
            JSON.stringify(json(row.draft_payload)),
            input.changeSummary ?? null,
            admin.id,
          ],
        );
        await connection.execute(
          `UPDATE content_entries
           SET published_payload = draft_payload, status = 'published',
               published_at = CURRENT_TIMESTAMP(3), updated_by = ?
           WHERE id = ?`,
          [admin.id, row.id],
        );
        await connection.commit();
        await audit.record({
          actorType: "admin",
          actorId: admin.id,
          action: "content.publish",
          resourceType: "content",
          resourceId: routeParam(request, "key"),
          result: "success",
          ...auditContext(request),
          metadata: { version: row.version },
        });
        response.json({ version: row.version, status: "published" });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  );

  router.get(
    "/:key/versions",
    requirePermission("content:read", audit),
    async (request, response) => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT cv.version, cv.payload, cv.change_summary AS changeSummary,
                cv.published_by AS publishedBy, cv.created_at AS createdAt
         FROM content_versions cv
         JOIN content_entries ce ON ce.id = cv.content_entry_id
         WHERE ce.content_key = ?
         ORDER BY cv.version DESC`,
        [routeParam(request, "key")],
      );
      response.json({ items: rows });
    },
  );

  router.post(
    "/:key/rollback",
    requirePermission("content:publish", audit),
    async (request, response) => {
      const input = rollbackSchema.parse(request.body);
      const admin = currentAdmin(response);
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE content_entries ce
         JOIN content_versions cv ON cv.content_entry_id = ce.id AND cv.version = ?
         SET ce.draft_payload = cv.payload, ce.version = ce.version + 1,
             ce.status = 'draft', ce.updated_by = ?
         WHERE ce.content_key = ?`,
        [input.version, admin.id, routeParam(request, "key")],
      );
      if (result.affectedRows !== 1) {
        throw new HttpError(404, "CONTENT_VERSION_NOT_FOUND", "历史版本不存在");
      }
      await audit.record({
        actorType: "admin",
        actorId: admin.id,
        action: "content.rollback",
        resourceType: "content",
        resourceId: routeParam(request, "key"),
        result: "success",
        ...auditContext(request),
        metadata: { sourceVersion: input.version },
      });
      response.status(204).send();
    },
  );

  return router;
}
