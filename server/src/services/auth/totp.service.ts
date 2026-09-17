import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type TotpErrorCode = "MFA_CODE_INVALID" | "MFA_CODE_REPLAYED";

export class TotpError extends Error {
  constructor(public readonly code: TotpErrorCode) {
    super(code);
  }
}

export interface TotpReplayStore {
  consume(adminId: string, counter: number, ttlSeconds: number): Promise<boolean>;
}

export class InMemoryTotpReplayStore implements TotpReplayStore {
  private readonly consumed = new Set<string>();

  async consume(adminId: string, counter: number): Promise<boolean> {
    const key = `${adminId}:${counter}`;
    if (this.consumed.has(key)) return false;
    this.consumed.add(key);
    return true;
  }
}

interface RedisSetClient {
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null>;
}

export class RedisTotpReplayStore implements TotpReplayStore {
  constructor(
    private readonly client: RedisSetClient,
    private readonly ensureConnected: () => Promise<void>,
  ) {}

  async consume(adminId: string, counter: number, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnected();
    return (
      (await this.client.set(`admin:mfa:used:${adminId}:${counter}`, "1", {
        NX: true,
        EX: ttlSeconds,
      })) === "OK"
    );
  }
}

interface TotpServiceOptions {
  encryptionKey: string;
  replayStore?: TotpReplayStore;
  now?: () => Date;
  allowedDriftWindows?: number;
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const periodSeconds = 30;

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/u, "").replace(/\s+/gu, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export class TotpService {
  private readonly encryptionKey: Buffer;
  private readonly replayStore: TotpReplayStore;
  private readonly now: () => Date;
  private readonly allowedDriftWindows: number;

  constructor(options: TotpServiceOptions) {
    if (options.encryptionKey.length < 32) {
      throw new Error("Admin MFA encryption key must contain at least 32 characters");
    }
    this.encryptionKey = createHash("sha256").update(options.encryptionKey).digest();
    this.replayStore = options.replayStore ?? new InMemoryTotpReplayStore();
    this.now = options.now ?? (() => new Date());
    this.allowedDriftWindows = options.allowedDriftWindows ?? 1;
  }

  encryptSecret(secret: string): Buffer {
    decodeBase32(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  decryptSecret(encrypted: Buffer): string {
    if (encrypted.length < 29) throw new Error("Invalid encrypted TOTP secret");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      encrypted.subarray(0, 12),
    );
    decipher.setAuthTag(encrypted.subarray(12, 28));
    return Buffer.concat([
      decipher.update(encrypted.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }

  generateCode(secret: string, date = this.now()): string {
    const counter = Math.floor(date.getTime() / 1000 / periodSeconds);
    return this.generateForCounter(secret, counter);
  }

  async verifyAndConsume(
    adminId: string,
    encryptedSecret: Buffer,
    suppliedCode: string,
  ): Promise<void> {
    const secret = this.decryptSecret(encryptedSecret);
    const currentCounter = Math.floor(this.now().getTime() / 1000 / periodSeconds);
    let matchedCounter: number | undefined;

    for (
      let counter = currentCounter - this.allowedDriftWindows;
      counter <= currentCounter + this.allowedDriftWindows;
      counter += 1
    ) {
      const expected = Buffer.from(this.generateForCounter(secret, counter));
      const supplied = Buffer.from(suppliedCode);
      if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
        matchedCounter = counter;
        break;
      }
    }

    if (matchedCounter === undefined) throw new TotpError("MFA_CODE_INVALID");
    if (!(await this.replayStore.consume(adminId, matchedCounter, 90))) {
      throw new TotpError("MFA_CODE_REPLAYED");
    }
  }

  private generateForCounter(secret: string, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
    const offset = (digest.at(-1) ?? 0) & 0x0f;
    const binary =
      ((digest[offset] ?? 0) & 0x7f) * 0x1000000 +
      (digest[offset + 1] ?? 0) * 0x10000 +
      (digest[offset + 2] ?? 0) * 0x100 +
      (digest[offset + 3] ?? 0);
    return (binary % 1_000_000).toString().padStart(6, "0");
  }
}
