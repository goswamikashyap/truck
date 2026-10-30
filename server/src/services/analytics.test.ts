import { describe, it, expect } from "vitest";
import {
  tripFinance,
  routeStats,
  truckStats,
  monthlySeries,
  categoryTotals,
  expiringDocs,
  suggestFreight,
  verdictFor,
  buildInsights,
  redactRoute,
  type TripRow,
} from "./analytics.js";
import { expenseSchema, tripSchema } from "./validation.js";
import { buildDashboard } from "./dashboard.js";

const exp = (category: string, amount: number, extra: Partial<TripRow["expenses"][number]> = {}) => ({
  category,
  amount,
  fxRate: 1,
  approvalStatus: "APPROVED",
  date: "2026-10-01",
  ...extra,
});
const trip = (id: string, over: Partial<TripRow>): TripRow => ({
  id,
  tripNo: id,
  status: "COMPLETED",
  startDate: "2026-10-05",
  freightAmount: 50000,
  routeId: "r1",
  truckId: "t1",
  partyId: "p1",
  expenses: [],
  ...over,
});
const routes = [
  { id: "r1", origin: "Mumbai", destination: "Delhi", distanceKm: 1400 },
  { id: "r2", origin: "Mumbai", destination: "Pune", distanceKm: 150 },
];

describe("tripFinance", () => {
  it("counts approved cost only and keeps pending separate", () => {
    const f = tripFinance(
      trip("a", {
        expenses: [exp("DIESEL", 10000, { liters: 100 }), exp("TOLL", 2000, { approvalStatus: "PENDING" }), exp("MISC", 500, { approvalStatus: "REJECTED" })],
      })
    );
    expect(f).toEqual({ freight: 50000, cost: 10000, pending: 2000, profit: 40000, liters: 100 });
  });
  it("converts foreign currency", () => {
    expect(tripFinance(trip("a", { expenses: [exp("TOLL", 100, { fxRate: 83.5 })] })).cost).toBe(8350);
  });
});

describe("routeStats", () => {
  const trips = [
    trip("a", { expenses: [exp("DIESEL", 30000, { liters: 350 })] }),
    trip("b", { freightAmount: 60000, expenses: [exp("DIESEL", 33000, { liters: 350 })] }),
    trip("c", { status: "PLANNED", freightAmount: 99999 }),
    trip("d", { routeId: "r2", freightAmount: 9000, expenses: [exp("DIESEL", 9500)] }),
  ];
  const stats = routeStats(trips, routes);
  it("ignores planned trips and averages the rest", () => {
    const r1 = stats[0];
    expect(r1.trips).toBe(2);
    expect(r1.freight).toBe(110000);
    expect(r1.expenses).toBe(63000);
    expect(r1.avgExpense).toBe(31500);
    expect(r1.profit).toBe(47000);
    expect(r1.costPerKm).toBe(22.5);
    expect(r1.profitPerKm).toBe(16.79);
    expect(r1.kmPerLitre).toBe(4);
    expect(r1.verdict).toBe("great");
  });
  it("flags a loss-making route and suggests a freight", () => {
    const r2 = stats[1];
    expect(r2.profit).toBe(-500);
    expect(r2.verdict).toBe("loss");
    expect(r2.suggestedFreight).toBe(11200);
  });
  it("leaves running trips out of profit and mileage (their costs are incomplete)", () => {
    const s = routeStats(
      [trip("a", { status: "RUNNING", freightAmount: 60000, expenses: [exp("DIESEL", 5000, { liters: 55 })] })],
      routes
    )[0];
    expect(s.trips).toBe(0);
    expect(s.kmPerLitre).toBeNull();
  });
  it("gives empty stats for a route with no trips", () => {
    const s = routeStats([], routes)[0];
    expect(s.trips).toBe(0);
    expect(s.marginPct).toBeNull();
    expect(s.verdict).toBeNull();
  });
  it("redacts money for managers but keeps cost", () => {
    const red = redactRoute(stats[0]);
    expect(red.profit).toBeUndefined();
    expect(red.freight).toBeUndefined();
    expect(red.expenses).toBe(63000);
    expect(red.costPerKm).toBe(22.5);
  });
});

describe("verdict and suggested freight", () => {
  it("buckets margins", () => {
    expect([25, 12, 3, -1].map(verdictFor)).toEqual(["great", "good", "thin", "loss"]);
  });
  it("rounds suggested freight up to the next 100", () => {
    expect(suggestFreight(30000)).toBe(35300);
    expect(suggestFreight(0)).toBe(0);
  });
});

describe("truckStats", () => {
  it("adds up km from the trip routes", () => {
    const s = truckStats(
      [trip("a", { expenses: [exp("DIESEL", 28000, { liters: 350 })] }), trip("b", { routeId: "r2" })],
      [{ id: "t1", regNo: "MH01", type: "Trailer" }],
      routes
    )[0];
    expect(s.trips).toBe(2);
    expect(s.km).toBe(1550);
    expect(s.kmPerLitre).toBe(4);
  });
});

