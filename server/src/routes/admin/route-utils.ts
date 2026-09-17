import type { Request, Response } from "express";

import type { AuthenticatedAdmin } from "../../middleware/require-permission.js";

export function currentAdmin(response: Response): AuthenticatedAdmin {
  return response.locals.admin as AuthenticatedAdmin;
}

export function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string") throw new Error(`Missing route parameter: ${name}`);
  return value;
}

export function auditContext(request: Request) {
  return {
    ip: request.ip,
    userAgent: request.get("user-agent"),
  };
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return "****";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function pagination(query: Request["query"]): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
