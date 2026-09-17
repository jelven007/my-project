import { describe, expect, it } from "vitest";

import { MockSmsProvider } from "./mock-sms-provider.js";
import { InMemoryRateLimiter } from "./rate-limiter.js";
import { InMemorySmsCodeStore, SmsCodeService } from "./sms-code.service.js";

const phone = "13800138000";

function setup(now = new Date("2026-09-17T05:00:00.000Z")) {
  const provider = new MockSmsProvider();
  const store = new InMemorySmsCodeStore();
  const rateLimiter = new InMemoryRateLimiter(() => now);
  const service = new SmsCodeService({
    pepper: "test-pepper-with-at-least-32-characters",
    provider,
    rateLimiter,
    store,
    now: () => now,
    generateCode: () => "482913",
  });
  return { provider, service, store };
}

describe("SmsCodeService", () => {
  it("stores only an HMAC and sends through the provider", async () => {
    const { provider, service, store } = setup();

    await service.send(phone, "register", "203.0.113.10");

    expect(provider.lastMessage).toMatchObject({ phone, code: "482913", scene: "register" });
    expect(store.records[0]?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(store.records)).not.toContain("482913");
  });

  it("consumes a valid code once", async () => {
    const { service } = setup();
    await service.send(phone, "register", "203.0.113.10");

    await expect(service.verify(phone, "register", "482913")).resolves.toBeUndefined();
    await expect(service.verify(phone, "register", "482913")).rejects.toMatchObject({
      code: "SMS_CODE_INVALID",
    });
  });

  it("rejects expired codes and stops after five failed attempts", async () => {
    let now = new Date("2026-09-17T05:00:00.000Z");
    const provider = new MockSmsProvider();
    const store = new InMemorySmsCodeStore();
    const service = new SmsCodeService({
      pepper: "test-pepper-with-at-least-32-characters",
      provider,
      rateLimiter: new InMemoryRateLimiter(() => now),
      store,
      now: () => now,
      generateCode: () => "482913",
    });

    await service.send(phone, "login", "203.0.113.10");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verify(phone, "login", "000000")).rejects.toMatchObject({
        code: "SMS_CODE_INVALID",
      });
    }
    await expect(service.verify(phone, "login", "482913")).rejects.toMatchObject({
      code: "SMS_CODE_INVALID",
    });

    await service.send(phone, "bind_phone", "203.0.113.10");
    now = new Date("2026-09-17T05:05:01.000Z");
    await expect(service.verify(phone, "bind_phone", "482913")).rejects.toMatchObject({
      code: "SMS_CODE_EXPIRED",
    });
  });

  it("enforces resend cooldown and hourly phone limits", async () => {
    let now = new Date("2026-09-17T05:00:00.000Z");
    const provider = new MockSmsProvider();
    const service = new SmsCodeService({
      pepper: "test-pepper-with-at-least-32-characters",
      provider,
      rateLimiter: new InMemoryRateLimiter(() => now),
      store: new InMemorySmsCodeStore(),
      now: () => now,
      generateCode: () => "482913",
    });

    await service.send(phone, "login", "203.0.113.10");
    await expect(service.send(phone, "login", "203.0.113.10")).rejects.toMatchObject({
      code: "SMS_RATE_LIMITED",
    });

    for (let attempt = 1; attempt < 5; attempt += 1) {
      now = new Date(now.getTime() + 61_000);
      await service.send(phone, "login", "203.0.113.10");
    }
    now = new Date(now.getTime() + 61_000);
    await expect(service.send(phone, "login", "203.0.113.10")).rejects.toMatchObject({
      code: "SMS_RATE_LIMITED",
    });
  });
});
