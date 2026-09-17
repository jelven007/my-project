import type { RequestHandler } from "express";
import helmet from "helmet";

/**
 * Strict security headers shared by both API surfaces. The API returns JSON
 * only, so a restrictive CSP that forbids scripts and framing is safe and adds
 * defense in depth against content-type confusion and clickjacking.
 */
export function securityHeaders(): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
    (_request, response, next) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
      next();
    },
  ];
}
