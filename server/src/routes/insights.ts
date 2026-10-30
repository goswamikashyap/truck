import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../utils/db.js";
import { tenant } from "../middleware/tenant.js";
import { requireRole } from "../middleware/auth.js";
import { canSeeProfit } from "../services/tripService.js";
import { redactRoute, routeStats, type TripRow } from "../services/analytics.js";
import { buildDashboard, byProfitPerKm } from "../services/dashboard.js";

const router = Router();
const cid = (req: Request) => req.companyId as string;
const office = ["COMPANY_OWNER", "MANAGER", "ACCOUNTANT"] as const;

const daysQuery = z.coerce.number().int().min(0).max(3650).default(180);

/** Loads trips with their expenses in the shape the analytics functions expect. */
async function loadTrips(companyId: string, from: Date | null) {
  const trips = await prisma.trip.findMany({
    where: { companyId, ...(from ? { startDate: { gte: from } } : {}) },
    include: { expenses: true },
  });
  return trips as unknown as TripRow[];
}

/** Route-by-route results: cost per km, mileage, margin, and what freight to ask for. */
router.get("/routes/analytics", tenant, requireRole(...office), async (req, res, next) => {
  try {
    const days = daysQuery.parse(req.query.days ?? 0);
    const now = new Date();
    const from = days ? new Date(now.getTime() - days * 86400000) : null;
    const [routes, trips] = await Promise.all([
      prisma.route.findMany({ where: { companyId: cid(req) } }),
      loadTrips(cid(req), from),
    ]);
    const stats = routeStats(trips, routes as any);
    if (canSeeProfit(req.user!.role)) {
      res.json(stats.sort(byProfitPerKm));
    } else {
      res.json(stats.map(redactRoute).sort((a, b) => (a.costPerKm ?? Infinity) - (b.costPerKm ?? Infinity)));
    }
  } catch (e) {
    next(e);
  }
});

router.get("/dashboard", tenant, requireRole(...office), async (req, res, next) => {
  try {
    const days = daysQuery.parse(req.query.days);
    const now = new Date();
    const rangeFrom = days ? new Date(now.getTime() - days * 86400000) : null;
    // The chart always shows 6 months, whatever range the KPIs use, so load back far enough for both.
    const seriesFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const fetchFrom = rangeFrom ? (rangeFrom < seriesFrom ? rangeFrom : seriesFrom) : null;

    const [trips, routes, trucks, drivers, statusRows, pendingApprovals] = await Promise.all([
      loadTrips(cid(req), fetchFrom),
      prisma.route.findMany({ where: { companyId: cid(req) } }),
      prisma.truck.findMany({ where: { companyId: cid(req) } }),
      prisma.driver.findMany({ where: { companyId: cid(req) } }),
      prisma.trip.groupBy({ by: ["status"], where: { companyId: cid(req) }, _count: { _all: true } }),
      prisma.tripExpense.count({ where: { companyId: cid(req), approvalStatus: "PENDING" } }),
    ]);

    res.json(
      buildDashboard({
        trips,
        routes: routes as any[],
        trucks,
        drivers,
        statusCounts: Object.fromEntries(statusRows.map((s: any) => [s.status, s._count._all])),
        pendingApprovals,
        days,
        showMoney: canSeeProfit(req.user!.role),
        now,
      })
    );
  } catch (e) {
    next(e);
  }
});

export default router;
