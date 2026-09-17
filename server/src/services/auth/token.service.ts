import { createHash, randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

export interface TokenUser {
  id: string;
  phone: string;
  nickname: string;
}

export interface RefreshTokenRecord {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
}

export interface RefreshTokenRepository {
  save(record: RefreshTokenRecord): Promise<void>;
  rotate(previousHash: string, replacement: RefreshTokenRecord, now: Date): Promise<boolean>;
  revoke(tokenHash: string): Promise<void>;
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly records: RefreshTokenRecord[] = [];

  async save(record: RefreshTokenRecord): Promise<void> {
    this.records.push(record);
  }

  async rotate(
    previousHash: string,
    replacement: RefreshTokenRecord,
    now: Date,
  ): Promise<boolean> {
    const previous = this.records.find((record) => record.tokenHash === previousHash);
    if (!previous || previous.revoked || previous.expiresAt.getTime() <= now.getTime()) {
      return false;
    }
    previous.revoked = true;
    this.records.push(replacement);
    return true;
  }

  async revoke(tokenHash: string): Promise<void> {
    const record = this.records.find((candidate) => candidate.tokenHash === tokenHash);
    if (record) record.revoked = true;
  }
}

export class TokenError extends Error {
  constructor() {
    super("TOKEN_INVALID");
  }
}

interface TokenServiceDependencies {
  accessSecret: string;
  refreshSecret: string;
  repository: RefreshTokenRepository;
  now?: () => Date;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: TokenUser;
}

const accessTokenSeconds = 15 * 60;
const refreshTokenSeconds = 7 * 24 * 60 * 60;

export class TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly now: () => Date;

  constructor(private readonly dependencies: TokenServiceDependencies) {
    if (dependencies.accessSecret.length < 32 || dependencies.refreshSecret.length < 32) {
      throw new Error("User token secrets must contain at least 32 characters");
    }
    if (dependencies.accessSecret === dependencies.refreshSecret) {
      throw new Error("Access and refresh token secrets must differ");
    }
    this.accessKey = new TextEncoder().encode(dependencies.accessSecret);
    this.refreshKey = new TextEncoder().encode(dependencies.refreshSecret);
    this.now = dependencies.now ?? (() => new Date());
  }

  async issue(user: TokenUser): Promise<AuthSession> {
    const session = await this.createSession(user);
    await this.dependencies.repository.save(session.record);
    return session.response;
  }

  async refresh(refreshToken: string, user: TokenUser): Promise<AuthSession> {
    const payload = await this.verifyRefresh(refreshToken);
    if (payload.sub !== user.id) throw new TokenError();

    const session = await this.createSession(user);
    const rotated = await this.dependencies.repository.rotate(
      this.hash(refreshToken),
      session.record,
      this.now(),
    );
    if (!rotated) throw new TokenError();
    return session.response;
  }

  async getRefreshSubject(refreshToken: string): Promise<string> {
    const payload = await this.verifyRefresh(refreshToken);
    if (!payload.sub) throw new TokenError();
    return payload.sub;
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.verifyRefresh(refreshToken);
      await this.dependencies.repository.revoke(this.hash(refreshToken));
    } catch {
      // Logout is intentionally idempotent and does not disclose token validity.
    }
  }

  async verifyAccess(accessToken: string): Promise<TokenUser> {
    try {
      const { payload } = await jwtVerify(accessToken, this.accessKey, {
        algorithms: ["HS256"],
        audience: "xiaomi-car-user",
        issuer: "xiaomi-car-api",
        currentDate: this.now(),
      });
      if (
        payload.typ !== "access" ||
        !payload.sub ||
        typeof payload.phone !== "string" ||
        typeof payload.nickname !== "string"
      ) {
        throw new TokenError();
      }
      return { id: payload.sub, phone: payload.phone, nickname: payload.nickname };
    } catch {
      throw new TokenError();
    }
  }

  private async createSession(
    user: TokenUser,
  ): Promise<{ response: AuthSession; record: RefreshTokenRecord }> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const accessToken = await new SignJWT({
      typ: "access",
      phone: user.phone,
      nickname: user.nickname,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-user")
      .setSubject(user.id)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + accessTokenSeconds)
      .sign(this.accessKey);

    const refreshToken = await new SignJWT({ typ: "refresh" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-user-refresh")
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + refreshTokenSeconds)
      .sign(this.refreshKey);

    return {
      response: { accessToken, refreshToken, expiresIn: accessTokenSeconds, user },
      record: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date((issuedAt + refreshTokenSeconds) * 1000),
        revoked: false,
      },
    };
  }

  private async verifyRefresh(refreshToken: string) {
    try {
      const result = await jwtVerify(refreshToken, this.refreshKey, {
        algorithms: ["HS256"],
        audience: "xiaomi-car-user-refresh",
        issuer: "xiaomi-car-api",
        currentDate: this.now(),
      });
      if (result.payload.typ !== "refresh" || !result.payload.sub) throw new TokenError();
      return result.payload;
    } catch {
      throw new TokenError();
    }
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
