import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../utils/db.js";
import { audit } from "../utils/audit.js";
import { tenant } from "../middleware/tenant.js";
import { requireRole } from "../middleware/auth.js";
import { nextTripNo, tripProfit, canTransition, expenseInr, type TripStatus } from "../services/tripService.js";
import { CATEGORIES, expenseSchema, tripSchema, tripUpdateSchema } from "../services/validation.js";

const router = Router();
const cid = (req: Request) => req.companyId as string;
const isOffice = (req: Request) => req.user!.role !== "DRIVER";

/** The driver record linked to the logged-in driver user. */
async function driverIdFor(req: Request) {
  const d = await prisma.driver.findFirst({
    where: { userId: req.user!.id, companyId: cid(req) },
    select: { id: true },
  });
  return d?.id ?? null;
}

/** Drivers never see the freight amount. */
function forRole<T extends { freightAmount?: unknown }>(req: Request, trip: T) {
  if (isOffice(req)) return trip;
  const { freightAmount: _freight, ...rest } = trip;
  return rest;
}

const tripInclude = { truck: true, driver: true, party: true, route: true } as const;

// ---------------------------------------------------------------- trips

router.get("/trips", tenant, async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const validStatus = ["PLANNED", "RUNNING", "COMPLETED", "CLOSED"].includes(status ?? "")
      ? (status as TripStatus)
      : undefined;
    const where: any = { companyId: cid(req), ...(validStatus ? { status: validStatus } : {}) };
    if (!isOffice(req)) {
      const driverId = await driverIdFor(req);
      if (!driverId) return res.json([]);
      where.driverId = driverId;
    }
    const trips = await prisma.trip.findMany({
      where,
      // Drivers need their own expenses too, so they can see what is still waiting for approval.
      include: { ...tripInclude, expenses: { orderBy: { date: "desc" } } },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });
    res.json(trips.map((t) => forRole(req, t)));
  } catch (e) {
    next(e);
  }
});

router.get("/trips/:id", tenant, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.id, companyId: cid(req) },
      include: { ...tripInclude, expenses: { orderBy: { date: "desc" } } },
    });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (!isOffice(req) && trip.driverId !== (await driverIdFor(req))) {
      return res.status(403).json({ error: "Not your trip" });
    }
    res.json(forRole(req, trip));
  } catch (e) {
    next(e);
  }
});

/** Every referenced row must belong to the SAME company (cross-tenant guard). */
async function referencesOk(req: Request, data: { truckId?: string; driverId?: string; partyId?: string; routeId?: string }) {
  const checks = await Promise.all([
    data.truckId ? prisma.truck.findFirst({ where: { id: data.truckId, companyId: cid(req) } }) : true,
    data.driverId ? prisma.driver.findFirst({ where: { id: data.driverId, companyId: cid(req) } }) : true,
    data.partyId ? prisma.party.findFirst({ where: { id: data.partyId, companyId: cid(req) } }) : true,
    data.routeId ? prisma.route.findFirst({ where: { id: data.routeId, companyId: cid(req) } }) : true,
  ]);
  return checks.every(Boolean);
}

router.post("/trips", tenant, requireRole("COMPANY_OWNER", "MANAGER"), async (req, res, next) => {
  try {
    const data = tripSchema.parse(req.body);
    if (!(await referencesOk(req, data))) {
      return res.status(400).json({ error: "Invalid truck, driver, party or route for this company" });
    }
    // Two people creating a trip at once can pick the same number; the unique index
    // rejects one of them, so retry with a fresh number.
    let trip;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        trip = await prisma.trip.create({
          data: { ...data, companyId: cid(req), tripNo: await nextTripNo(prisma, cid(req)) },
        });
        break;
      } catch (e: any) {
        if (e?.code !== "P2002" || attempt === 2) throw e;
      }
    }
    await audit(req, "trip", trip!.id, "create", null, trip);

    // Not an error: the owner may still want the trip, but should know the truck or driver is busy.
    const busy = await prisma.trip.findMany({
      where: {
        companyId: cid(req),
        status: "RUNNING",
        id: { not: trip!.id },
        OR: [{ truckId: data.truckId }, { driverId: data.driverId }],
      },
      select: { tripNo: true, truckId: true, driverId: true },
    });
    const warnings = busy.map((b) =>
      b.truckId === data.truckId
        ? `This truck is still on running trip ${b.tripNo}`
        : `This driver is still on running trip ${b.tripNo}`
    );
    res.status(201).json({ ...trip, warnings });
  } catch (e) {
    next(e);
  }
});

