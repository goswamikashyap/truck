import {
  buildInsights,
  categoryTotals,
  counted,
  expiringDocs,
  finished,
  monthlySeries,
  redactRoute,
  round2,
  routeStats,
  tripFinance,
  truckStats,
  type TripRow,
} from "./analytics.js";

export const byProfitPerKm = (a: { profitPerKm: number | null }, b: { profitPerKm: number | null }) =>
  (b.profitPerKm ?? -Infinity) - (a.profitPerKm ?? -Infinity);

export interface DashboardInput {
  /** Trips from the start of the chart window (or of the chosen range, whichever is earlier). */
  trips: TripRow[];
  routes: { id: string; origin: string; destination: string; distanceKm: number | string }[];
  trucks: any[];
  drivers: any[];
  statusCounts: Record<string, number>;
  pendingApprovals: number;
  days: number;
  showMoney: boolean;
  now: Date;
}

/** Everything the dashboard screen shows. Pure, so the numbers can be tested without a database. */
export function buildDashboard(i: DashboardInput) {
  const { trips, routes, trucks, drivers, statusCounts, pendingApprovals, days, showMoney, now } = i;
  const rangeFrom = days ? new Date(now.getTime() - days * 86400000) : null;
  const inRange = rangeFrom ? trips.filter((t) => new Date(t.startDate) >= rangeFrom) : trips;
  // Money spent includes trips still on the road; freight, profit and mileage use finished trips only.
  const spentFin = counted(inRange).map(tripFinance);
  const expenses = spentFin.reduce((s, f) => s + f.cost, 0);
  const done = finished(inRange);
  const fin = done.map(tripFinance);
  const freight = fin.reduce((s, f) => s + f.freight, 0);
  const profit = freight - fin.reduce((s, f) => s + f.cost, 0);
  const lossTrips = fin.filter((f) => f.profit < 0).length;

  const rStats = routeStats(inRange, routes);
  const tStats = truckStats(inRange, trucks, routes);
  const categories = categoryTotals(inRange);
  const alerts = expiringDocs(trucks, drivers, now);

  const km = new Map(routes.map((r) => [r.id, Number(r.distanceKm)]));
  const totalKm = done.reduce((s, t) => s + (t.routeId ? km.get(t.routeId) ?? 0 : 0), 0);
  const fuelKm = done.reduce((s, t, idx) => s + (fin[idx].liters > 0 && t.routeId ? km.get(t.routeId) ?? 0 : 0), 0);
  const liters = fin.reduce((s, f) => s + f.liters, 0);

  const monthly = monthlySeries(trips, now, 6).map((m) =>
    showMoney ? m : { month: m.month, trips: m.trips, expenses: m.expenses }
  );
  const ranked = rStats.filter((r) => r.trips > 0);
  const topRoutes = (
    showMoney ? [...ranked].sort(byProfitPerKm) : [...ranked].map(redactRoute).sort((a, b) => b.trips - a.trips)
  ).slice(0, 5);

  return {
    days,
    showMoney,
    kpis: {
      tripsInRange: inRange.length,
      running: statusCounts.RUNNING ?? 0,
      planned: statusCounts.PLANNED ?? 0,
      pendingApprovals,
      expenses: round2(expenses),
      totalKm: round2(totalKm),
      costPerKm: totalKm ? round2(expenses / totalKm) : null,
      liters: round2(liters),
      kmPerLitre: liters > 0 && fuelKm > 0 ? round2(fuelKm / liters) : null,
      finishedTrips: done.length,
      lossTrips: showMoney ? lossTrips : undefined,
      freight: showMoney ? round2(freight) : undefined,
      profit: showMoney ? round2(profit) : undefined,
      marginPct: showMoney && freight > 0 ? round2((profit / freight) * 100) : undefined,
    },
    monthly,
    categories,
    topRoutes,
    trucks: (showMoney ? tStats : tStats.map((t) => ({ ...t, freight: undefined, profit: undefined })))
      .filter((t) => t.trips > 0)
      .sort((a, b) => (showMoney ? (b.profit ?? 0) - (a.profit ?? 0) : b.trips - a.trips)),
    alerts,
    insights: buildInsights({ routes: rStats, trucks: tStats, categories, alerts, pendingApprovals, lossTrips, showMoney }),
  };
}
