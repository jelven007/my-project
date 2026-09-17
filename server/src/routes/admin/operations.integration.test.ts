import { hash } from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import { InMemoryAuditRecorder } from "../../services/audit.service.js";
import {
  AdminAuthService,
  InMemoryAdminAuthRepository,
  InMemoryMfaChallengeStore,
  type AdminSession,
} from "../../services/auth/admin-auth.service.js";
import { TotpService } from "../../services/auth/totp.service.js";
import { DashboardEvents } from "../../services/dashboard-events.js";
import { createAdminOperationsRouter } from "./operations.routes.js";

const allowedOrigin = "http://localhost:5174";

interface StubResult {
  rows: unknown[];
}

/**
 * Minimal pool double: operations routes enforce auth and RBAC before touching
 * SQL, so canned rows are enough to assert masking, CSRF, and authorization.
 */
function stubPool(responses: Record<string, StubResult>) {
  const answer = (sql: string): [unknown[], []] => {
    const key = Object.keys(responses).find((fragment) => sql.includes(fragment));
    return [key ? responses[key]!.rows : [], []];
  };
  return {
    query: vi.fn(async (sql: string) => answer(sql)),
    execute: vi.fn(async (sql: string) => answer(sql)),
    getConnection: vi.fn(),
  } as never;
}

async function authenticate(service: AdminAuthService): Promise<AdminSession> {
  const result = await service.login("ops", "StrongPass1!", {});
  if (result.kind !== "authenticated") throw new Error("expected direct session");
  return result;
}

describe("admin operations routes", () => {
  let service: AdminAuthService;
  let repository: InMemoryAdminAuthRepository;

  beforeEach(async () => {
    const now = new Date("2026-09-17T05:00:00.000Z");
    repository = new InMemoryAdminAuthRepository();
    repository.records.push({
      id: "7",
      username: "ops",
      email: "ops@example.com",
      displayName: "Ops",
      passwordHash: await hash("StrongPass1!", 4),
      active: true,
      failedLoginCount: 0,
      roles: ["order_operator"],
      permissions: ["orders:read", "orders:update"],
    });
    service = new AdminAuthService({
      repository,
      challenges: new InMemoryMfaChallengeStore(() => now),
      totp: new TotpService({ encryptionKey: "admin-mfa-encryption-key-tests-003", now: () => now }),
      audit: new InMemoryAuditRecorder(),
      accessSecret: "admin-access-secret-for-tests-00001",
      refreshSecret: "admin-refresh-secret-for-tests-0002",
      now: () => now,
    });
  });

  function buildApp(pool: never) {
    return createApp({
      readinessProbe: async () => undefined,
      allowedOrigins: [allowedOrigin],
      adminOperationsRouter: createAdminOperationsRouter({
        pool,
        audit: new InMemoryAuditRecorder(),
        authService: service,
        allowedOrigin,
        dashboardEvents: new DashboardEvents(async () => ({
          totalUsers: 1,
          todayUsers: 1,
          totalOrders: 0,
          todayOrders: 0,
          pendingTestDrives: 0,
          updatedAt: new Date().toISOString(),
        })),
      }),
    });
  }

  it("masks contact phone when the admin lacks orders:pii", async () => {
    const session = await authenticate(service);
    const pool = stubPool({
      "FROM orders o": {
        rows: [
          {
            orderNo: "SO-1",
            status: "pending_confirmation",
            contactName: "王女士",
            contactPhone: "13800001234",
            createdAt: "2026-09-17",
            carName: "SU7",
            dealerName: "北京店",
          },
        ],
      },
    });
    const response = await request(buildApp(pool))
      .get("/api/admin/orders")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.items[0].contactPhone).toBe("138****1234");
  });

  it("denies reading SMS deliveries without sms:read", async () => {
    const session = await authenticate(service);
    const response = await request(buildApp(stubPool({})))
      .get("/api/admin/sms-deliveries")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PERMISSION_DENIED");
  });

  it("rejects mutations that fail CSRF and Origin validation", async () => {
    const session = await authenticate(service);
    const response = await request(buildApp(stubPool({})))
      .patch("/api/admin/orders/SO-1")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ status: "confirmed" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_INVALID");
  });

  it("requires dashboard:read to open the metrics stream", async () => {
    const session = await authenticate(service);
    const response = await request(buildApp(stubPool({})))
      .get("/api/admin/dashboard/summary")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PERMISSION_DENIED");
  });

  it("rejects anonymous access to every operations route", async () => {
    const response = await request(buildApp(stubPool({}))).get("/api/admin/orders");
    expect(response.status).toBe(401);
  });
});

describe("dashboard events", () => {
  it("emits only when the snapshot changes and stops when idle", async () => {
    vi.useFakeTimers();
    let total = 1;
    const events = new DashboardEvents(
      async () => ({
        totalUsers: total,
        todayUsers: 0,
        totalOrders: 0,
        todayOrders: 0,
        pendingTestDrives: 0,
        updatedAt: "static",
      }),
      10,
    );
    const received: number[] = [];
    const unsubscribe = events.subscribe((snapshot) => received.push(snapshot.totalUsers));

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    expect(received).toEqual([1]);

    total = 2;
    await vi.advanceTimersByTimeAsync(10);
    expect(received).toEqual([1, 2]);

    unsubscribe();
    total = 3;
    await vi.advanceTimersByTimeAsync(50);
    expect(received).toEqual([1, 2]);
    vi.useRealTimers();
  });
});
