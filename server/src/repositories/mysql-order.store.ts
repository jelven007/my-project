import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import type { Order } from "@xiaomi-car/contracts";

import {
  OrderError,
  type OrderStore,
  type ReserveOrderInput,
} from "../services/order.service.js";

interface InventoryRow extends RowDataPacket {
  id: number;
  dealer_id: number;
  car_id: number;
  total_qty: number;
  reserved_qty: number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  order_no: string;
  user_id: number;
  dealer_id: number;
  car_id: number;
  inventory_id: number;
  amount: number;
  status: Order["status"];
  contact_name: string;
  contact_phone: string;
  reservation_expires_at: Date;
  created_at: Date;
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id.toString(),
    orderNo: row.order_no,
    userId: row.user_id.toString(),
    dealerId: row.dealer_id.toString(),
    carId: row.car_id.toString(),
    inventoryId: row.inventory_id.toString(),
    amount: 0,
    status: row.status,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    reservationExpiresAt: row.reservation_expires_at,
    createdAt: row.created_at,
  };
}

const orderColumns = `
  id, order_no, user_id, dealer_id, car_id, inventory_id, amount, status,
  contact_name, contact_phone, reservation_expires_at, created_at
`;

export class MysqlOrderStore implements OrderStore {
  constructor(private readonly pool: Pool) {}

  async reserve(input: ReserveOrderInput): Promise<Order> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockUser(connection, input.userId);

      const [idempotencyRows] = await connection.execute<RowDataPacket[]>(
        `SELECT resource_id, request_hash
         FROM idempotency_keys
         WHERE user_id = ? AND scope = 'order.create' AND idempotency_key = ?
         FOR UPDATE`,
        [input.userId, input.idempotencyKey],
      );
      const previous = idempotencyRows[0];
      if (previous) {
        if (previous.request_hash !== input.requestHash) {
          throw new OrderError("IDEMPOTENCY_CONFLICT");
        }
        const order = await this.findOrder(connection, previous.resource_id);
        await connection.commit();
        if (!order) throw new OrderError("ORDER_NOT_FOUND");
        return order;
      }

      const [inventoryRows] = await connection.execute<InventoryRow[]>(
        `SELECT i.id, i.dealer_id, i.car_id, i.total_qty, i.reserved_qty
         FROM dealer_inventory i
         JOIN dealers d ON d.id = i.dealer_id
         JOIN cars c ON c.id = i.car_id
         WHERE i.id = ? AND i.status = 'active' AND d.status = 'active'
           AND c.status = 'published'
         FOR UPDATE`,
        [input.inventoryId],
      );
      const inventory = inventoryRows[0];
      if (!inventory || inventory.total_qty <= inventory.reserved_qty) {
        throw new OrderError("INVENTORY_UNAVAILABLE");
      }

      const [activeOrders] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM orders
         WHERE user_id = ? AND car_id = ?
           AND status IN ('pending_confirmation', 'confirmed')
         LIMIT 1`,
        [input.userId, inventory.car_id],
      );
      if (activeOrders.length > 0) throw new OrderError("ACTIVE_ORDER_EXISTS");

      const [orderResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO orders
          (order_no, user_id, dealer_id, car_id, inventory_id, amount, status,
           contact_name, contact_phone, reservation_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'pending_confirmation', ?, ?, ?, ?)`,
        [
          input.orderNo,
          input.userId,
          inventory.dealer_id,
          inventory.car_id,
          inventory.id,
          input.contactName,
          input.contactPhone,
          input.reservationExpiresAt,
          input.now,
        ],
      );
      await connection.execute(
        `UPDATE dealer_inventory
         SET reserved_qty = reserved_qty + 1, version = version + 1
         WHERE id = ?`,
        [inventory.id],
      );
      await connection.execute(
        `INSERT INTO idempotency_keys
          (user_id, scope, idempotency_key, resource_id, request_hash, expires_at)
         VALUES (?, 'order.create', ?, ?, ?, ?)`,
        [
          input.userId,
          input.idempotencyKey,
          orderResult.insertId,
          input.requestHash,
          new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
        ],
      );
      const order = await this.findOrder(connection, orderResult.insertId);
      await connection.commit();
      if (!order) throw new OrderError("ORDER_NOT_FOUND");
      return order;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async cancel(userId: string, orderId: string, now: Date): Promise<Order> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<OrderRow[]>(
        `SELECT ${orderColumns} FROM orders
         WHERE id = ? AND user_id = ? FOR UPDATE`,
        [orderId, userId],
      );
      const row = rows[0];
      if (!row) throw new OrderError("ORDER_NOT_FOUND");
      if (!["pending_confirmation", "confirmed"].includes(row.status)) {
        throw new OrderError("ORDER_TRANSITION_INVALID");
      }
      await connection.execute(
        "UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?",
        [now, orderId],
      );
      await connection.execute(
        `UPDATE dealer_inventory
         SET reserved_qty = reserved_qty - 1, version = version + 1
         WHERE id = ? AND reserved_qty > 0`,
        [row.inventory_id],
      );
      row.status = "cancelled";
      await connection.commit();
      return mapOrder(row);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async expireDue(now: Date, limit: number): Promise<number> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<OrderRow[]>(
        `SELECT ${orderColumns} FROM orders
         WHERE status = 'pending_confirmation' AND reservation_expires_at <= ?
         ORDER BY reservation_expires_at ASC
         LIMIT ${Math.max(1, Math.min(500, limit))}
         FOR UPDATE SKIP LOCKED`,
        [now],
      );
      for (const row of rows) {
        await connection.execute(
          "UPDATE orders SET status = 'expired', updated_at = ? WHERE id = ?",
          [now, row.id],
        );
        await connection.execute(
          `UPDATE dealer_inventory
           SET reserved_qty = reserved_qty - 1, version = version + 1
           WHERE id = ? AND reserved_qty > 0`,
          [row.inventory_id],
        );
      }
      await connection.commit();
      return rows.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listByUser(userId: string): Promise<Order[]> {
    const [rows] = await this.pool.execute<OrderRow[]>(
      `SELECT ${orderColumns} FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC`,
      [userId],
    );
    return rows.map(mapOrder);
  }

  private async lockUser(connection: PoolConnection, userId: string): Promise<void> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE id = ? AND status = 1 FOR UPDATE",
      [userId],
    );
    if (rows.length === 0) throw new OrderError("ORDER_NOT_FOUND");
  }

  private async findOrder(
    connection: PoolConnection,
    orderId: string | number,
  ): Promise<Order | undefined> {
    const [rows] = await connection.execute<OrderRow[]>(
      `SELECT ${orderColumns} FROM orders WHERE id = ? LIMIT 1`,
      [orderId],
    );
    return rows[0] ? mapOrder(rows[0]) : undefined;
  }
}
