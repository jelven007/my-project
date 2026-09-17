export type OrderStatus =
  | "pending_confirmation"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "completed";

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled", "expired"],
  confirmed: ["cancelled", "completed"],
  cancelled: [],
  expired: [],
  completed: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}
