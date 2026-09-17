import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../middleware/error-handler.js";
import type { CarsRepository } from "../repositories/cars.repository.js";

const querySchema = z.object({
  bodyType: z.string().trim().min(1).max(50).optional(),
});

export function createCarsRouter(repository: CarsRepository): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const filters = querySchema.parse(request.query);
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    response.json({ items: await repository.listPublished(filters) });
  });

  router.get("/:slug", async (request, response) => {
    const slug = z.string().regex(/^[a-z0-9-]+$/).parse(request.params.slug);
    const car = await repository.findPublishedBySlug(slug);
    if (!car) throw new HttpError(404, "CAR_NOT_FOUND", "车型不存在");
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    response.json(car);
  });

  return router;
}
