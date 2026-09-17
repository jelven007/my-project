import type { Pool, RowDataPacket } from "mysql2/promise";

import { carSchema, type Car } from "@xiaomi-car/contracts";

export interface CarsRepository {
  listPublished(filters: { bodyType?: string }): Promise<Car[]>;
  findPublishedBySlug(slug: string): Promise<Car | undefined>;
}

interface CarRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_from: number;
  range_km: number;
  acceleration: number;
  max_power_ps: number;
  top_speed: number;
  body_type: string;
  image_url: string;
  gallery: unknown;
  highlights: unknown;
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function mapCar(row: CarRow): Car {
  return carSchema.parse({
    id: row.id.toString(),
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    priceFrom: row.price_from,
    rangeKm: row.range_km,
    acceleration: row.acceleration,
    maxPowerPs: row.max_power_ps,
    topSpeed: row.top_speed,
    bodyType: row.body_type,
    imageUrl: row.image_url,
    gallery: jsonArray(row.gallery),
    highlights: jsonArray(row.highlights),
  });
}

const selectPublishedCars = `
  SELECT id, slug, name, tagline, description, price_from, range_km, acceleration,
         max_power_ps, top_speed, body_type, image_url, gallery, highlights
  FROM cars
  WHERE status = 'published' AND published_at IS NOT NULL
`;

export class MysqlCarsRepository implements CarsRepository {
  constructor(private readonly pool: Pool) {}

  async listPublished(filters: { bodyType?: string }): Promise<Car[]> {
    const where = filters.bodyType ? " AND body_type = ?" : "";
    const [rows] = await this.pool.execute<CarRow[]>(
      `${selectPublishedCars}${where} ORDER BY sort_order ASC, id ASC`,
      filters.bodyType ? [filters.bodyType] : [],
    );
    return rows.map(mapCar);
  }

  async findPublishedBySlug(slug: string): Promise<Car | undefined> {
    const [rows] = await this.pool.execute<CarRow[]>(
      `${selectPublishedCars} AND slug = ? LIMIT 1`,
      [slug],
    );
    return rows[0] ? mapCar(rows[0]) : undefined;
  }
}
