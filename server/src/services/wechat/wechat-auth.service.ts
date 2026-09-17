import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import type { UserRecord, UserRepository } from "../auth/user-auth.service.js";
import { UserConflictError } from "../auth/user-auth.service.js";
import type { AuthSession, TokenService } from "../auth/token.service.js";
import type { SmsCodeService } from "../sms/sms-code.service.js";
import type { WechatProfile, WechatProvider } from "./wechat-provider.js";

export interface OauthStateStore {
  save(nonce: string, expiresAt: Date): Promise<void>;
  consume(nonce: string): Promise<boolean>;
}

export class InMemoryOauthStateStore implements OauthStateStore {
  private readonly records = new Map<string, Date>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async save(nonce: string, expiresAt: Date): Promise<void> {
    this.records.set(nonce, expiresAt);
  }

  async consume(nonce: string): Promise<boolean> {
    const expiresAt = this.records.get(nonce);
    this.records.delete(nonce);
    return expiresAt !== undefined && expiresAt.getTime() > this.now().getTime();
  }
}

export interface WechatIdentityRepository {
  findUser(providerUserId: string): Promise<UserRecord | undefined>;
  createUserWithIdentity(phone: string, profile: WechatProfile): Promise<UserRecord>;
}

export class InMemoryWechatIdentityRepository implements WechatIdentityRepository {
  private readonly identities = new Map<string, string>();

  constructor(private readonly users: UserRepository) {}

  async findUser(providerUserId: string): Promise<UserRecord | undefined> {
    const userId = this.identities.get(providerUserId);
    return userId ? this.users.findById(userId) : undefined;
  }

  async createUserWithIdentity(phone: string, profile: WechatProfile): Promise<UserRecord> {
    if (await this.users.findByPhone(phone)) throw new UserConflictError();
    if (this.identities.has(profile.providerUserId)) {
      throw new WechatAuthError("WECHAT_IDENTITY_CONFLICT");
    }
    const user = await this.users.create({ phone, nickname: profile.nickname });
    this.identities.set(profile.providerUserId, user.id);
    return user;
  }
}

export type WechatAuthErrorCode =
  | "WECHAT_STATE_INVALID"
  | "WECHAT_PROVIDER_ERROR"
  | "WECHAT_BINDING_INVALID"
  | "WECHAT_PHONE_CONFLICT"
  | "WECHAT_IDENTITY_CONFLICT";

export class WechatAuthError extends Error {
  constructor(public readonly code: WechatAuthErrorCode) {
    super(code);
  }
}

interface WechatAuthDependencies {
  stateSecret: string;
  provider: WechatProvider;
  stateStore: OauthStateStore;
  identities: WechatIdentityRepository;
  smsCodes: SmsCodeService;
  tokens: TokenService;
  now?: () => Date;
}

interface StatePayload {
  nonce: string;
  returnTo: string;
  expiresAt: number;
}

export type WechatCallbackResult =
  | { kind: "authenticated"; session: AuthSession; returnTo: string }
  | { kind: "phone_binding_required"; bindingToken: string; returnTo: string };

export class WechatAuthService {
  private readonly key: Uint8Array;
  private readonly now: () => Date;

  constructor(private readonly dependencies: WechatAuthDependencies) {
    if (dependencies.stateSecret.length < 32) {
      throw new Error("WeChat state secret must contain at least 32 characters");
    }
    this.key = new TextEncoder().encode(dependencies.stateSecret);
    this.now = dependencies.now ?? (() => new Date());
  }

  async start(returnTo: string): Promise<{ state: string; authorizationUrl: string }> {
    const payload: StatePayload = {
      nonce: randomUUID(),
      returnTo: this.safeReturnTo(returnTo),
      expiresAt: this.now().getTime() + 10 * 60 * 1000,
    };
    await this.dependencies.stateStore.save(payload.nonce, new Date(payload.expiresAt));
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded);
    const state = `${encoded}.${signature}`;
    return {
      state,
      authorizationUrl: this.dependencies.provider.createAuthorizationUrl(state),
    };
  }

  async callback(code: string, state: string): Promise<WechatCallbackResult> {
    const statePayload = await this.verifyState(state);
    let profile: WechatProfile;
    try {
      profile = await this.dependencies.provider.exchangeCode(code);
    } catch {
      throw new WechatAuthError("WECHAT_PROVIDER_ERROR");
    }

    const existing = await this.dependencies.identities.findUser(profile.providerUserId);
    if (existing) {
      if (!existing.active) throw new WechatAuthError("WECHAT_IDENTITY_CONFLICT");
      return {
        kind: "authenticated",
        session: await this.dependencies.tokens.issue(existing),
        returnTo: statePayload.returnTo,
      };
    }

    return {
      kind: "phone_binding_required",
      bindingToken: await this.createBindingToken(profile),
      returnTo: statePayload.returnTo,
    };
  }

  async bindPhone(bindingToken: string, phone: string, code: string): Promise<AuthSession> {
    await this.dependencies.smsCodes.verify(phone, "bind_phone", code);
    const profile = await this.verifyBindingToken(bindingToken);
    try {
      const user = await this.dependencies.identities.createUserWithIdentity(phone, profile);
      return this.dependencies.tokens.issue(user);
    } catch (error) {
      if (error instanceof UserConflictError) {
        throw new WechatAuthError("WECHAT_PHONE_CONFLICT");
      }
      throw error;
    }
  }

  private async verifyState(state: string): Promise<StatePayload> {
    try {
      const [encoded, signature] = state.split(".");
      if (!encoded || !signature) throw new Error();
      const expected = Buffer.from(this.sign(encoded), "base64url");
      const received = Buffer.from(signature, "base64url");
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new Error();
      }
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as StatePayload;
      if (
        typeof payload.nonce !== "string" ||
        typeof payload.returnTo !== "string" ||
        typeof payload.expiresAt !== "number" ||
        payload.expiresAt <= this.now().getTime() ||
        !(await this.dependencies.stateStore.consume(payload.nonce))
      ) {
        throw new Error();
      }
      return payload;
    } catch {
      throw new WechatAuthError("WECHAT_STATE_INVALID");
    }
  }

  private async createBindingToken(profile: WechatProfile): Promise<string> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    return new SignJWT({
      typ: "wechat_bind",
      openid: profile.providerUserId,
      unionId: profile.unionId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("xiaomi-car-api")
      .setAudience("xiaomi-car-wechat-binding")
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 10 * 60)
      .sign(this.key);
  }

  private async verifyBindingToken(token: string): Promise<WechatProfile> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: "xiaomi-car-api",
        audience: "xiaomi-car-wechat-binding",
        currentDate: this.now(),
      });
      if (
        payload.typ !== "wechat_bind" ||
        typeof payload.openid !== "string" ||
        typeof payload.nickname !== "string"
      ) {
        throw new Error();
      }
      return {
        providerUserId: payload.openid,
        nickname: payload.nickname,
        ...(typeof payload.unionId === "string" ? { unionId: payload.unionId } : {}),
        ...(typeof payload.avatarUrl === "string" ? { avatarUrl: payload.avatarUrl } : {}),
      };
    } catch {
      throw new WechatAuthError("WECHAT_BINDING_INVALID");
    }
  }

  private sign(value: string): string {
    return createHmac("sha256", this.dependencies.stateSecret).update(value).digest("base64url");
  }

  private safeReturnTo(value: string): string {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  }
}