describe("monthlySeries and categories", () => {
  const trips = [
    trip("a", { startDate: "2026-10-05", expenses: [exp("DIESEL", 10000)] }),
    trip("b", { startDate: "2026-08-20", expenses: [exp("TOLL", 5000)] }),
    trip("c", { startDate: "2025-01-01" }),
  ];
  it("zero-fills months and drops old trips", () => {
    const s = monthlySeries(trips, new Date("2026-10-26T00:00:00Z"), 4);
    expect(s.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(s[0].trips).toBe(0);
    expect(s[1].expenses).toBe(5000);
    expect(s[3].freight).toBe(50000);
  });
  it("totals categories with percentages", () => {
    const c = categoryTotals(trips);
    expect(c[0]).toEqual({ category: "DIESEL", amount: 10000, pct: 66.67 });
  });
});

describe("expiringDocs", () => {
  it("lists expired and soon, most urgent first, ignores far dates", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const a = expiringDocs(
      [{ id: "t1", regNo: "MH01", insuranceExp: "2026-10-20", permitExp: "2026-11-10", fitnessExp: "2027-05-01" }],
      [{ id: "d1", name: "Ramesh", licenceExp: "2026-10-26" }],
      now
    );
    expect(a.map((x) => [x.doc, x.daysLeft, x.level])).toEqual([
      ["Insurance", -6, "expired"],
      ["Licence", 0, "soon"],
      ["Permit", 15, "soon"],
    ]);
  });
});

describe("buildInsights", () => {
  it("hides money findings from roles that cannot see profit", () => {
    const base = { routes: [], trucks: [], categories: [], alerts: [], pendingApprovals: 2, lossTrips: 3 };
    expect(buildInsights({ ...base, showMoney: false }).map((i) => i.title)).toEqual(["2 expenses waiting for you"]);
    expect(buildInsights({ ...base, showMoney: true }).some((i) => i.title.includes("made a loss"))).toBe(true);
  });
});

describe("expenseSchema", () => {
  const ok = { category: "DIESEL", amount: "1000", date: "2026-10-01" };
  it("forces rate 1 for INR even if a rate is sent", () => {
    expect(expenseSchema.parse({ ...ok, fxRate: "83" }).fxRate).toBe(1);
  });
  it("requires a rate for foreign currency", () => {
    expect(expenseSchema.safeParse({ ...ok, currency: "usd" }).success).toBe(false);
    expect(expenseSchema.parse({ ...ok, currency: "usd", fxRate: 83.5 }).currency).toBe("USD");
  });
  it("accepts litres only on diesel", () => {
    expect(expenseSchema.safeParse({ ...ok, liters: "40" }).success).toBe(true);
    expect(expenseSchema.safeParse({ ...ok, category: "TOLL", liters: "40" }).success).toBe(false);
  });
});

describe("tripSchema", () => {
  const base = { truckId: "a", driverId: "b", partyId: "c", startDate: "2026-10-10", freightAmount: "5000" };
  it("rejects an end date before the start date", () => {
    expect(tripSchema.safeParse({ ...base, endDate: "2026-10-01" }).success).toBe(false);
    expect(tripSchema.safeParse({ ...base, endDate: "2026-10-12" }).success).toBe(true);
  });
});

describe("buildDashboard", () => {
  const base = {
    routes,
    trucks: [{ id: "t1", regNo: "MH01", type: "Trailer" }],
    drivers: [],
    statusCounts: { RUNNING: 1, COMPLETED: 1 },
    pendingApprovals: 0,
    days: 180,
    now: new Date("2026-10-26T00:00:00Z"),
  };
  const trips = [
    trip("done", { expenses: [exp("DIESEL", 20000, { liters: 350 })] }),
    trip("live", { status: "RUNNING", expenses: [exp("DIESEL", 6000, { liters: 70 })] }),
  ];
  it("counts running spend in expenses but only finished trips in profit", () => {
    const d = buildDashboard({ ...base, trips, showMoney: true });
    expect(d.kpis.expenses).toBe(26000);
    expect(d.kpis.freight).toBe(50000);
    expect(d.kpis.profit).toBe(30000);
    expect(d.kpis.kmPerLitre).toBe(4);
    expect(d.kpis.finishedTrips).toBe(1);
  });
  it("hides freight and profit for a manager", () => {
    const d = buildDashboard({ ...base, trips, showMoney: false });
    expect(d.kpis.profit).toBeUndefined();
    expect(d.kpis.freight).toBeUndefined();
    expect(d.kpis.expenses).toBe(26000);
    expect(d.monthly[0]).toEqual({ month: "2026-05", trips: 0, expenses: 0 });
  });
});
