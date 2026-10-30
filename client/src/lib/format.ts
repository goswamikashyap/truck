/** Small helpers for money, dates, CSV and the labels used across the app. */

export const inr = (n: number | string | null | undefined) =>
  n == null || n === "" || Number.isNaN(Number(n)) ? "–" : `${Number(n) < 0 ? "-" : ""}₹${Math.abs(Math.round(Number(n))).toLocaleString("en-IN")}`;

/** ₹1.2L, ₹3.4Cr: easier to read on a phone tile than 12,34,567. */
export function inrShort(n: number | string | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "–";
  const v = Number(n);
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e4) return `${s}₹${(a / 1e3).toFixed(1)}k`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}

export const num = (n: number | string | null | undefined, digits = 0) =>
  n == null || Number.isNaN(Number(n)) ? "–" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits });

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Today's date in the user's own time zone, as YYYY-MM-DD.
 * (new Date().toISOString() is UTC, which is still "yesterday" in India before 5:30 am.)
 */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgoLocal(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthStartLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** Dates are stored as calendar days (UTC midnight), so they are shown in UTC to avoid shifting a day. */
export function fmtDate(v: string | Date | null | undefined, withYear = false) {
  if (!v) return "–";
  const d = new Date(v);
  const sameYear = d.getUTCFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear || !sameYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export const isoDay = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

export function daysFromToday(v: string | Date) {
  const d = new Date(v);
  const t = new Date();
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / 86400000);
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const CATEGORY = {
  DIESEL: { label: "Diesel", icon: "fuel", color: "#5b3df5", dark: "#4529d6", light: "#efebff" },
  TOLL: { label: "Toll", icon: "toll", color: "#00a99b", dark: "#007d73", light: "#dcf6f3" },
  DRIVER_FOOD: { label: "Driver food", icon: "food", color: "#ffb300", dark: "#b97f00", light: "#fff3d1" },
  LOADING: { label: "Loading", icon: "box", color: "#2b9bf4", dark: "#176cb3", light: "#e0f0ff" },
  REPAIR: { label: "Repair", icon: "wrench", color: "#f2455a", dark: "#c4283c", light: "#ffe5e9" },
  POLICE_RTO: { label: "Police / RTO", icon: "shield", color: "#ff8a3d", dark: "#b35412", light: "#ffeadb" },
  MISC: { label: "Misc", icon: "dots", color: "#8e94b8", dark: "#5a6086", light: "#eceefa" },
} as const;
export type CategoryKey = keyof typeof CATEGORY;
export const CATEGORY_KEYS = Object.keys(CATEGORY) as CategoryKey[];
export const catMeta = (k: string) => CATEGORY[k as CategoryKey] ?? CATEGORY.MISC;

export const STATUS = {
  PLANNED: { label: "Planned", badge: "badge-sky", accent: "#2b9bf4" },
  RUNNING: { label: "Running", badge: "badge-violet", accent: "#5b3df5" },
  COMPLETED: { label: "Completed", badge: "badge-teal", accent: "#00a99b" },
  CLOSED: { label: "Closed", badge: "", accent: "#9a9fc0" },
} as const;
export type TripStatus = keyof typeof STATUS;
export const STATUS_ORDER: TripStatus[] = ["PLANNED", "RUNNING", "COMPLETED", "CLOSED"];

export const VERDICT = {
  great: { label: "Great margin", tone: "good", badge: "badge-teal" },
  good: { label: "Healthy margin", tone: "good", badge: "badge-teal" },
  thin: { label: "Thin margin", tone: "warn", badge: "badge-gold" },
  loss: { label: "Losing money", tone: "bad", badge: "badge-coral" },
} as const;

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The BOM makes Excel open the file as UTF-8, so ₹ and → show correctly.
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const routeName = (r?: { origin: string; destination: string } | null) => (r ? `${r.origin} → ${r.destination}` : "No route");

export const roleLabel = (role: string) =>
  ({ COMPANY_OWNER: "Owner", MANAGER: "Manager", ACCOUNTANT: "Accountant", DRIVER: "Driver", PLATFORM_ADMIN: "Platform admin" } as Record<string, string>)[role] ?? role;
