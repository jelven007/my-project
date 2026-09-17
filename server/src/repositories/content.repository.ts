import type { Pool, RowDataPacket } from "mysql2/promise";

export interface PublishedContent {
  key: string;
  type: string;
  version: number;
  payload: unknown;
  publishedAt: Date;
}

export interface ContentRepository {
  findPublished(key: string): Promise<PublishedContent | undefined>;
}

interface ContentRow extends RowDataPacket {
  content_key: string;
  content_type: string;
  version: number;
  published_payload: unknown;
  published_at: Date;
}

export class MysqlContentRepository implements ContentRepository {
  constructor(private readonly pool: Pool) {}

  async findPublished(key: string): Promise<PublishedContent | undefined> {
    const [rows] = await this.pool.execute<ContentRow[]>(
      `SELECT content_key, content_type, version, published_payload, published_at
       FROM content_entries
       WHERE content_key = ? AND status = 'published'
         AND published_payload IS NOT NULL AND published_at IS NOT NULL
       LIMIT 1`,
      [key],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      key: row.content_key,
      type: row.content_type,
      version: row.version,
      payload:
        typeof row.published_payload === "string"
          ? (JSON.parse(row.published_payload) as unknown)
          : row.published_payload,
      publishedAt: row.published_at,
    };
  }
}
