import { createHash, randomUUID } from "node:crypto";

import { compare } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";

import type { AuthenticatedAdmin } from "../../middleware/require-permission.js";
import type { AuditRecorder } from "../audit.service.js";
import { TotpError, type TotpService } from "./totp.service.js";

export interface AdminRecord extends AuthenticatedAdmin {
  email: string;
  passwordHash: string;
  active: boolean;
  failedLoginCount: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  mfaSecretEncrypted?: Buffer;
}

export interface AdminRefreshTokenRecord {
  adminId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  ip?: string;
  userAgent?: string;
}

export interface AdminAuthRepository {
  findByLogin(login: string): Promise<AdminRecord | undefined>;
  findById(id: string): Promise<AdminRecord | undefined>;
  recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void>;
  recordSuccessfulLogin(id: string, now: Date): Promise<void>;
  saveRefreshToken(record: AdminRefreshTokenRecord): Promise<void>;
  rotateRefreshToken(
    previousHash: string,
    replacement: AdminRefreshTokenRecord,
    now: Date,
  ): Promise<boolean>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeAllRefreshTokens(adminId: string): Promise<void>;
}

export class InMemoryAdminAuthRepository implements AdminAuthRepository {
  readonly records: AdminRecord[] = [];
  readonly refreshTokens: AdminRefreshTokenRecord[] = [];

  async findByLogin(login: string): Promise<AdminRecord | undefined> {
    return this.records.find(
      (record) => record.username === login || record.email === login,
    );
  }

  async findById(id: string): Promise<AdminRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void> {
    const admin = await this.findById(id);
    if (!admin) return;
    admin.failedLoginCount += 1;
    if (admin.failedLoginCount >= maxAttempts) {
      admin.lockedUntil = new Date(now.getTime() + lockDurationMs);
    }
  }

  async recordSuccessfulLogin(id: string, now: Date): Promise<void> {
    const admin = await this.findById(id);
    if (!admin) return;
    admin.failedLoginCount = 0;
    delete admin.lockedUntil;
    admin.lastLoginAt = now;
  }

  async saveRefreshToken(record: AdminRefreshTokenRecord): Promise<void> {
    this.refreshTokens.push(record);
  }

  async rotateRefreshToken(
    previousHash: string,
    replacement: AdminRefreshTokenRecord,
    now: Date,
  ): Promise<boolean> {
    const previous = this.refreshTokens.find((record) => record.tokenHash === previousHash);
    if (!previous || previous.revoked || previous.expiresAt.getTime() <= now.getTime()) {
      return false;
    }
    previous.revoked = true;
    this.refreshTokens.push(replacement);
    return true;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    const token = this.refreshTokens.find((record) => record.tokenHash === tokenHash);
    if (token) token.revoked = true;
  }

  async revokeAllRefreshTokens(adminId: string): Promise<void> {
    for (const token of this.refreshTokens) {
      if (token.adminId === adminId) token.revoked = true;
    }
  }
}

export interface MfaChallengeStore {
  save(id: string, adminId: string, expiresAt: Date): Promise<void>;
  consume(id: string, adminId: string): Promise<boolean>;
}

export class InMemoryMfaChallengeStore implements MfaChallengeStore {
  private readonly challenges = new Map<string, { adminId: string; expiresAt: Date }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async save(id: string, adminId: string, expiresAt: Date): Promise<void> {
    this.challenges.set(id, { adminId, expiresAt });
  }

  async consume(id: string, adminId: string): Promise<boolean> {
    const challenge = this.challenges.get(id);
    if (
      !challenge ||
      challenge.adminId !== adminId ||
      challenge.expiresAt.getTime() <= this.now().getTime()
    ) {
      return false;
    }
    this.challenges.delete(id);
    return true;
  }
}

interface RedisChallengeClient {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export class RedisMfaChallengeStore implements MfaChallengeStore {
  constructor(
    private readonly client: RedisChallengeClient,
    private readonly ensureConnected: () => Promise<void>,
  ) {}

  async save(id: string, adminId: string, expiresAt: Date): Promise<void> {
    await this.ensureConnected();
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.client.set(`admin:mfa:challenge:${id}`, adminId, { EX: ttl });
  }

