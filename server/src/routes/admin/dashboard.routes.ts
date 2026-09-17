import { Router } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { requirePermission } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../../services/audit.service.js";
import {
  DashboardEvents,
  type DashboardSnapshot,
} from "../../services/dashboard-events.js";

interface SummaryRow extends RowDataPacket {
  totalUsers: number;
  todayUsers: number;
  totalOrders: number;
  todayOrders: number;
  pendingTestDrives: number;
}

function startOfShanghaiDay(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+08:00`);
}

export function createDashboardEvents(pool: Pool): DashboardEvents {
  return new DashboardEvents(async (): Promise<DashboardSnapshot> => {
    const [rows] = await pool.execute<SummaryRow[]>(
      `SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS todayUsers,
        (SELECT COUNT(*) FROM orders) AS totalOrders,
        (SELECT COUNT(*) FROM orders WHERE created_at >= ?) AS todayOrders,
        (SELECT COUNT(*) FROM test_drives
          WHERE status IN ('submitted', 'contacted')) AS pendingTestDrives`,
      [startOfShanghaiDay(), startOfShanghaiDay()],
    );
    const row = rows[0];
    return {
      totalUsers: row?.totalUsers ?? 0,
      todayUsers: row?.todayUsers ?? 0,
      totalOrders: row?.totalOrders ?? 0,
      todayOrders: row?.todayOrders ?? 0,
      pendingTestDrives: row?.pendingTestDrives ?? 0,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function createAdminDashboardRouter(
  pool: Pool,
  audit: AuditRecorder,
  events: DashboardEvents,
): Router {
  const router = Router();

  router.get(
    "/summary",
    requirePermission("dashboard:read", audit),
    async (_request, response) => {
      response.json(await events.snapshot());
    },
  );

  router.get(
    "/trends",
    requirePermission("dashboard:read", audit),
    async (request, response) => {
      const { days } = z
        .object({ days: z.coerce.number().int().refine((value) => [7, 30].includes(value)) })
        .parse(request.query);
      const [users] = await pool.query<RowDataPacket[]>(
        `SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) AS date,
                COUNT(*) AS count
         FROM users
         WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ${days} DAY
         GROUP BY date ORDER BY date`,
      );
      const [orders] = await pool.query<RowDataPacket[]>(
        `SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) AS date,
                status, COUNT(*) AS count
         FROM orders
         WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ${days} DAY
         GROUP BY date, status ORDER BY date, status`,
      );
      response.json({ days, users, orders, timeZone: "Asia/Shanghai" });
    },
  );

  router.get(
    "/events",
    requirePermission("dashboard:read", audit),
    async (request, response) => {
      response.status(200);
      response.set({
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      response.flushHeaders();

      let eventId = Date.now();
      const send = (snapshot: DashboardSnapshot) => {
        eventId += 1;
        response.write(`id: ${eventId}\nevent: metrics\ndata: ${JSON.stringify(snapshot)}\n\n`);
      };
      send(await events.snapshot());
      const unsubscribe = events.subscribe(send);
      const heartbeat = setInterval(() => {
        response.write(`: heartbeat ${Date.now()}\n\n`);
      }, 15_000);
      heartbeat.unref();
      request.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );

  return router;
}
