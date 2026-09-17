import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../middleware/error-handler.js";
import type { ContentRepository } from "../repositories/content.repository.js";

export function createContentRouter(repository: ContentRepository): Router {
  const router = Router();

  router.get("/:key", async (request, response) => {
    const key = z.string().regex(/^[a-z0-9._-]+$/).parse(request.params.key);
    const content = await repository.findPublished(key);
    if (!content) throw new HttpError(404, "CONTENT_NOT_FOUND", "内容不存在");
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    response.json(content);
  });

  return router;
}
