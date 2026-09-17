const secretKeyPattern =
  /(password|passwd|secret|token|code|pepper|authorization|cookie|mfa|otp)/i;
const phonePattern = /(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g;

function maskPhonesInString(value: string): string {
  return value.replace(phonePattern, (_match, prefix: string, suffix: string) => {
    return `${prefix}****${suffix}`;
  });
}

/**
 * Recursively redacts sensitive values before anything reaches logs. Known
 * secret field names are removed entirely; free-text phone numbers are masked
 * so they never leak through messages or nested payloads.
 */
export function redact(value: unknown): Record<string, unknown> {
  return redactValue(value) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return maskPhonesInString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = secretKeyPattern.test(key) ? "[REDACTED]" : redactValue(entry);
    }
    return output;
  }
  return value;
}

export interface RequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

interface RouteStat {
  count: number;
  errors: number;
  durations: number[];
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index] ?? 0;
}

export interface MetricsSnapshot {
  totalRequests: number;
  errorRequests: number;
  routes: Record<string, { count: number; errors: number; p95Ms: number }>;
}

/**
 * In-process metrics registry. It keeps a bounded latency window per route so a
 * long-running API process cannot grow unbounded, and renders a Prometheus-style
 * exposition for scraping.
 */
export class MetricsRegistry {
  private total = 0;
  private errors = 0;
  private readonly routes = new Map<string, RouteStat>();
  private readonly maxSamples = 1000;

  observe(observation: RequestObservation): void {
    this.total += 1;
    if (observation.statusCode >= 500) this.errors += 1;
    const key = `${observation.method} ${observation.route}`;
    const stat = this.routes.get(key) ?? { count: 0, errors: 0, durations: [] };
    stat.count += 1;
    if (observation.statusCode >= 500) stat.errors += 1;
    stat.durations.push(observation.durationMs);
    if (stat.durations.length > this.maxSamples) stat.durations.shift();
    this.routes.set(key, stat);
  }

  snapshot(): MetricsSnapshot {
    const routes: MetricsSnapshot["routes"] = {};
    for (const [key, stat] of this.routes) {
      const sorted = [...stat.durations].sort((a, b) => a - b);
      routes[key] = { count: stat.count, errors: stat.errors, p95Ms: percentile(sorted, 0.95) };
    }
    return { totalRequests: this.total, errorRequests: this.errors, routes };
  }

  render(): string {
    const lines = [
      "# HELP http_requests_total Total HTTP requests observed",
      "# TYPE http_requests_total counter",
      `http_requests_total ${this.total}`,
      "# HELP http_requests_errors_total Total HTTP 5xx responses",
      "# TYPE http_requests_errors_total counter",
      `http_requests_errors_total ${this.errors}`,
    ];
    const snapshot = this.snapshot();
    for (const [key, stat] of Object.entries(snapshot.routes)) {
      const [method, route] = key.split(" ");
      const labels = `method="${method}",route="${route}"`;
      lines.push(`http_request_p95_ms{${labels}} ${stat.p95Ms}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

export const metricsRegistry = new MetricsRegistry();
