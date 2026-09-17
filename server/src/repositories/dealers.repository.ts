import type { Pool, RowDataPacket } from "mysql2/promise";

import { dealerSchema, type Dealer } from "@xiaomi-car/contracts";

export interface DealerFilters {
  city?: string;
  carId?: string;
  availableOnly?: boolean;
}

export interface DealersRepository {
  listActive(filters: DealerFilters): Promise<Dealer[]>;
}

interface DealerInventoryRow extends RowDataPacket {
  dealer_id: number;
  code: string;
  dealer_name: string;
  province: string;
  city: string;
  address: string;
  phone: string;
  longitude: number | null;
  latitude: number | null;
  business_hours: string;
  inventory_id: number;
  car_id: number;
  car_name: string;
  car_slug: string;
  total_qty: number;
  reserved_qty: number;
}

export class MysqlDealersRepository implements DealersRepository {
  constructor(private readonly pool: Pool) {}

  async listActive(filters: DealerFilters): Promise<Dealer[]> {
    const conditions = ["d.status = 'active'", "i.status = 'active'", "c.status = 'published'"];
    const values: Array<string | number> = [];
    if (filters.city) {
      conditions.push("d.city = ?");
      values.push(filters.city);
    }
    if (filters.carId) {
      conditions.push("c.id = ?");
      values.push(filters.carId);
    }
    if (filters.availableOnly) conditions.push("i.total_qty > i.reserved_qty");

    const [rows] = await this.pool.execute<DealerInventoryRow[]>(
      `SELECT d.id AS dealer_id, d.code, d.name AS dealer_name, d.province, d.city,
              d.address, d.phone, d.longitude, d.latitude, d.business_hours,
              i.id AS inventory_id, i.car_id, c.name AS car_name, c.slug AS car_slug,
              i.total_qty, i.reserved_qty
       FROM dealers d
       JOIN dealer_inventory i ON i.dealer_id = d.id
       JOIN cars c ON c.id = i.car_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY d.city ASC, d.name ASC, c.sort_order ASC, c.id ASC`,
      values,
    );

    const dealers = new Map<string, Dealer>();
    for (const row of rows) {
      const id = row.dealer_id.toString();
      const inventory = {
        inventoryId: row.inventory_id.toString(),
        carId: row.car_id.toString(),
        carName: row.car_name,
        carSlug: row.car_slug,
        totalQuantity: row.total_qty,
        reservedQuantity: row.reserved_qty,
        availableQuantity: row.total_qty - row.reserved_qty,
      };
      const existing = dealers.get(id);
      if (existing) {
        existing.inventory.push(inventory);
      } else {
        dealers.set(
          id,
          dealerSchema.parse({
            id,
            code: row.code,
            name: row.dealer_name,
            province: row.province,
            city: row.city,
            address: row.address,
            phone: row.phone,
            longitude: row.longitude,
            latitude: row.latitude,
            businessHours: row.business_hours,
            inventory: [inventory],
          }),
        );
      }
    }
    return [...dealers.values()];
  }
}
