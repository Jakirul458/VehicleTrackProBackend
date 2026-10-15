import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../utils/http.js";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "Endpoint not found."));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    res.status(409).json({ success: false, message: "An account or record with those details already exists." });
    return;
  }
  if (typeof error === "object" && error !== null && "name" in error && error.name === "ValidationError") {
    res.status(422).json({ success: false, message: "Some submitted fields are invalid." });
    return;
  }
  console.error(error);
  res.status(500).json({ success: false, message: "An unexpected server error occurred." });
};