  async consume(id: string, adminId: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.eval(
      `local value = redis.call("GET", KEYS[1])
       if value == ARGV[1] then redis.call("DEL", KEYS[1]); return 1 end
       return 0`,
      {
        keys: [`admin:mfa:challenge:${id}`],
        arguments: [adminId],
      },
    );
    return result === 1;
  }
}

export type AdminAuthErrorCode =
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_LOCKED"
  | "INVALID_CREDENTIALS"
  | "MFA_CHALLENGE_INVALID"
  | "MFA_CODE_INVALID"
  | "MFA_CODE_REPLAYED"
  | "MFA_SETUP_REQUIRED"
  | "TOKEN_INVALID";

export class AdminAuthError extends Error {
  constructor(public readonly code: AdminAuthErrorCode) {
    super(code);
  }
}

export interface AdminRequestContext {
  ip?: string;
  userAgent?: string;
}

export interface AdminSession {
  kind: "authenticated";
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  admin: AuthenticatedAdmin;
}

export interface AdminMfaChallenge {
  kind: "mfa_required";
  challengeToken: string;
  expiresIn: number;
}

interface AdminAuthDependencies {
  repository: AdminAuthRepository;
  challenges: MfaChallengeStore;
  totp: TotpService;
  audit: AuditRecorder;
  accessSecret: string;
  refreshSecret: string;
  now?: () => Date;
}

const accessTokenSeconds = 10 * 60;
const refreshTokenSeconds = 8 * 60 * 60;
const challengeSeconds = 5 * 60;
const maxLoginAttempts = 5;
const lockDurationMs = 30 * 60 * 1000;

export class AdminAuthService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly now: () => Date;

  constructor(private readonly dependencies: AdminAuthDependencies) {
    if (
      dependencies.accessSecret.length < 32 ||
      dependencies.refreshSecret.length < 32 ||
      dependencies.accessSecret === dependencies.refreshSecret
    ) {
      throw new Error("Admin token secrets must be distinct and at least 32 characters");
    }
    this.accessKey = new TextEncoder().encode(dependencies.accessSecret);
    this.refreshKey = new TextEncoder().encode(dependencies.refreshSecret);
    this.now = dependencies.now ?? (() => new Date());
  }