router.put("/trips/:id", tenant, requireRole("COMPANY_OWNER", "MANAGER"), async (req, res, next) => {
  try {
    const data = tripUpdateSchema.parse(req.body);
    const trip = await prisma.trip.findFirst({ where: { id: req.params.id, companyId: cid(req) } });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.status === "CLOSED") return res.status(409).json({ error: "Trip is closed" });
    if (data.endDate && data.endDate < (data.startDate ?? trip.startDate)) {
      return res.status(400).json({ error: "End date cannot be before the start date" });
    }
    if (!(await referencesOk(req, data))) {
      return res.status(400).json({ error: "Invalid truck, driver, party or route for this company" });
    }
    const updated = await prisma.trip.update({ where: { id: trip.id }, data });
    await audit(req, "trip", trip.id, "update", trip, updated);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/trips/:id", tenant, requireRole("COMPANY_OWNER", "MANAGER"), async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.id, companyId: cid(req) },
      include: { _count: { select: { expenses: true } } },
    });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    // Only a trip that never started and has no money on it can be removed, so history stays intact.
    if (trip.status !== "PLANNED" || trip._count.expenses > 0) {
      return res.status(409).json({ error: "Only a planned trip with no expenses can be deleted" });
    }
    const { _count, ...before } = trip;
    await prisma.trip.delete({ where: { id: trip.id } });
    await audit(req, "trip", trip.id, "delete", before, null);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/trips/:id/status",
  tenant,
  requireRole("COMPANY_OWNER", "MANAGER"),
  async (req, res, next) => {
    try {
      const { status, endDate } = z
        .object({
          status: z.enum(["PLANNED", "RUNNING", "COMPLETED", "CLOSED"]),
          // The browser sends today's date in the user's own time zone (India), not the server's.
          endDate: z.coerce.date().optional(),
        })
        .parse(req.body);
      const trip = await prisma.trip.findFirst({ where: { id: req.params.id, companyId: cid(req) } });
      if (!trip) return res.status(404).json({ error: "Trip not found" });
      if (!canTransition(trip.status as TripStatus, status, req.user!.role)) {
        return res.status(409).json({ error: `Cannot move trip from ${trip.status} to ${status}` });
      }
      if (status === "CLOSED") {
        // Closing locks the trip, and approvals are blocked on closed trips, so any expense still
        // PENDING would be stuck forever and silently left out of profit.
        const waiting = await prisma.tripExpense.count({
          where: { tripId: trip.id, companyId: cid(req), approvalStatus: "PENDING" },
        });
        if (waiting > 0) {
          return res.status(409).json({
            error: `Approve or reject the ${waiting} pending expense${waiting > 1 ? "s" : ""} before closing this trip`,
          });
        }
      }
      const updated = await prisma.trip.update({
        where: { id: trip.id },
        // Finishing a trip stamps the end date, so the trip list and reports have one.
        data: {
          status,
          ...(status === "COMPLETED" && !trip.endDate
            ? { endDate: endDate ?? new Date(new Date().toISOString().slice(0, 10)) }
            : {}),
        },
      });
      await audit(req, "trip", trip.id, "update", trip, updated);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

// ------------------------------------------------------------- expenses

router.post("/trips/:id/expenses", tenant, async (req, res, next) => {
  try {
    const data = expenseSchema.parse(req.body);
    const trip = await prisma.trip.findFirst({ where: { id: req.params.id, companyId: cid(req) } });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.status === "CLOSED") return res.status(409).json({ error: "Trip is closed" });

    // Drivers: only their own trips, and the entry waits for approval.
    const driver = !isOffice(req);
    if (driver && trip.driverId !== (await driverIdFor(req))) {
      return res.status(403).json({ error: "Not your trip" });
    }
    const expense = await prisma.tripExpense.create({
      data: {
        ...data,
        tripId: trip.id,
        companyId: cid(req),
        enteredById: req.user!.id,
        approvalStatus: driver ? "PENDING" : "APPROVED",
      },
    });
    await audit(req, "trip_expense", expense.id, "create", null, expense);
    res.status(201).json(expense);
  } catch (e) {
    next(e);
  }
});

const ledgerQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  tripId: z.string().min(1).optional(),
});

