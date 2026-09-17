import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryAuditRecorder } from "../audit.service.js";
import {
  AdminAuthError,
  AdminAuthService,
  InMemoryAdminAuthRepository,
  InMemoryMfaChallengeStore,
} from "./admin-auth.service.js";
import { InMemoryTotpReplayStore, TotpService } from "./totp.service.js";

const accessSecret = "admin-access-secret-for-tests-00001";
const refreshSecret = "admin-refresh-secret-for-tests-0002";
const mfaEncryptionKey = "admin-mfa-encryption-key-tests-003";
const totpSecret = "JBSWY3DPEHPK3PXP";

describe("AdminAuthService", () => {
  let now: Date;
  let repository: InMemoryAdminAuthRepository;
  let challenges: InMemoryMfaChallengeStore;
  let totp: TotpService;
  let audit: InMemoryAuditRecorder;
  let service: AdminAuthService;

  beforeEach(async () => {
    now = new Date("2026-09-17T05:00:00.000Z");
    repository = new InMemoryAdminAuthRepository();
    challenges = new InMemoryMfaChallengeStore(() => now);
    totp = new TotpService({
      encryptionKey: mfaEncryptionKey,
      now: () => now,
      replayStore: new InMemoryTotpReplayStore(),
    });
    audit = new InMemoryAuditRecorder();
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
      permissions: ["admin:manage", "role:manage"],
    });
    service = new AdminAuthService({
      repository,
      challenges,
      totp,
      audit,
      accessSecret,
      refreshSecret,
      now: () => now,
    });
  });

  it("requires MFA and rejects an expired challenge", async () => {
    const first = await service.login("root", "StrongPass1!", {});
    expect(first.kind).toBe("mfa_required");
    if (first.kind !== "mfa_required") throw new Error("Expected MFA challenge");

    now = new Date(now.getTime() + 6 * 60_000);
    await expect(
      service.verifyMfa(first.challengeToken, "123456", {}),
    ).rejects.toEqual(new AdminAuthError("MFA_CHALLENGE_INVALID"));
  });

  it("establishes a session after MFA and rotates refresh tokens once", async () => {
    const first = await service.login("root", "StrongPass1!", {});
    if (first.kind !== "mfa_required") throw new Error("Expected MFA challenge");
    const session = await service.verifyMfa(
      first.challengeToken,
      totp.generateCode(totpSecret),
      {},
    );

    expect(await service.verifyAccess(session.accessToken)).toMatchObject({
      id: "1",
      roles: ["super_admin"],
    });
    const replacement = await service.refresh(session.refreshToken, {});
    await expect(service.refresh(session.refreshToken, {})).rejects.toEqual(
      new AdminAuthError("TOKEN_INVALID"),
    );
    expect(replacement.refreshToken).not.toBe(session.refreshToken);
  });

  it("locks the account for 30 minutes after five password failures", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login("root", "wrong-password", {})).rejects.toEqual(
        new AdminAuthError("INVALID_CREDENTIALS"),
      );
    }

    await expect(service.login("root", "StrongPass1!", {})).rejects.toEqual(
      new AdminAuthError("ACCOUNT_LOCKED"),
    );
    expect(repository.records[0]?.lockedUntil?.getTime()).toBe(
      now.getTime() + 30 * 60_000,
    );
  });

  it("rejects access immediately when an administrator is disabled", async () => {
    const first = await service.login("root", "StrongPass1!", {});
    if (first.kind !== "mfa_required") throw new Error("Expected MFA challenge");
    const session = await service.verifyMfa(
      first.challengeToken,
      totp.generateCode(totpSecret),
      {},
    );
    repository.records[0]!.active = false;

    await expect(service.verifyAccess(session.accessToken)).rejects.toEqual(
      new AdminAuthError("ACCOUNT_DISABLED"),
    );
  });

  it("allows the development admin account without MFA", async () => {
    repository.records.push({
      id: "2",
      username: "admin",
      email: "admin@localhost.invalid",
      displayName: "本地管理员",
      passwordHash: await hash("admin", 4),
      active: true,
      failedLoginCount: 0,
      roles: ["local_admin"],
      permissions: ["dashboard:read", "admin:manage"],
    });

    const session = await service.login("admin", "admin", {});

    expect(session).toMatchObject({
      kind: "authenticated",
      admin: {
        username: "admin",
        roles: ["local_admin"],
      },
    });
  });
});
