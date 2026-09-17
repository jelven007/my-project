import { describe, expect, it } from "vitest";

import {
  InMemoryRefreshTokenRepository,
  TokenService,
} from "../auth/token.service.js";
import { InMemoryUserRepository } from "../auth/user-auth.service.js";
import { InMemoryRateLimiter } from "../sms/rate-limiter.js";
import { MockSmsProvider } from "../sms/mock-sms-provider.js";
import {
  InMemorySmsCodeStore,
  SmsCodeService,
} from "../sms/sms-code.service.js";
import { MockWechatProvider } from "./mock-wechat-provider.js";
import {
  InMemoryOauthStateStore,
  InMemoryWechatIdentityRepository,
  WechatAuthService,
} from "./wechat-auth.service.js";

const phone = "13800138000";

function setup() {
  const now = new Date("2026-09-17T06:00:00.000Z");
  const users = new InMemoryUserRepository();
  const provider = new MockWechatProvider();
  const smsCodes = new SmsCodeService({
    pepper: "test-sms-pepper-with-at-least-32-characters",
    provider: new MockSmsProvider(),
    rateLimiter: new InMemoryRateLimiter(() => now),
    store: new InMemorySmsCodeStore(),
    now: () => now,
    generateCode: () => "482913",
  });
  const tokens = new TokenService({
    accessSecret: "test-access-secret-with-at-least-32-characters",
    refreshSecret: "test-refresh-secret-with-at-least-32-characters",
    repository: new InMemoryRefreshTokenRepository(),
    now: () => now,
  });
  const service = new WechatAuthService({
    stateSecret: "test-wechat-state-secret-at-least-32-characters",
    provider,
    stateStore: new InMemoryOauthStateStore(() => now),
    identities: new InMemoryWechatIdentityRepository(users),
    smsCodes,
    tokens,
    now: () => now,
  });
  return { provider, service, smsCodes, users };
}

describe("WechatAuthService", () => {
  it("rejects callback state replay and provider failures", async () => {
    const { provider, service } = setup();
    provider.registerCode("valid-code", {
      providerUserId: "openid-1",
      nickname: "微信用户",
    });
    const { state } = await service.start("/profile");

    await expect(service.callback("valid-code", state)).resolves.toMatchObject({
      kind: "phone_binding_required",
    });
    await expect(service.callback("valid-code", state)).rejects.toMatchObject({
      code: "WECHAT_STATE_INVALID",
    });

    const second = await service.start("/");
    await expect(service.callback("unknown-code", second.state)).rejects.toMatchObject({
      code: "WECHAT_PROVIDER_ERROR",
    });
  });

  it("binds a new user and logs in an existing identity", async () => {
    const { provider, service, smsCodes } = setup();
    provider.registerCode("first-code", {
      providerUserId: "openid-1",
      unionId: "union-1",
      nickname: "微信用户",
    });
    const start = await service.start("/orders");
    const callback = await service.callback("first-code", start.state);
    expect(callback.kind).toBe("phone_binding_required");
    if (callback.kind !== "phone_binding_required") throw new Error("unexpected result");

    await smsCodes.send(phone, "bind_phone", "203.0.113.20");
    const session = await service.bindPhone(callback.bindingToken, phone, "482913");
    expect(session.user).toMatchObject({ phone, nickname: "微信用户" });

    provider.registerCode("second-code", {
      providerUserId: "openid-1",
      nickname: "微信用户",
    });
    const secondStart = await service.start("/");
    await expect(service.callback("second-code", secondStart.state)).resolves.toMatchObject({
      kind: "authenticated",
      session: { user: { phone } },
    });
  });

  it("rejects binding an identity to an existing phone", async () => {
    const { provider, service, smsCodes, users } = setup();
    await users.create({ phone, nickname: "已有用户", passwordHash: "hash" });
    provider.registerCode("first-code", {
      providerUserId: "openid-new",
      nickname: "微信用户",
    });
    const start = await service.start("/");
    const callback = await service.callback("first-code", start.state);
    if (callback.kind !== "phone_binding_required") throw new Error("unexpected result");
    await smsCodes.send(phone, "bind_phone", "203.0.113.20");

    await expect(
      service.bindPhone(callback.bindingToken, phone, "482913"),
    ).rejects.toMatchObject({ code: "WECHAT_PHONE_CONFLICT" });
  });
});
