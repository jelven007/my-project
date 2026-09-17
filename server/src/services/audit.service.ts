import type { Pool } from "mysql2/promise";

export type AuditResult = "success" | "failure" | "denied";

export interface AuditEntry {
  actorType: "user" | "admin" | "system";
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: AuditResult;
  ip?: string;
  userAgent?: string;
  metadata?: unknown;
}

export interface AuditRecorder {
  record(entry: AuditEntry): Promise<void>;
}

export class AuditService implements AuditRecorder {
  constructor(private readonly pool: Pool) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.pool.execute(
      `INSERT INTO audit_logs
       (actor_type, actor_id, action, resource_type, resource_id, result, ip, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorType,
        entry.actorId ?? null,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.result,
        entry.ip ?? null,
        entry.userAgent ?? null,
        entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      ],
    );
  }
}

export class InMemoryAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
