import { z } from "zod";

export const carSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  priceFrom: z.number().int().nonnegative(),
  rangeKm: z.number().int().nonnegative(),
  acceleration: z.number().nonnegative(),
  maxPowerPs: z.number().int().nonnegative(),
  topSpeed: z.number().int().nonnegative(),
  bodyType: z.string(),
  imageUrl: z.string(),
  gallery: z.array(z.string()),
  highlights: z.array(z.unknown()),
});

export const dealerInventorySchema = z.object({
  inventoryId: z.string(),
  carId: z.string(),
  carName: z.string(),
  carSlug: z.string(),
  totalQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  availableQuantity: z.number().int().nonnegative(),
});

export const dealerSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  province: z.string(),
  city: z.string(),
  address: z.string(),
  phone: z.string(),
  longitude: z.number().nullable(),
  latitude: z.number().nullable(),
  businessHours: z.string(),
  inventory: z.array(dealerInventorySchema),
});

export type Car = z.infer<typeof carSchema>;
export type Dealer = z.infer<typeof dealerSchema>;
export type DealerInventory = z.infer<typeof dealerInventorySchema>;
