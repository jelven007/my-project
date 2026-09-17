import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const value = incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();

  res.locals.requestId = value;
  res.setHeader("x-request-id", value);
  next();
}
