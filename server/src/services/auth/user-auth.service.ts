import { compare, hash } from "bcryptjs";

import type {
  PasswordLoginRequest,
  RegisterRequest,
  SmsLoginRequest,
} from "@xiaomi-car/contracts";

import type { SmsCodeService } from "../sms/sms-code.service.js";
import type { AuthSession, TokenService, TokenUser } from "./token.service.js";

export interface UserRecord extends TokenUser {
  passwordHash?: string;
  active: boolean;
  failedLoginCount: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
}

export interface CreateUserInput {
  phone: string;
  nickname: string;
  passwordHash?: string;
}

export interface UserRepository {
  findByPhone(phone: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  create(input: CreateUserInput): Promise<UserRecord>;
  recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void>;
  recordSuccessfulLogin(id: string, now: Date): Promise<void>;
}

export class UserConflictError extends Error {}

export class InMemoryUserRepository implements UserRepository {
  readonly records: UserRecord[] = [];

  async findByPhone(phone: string): Promise<UserRecord | undefined> {
    return this.records.find((record) => record.phone === phone);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    if (await this.findByPhone(input.phone)) throw new UserConflictError();
    const record: UserRecord = {
      id: (this.records.length + 1).toString(),
      phone: input.phone,
      nickname: input.nickname,
      active: true,
      failedLoginCount: 0,
      ...(input.passwordHash === undefined ? {} : { passwordHash: input.passwordHash }),
    };
    this.records.push(record);
    return record;
  }

  async recordFailedLogin(
    id: string,
    now: Date,
    maxAttempts: number,
    lockDurationMs: number,
  ): Promise<void> {
    const user = await this.findById(id);
    if (!user) return;
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= maxAttempts) {
      user.lockedUntil = new Date(now.getTime() + lockDurationMs);
    }
  }

  async recordSuccessfulLogin(id: string, now: Date): Promise<void> {
    const user = await this.findById(id);
    if (!user) return;
    user.failedLoginCount = 0;
    delete user.lockedUntil;
    user.lastLoginAt = now;
  }
}

export type AuthErrorCode =
  | "ACCOUNT_EXISTS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "INVALID_CREDENTIALS"
  | "TOKEN_INVALID";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
  }
}

interface UserAuthServiceDependencies {
  users: UserRepository;
  smsCodes: SmsCodeService;
  tokens: TokenService;
  now?: () => Date;
}

const maxLoginAttempts = 5;
const lockDurationMs = 15 * 60 * 1000;

export class UserAuthService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: UserAuthServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async register(input: RegisterRequest): Promise<AuthSession> {
    await this.dependencies.smsCodes.verify(input.phone, "register", input.code);

    try {
      const user = await this.dependencies.users.create({
        phone: input.phone,
        nickname: input.nickname,
        passwordHash: await hash(input.password, 12),
      });
      return this.dependencies.tokens.issue(this.toTokenUser(user));
    } catch (error) {
      if (error instanceof UserConflictError) throw new AuthError("ACCOUNT_EXISTS");
      throw error;
    }
  }

  async loginWithPassword(input: PasswordLoginRequest): Promise<AuthSession> {
    const user = await this.dependencies.users.findByPhone(input.phone);
    if (!user?.passwordHash) throw new AuthError("INVALID_CREDENTIALS");
    this.assertUsable(user);

    if (!(await compare(input.password, user.passwordHash))) {
      await this.dependencies.users.recordFailedLogin(
        user.id,
        this.now(),
        maxLoginAttempts,
        lockDurationMs,
      );
      throw new AuthError("INVALID_CREDENTIALS");
    }

    await this.dependencies.users.recordSuccessfulLogin(user.id, this.now());
    return this.dependencies.tokens.issue(this.toTokenUser(user));
  }

  async loginWithSms(input: SmsLoginRequest): Promise<AuthSession> {
    await this.dependencies.smsCodes.verify(input.phone, "login", input.code);
    const user = await this.dependencies.users.findByPhone(input.phone);
    if (!user) throw new AuthError("INVALID_CREDENTIALS");
    this.assertUsable(user);
    await this.dependencies.users.recordSuccessfulLogin(user.id, this.now());
    return this.dependencies.tokens.issue(this.toTokenUser(user));
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    try {
      const userId = await this.dependencies.tokens.getRefreshSubject(refreshToken);
      const user = await this.dependencies.users.findById(userId);
      if (!user) throw new AuthError("TOKEN_INVALID");
      this.assertUsable(user);
      return await this.dependencies.tokens.refresh(refreshToken, this.toTokenUser(user));
    } catch (error) {
      if (error instanceof AuthError && error.code === "ACCOUNT_DISABLED") throw error;
      throw new AuthError("TOKEN_INVALID");
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.dependencies.tokens.revoke(refreshToken);
  }

  private assertUsable(user: UserRecord): void {
    if (!user.active) throw new AuthError("ACCOUNT_DISABLED");
    if (user.lockedUntil && user.lockedUntil.getTime() > this.now().getTime()) {
      throw new AuthError("ACCOUNT_LOCKED");
    }
  }

  private toTokenUser(user: UserRecord): TokenUser {
    return { id: user.id, phone: user.phone, nickname: user.nickname };
  }
}
