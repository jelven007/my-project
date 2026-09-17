import { EventEmitter } from "node:events";

export interface DashboardSnapshot {
  totalUsers: number;
  todayUsers: number;
  totalOrders: number;
  todayOrders: number;
  pendingTestDrives: number;
  updatedAt: string;
}

export type DashboardSnapshotProvider = () => Promise<DashboardSnapshot>;

export class DashboardEvents {
  private readonly emitter = new EventEmitter();
  private timer?: NodeJS.Timeout;
  private previous?: string;

  constructor(
    private readonly provider: DashboardSnapshotProvider,
    private readonly intervalMs = 5000,
  ) {
    this.emitter.setMaxListeners(200);
  }

  async snapshot(): Promise<DashboardSnapshot> {
    return this.provider();
  }

  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void {
    this.emitter.on("snapshot", listener);
    this.start();
    return () => {
      this.emitter.off("snapshot", listener);
      if (this.emitter.listenerCount("snapshot") === 0) this.stop();
    };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    try {
      const snapshot = await this.provider();
      const serialized = JSON.stringify(snapshot);
      if (serialized !== this.previous) {
        this.previous = serialized;
        this.emitter.emit("snapshot", snapshot);
      }
    } catch {
      // Readiness monitoring reports dependency outages; SSE retries on its next interval.
    }
  }
}
