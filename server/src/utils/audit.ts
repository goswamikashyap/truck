import type { Request } from "express";
import { prisma } from "./db.js";

/** Writes an audit row for a financial or master-data change. companyId always comes from the token. */
export async function audit(
  req: Request,
  entity: string,
  entityId: string,
  action: "create" | "update" | "delete",
  oldValue?: unknown,
  newValue?: unknown
) {
  const companyId = req.companyId ?? req.user?.companyId;
  if (!companyId || !req.user) return;
  await prisma.auditLog.create({
    data: {
      companyId,
      userId: req.user.id,
      entity,
      entityId,
      action,
      oldValue: oldValue == null ? undefined : JSON.parse(JSON.stringify(oldValue)),
      newValue: newValue == null ? undefined : JSON.parse(JSON.stringify(newValue)),
    },
  });
}
