import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../utils/db.js";
import { audit } from "../utils/audit.js";
import { tenant } from "../middleware/tenant.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const cid = (req: Request) => req.companyId as string;

const truckSchema = z.object({
  regNo: z.string().trim().min(4).transform((s) => s.toUpperCase()),
  type: z.string().trim().min(1),
  capacityTons: z.coerce.number().positive().optional(),
  insuranceExp: z.coerce.date().optional(),
  permitExp: z.coerce.date().optional(),
  fitnessExp: z.coerce.date().optional(),
  pucExp: z.coerce.date().optional(),
});

// Master data is for office staff. Drivers must not be able to list other drivers' salary and
// phone numbers, or the customer list.
const readRoles: Parameters<typeof requireRole> = ["COMPANY_OWNER", "MANAGER", "ACCOUNTANT"];

const partySchema = z.object({
  name: z.string().trim().min(2),
  gstNo: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  creditDays: z.coerce.number().int().nonnegative().default(0),
});

const driverSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(6),
  licenceNo: z.string().trim().optional(),
  licenceExp: z.coerce.date().optional(),
  salaryType: z.enum(["per_trip", "monthly"]).optional(),
  baseSalary: z.coerce.number().nonnegative().optional(),
});

const routeSchema = z.object({
  origin: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  distanceKm: z.coerce.number().positive(),
  notes: z.string().trim().optional(),
});

/**
 * Builds list / create / update endpoints for one master table.
 * Every query filters on the company from the token.
 */
function master(
  path: string,
  model: "truck" | "party" | "driver" | "route",
  schema: z.ZodTypeAny,
  orderBy: Record<string, "asc" | "desc">,
  writeRoles: Parameters<typeof requireRole>
) {
  const db = prisma[model] as any;

  router.get(`/${path}`, tenant, requireRole(...readRoles), async (req, res, next) => {
    try {
      res.json(await db.findMany({ where: { companyId: cid(req) }, orderBy }));
    } catch (e) {
      next(e);
    }
  });

  router.post(`/${path}`, tenant, requireRole(...writeRoles), async (req, res, next) => {
    try {
      const data = schema.parse(req.body);
      const row = await db.create({ data: { ...data, companyId: cid(req) } });
      await audit(req, model, row.id, "create", null, row);
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  router.put(`/${path}/:id`, tenant, requireRole(...writeRoles), async (req, res, next) => {
    try {
      const data = (schema as z.ZodObject<any>).partial().parse(req.body);
      const existing = await db.findFirst({ where: { id: req.params.id, companyId: cid(req) } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      const row = await db.update({ where: { id: existing.id }, data });
      await audit(req, model, row.id, "update", existing, row);
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  router.delete(`/${path}/:id`, tenant, requireRole(...writeRoles), async (req, res, next) => {
    try {
      const existing = await db.findFirst({ where: { id: req.params.id, companyId: cid(req) } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      // A foreign-key error (P2003) means trips still use this record; the error handler turns it into a 409.
      await db.delete({ where: { id: existing.id } });
      await audit(req, model, existing.id, "delete", existing, null);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}

master("trucks", "truck", truckSchema, { regNo: "asc" }, ["COMPANY_OWNER", "MANAGER"]);
master("parties", "party", partySchema, { name: "asc" }, ["COMPANY_OWNER", "MANAGER", "ACCOUNTANT"]);
master("drivers", "driver", driverSchema, { name: "asc" }, ["COMPANY_OWNER", "MANAGER"]);
master("routes", "route", routeSchema, { origin: "asc" }, ["COMPANY_OWNER", "MANAGER"]);

export default router;
