export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  company: { id: string; name: string } | null;
}

export const isOffice = (role: string) => role !== "DRIVER";
export const canManage = (role: string) => role === "COMPANY_OWNER" || role === "MANAGER";
export const canSeeProfit = (role: string) => role === "COMPANY_OWNER" || role === "ACCOUNTANT" || role === "PLATFORM_ADMIN";

export interface Truck {
  id: string;
  regNo: string;
  type: string;
  capacityTons?: string | number | null;
  insuranceExp?: string | null;
  permitExp?: string | null;
  fitnessExp?: string | null;
  pucExp?: string | null;
}
export interface Driver {
  id: string;
  name: string;
  phone: string;
  licenceNo?: string | null;
  licenceExp?: string | null;
  salaryType?: string | null;
  baseSalary?: string | number | null;
}
export interface Party {
  id: string;
  name: string;
  gstNo?: string | null;
  phone?: string | null;
  address?: string | null;
  creditDays: number;
}
export interface Route {
  id: string;
  origin: string;
  destination: string;
  distanceKm: string | number;
  notes?: string | null;
}

export interface Expense {
  id: string;
  tripId: string;
  category: string;
  amount: string | number;
  currency: string;
  fxRate: string | number;
  date: string;
  notes?: string | null;
  liters?: string | number | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  enteredById: string;
  createdAt: string;
}

export interface LedgerExpense extends Expense {
  amountInr: number;
  trip: {
    id: string;
    tripNo: string;
    status: string;
    truck?: { regNo: string } | null;
    route?: { origin: string; destination: string } | null;
  };
}

export interface Trip {
  id: string;
  tripNo: string;
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "CLOSED";
  startDate: string;
  endDate?: string | null;
  loadDesc?: string | null;
  freightAmount?: string | number; // missing for drivers
  truckId: string;
  driverId: string;
  partyId: string;
  routeId?: string | null;
  truck?: Truck;
  driver?: Driver;
  party?: Party;
  route?: Route | null;
  expenses?: Expense[];
}

export interface RouteStat {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  trips: number;
  expenses: number;
  avgExpense: number;
  costPerKm: number | null;
  liters: number;
  kmPerLitre: number | null;
  // Only for roles that may see profit:
  freight?: number;
  profit?: number;
  avgFreight?: number;
  avgProfit?: number;
  marginPct?: number | null;
  freightPerKm?: number | null;
  profitPerKm?: number | null;
  verdict?: "great" | "good" | "thin" | "loss" | null;
  suggestedFreight?: number;
}

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  body: string;
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

export interface Dashboard {
  days: number;
  showMoney: boolean;
  kpis: {
    tripsInRange: number;
    running: number;
    planned: number;
    pendingApprovals: number;
    expenses: number;
    totalKm: number;
    costPerKm: number | null;
    liters: number;
    kmPerLitre: number | null;
    finishedTrips?: number;
    lossTrips?: number;
    freight?: number;
    profit?: number;
    marginPct?: number;
  };
  monthly: { month: string; trips: number; expenses: number; freight?: number; profit?: number }[];
  categories: { category: string; amount: number; pct: number }[];
  topRoutes: RouteStat[];
  trucks: { id: string; regNo: string; type: string; trips: number; km: number; expenses: number; costPerKm: number | null; kmPerLitre: number | null; freight?: number; profit?: number }[];
  alerts: DocAlert[];
  insights: Insight[];
}

/** Query keys in one place so a change in one screen refreshes the others. */
export const KEYS = {
  trips: ["trips"],
  expenses: ["expenses"],
  pending: ["pending-expenses"],
  dashboard: ["dashboard"],
  routeStats: ["route-stats"],
  routes: ["routes"],
  trucks: ["trucks"],
  drivers: ["drivers"],
  parties: ["parties"],
} as const;
