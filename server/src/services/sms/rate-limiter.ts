export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = this.now().getTime();
    const existing = this.entries.get(key);
    const entry =
      existing && existing.expiresAt > now
        ? existing
        : { count: 0, expiresAt: now + windowSeconds * 1000 };

    entry.count += 1;
    this.entries.set(key, entry);

    return {
      allowed: entry.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
    };
  }
}

const consumeScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

interface RedisEvalClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisEvalClient,
    private readonly ensureConnected: () => Promise<void> = async () => undefined,
  ) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    await this.ensureConnected();
    const result = (await this.client.eval(consumeScript, {
      keys: [`rate:${key}`],
      arguments: [windowSeconds.toString()],
    })) as [number, number];

    return {
      allowed: result[0] <= limit,
      retryAfterSeconds: Math.max(1, result[1]),
    };
  }
}
