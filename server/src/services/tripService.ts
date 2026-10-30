import type { PrismaClient } from "@prisma/client";

/** Business rules live here, outside the routes, so they are easy to test. */

export type TripStatus = "PLANNED" | "RUNNING" | "COMPLETED" | "CLOSED";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Trip profit = freight minus the sum of APPROVED expenses converted to INR.
 * PENDING (driver-submitted) and REJECTED expenses are excluded.
 */
export function tripProfit(
  freight: number,
  expenses: { amount: number | string; fxRate: number | string; approvalStatus: string }[]
) {
  const approved = expenses
    .filter((e) => e.approvalStatus === "APPROVED")
    .reduce((sum, e) => sum + expenseInr(e), 0);
  return round2(Number(freight) - approved);
}

/** "T-00001" -> 2. Returns the next number in the company's series. */
export function nextNumberFrom(lastTripNo: string | null | undefined) {
  if (!lastTripNo) return 1;
  const n = parseInt(lastTripNo.split("-")[1] || "0", 10);
  return (Number.isNaN(n) ? 0 : n) + 1;
}

export function formatTripNo(n: number) {
  return `T-${String(n).padStart(5, "0")}`;
}

export async function nextTripNo(prisma: PrismaClient, companyId: string) {
  // Trip numbers only ever go up, so the most recently created trip holds the highest number.
  // (Sorting tripNo as text would put T-100000 before T-99999, and loading every trip is slow.)
  const last = await prisma.trip.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { tripNo: true },
  });
  return formatTripNo(nextNumberFrom(last?.tripNo));
}

/** One expense converted to INR. */
export const expenseInr = (e: { amount: number | string; fxRate: number | string }) =>
  Number(e.amount) * Number(e.fxRate || 1);

/** Profit is money information: owner and accountant only (platform admin always). */
export const canSeeProfit = (role: string) =>
  role === "COMPANY_OWNER" || role === "ACCOUNTANT" || role === "PLATFORM_ADMIN";

const forward: Record<TripStatus, TripStatus[]> = {
  PLANNED: ["RUNNING"],
  RUNNING: ["COMPLETED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};

/** Allowed status moves. Only the company owner may reopen a closed trip (CLOSED -> COMPLETED). */
export function canTransition(from: TripStatus, to: TripStatus, role: string) {
  if (from === "CLOSED") return to === "COMPLETED" && role === "COMPANY_OWNER";
  return forward[from].includes(to);
}
