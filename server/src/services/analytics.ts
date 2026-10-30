/**
 * Numbers behind the dashboard, the route analysis and the expense insights.
 * Everything here is a pure function (no database, no Express), so it is easy to test.
 *
 * Rules:
 *  - Only APPROVED expenses count as cost. PENDING and REJECTED are left out.
 *  - Foreign-currency expenses are converted to INR with their own fxRate.
 *  - PLANNED trips are left out of money totals because nothing has happened yet.
 *  - Profit, margin, route and truck results use FINISHED trips only (COMPLETED or CLOSED).
 *    A running trip has its full freight but only part of its costs so far, which would
 *    overstate profit and mileage. Spend totals (category mix, "expenses") include running trips.
 */
import { expenseInr } from "./tripService.js";

export interface ExpenseRow {
  category: string;
  amount: number | string;
  fxRate: number | string;
  approvalStatus: string;
  date: Date | string;
  liters?: number | string | null;
}

export interface TripRow {
  id: string;
  tripNo: string;
  status: string;
  startDate: Date | string;
  freightAmount: number | string;
  routeId?: string | null;
  truckId: string;
  partyId: string;
  expenses: ExpenseRow[];
}

export interface RouteRow {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number | string;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const approved = (e: ExpenseRow) => e.approvalStatus === "APPROVED";

/** Trips that have started, so their spending counts. */
export const counted = <T extends { status: string }>(trips: T[]) => trips.filter((t) => t.status !== "PLANNED");

/** Trips that are over, so freight and cost can be compared fairly. */
export const finished = <T extends { status: string }>(trips: T[]) =>
  trips.filter((t) => t.status === "COMPLETED" || t.status === "CLOSED");

export function tripFinance(t: TripRow) {
  const freight = num(t.freightAmount);
  const cost = t.expenses.filter(approved).reduce((s, e) => s + expenseInr(e), 0);
  const pending = t.expenses.filter((e) => e.approvalStatus === "PENDING").reduce((s, e) => s + expenseInr(e), 0);
  const liters = t.expenses
    .filter((e) => approved(e) && e.category === "DIESEL")
    .reduce((s, e) => s + num(e.liters), 0);
  return { freight, cost: round2(cost), pending: round2(pending), profit: round2(freight - cost), liters: round2(liters) };
}

export type Verdict = "great" | "good" | "thin" | "loss";

/** Margin = profit as a share of freight. */
export function verdictFor(marginPct: number): Verdict {
  if (marginPct >= 20) return "great";
  if (marginPct >= 10) return "good";
  if (marginPct >= 0) return "thin";
  return "loss";
}

/** Freight that would leave `targetMarginPct` profit after the usual cost, rounded up to the next ₹100. */
export function suggestFreight(avgCost: number, targetMarginPct = 15) {
  if (avgCost <= 0) return 0;
  return Math.ceil(avgCost / (1 - targetMarginPct / 100) / 100) * 100;
}

export function routeStats(trips: TripRow[], routes: RouteRow[]) {
  const done = finished(trips);
  return routes.map((r) => {
    const km = num(r.distanceKm);
    const mine = done.filter((t) => t.routeId === r.id);
    const fin = mine.map(tripFinance);
    const freight = fin.reduce((s, f) => s + f.freight, 0);
    const cost = fin.reduce((s, f) => s + f.cost, 0);
    const profit = freight - cost;
    const n = mine.length;
    // Mileage only from trips where diesel litres were actually entered.
    const withFuel = fin.filter((f) => f.liters > 0);
    const liters = withFuel.reduce((s, f) => s + f.liters, 0);
    const fuelKm = withFuel.length * km;
    const margin = freight > 0 ? (profit / freight) * 100 : 0;
    return {
      id: r.id,
      origin: r.origin,
      destination: r.destination,
      distanceKm: km,
      trips: n,
      freight: round2(freight),
      expenses: round2(cost),
      profit: round2(profit),
      avgFreight: n ? round2(freight / n) : 0,
      avgExpense: n ? round2(cost / n) : 0,
      avgProfit: n ? round2(profit / n) : 0,
      marginPct: n ? round2(margin) : null,
      costPerKm: n && km ? round2(cost / (n * km)) : null,
      freightPerKm: n && km ? round2(freight / (n * km)) : null,
      profitPerKm: n && km ? round2(profit / (n * km)) : null,
      liters: round2(liters),
      kmPerLitre: liters > 0 ? round2(fuelKm / liters) : null,
      verdict: n ? verdictFor(margin) : null,
      suggestedFreight: n ? suggestFreight(cost / n) : 0,
    };
  });
}

export type RouteStat = ReturnType<typeof routeStats>[number];

/** Managers see costs but not freight, profit or margin (same rule as trip profit). */
export function redactRoute(r: RouteStat) {
  return {
    ...r,
    freight: undefined,
    profit: undefined,
    avgFreight: undefined,
    avgProfit: undefined,
    marginPct: undefined,
    freightPerKm: undefined,
    profitPerKm: undefined,
    verdict: undefined,
    suggestedFreight: undefined,
  };
}

export function truckStats(
  trips: TripRow[],
  trucks: { id: string; regNo: string; type: string }[],
  routes: RouteRow[]
) {
  const km = new Map(routes.map((r) => [r.id, num(r.distanceKm)]));
  const done = finished(trips);
  return trucks.map((t) => {
    const mine = done.filter((x) => x.truckId === t.id);
    const fin = mine.map(tripFinance);
    const freight = fin.reduce((s, f) => s + f.freight, 0);
    const cost = fin.reduce((s, f) => s + f.cost, 0);
    const distance = mine.reduce((s, x) => s + (x.routeId ? km.get(x.routeId) ?? 0 : 0), 0);
    let fuelKm = 0;
    let liters = 0;
    mine.forEach((x, i) => {
      if (fin[i].liters > 0 && x.routeId) {
        fuelKm += km.get(x.routeId) ?? 0;
        liters += fin[i].liters;
      }
    });
    return {
      id: t.id,
      regNo: t.regNo,
      type: t.type,
      trips: mine.length,
      km: round2(distance),
      freight: round2(freight),
      expenses: round2(cost),
      profit: round2(freight - cost),
      costPerKm: distance ? round2(cost / distance) : null,
      kmPerLitre: liters > 0 ? round2(fuelKm / liters) : null,
    };
  });
}

export type TruckStat = ReturnType<typeof truckStats>[number];

/** Month buckets (UTC, "YYYY-MM") for the last `months` months including the current one. */
export function monthlySeries(trips: TripRow[], now: Date, months = 6) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const rows = new Map(keys.map((k) => [k, { month: k, trips: 0, freight: 0, expenses: 0, profit: 0 }]));
  for (const t of finished(trips)) {
    const d = new Date(t.startDate);
    const row = rows.get(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    if (!row) continue;
    const f = tripFinance(t);
    row.trips += 1;
    row.freight += f.freight;
    row.expenses += f.cost;
    row.profit += f.profit;
  }
  return keys.map((k) => {
    const r = rows.get(k)!;
    return { ...r, freight: round2(r.freight), expenses: round2(r.expenses), profit: round2(r.profit) };
  });
}

export function categoryTotals(trips: TripRow[]) {
  const totals = new Map<string, number>();
  for (const t of counted(trips)) {
    for (const e of t.expenses.filter(approved)) {
      totals.set(e.category, (totals.get(e.category) ?? 0) + expenseInr(e));
    }
  }
  const sum = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      pct: sum ? round2((amount / sum) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface DocAlert {
  kind: "truck" | "driver";
  id: string;
  label: string;
  doc: string;
  date: string;
  daysLeft: number;
  level: "expired" | "soon";
}

/** Documents that are already expired or expire within `windowDays`. Most urgent first. */
export function expiringDocs(
  trucks: {
    id: string;
    regNo: string;
    insuranceExp?: Date | string | null;
    permitExp?: Date | string | null;
    fitnessExp?: Date | string | null;
    pucExp?: Date | string | null;
  }[],
  drivers: { id: string; name: string; licenceExp?: Date | string | null }[],
  now: Date,
  windowDays = 30
): DocAlert[] {
  const out: DocAlert[] = [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const check = (kind: DocAlert["kind"], id: string, label: string, doc: string, value?: Date | string | null) => {
    if (!value) return;
    const d = new Date(value);
    const daysLeft = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today) / 86400000);
    if (daysLeft > windowDays) return;
    out.push({ kind, id, label, doc, date: d.toISOString().slice(0, 10), daysLeft, level: daysLeft < 0 ? "expired" : "soon" });
  };
  for (const t of trucks) {
    check("truck", t.id, t.regNo, "Insurance", t.insuranceExp);
    check("truck", t.id, t.regNo, "Permit", t.permitExp);
    check("truck", t.id, t.regNo, "Fitness", t.fitnessExp);
    check("truck", t.id, t.regNo, "PUC", t.pucExp);
  }
  for (const d of drivers) check("driver", d.id, d.name, "Licence", d.licenceExp);
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  body: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const label = (r: { origin: string; destination: string }) => `${r.origin} → ${r.destination}`;

/** Plain-language findings. Money findings are skipped for roles that cannot see profit. */
export function buildInsights(input: {
  routes: RouteStat[];
  trucks: TruckStat[];
  categories: { category: string; pct: number }[];
  alerts: DocAlert[];
  pendingApprovals: number;
  lossTrips: number;
  showMoney: boolean;
}): Insight[] {
  const out: Insight[] = [];
  const { routes, trucks, categories, alerts, pendingApprovals, lossTrips, showMoney } = input;

  const expired = alerts.filter((a) => a.level === "expired");
  const soon = alerts.filter((a) => a.level === "soon");
  if (expired.length) {
    out.push({
      tone: "bad",
      title: `${expired.length} document${expired.length > 1 ? "s" : ""} expired`,
      body: `${expired.slice(0, 3).map((a) => `${a.label} ${a.doc}`).join(", ")}${expired.length > 3 ? " and more" : ""}. A truck on the road with an expired paper can be fined or held.`,
    });
  }
  if (soon.length) {
    out.push({
      tone: "warn",
      title: `${soon.length} document${soon.length > 1 ? "s" : ""} expiring soon`,
      body: `${soon.slice(0, 3).map((a) => `${a.label} ${a.doc} (${a.daysLeft}d)`).join(", ")}. Renew before the next trip.`,
    });
  }
  if (pendingApprovals > 0) {
    out.push({
      tone: "info",
      title: `${pendingApprovals} expense${pendingApprovals > 1 ? "s" : ""} waiting for you`,
      body: "Driver-entered expenses are not counted in profit until you approve them.",
    });
  }

  if (showMoney) {
    if (lossTrips > 0) {
      out.push({
        tone: "bad",
        title: `${lossTrips} trip${lossTrips > 1 ? "s" : ""} made a loss`,
        body: "Open the trips list and filter by loss to see which party or route caused it.",
      });
    }
    const ranked = routes.filter((r) => r.trips >= 1 && r.profitPerKm != null);
    if (ranked.length >= 2) {
      const best = [...ranked].sort((a, b) => b.profitPerKm! - a.profitPerKm!)[0];
      out.push({
        tone: "good",
        title: `Best route: ${label(best)}`,
        body: `Earns ${inr(best.profitPerKm!)} profit per km (${best.marginPct}% margin). Offer trucks here first.`,
      });
    }
    const weak = routes
      .filter((r) => r.trips >= 2 && r.marginPct != null && r.marginPct < 8)
      .sort((a, b) => a.marginPct! - b.marginPct!)[0];
    if (weak) {
      out.push({
        tone: weak.marginPct! < 0 ? "bad" : "warn",
        title: `${label(weak)} earns very little`,
        body: `Margin is ${weak.marginPct}%. Ask for about ${inr(weak.suggestedFreight)} per trip to keep 15% profit.`,
      });
    }
  }

  const top = categories[0];
  if (top && top.pct >= 50) {
    out.push({
      tone: "info",
      title: `${prettyCategory(top.category)} is ${Math.round(top.pct)}% of your costs`,
      body: "Small savings here move profit the most. Compare fill-up rates and mileage across trucks.",
    });
  }

  const withMileage = trucks.filter((t) => t.kmPerLitre != null);
  if (withMileage.length >= 2) {
    const avg = withMileage.reduce((s, t) => s + t.kmPerLitre!, 0) / withMileage.length;
    const worst = [...withMileage].sort((a, b) => a.kmPerLitre! - b.kmPerLitre!)[0];
    if (worst.kmPerLitre! < avg * 0.85) {
      out.push({
        tone: "warn",
        title: `${worst.regNo} is using more diesel`,
        body: `${worst.kmPerLitre} km per litre against a fleet average of ${round2(avg)}. Check tyres, load and fuel theft.`,
      });
    }
  }
  return out;
}

export function prettyCategory(c: string) {
  const map: Record<string, string> = {
    DIESEL: "Diesel",
    TOLL: "Toll",
    DRIVER_FOOD: "Driver food",
    LOADING: "Loading",
    REPAIR: "Repair",
    POLICE_RTO: "Police / RTO",
    MISC: "Misc",
  };
  return map[c] ?? c;
}
