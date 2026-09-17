import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import {
  InMemoryRefreshTokenRepository,
  TokenService,
} from "../services/auth/token.service.js";
import {
  InMemoryUserRepository,
  UserAuthService,
} from "../services/auth/user-auth.service.js";
import { InMemoryRateLimiter } from "../services/sms/rate-limiter.js";
import { MockSmsProvider } from "../services/sms/mock-sms-provider.js";
import {
  InMemorySmsCodeStore,
  SmsCodeService,
} from "../services/sms/sms-code.service.js";
import { createAuthRouter } from "./auth.routes.js";

const phone = "13800138000";
const password = "StrongPass1!";

function setup() {
  const now = new Date();
  const provider = new MockSmsProvider();
  const smsCodes = new SmsCodeService({
    pepper: "test-sms-pepper-with-at-least-32-characters",
    provider,
    rateLimiter: new InMemoryRateLimiter(() => now),
    store: new InMemorySmsCodeStore(),
    now: () => now,
    generateCode: () => "482913",
  });
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const tokens = new TokenService({
    accessSecret: "test-access-secret-with-at-least-32-characters",
    refreshSecret: "test-refresh-secret-with-at-least-32-characters",
    repository: refreshTokens,
    now: () => now,
  });
  const authService = new UserAuthService({
    users,
    smsCodes,
    tokens,
    now: () => now,
  });
  const authRouter = createAuthRouter({
    authService,
    smsCodes,
    secureCookies: false,
  });
  const app = createApp({
    readinessProbe: async () => undefined,
    authRouter,
  });

  return { app, provider, refreshTokens, tokens, users };
}

async function register(app: ReturnType<typeof createApp>) {
  const sendResponse = await request(app)
    .post("/api/auth/sms/send")
    .set("X-Forwarded-For", "203.0.113.10")
    .send({ phone, scene: "register" });
  expect(sendResponse.status).toBe(202);
  expect(sendResponse.body).toEqual({
    message: "如手机号可用，验证码将发送",
  });
  expect(JSON.stringify(sendResponse.body)).not.toContain("482913");

  return request(app).post("/api/auth/register").send({
    phone,
    code: "482913",
    password,
    nickname: "测试车主",
  });
}

describe("user authentication routes", () => {
  it("registers with a one-time SMS code and hashes the password", async () => {
    const { app, users } = setup();

    const response = await register(app);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      expiresIn: 900,
      user: { phone, nickname: "测试车主" },
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("xiaomi_user_refresh=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(users.records[0]?.passwordHash).not.toBe(password);
    expect(users.records[0]?.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    const replay = await request(app).post("/api/auth/register").send({
      phone,
      code: "482913",
      password,
      nickname: "重复用户",
    });
    expect(replay.status).toBe(401);
  });

  it("supports password and SMS login without exposing codes", async () => {
    const { app, provider } = setup();
    await register(app);

    const passwordResponse = await request(app).post("/api/auth/login/password").send({
      phone,
      password,
    });
    expect(passwordResponse.status).toBe(200);

    await request(app)
      .post("/api/auth/sms/send")
      .set("X-Forwarded-For", "203.0.113.11")
      .send({ phone, scene: "login" });
    expect(provider.lastMessage?.code).toBe("482913");
    const smsResponse = await request(app).post("/api/auth/login/sms").send({
      phone,
      code: "482913",
    });
    expect(smsResponse.status).toBe(200);
  });

  it("locks an account after five failed password attempts", async () => {
    const { app } = setup();
    await register(app);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/api/auth/login/password").send({
        phone,
        password: "WrongPassword1!",
      });
      expect(response.status).toBe(401);
    }

    const locked = await request(app).post("/api/auth/login/password").send({
      phone,
      password,
    });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("rotates refresh tokens and revokes them on logout", async () => {
    const { app } = setup();
    const registration = await register(app);
    const firstCookie = registration.headers["set-cookie"]?.[0];
    expect(firstCookie).toBeDefined();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstCookie as string);
    expect(refreshed.status).toBe(200);
    const secondCookie = refreshed.headers["set-cookie"]?.[0];
    expect(secondCookie).toBeDefined();
    expect(secondCookie).not.toBe(firstCookie);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstCookie as string);
    expect(replay.status).toBe(401);

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", secondCookie as string);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", secondCookie as string);
    expect(afterLogout.status).toBe(401);
  });
});
