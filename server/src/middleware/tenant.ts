import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth.js";

/**
 * Tenant middleware: the company comes from the logged-in user's token,
 * NEVER from a client-supplied body or query parameter. It sets req.companyId,
 * and every query in the routes filters on it.
 */
export function tenant(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.companyId) return res.status(403).json({ error: "No company context" });
    req.companyId = req.user.companyId;
    next();
  });
}
