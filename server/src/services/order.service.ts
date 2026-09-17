import { createHash, randomBytes } from "node:crypto";

import type { CreateOrderRequest, Order } from "@xiaomi-car/contracts";

export interface ReserveOrderInput extends CreateOrderRequest {
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  orderNo: string;
  now: Date;
  reservationExpiresAt: Date;
}

export interface OrderStore {
  reserve(input: ReserveOrderInput): Promise<Order>;
  cancel(userId: string, orderId: string, now: Date): Promise<Order>;
  expireDue(now: Date, limit: number): Promise<number>;
  listByUser(userId: string): Promise<Order[]>;
}

export type OrderErrorCode =
  | "INVENTORY_UNAVAILABLE"
  | "ACTIVE_ORDER_EXISTS"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_NOT_FOUND"
  | "ORDER_TRANSITION_INVALID";

export class OrderError extends Error {
  constructor(public readonly code: OrderErrorCode) {
    super(code);
  }
}

interface InventoryRecord {
  id: string;
  dealerId: string;
  carId: string;
  totalQuantity: number;
  reservedQuantity: number;
  active: boolean;
}

interface IdempotencyRecord {
  requestHash: string;
  orderId: string;
}

export class InMemoryOrderStore implements OrderStore {
  readonly orders: Order[] = [];
  readonly inventory = new Map<string, InventoryRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  seedInventory(record: InventoryRecord): void {
    this.inventory.set(record.id, { ...record });
  }

  async reserve(input: ReserveOrderInput): Promise<Order> {
    const idempotencyId = `${input.userId}:${input.idempotencyKey}`;
    const previous = this.idempotency.get(idempotencyId);
    if (previous) {
      if (previous.requestHash !== input.requestHash) {
        throw new OrderError("IDEMPOTENCY_CONFLICT");
      }
      return this.orders.find((order) => order.id === previous.orderId)!;
    }

    const inventory = this.inventory.get(input.inventoryId);
    if (!inventory?.active || inventory.totalQuantity <= inventory.reservedQuantity) {
      throw new OrderError("INVENTORY_UNAVAILABLE");
    }
    if (
      this.orders.some(
        (order) =>
          order.userId === input.userId &&
          order.carId === inventory.carId &&
          ["pending_confirmation", "confirmed"].includes(order.status),
      )
    ) {
      throw new OrderError("ACTIVE_ORDER_EXISTS");
    }

    inventory.reservedQuantity += 1;
    const order: Order = {
      id: (this.orders.length + 1).toString(),
      orderNo: input.orderNo,
      userId: input.userId,
      dealerId: inventory.dealerId,
      carId: inventory.carId,
      inventoryId: inventory.id,
      amount: 0,
      status: "pending_confirmation",
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      reservationExpiresAt: input.reservationExpiresAt,
      createdAt: input.now,
    };
    this.orders.push(order);
    this.idempotency.set(idempotencyId, {
      requestHash: input.requestHash,
      orderId: order.id,
    });
    return order;
  }

  async cancel(userId: string, orderId: string, _now: Date): Promise<Order> {
    const order = this.orders.find(
      (candidate) => candidate.id === orderId && candidate.userId === userId,
    );
    if (!order) throw new OrderError("ORDER_NOT_FOUND");
    if (!["pending_confirmation", "confirmed"].includes(order.status)) {
      throw new OrderError("ORDER_TRANSITION_INVALID");
    }
    order.status = "cancelled";
    const inventory = this.inventory.get(order.inventoryId);
    if (inventory) inventory.reservedQuantity -= 1;
    return order;
  }

  async expireDue(now: Date, limit: number): Promise<number> {
    const due = this.orders
      .filter(
        (order) =>
          order.status === "pending_confirmation" &&
          order.reservationExpiresAt.getTime() <= now.getTime(),
      )
      .slice(0, limit);
    for (const order of due) {
      order.status = "expired";
      const inventory = this.inventory.get(order.inventoryId);
      if (inventory) inventory.reservedQuantity -= 1;
    }
    return due.length;
  }

  async listByUser(userId: string): Promise<Order[]> {
    return this.orders.filter((order) => order.userId === userId);
  }
}

interface OrderServiceDependencies {
  store: OrderStore;
  reservationHours?: number;
  now?: () => Date;
  generateOrderNo?: () => string;
}

export class OrderService {
  private readonly now: () => Date;
  private readonly reservationHours: number;
  private readonly generateOrderNo: () => string;

  constructor(private readonly dependencies: OrderServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.reservationHours = dependencies.reservationHours ?? 48;
    this.generateOrderNo =
      dependencies.generateOrderNo ??
      (() => `XC${Date.now().toString(36).toUpperCase()}${randomBytes(8).toString("hex").toUpperCase()}`);
  }

  async create(
    userId: string,
    input: CreateOrderRequest,
    idempotencyKey: string,
  ): Promise<Order> {
    const now = this.now();
    return this.dependencies.store.reserve({
      ...input,
      userId,
      idempotencyKey,
      requestHash: createHash("sha256")
        .update(
          JSON.stringify({
            inventoryId: input.inventoryId,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
          }),
        )
        .digest("hex"),
      orderNo: this.generateOrderNo(),
      now,
      reservationExpiresAt: new Date(
        now.getTime() + this.reservationHours * 60 * 60 * 1000,
      ),
    });
  }

  async cancel(userId: string, orderId: string): Promise<Order> {
    return this.dependencies.store.cancel(userId, orderId, this.now());
  }

  async expireDue(limit = 100): Promise<number> {
    return this.dependencies.store.expireDue(this.now(), limit);
  }

  async listForUser(userId: string): Promise<Order[]> {
    return this.dependencies.store.listByUser(userId);
  }
}
