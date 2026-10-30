import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { getEnv } from "../utils/env.js";

export type Role = "PLATFORM_ADMIN" | "COMPANY_OWNER" | "MANAGER" | "ACCOUNTANT" | "DRIVER";

export interface AuthUser {
  id: string;
  companyId: string | null;
  role: Role;
  type?: "access" | "refresh";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Set by the tenant middleware from the token, never from client input. */
      companyId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(header.slice(7), getEnv().JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as AuthUser;
    if (payload.type !== "access") {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Role gate. Platform admins always pass. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "PLATFORM_ADMIN" || roles.includes(req.user.role)) return next();
    res.status(403).json({ error: "Forbidden" });
  };
}
