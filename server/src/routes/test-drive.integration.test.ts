import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import {
  InMemoryRefreshTokenRepository,
  TokenService,
} from "../services/auth/token.service.js";
import { InMemoryUserRepository } from "../services/auth/user-auth.service.js";
import {
  InMemoryTestDriveStore,
  TestDriveService,
} from "../services/test-drive.service.js";
import { createProfileRouter } from "./profile.routes.js";
import { createTestDriveRouter } from "./test-drive.routes.js";

async function setup() {
  const now = new Date("2026-09-17T06:00:00.000Z");
  const users = new InMemoryUserRepository();
  const user = await users.create({
    phone: "13800138000",
    nickname: "测试车主",
    passwordHash: "hash",
  });
  const other = await users.create({
    phone: "13900139000",
    nickname: "其他用户",
    passwordHash: "hash",
  });
  const tokens = new TokenService({
    accessSecret: "test-access-secret-with-at-least-32-characters",
    refreshSecret: "test-refresh-secret-with-at-least-32-characters",
    repository: new InMemoryRefreshTokenRepository(),
    now: () => now,
  });
  const accessToken = (await tokens.issue(user)).accessToken;
  const otherToken = (await tokens.issue(other)).accessToken;
  const store = new InMemoryTestDriveStore();
  const service = new TestDriveService(store, () => now);
  const app = createApp({
    readinessProbe: async () => undefined,
    profileRouter: createProfileRouter(users, tokens),
    testDriveRouter: createTestDriveRouter(service, tokens, users),
  });
  return { accessToken, app, otherToken, store, users };
}

const validRequest = {
  carId: "1",
  dealerId: "10",
  contactName: "测试车主",
  contactPhone: "13800138000",
  preferredDate: "2026-09-20",
};

describe("test drive and profile routes", () => {
  it("requires a future date and isolates ownership", async () => {
    const { accessToken, app, otherToken } = await setup();
    const invalid = await request(app)
      .post("/api/test-drives")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validRequest, preferredDate: "2026-09-17" });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post("/api/test-drives")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validRequest);
    expect(created.status).toBe(201);

    const otherList = await request(app)
      .get("/api/test-drives")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherList.body.items).toEqual([]);
  });

  it("records cancellation history and masks profile phone", async () => {
    const { accessToken, app, store } = await setup();
    const created = await request(app)
      .post("/api/test-drives")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validRequest);
    const cancelled = await request(app)
      .post(`/api/test-drives/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(cancelled.body.status).toBe("cancelled");
    expect(store.history.map((entry) => entry.to)).toEqual(["submitted", "cancelled"]);

    const profile = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(profile.body.phoneMasked).toBe("138****8000");
    expect(profile.body).not.toHaveProperty("phone");
  });

  it("rejects a disabled user even with an unexpired token", async () => {
    const { accessToken, app, users } = await setup();
    users.records[0]!.active = false;
    const response = await request(app)
      .get("/api/test-drives")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DISABLED");
  });
});
