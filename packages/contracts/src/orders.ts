import { z } from "zod";

import { phoneSchema } from "./auth.js";

export const createOrderRequestSchema = z.object({
  inventoryId: z.string().regex(/^\d+$/),
  contactName: z.string().trim().min(1).max(80),
  contactPhone: phoneSchema,
});

export const orderStatusSchema = z.enum([
  "pending_confirmation",
  "confirmed",
  "cancelled",
  "expired",
  "completed",
]);

export const orderSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  userId: z.string(),
  dealerId: z.string(),
  carId: z.string(),
  inventoryId: z.string(),
  amount: z.literal(0),
  status: orderStatusSchema,
  contactName: z.string(),
  contactPhone: phoneSchema,
  reservationExpiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type Order = z.infer<typeof orderSchema>;
