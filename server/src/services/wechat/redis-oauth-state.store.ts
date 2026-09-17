import type { OauthStateStore } from "./wechat-auth.service.js";

interface RedisStateClient {
  set(
    key: string,
    value: string,
    options: { expiration: { type: "EX"; value: number }; condition: "NX" },
  ): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
}

export class RedisOauthStateStore implements OauthStateStore {
  constructor(
    private readonly client: RedisStateClient,
    private readonly ensureConnected: () => Promise<void>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(nonce: string, expiresAt: Date): Promise<void> {
    await this.ensureConnected();
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - this.now().getTime()) / 1000));
    const result = await this.client.set(`oauth:wechat:${nonce}`, "1", {
      expiration: { type: "EX", value: ttl },
      condition: "NX",
    });
    if (result !== "OK") throw new Error("Unable to reserve OAuth state");
  }

  async consume(nonce: string): Promise<boolean> {
    await this.ensureConnected();
    return (await this.client.getDel(`oauth:wechat:${nonce}`)) === "1";
  }
}
