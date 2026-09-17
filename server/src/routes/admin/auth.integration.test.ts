import { hash } from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { InMemoryAuditRecorder } from "../../services/audit.service.js";
import {
  AdminAuthService,
  InMemoryAdminAuthRepository,
  InMemoryMfaChallengeStore,
} from "../../services/auth/admin-auth.service.js";
import { TotpService } from "../../services/auth/totp.service.js";
import { createAdminAuthRouter } from "./auth.routes.js";

const totpSecret = "JBSWY3DPEHPK3PXP";

describe("admin auth routes", () => {
  let totp: TotpService;
  let service: AdminAuthService;

  beforeEach(async () => {
    const now = new Date("2026-09-17T05:00:00.000Z");
    const repository = new InMemoryAdminAuthRepository();
    totp = new TotpService({
      encryptionKey: "admin-mfa-encryption-key-tests-003",
      now: () => now,
    });
    repository.records.push({
      id: "1",
      username: "root",
      email: "root@example.com",
      displayName: "Root",
      passwordHash: await hash("StrongPass1!", 4),
      active: true,
      failedLoginCount: 0,
      mfaSecretEncrypted: totp.encryptSecret(totpSecret),
      roles: ["super_admin"],
      permissions: ["dashboard:read"],
    });
    service = new AdminAuthService({
      repository,
      challenges: new InMemoryMfaChallengeStore(() => now),
      totp,
      audit: new InMemoryAuditRecorder(),
      accessSecret: "admin-access-secret-for-tests-00001",
      refreshSecret: "admin-refresh-secret-for-tests-0002",
      now: () => now,
    });
  });

  it("sets an isolated refresh cookie after MFA and exposes current permissions", async () => {
    const app = createApp({
      readinessProbe: async () => undefined,
      adminAuthRouter: createAdminAuthRouter({
        authService: service,
        allowedOrigin: "http://localhost:5174",
        secureCookies: false,
      }),
    });
    const login = await request(app)
      .post("/api/admin/auth/login")
      .send({ login: "root", password: "StrongPass1!" });
    const authenticated = await request(app)
      .post("/api/admin/auth/mfa/verify")
      .send({
        challengeToken: login.body.challengeToken,
        code: totp.generateCode(totpSecret),
      });
    const setCookies = authenticated.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookies) ? setCookies.join(";") : setCookies;

    expect(authenticated.status).toBe(200);
    expect(cookieHeader).toContain("xiaomi_admin_refresh=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");

    const me = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${authenticated.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.admin).toMatchObject({
      username: "root",
      permissions: ["dashboard:read"],
    });
  });

  it("requires trusted Origin and matching CSRF values to refresh", async () => {
    const app = createApp({
      readinessProbe: async () => undefined,
      adminAuthRouter: createAdminAuthRouter({
        authService: service,
        allowedOrigin: "http://localhost:5174",
        secureCookies: false,
      }),
    });
    const login = await request(app)
      .post("/api/admin/auth/login")
      .send({ login: "root", password: "StrongPass1!" });
    const authenticated = await request(app)
      .post("/api/admin/auth/mfa/verify")
      .send({
        challengeToken: login.body.challengeToken,
        code: totp.generateCode(totpSecret),
      });
    const cookies = authenticated.headers["set-cookie"] as unknown as string[];
    const csrfCookie = cookies
      .find((cookie) => cookie.startsWith("xiaomi_admin_csrf="))
      ?.split(";")[0]
      ?.split("=")[1];

    const denied = await request(app)
      .post("/api/admin/auth/refresh")
      .set("Cookie", cookies);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("CSRF_INVALID");

    const refreshed = await request(app)
      .post("/api/admin/auth/refresh")
      .set("Origin", "http://localhost:5174")
      .set("x-csrf-token", csrfCookie ?? "")
      .set("Cookie", cookies);
    expect(refreshed.status).toBe(200);
  });
});
