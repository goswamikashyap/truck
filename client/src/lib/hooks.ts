import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { KEYS } from "./types";
import type { Dashboard, Driver, Party, Route, RouteStat, Trip, Truck } from "./types";

export const useTrips = () => useQuery({ queryKey: KEYS.trips, queryFn: () => api<Trip[]>("/trips") });

/** Office-only lists. Drivers are not allowed to read them, so the query stays off for them. */
export const useTrucks = (enabled = true) => useQuery({ queryKey: KEYS.trucks, queryFn: () => api<Truck[]>("/trucks"), enabled });
export const useDrivers = (enabled = true) => useQuery({ queryKey: KEYS.drivers, queryFn: () => api<Driver[]>("/drivers"), enabled });
export const useParties = (enabled = true) => useQuery({ queryKey: KEYS.parties, queryFn: () => api<Party[]>("/parties"), enabled });
export const useRoutes = (enabled = true) => useQuery({ queryKey: KEYS.routes, queryFn: () => api<Route[]>("/routes"), enabled });
export const useRouteStats = (enabled = true) =>
  useQuery({ queryKey: KEYS.routeStats, queryFn: () => api<RouteStat[]>("/routes/analytics"), enabled });
export const useDashboard = (days: number) =>
  useQuery({ queryKey: [...KEYS.dashboard, days], queryFn: () => api<Dashboard>(`/dashboard?days=${days}`) });

/** After any money or trip change, refresh everything that shows totals. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    for (const k of [KEYS.trips, KEYS.expenses, KEYS.pending, KEYS.dashboard, KEYS.routeStats]) {
      qc.invalidateQueries({ queryKey: k });
    }
  };
}

/** Average approved amount (in INR) for one category on one route, from trips already loaded. */
export function typicalExpense(trips: Trip[], routeId: string | null | undefined, category: string, excludeTripId?: string) {
  if (!routeId) return null;
  const amounts: number[] = [];
  for (const t of trips) {
    if (t.routeId !== routeId || t.id === excludeTripId) continue;
    for (const e of t.expenses ?? []) {
      if (e.category === category && e.approvalStatus === "APPROVED") amounts.push(Number(e.amount) * Number(e.fxRate || 1));
    }
  }
  if (amounts.length < 2) return null;
  return amounts.reduce((s, a) => s + a, 0) / amounts.length;
}

export function tripCost(t: Trip) {
  return (t.expenses ?? []).filter((e) => e.approvalStatus === "APPROVED").reduce((s, e) => s + Number(e.amount) * Number(e.fxRate || 1), 0);
}
export function tripPending(t: Trip) {
  return (t.expenses ?? []).filter((e) => e.approvalStatus === "PENDING").reduce((s, e) => s + Number(e.amount) * Number(e.fxRate || 1), 0);
}
export function tripLiters(t: Trip) {
  return (t.expenses ?? []).filter((e) => e.approvalStatus === "APPROVED" && e.category === "DIESEL").reduce((s, e) => s + Number(e.liters ?? 0), 0);
}


/** True while the screen matches a CSS media query (used to switch table <-> card layouts). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