/** Every expense across trips, newest first. This is the "where did the money go" list. */
router.get("/expenses", tenant, async (req, res, next) => {
  try {
    const q = ledgerQuery.parse(req.query);
    const where: any = {
      companyId: cid(req),
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { approvalStatus: q.status } : {}),
      ...(q.tripId ? { tripId: q.tripId } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
    if (!isOffice(req)) {
      const driverId = await driverIdFor(req);
      if (!driverId) return res.json([]);
      where.trip = { driverId };
    }
    const rows = await prisma.tripExpense.findMany({
      where,
      include: {
        trip: {
          select: {
            id: true,
            tripNo: true,
            status: true,
            truck: { select: { regNo: true } },
            route: { select: { origin: true, destination: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
    res.json(rows.map((r) => ({ ...r, amountInr: Math.round(expenseInr(r) * 100) / 100 })));
  } catch (e) {
    next(e);
  }
});

router.get("/expenses/pending", tenant, requireRole("COMPANY_OWNER", "MANAGER"), async (req, res, next) => {
  try {
    res.json(
      await prisma.tripExpense.findMany({
        where: { companyId: cid(req), approvalStatus: "PENDING" },
        include: {
          trip: {
            select: {
              tripNo: true,
              truck: { select: { regNo: true } },
              route: { select: { origin: true, destination: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  "/expenses/:id/approve",
  tenant,
  requireRole("COMPANY_OWNER", "MANAGER"),
  async (req, res, next) => {
    try {
      const { decision } = z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).parse(req.body);
      const expense = await prisma.tripExpense.findFirst({
        where: { id: req.params.id, companyId: cid(req) },
        include: { trip: { select: { status: true } } },
      });
      if (!expense) return res.status(404).json({ error: "Expense not found" });
      if (expense.trip.status === "CLOSED") return res.status(409).json({ error: "Trip is closed" });
      const { trip: _trip, ...before } = expense;
      const updated = await prisma.tripExpense.update({
        where: { id: expense.id },
        data: { approvalStatus: decision === "REJECT" ? "REJECTED" : "APPROVED" },
      });
      await audit(req, "trip_expense", expense.id, "update", before, updated);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

/** Office staff can remove a wrong entry; a driver only their own entry that is still pending. */
router.delete("/expenses/:id", tenant, async (req, res, next) => {
  try {
    const expense = await prisma.tripExpense.findFirst({
      where: { id: req.params.id, companyId: cid(req) },
      include: { trip: { select: { status: true } } },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (expense.trip.status === "CLOSED") return res.status(409).json({ error: "Trip is closed" });
    const role = req.user!.role;
    const office = role === "COMPANY_OWNER" || role === "MANAGER" || role === "PLATFORM_ADMIN";
    const ownPending = role === "DRIVER" && expense.enteredById === req.user!.id && expense.approvalStatus === "PENDING";
    if (!office && !ownPending) return res.status(403).json({ error: "Forbidden" });
    const { trip: _trip, ...before } = expense;
    await prisma.tripExpense.delete({ where: { id: expense.id } });
    await audit(req, "trip_expense", expense.id, "delete", before, null);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Profit is money information: owner and accountant only.
router.get(
  "/trips/:id/profit",
  tenant,
  requireRole("COMPANY_OWNER", "ACCOUNTANT"),
  async (req, res, next) => {
    try {
      const trip = await prisma.trip.findFirst({
        where: { id: req.params.id, companyId: cid(req) },
        include: { expenses: true },
      });
      if (!trip) return res.status(404).json({ error: "Trip not found" });
      res.json({
        tripNo: trip.tripNo,
        freight: Number(trip.freightAmount),
        profit: tripProfit(Number(trip.freightAmount), trip.expenses),
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
