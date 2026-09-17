import { describe, expect, it } from "vitest";

import {
  InMemoryTotpReplayStore,
  TotpError,
  TotpService,
} from "./totp.service.js";

const secret = "JBSWY3DPEHPK3PXP";
const encryptionKey = "local-admin-mfa-encryption-key-32";

describe("TotpService", () => {
  it("encrypts secrets and verifies a code without exposing plaintext", async () => {
    const now = new Date("2026-09-17T05:00:00.000Z");
    const service = new TotpService({ encryptionKey, now: () => now });
    const encrypted = service.encryptSecret(secret);

    expect(encrypted.toString("utf8")).not.toContain(secret);
    await expect(
      service.verifyAndConsume("admin-1", encrypted, service.generateCode(secret)),
    ).resolves.toBeUndefined();
  });

  it("rejects replay of the same TOTP time window", async () => {
    const now = new Date("2026-09-17T05:00:00.000Z");
    const service = new TotpService({
      encryptionKey,
      now: () => now,
      replayStore: new InMemoryTotpReplayStore(),
    });
    const encrypted = service.encryptSecret(secret);
    const code = service.generateCode(secret);

    await service.verifyAndConsume("admin-1", encrypted, code);
    await expect(service.verifyAndConsume("admin-1", encrypted, code)).rejects.toEqual(
      new TotpError("MFA_CODE_REPLAYED"),
    );
  });

  it("rejects invalid and expired-window codes", async () => {
    let now = new Date("2026-09-17T05:00:00.000Z");
    const service = new TotpService({ encryptionKey, now: () => now, allowedDriftWindows: 0 });
    const encrypted = service.encryptSecret(secret);
    const code = service.generateCode(secret);
    now = new Date(now.getTime() + 60_000);

    await expect(service.verifyAndConsume("admin-1", encrypted, code)).rejects.toEqual(
      new TotpError("MFA_CODE_INVALID"),
    );
  });
});
