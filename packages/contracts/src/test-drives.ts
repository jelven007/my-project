import { z } from "zod";

import { phoneSchema } from "./auth.js";

export const createTestDriveRequestSchema = z.object({
  carId: z.string().regex(/^\d+$/),
  dealerId: z.string().regex(/^\d+$/),
  contactName: z.string().trim().min(1).max(80),
  contactPhone: phoneSchema,
  preferredDate: z.iso.date(),
  notes: z.string().trim().max(500).optional(),
});

export const testDriveStatusSchema = z.enum([
  "submitted",
  "contacted",
  "scheduled",
  "completed",
  "cancelled",
]);

export const testDriveSchema = z.object({
  id: z.string(),
  userId: z.string(),
  carId: z.string(),
  dealerId: z.string(),
  contactName: z.string(),
  contactPhone: phoneSchema,
  preferredDate: z.string(),
  status: testDriveStatusSchema,
  notes: z.string().optional(),
  createdAt: z.coerce.date(),
});

export type CreateTestDriveRequest = z.infer<typeof createTestDriveRequestSchema>;
export type TestDrive = z.infer<typeof testDriveSchema>;
