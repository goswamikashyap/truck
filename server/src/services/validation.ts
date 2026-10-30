import { z } from "zod";

export const CATEGORIES = ["DIESEL", "TOLL", "DRIVER_FOOD", "LOADING", "REPAIR", "POLICE_RTO", "MISC"] as const;

const tripBase = z.object({
  truckId: z.string().min(1),
  driverId: z.string().min(1),
  partyId: z.string().min(1),
  routeId: z.string().min(1).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  loadDesc: z.string().trim().max(200).optional(),
  freightAmount: z.coerce.number().positive(),
});

const endAfterStart = (d: { startDate?: Date; endDate?: Date }) =>
  !d.startDate || !d.endDate || d.endDate >= d.startDate;
const endMsg = { message: "End date cannot be before the start date", path: ["endDate"] };

export const tripSchema = tripBase.refine(endAfterStart, endMsg);
export const tripUpdateSchema = tripBase.partial().refine(endAfterStart, endMsg);

const expenseBase = z.object({
  category: z.enum(CATEGORIES),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code like INR or USD").default("INR"),
  fxRate: z.coerce.number().positive().optional(),
  date: z.coerce.date(),
  notes: z.string().trim().max(300).optional(),
  liters: z.coerce.number().positive().optional(),
});

/**
 * - INR expenses always use rate 1 (a stray rate can no longer inflate costs).
 * - Foreign-currency expenses must say what the rate was (the old default of 1 silently
 *   counted 100 USD as 100 rupees).
 * - Litres only make sense for diesel.
 */
export const expenseSchema = expenseBase
  .superRefine((d, ctx) => {
    if (d.currency !== "INR" && d.fxRate == null) {
      ctx.addIssue({ code: "custom", path: ["fxRate"], message: `Enter the ${d.currency} to INR exchange rate` });
    }
    if (d.liters != null && d.category !== "DIESEL") {
      ctx.addIssue({ code: "custom", path: ["liters"], message: "Litres can only be added to a diesel expense" });
    }
  })
  .transform((d) => ({ ...d, fxRate: d.currency === "INR" ? 1 : (d.fxRate as number) }));