  async login(
    login: string,
    password: string,
    context: AdminRequestContext,
  ): Promise<AdminMfaChallenge | AdminSession> {
    const admin = await this.dependencies.repository.findByLogin(login);
    if (!admin) {
      await this.audit(undefined, "admin.login", "failure", context, {
        reason: "invalid_credentials",
      });
      throw new AdminAuthError("INVALID_CREDENTIALS");
    }
    this.assertUsable(admin);

    if (!(await compare(password, admin.passwordHash))) {
      await this.dependencies.repository.recordFailedLogin(
        admin.id,
        this.now(),
        maxLoginAttempts,
        lockDurationMs,
      );
      await this.audit(admin.id, "admin.login", "failure", context, {
        reason: "invalid_credentials",
      });
      throw new AdminAuthError("INVALID_CREDENTIALS");
    }

    if (!admin.mfaSecretEncrypted) {
      if (admin.roles.includes("super_admin")) {
        throw new AdminAuthError("MFA_SETUP_REQUIRED");
      }
      await this.dependencies.repository.recordSuccessfulLogin(admin.id, this.now());
      return this.issueSession(admin, context);
    }

    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const challengeId = randomUUID();
    const expiresAt = new Date((issuedAt + challengeSeconds) * 1000);
    await this.dependencies.challenges.save(challengeId, admin.id, expiresAt);
    const challengeToken = await new SignJWT({ typ: "admin_mfa" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-admin-mfa")
      .setSubject(admin.id)
      .setJti(challengeId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + challengeSeconds)
      .sign(this.accessKey);
    return { kind: "mfa_required", challengeToken, expiresIn: challengeSeconds };
  }

  async verifyMfa(
    challengeToken: string,
    code: string,
    context: AdminRequestContext,
  ): Promise<AdminSession> {
    let adminId: string;
    let challengeId: string;
    try {
      const { payload } = await jwtVerify(challengeToken, this.accessKey, {
        algorithms: ["HS256"],
        issuer: "xiaomi-car-api",
        audience: "xiaomi-car-admin-mfa",
        currentDate: this.now(),
      });
      if (payload.typ !== "admin_mfa" || !payload.sub || !payload.jti) {
        throw new Error("Invalid challenge");
      }
      adminId = payload.sub;
      challengeId = payload.jti;
    } catch {
      throw new AdminAuthError("MFA_CHALLENGE_INVALID");
    }

    const admin = await this.dependencies.repository.findById(adminId);
    if (!admin?.mfaSecretEncrypted) throw new AdminAuthError("MFA_CHALLENGE_INVALID");
    this.assertUsable(admin);

    try {
      await this.dependencies.totp.verifyAndConsume(
        admin.id,
        admin.mfaSecretEncrypted,
        code,
      );
    } catch (error) {
      const code =
        error instanceof TotpError && error.code === "MFA_CODE_REPLAYED"
          ? "MFA_CODE_REPLAYED"
          : "MFA_CODE_INVALID";
      await this.audit(admin.id, "admin.mfa.verify", "failure", context, { reason: code });
      throw new AdminAuthError(code);
    }

    if (!(await this.dependencies.challenges.consume(challengeId, admin.id))) {
      throw new AdminAuthError("MFA_CHALLENGE_INVALID");
    }
    await this.dependencies.repository.recordSuccessfulLogin(admin.id, this.now());
    await this.audit(admin.id, "admin.login", "success", context);
    return this.issueSession(admin, context);
  }

  async refresh(
    refreshToken: string,
    context: AdminRequestContext,
  ): Promise<AdminSession> {
    try {
      const { payload } = await jwtVerify(refreshToken, this.refreshKey, {
        algorithms: ["HS256"],
        issuer: "xiaomi-car-api",
        audience: "xiaomi-car-admin-refresh",
        currentDate: this.now(),
      });
      if (payload.typ !== "admin_refresh" || !payload.sub) {
        throw new AdminAuthError("TOKEN_INVALID");
      }
      const admin = await this.dependencies.repository.findById(payload.sub);
      if (!admin) throw new AdminAuthError("TOKEN_INVALID");
      this.assertUsable(admin);
      return await this.issueSession(admin, context, this.hash(refreshToken));
    } catch (error) {
      if (error instanceof AdminAuthError && error.code === "ACCOUNT_DISABLED") throw error;
      throw new AdminAuthError("TOKEN_INVALID");
    }
  }

  async logout(
    refreshToken: string | undefined,
    adminId: string | undefined,
    context: AdminRequestContext,
  ): Promise<void> {
    if (refreshToken) {
      await this.dependencies.repository.revokeRefreshToken(this.hash(refreshToken));
    }
    await this.audit(adminId, "admin.logout", "success", context);
  }

  async verifyAccess(accessToken: string): Promise<AuthenticatedAdmin> {
    try {
      const { payload } = await jwtVerify(accessToken, this.accessKey, {
        algorithms: ["HS256"],
        issuer: "xiaomi-car-api",
        audience: "xiaomi-car-admin",
        currentDate: this.now(),
      });
      if (payload.typ !== "admin_access" || !payload.sub) {
        throw new AdminAuthError("TOKEN_INVALID");
      }
      const admin = await this.dependencies.repository.findById(payload.sub);
      if (!admin) throw new AdminAuthError("TOKEN_INVALID");
      this.assertUsable(admin);
      return this.publicAdmin(admin);
    } catch (error) {
      if (error instanceof AdminAuthError && error.code === "ACCOUNT_DISABLED") throw error;
      throw new AdminAuthError("TOKEN_INVALID");
    }
  }

  private async issueSession(
    admin: AdminRecord,
    context: AdminRequestContext,
    previousHash?: string,
  ): Promise<AdminSession> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const accessToken = await new SignJWT({ typ: "admin_access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-admin")
      .setSubject(admin.id)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + accessTokenSeconds)
      .sign(this.accessKey);
    const refreshToken = await new SignJWT({ typ: "admin_refresh" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-admin-refresh")
      .setSubject(admin.id)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + refreshTokenSeconds)
      .sign(this.refreshKey);
    const record: AdminRefreshTokenRecord = {
      adminId: admin.id,
      tokenHash: this.hash(refreshToken),
      expiresAt: new Date((issuedAt + refreshTokenSeconds) * 1000),
      revoked: false,
      ...context,
    };
    const persisted = previousHash
      ? await this.dependencies.repository.rotateRefreshToken(
          previousHash,
          record,
          this.now(),
        )
      : (await this.dependencies.repository.saveRefreshToken(record), true);
    if (!persisted) throw new AdminAuthError("TOKEN_INVALID");
    return {
      kind: "authenticated",
      accessToken,
      refreshToken,
      expiresIn: accessTokenSeconds,
      admin: this.publicAdmin(admin),
    };
  }

  private publicAdmin(admin: AdminRecord): AuthenticatedAdmin {
    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      roles: [...admin.roles],
      permissions: [...admin.permissions],
    };
  }

  private assertUsable(admin: AdminRecord): void {
    if (!admin.active) throw new AdminAuthError("ACCOUNT_DISABLED");
    if (admin.lockedUntil && admin.lockedUntil.getTime() > this.now().getTime()) {
      throw new AdminAuthError("ACCOUNT_LOCKED");
    }
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    result: "success" | "failure",
    context: AdminRequestContext,
    metadata?: unknown,
  ): Promise<void> {
    await this.dependencies.audit.record({
      actorType: "admin",
      actorId,
      action,
      resourceType: "admin_session",
      result,
      ...context,
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
}
