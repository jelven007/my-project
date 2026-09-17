import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const bodyParserError =
    error !== null &&
    typeof error === "object" &&
    "type" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number; type: string })
      : undefined;

  const knownError =
    error instanceof HttpError
      ? error
      : error instanceof ZodError
        ? new HttpError(400, "VALIDATION_ERROR", "请求参数不正确", error.issues)
        : bodyParserError?.status === 413
          ? new HttpError(413, "PAYLOAD_TOO_LARGE", "请求体超过大小限制")
          : bodyParserError?.type === "entity.parse.failed"
            ? new HttpError(400, "INVALID_JSON", "请求体不是合法的 JSON")
            : new HttpError(500, "INTERNAL_ERROR", "服务器内部错误");

  res.status(knownError.status).json({
    code: knownError.code,
    message: knownError.message,
    requestId: res.locals.requestId,
    ...(knownError.details === undefined ? {} : { details: knownError.details }),
  });
};
