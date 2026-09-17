import { afterAll, describe, expect, it } from "vitest";

import { pool } from "../../db/pool.js";
import { MysqlSmsCodeStore } from "../sms/mysql-sms-code.store.js";
import { MysqlRefreshTokenRepository } from "./mysql-refresh-token.repository.js";
import { MysqlUserRepository } from "./mysql-user.repository.js";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";
const phone = `139${Date.now().toString().slice(-8)}`;

describe.runIf(runIntegration)("MySQL authentication repositories", () => {
  afterAll(async () => {
    await pool.execute("DELETE FROM sms_deliveries WHERE phone_masked = ?", [
      `${phone.slice(0, 3)}****${phone.slice(-4)}`,
    ]);
    await pool.execute("DELETE FROM sms_codes WHERE phone = ?", [phone]);
    await pool.execute(
      "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone = ?)",
      [phone],
    );
    await pool.execute("DELETE FROM users WHERE phone = ?", [phone]);
    await pool.end();
  });

  it("persists SMS state, users, and atomic refresh rotation", async () => {
    const smsStore = new MysqlSmsCodeStore(
      pool,
      "integration-phone-pepper-at-least-32-characters",
    );
    const smsRecord = {
      phone,
      scene: "register" as const,
      codeHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 300_000),
      consumed: false,
      verifyAttempts: 0,
      providerRequestId: `integration-${Date.now()}`,
      providerMessageId: `message-${Date.now()}`,
      providerName: "mock",
    };
    await smsStore.save(smsRecord);
    const storedSms = await smsStore.findLatest(phone, "register");
    expect(storedSms?.codeHash).toBe("a".repeat(64));
    expect(await smsStore.consume(storedSms!)).toBe(true);
    expect(await smsStore.consume(storedSms!)).toBe(false);

    const users = new MysqlUserRepository(pool);
    const user = await users.create({
      phone,
      nickname: "集成测试",
      passwordHash: "$2b$12$integration.test.hash",
    });
    expect((await users.findById(user.id))?.phone).toBe(phone);

    const refreshTokens = new MysqlRefreshTokenRepository(pool);
    const first = {
      userId: user.id,
      tokenHash: "b".repeat(64),
      expiresAt: new Date(Date.now() + 300_000),
      revoked: false,
    };
    await refreshTokens.save(first);
    expect(
      await refreshTokens.rotate(
        first.tokenHash,
        { ...first, tokenHash: "c".repeat(64) },
        new Date(),
      ),
    ).toBe(true);
    expect(
      await refreshTokens.rotate(
        first.tokenHash,
        { ...first, tokenHash: "d".repeat(64) },
        new Date(),
      ),
    ).toBe(false);
  });
});
