import { Router } from "express";
import { z } from "zod";

import type { DealersRepository } from "../repositories/dealers.repository.js";

const querySchema = z.object({
  city: z.string().trim().min(1).max(50).optional(),
  carId: z.string().regex(/^\d+$/).optional(),
  availableOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export function createDealersRouter(repository: DealersRepository): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const filters = querySchema.parse(request.query);
    response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    response.json({ items: await repository.listActive(filters) });
  });

  return router;
}
