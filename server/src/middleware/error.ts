import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/** Central error handler: validation errors are 400, unique clashes are 409, the rest 500. */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ error: "A record with these values already exists" });
  }
  if (err?.code === "P2003") {
    return res.status(409).json({ error: "This record is used by trips, so it cannot be deleted" });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.status ? err.message : "Internal error" });
}
