import { describe, it, expect } from "vitest";
import { tripProfit, nextNumberFrom, formatTripNo, canTransition } from "./tripService.js";

describe("tripProfit", () => {
  it("subtracts only approved expenses", () => {
    const profit = tripProfit(45000, [
      { amount: 12000, fxRate: 1, approvalStatus: "APPROVED" },
      { amount: 5000, fxRate: 1, approvalStatus: "PENDING" },
      { amount: 700, fxRate: 1, approvalStatus: "REJECTED" },
    ]);
    expect(profit).toBe(33000);
  });

  it("converts foreign-currency expenses with the exchange rate", () => {
    const profit = tripProfit(100000, [{ amount: 100, fxRate: 83.5, approvalStatus: "APPROVED" }]);
    expect(profit).toBe(91650);
  });

  it("returns the full freight when there are no expenses", () => {
    expect(tripProfit(25000, [])).toBe(25000);
  });

  it("can be negative when expenses exceed freight", () => {
    expect(tripProfit(1000, [{ amount: 1500, fxRate: 1, approvalStatus: "APPROVED" }])).toBe(-500);
  });

  it("rounds to 2 decimals", () => {
    expect(tripProfit(100, [{ amount: 0.1, fxRate: 3, approvalStatus: "APPROVED" }])).toBe(99.7);
  });
});

describe("trip numbers", () => {
  it("starts at T-00001", () => {
    expect(formatTripNo(nextNumberFrom(null))).toBe("T-00001");
  });
  it("increments the last number", () => {
    expect(formatTripNo(nextNumberFrom("T-00009"))).toBe("T-00010");
  });
  it("keeps counting past five digits", () => {
    expect(formatTripNo(nextNumberFrom("T-99999"))).toBe("T-100000");
  });
});

describe("canTransition", () => {
  it("allows the normal forward order", () => {
    expect(canTransition("PLANNED", "RUNNING", "MANAGER")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED", "MANAGER")).toBe(true);
    expect(canTransition("COMPLETED", "CLOSED", "MANAGER")).toBe(true);
  });
  it("blocks skipping steps", () => {
    expect(canTransition("PLANNED", "CLOSED", "COMPANY_OWNER")).toBe(false);
  });
  it("lets only the owner reopen a closed trip", () => {
    expect(canTransition("CLOSED", "COMPLETED", "COMPANY_OWNER")).toBe(true);
    expect(canTransition("CLOSED", "COMPLETED", "MANAGER")).toBe(false);
  });
});
