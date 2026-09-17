import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { SmsScene } from "@xiaomi-car/contracts";

import type { RateLimiter } from "./rate-limiter.js";
import type { SmsProvider } from "./sms-provider.js";

export interface SmsCodeRecord {
  id?: string;
  phone: string;
  scene: SmsScene;
  codeHash: string;
  expiresAt: Date;
  consumed: boolean;
  verifyAttempts: number;
  providerRequestId: string;
  providerMessageId?: string;
  providerName: string;
}

export interface SmsCodeStore {
  save(record: SmsCodeRecord): Promise<void>;
  findLatest(phone: string, scene: SmsScene): Promise<SmsCodeRecord | undefined>;
  incrementAttempts(record: SmsCodeRecord): Promise<void>;
  consume(record: SmsCodeRecord): Promise<boolean>;
}

export class InMemorySmsCodeStore implements SmsCodeStore {
  readonly records: SmsCodeRecord[] = [];

  async save(record: SmsCodeRecord): Promise<void> {
    this.records.push(record);
  }

  async findLatest(phone: string, scene: SmsScene): Promise<SmsCodeRecord | undefined> {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record?.phone === phone && record.scene === scene) return record;
    }
    return undefined;
  }

  async incrementAttempts(record: SmsCodeRecord): Promise<void> {
    record.verifyAttempts = Math.min(5, record.verifyAttempts + 1);
  }

  async consume(record: SmsCodeRecord): Promise<boolean> {
    if (record.consumed) return false;
    record.consumed = true;
    return true;
  }
}

export class SmsCodeError extends Error {
  constructor(
    public readonly code:
      | "SMS_CODE_INVALID"
      | "SMS_CODE_EXPIRED"
      | "SMS_PROVIDER_UNAVAILABLE"
      | "SMS_RATE_LIMITED",
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

interface SmsCodeServiceDependencies {
  pepper: string;
  provider: SmsProvider;
  rateLimiter: RateLimiter;
  store: SmsCodeStore;
  now?: () => Date;
  generateCode?: () => string;
}

export class SmsCodeService {
  private readonly now: () => Date;
  private readonly generateCode: () => string;

  constructor(private readonly dependencies: SmsCodeServiceDependencies) {
    if (dependencies.pepper.length < 32) {
      throw new Error("SMS code pepper must contain at least 32 characters");
    }
    this.now = dependencies.now ?? (() => new Date());
    this.generateCode = dependencies.generateCode ?? (() => randomInt(0, 1_000_000).toString().padStart(6, "0"));
  }

  async send(phone: string, scene: SmsScene, ipAddress: string): Promise<void> {
    await this.enforceRateLimit(`sms:cooldown:${phone}:${scene}`, 1, 60);
    await this.enforceRateLimit(`sms:phone:${phone}`, 5, 60 * 60);
    await this.enforceRateLimit(`sms:ip:${ipAddress}`, 20, 60 * 60);

    const code = this.generateCode();
    const result = await this.dependencies.provider.send({ phone, code, scene });
    if (!result.accepted) {
      throw new SmsCodeError("SMS_PROVIDER_UNAVAILABLE");
    }

    const record: SmsCodeRecord = {
      phone,
      scene,
      codeHash: this.hash(phone, scene, code),
      expiresAt: new Date(this.now().getTime() + 5 * 60 * 1000),
      consumed: false,
      verifyAttempts: 0,
      providerRequestId: result.requestId,
      providerName: this.dependencies.provider.name,
      ...(result.messageId === undefined ? {} : { providerMessageId: result.messageId }),
    };
    await this.dependencies.store.save(record);
  }

  async verify(phone: string, scene: SmsScene, code: string): Promise<void> {
    const record = await this.dependencies.store.findLatest(phone, scene);
    if (!record || record.consumed || record.verifyAttempts >= 5) {
      throw new SmsCodeError("SMS_CODE_INVALID");
    }
    if (record.expiresAt.getTime() < this.now().getTime()) {
      throw new SmsCodeError("SMS_CODE_EXPIRED");
    }

    const expected = Buffer.from(record.codeHash, "hex");
    const received = Buffer.from(this.hash(phone, scene, code), "hex");
    if (!timingSafeEqual(expected, received)) {
      await this.dependencies.store.incrementAttempts(record);
      throw new SmsCodeError("SMS_CODE_INVALID");
    }
    if (!(await this.dependencies.store.consume(record))) {
      throw new SmsCodeError("SMS_CODE_INVALID");
    }
  }

  private async enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await this.dependencies.rateLimiter.consume(key, limit, windowSeconds);
    if (!result.allowed) {
      throw new SmsCodeError("SMS_RATE_LIMITED", result.retryAfterSeconds);
    }
  }

  private hash(phone: string, scene: SmsScene, code: string): string {
    return createHmac("sha256", this.dependencies.pepper)
      .update(`${phone}:${scene}:${code}`)
      .digest("hex");
  }
}
