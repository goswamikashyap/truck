import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Small deterministic random generator, so the demo data looks the same on every machine.
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);
const round = (n: number, step = 1) => Math.round(n / step) * step;

async function main() {
  const email = "owner@demo.in";
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("Seed already run");
    return;
  }
  const passwordHash = await bcrypt.hash("password123", 10);
  const company = await prisma.company.create({
    data: { name: "Demo Transport Co." },
  });
  const companyId = company.id;

  const owner = await prisma.user.create({
    data: {
      companyId,
      name: "Demo Owner",
      email,
      passwordHash,
      role: "COMPANY_OWNER",
    },
  });
  await prisma.user.create({
    data: {
      companyId,
      name: "Demo Manager",
      email: "manager@demo.in",
      passwordHash,
      role: "MANAGER",
    },
  });
  await prisma.user.create({
    data: {
      companyId,
      name: "Demo Accountant",
      email: "accountant@demo.in",
      passwordHash,
      role: "ACCOUNTANT",
    },
  });
  const driverUser = await prisma.user.create({
    data: {
      companyId,
      name: "Ramesh Yadav",
      email: "driver@demo.in",
      passwordHash,
      role: "DRIVER",
    },
  });

  // Documents: one expired, a few expiring soon, so the alerts panel has something to show.
  const truckData = [
    {
      regNo: "MH04AB1234",
      type: "Trailer",
      capacityTons: 28,
      insuranceExp: daysFromNow(210),
      permitExp: daysFromNow(300),
      kmpl: 4.3,
    },
    {
      regNo: "MH43CD5678",
      type: "Container",
      capacityTons: 24,
      insuranceExp: daysFromNow(-5),
      permitExp: daysFromNow(120),
      kmpl: 4.0,
    },
    {
      regNo: "GJ05EF9012",
      type: "Trailer",
      capacityTons: 28,
      insuranceExp: daysFromNow(90),
      permitExp: daysFromNow(12),
      kmpl: 3.1,
    },
    {
      regNo: "GJ01GH3456",
      type: "Open body",
      capacityTons: 16,
      insuranceExp: daysFromNow(150),
      permitExp: daysFromNow(200),
      kmpl: 4.6,
    },
    {
      regNo: "RJ14JK7890",
      type: "Tanker",
      capacityTons: 22,
      insuranceExp: daysFromNow(60),
      permitExp: daysFromNow(75),
      fitnessExp: daysFromNow(22),
      kmpl: 3.9,
    },
  ];
  const trucks = [];
  for (const { kmpl: _k, ...t } of truckData)
    trucks.push(await prisma.truck.create({ data: { ...t, companyId } }));

  const driverData = [
    {
      name: "Ramesh Yadav",
      phone: "9876543210",
      licenceNo: "MH0420110001234",
      licenceExp: daysFromNow(400),
      userId: driverUser.id,
    },
    {
      name: "Suresh Patil",
      phone: "9822011122",
      licenceNo: "MH0420120004567",
      licenceExp: daysFromNow(20),
    },
    {
      name: "Imran Shaikh",
      phone: "9768800334",
      licenceNo: "GJ0120130007788",
      licenceExp: daysFromNow(700),
    },
    {
      name: "Gurpreet Singh",
      phone: "9814455667",
      licenceNo: "PB1020100009911",
      licenceExp: daysFromNow(250),
    },
    {
      name: "Mohan Meena",
      phone: "9928877665",
      licenceNo: "RJ1420150002233",
      licenceExp: daysFromNow(90),
    },
  ];
  const drivers = [];
  for (const d of driverData)
    drivers.push(await prisma.driver.create({ data: { ...d, companyId } }));

  const parties = [];
  for (const p of [
    {
      name: "Acme Steel Ltd",
      creditDays: 30,
      phone: "02226001122",
      gstNo: "27AAACA1234A1Z5",
    },
    { name: "Bharat Cement", creditDays: 45, phone: "02240005566" },
    { name: "Sunrise FMCG", creditDays: 60, phone: "01140112233" },
    { name: "Kaveri Textiles", creditDays: 15, phone: "07926112200" },
  ]) {
    parties.push(await prisma.party.create({ data: { ...p, companyId } }));
  }

  // rate = typical freight per km the market pays on that lane.
  const routeData = [
    { origin: "Mumbai", destination: "Delhi", distanceKm: 1400, rate: 44 },
    { origin: "Mumbai", destination: "Pune", distanceKm: 150, rate: 38 },
    { origin: "Mumbai", destination: "Ahmedabad", distanceKm: 530, rate: 41 },
    { origin: "Surat", destination: "Jaipur", distanceKm: 880, rate: 40 },
    { origin: "Mumbai", destination: "Bengaluru", distanceKm: 980, rate: 33 },
    { origin: "Delhi", destination: "Kolkata", distanceKm: 1500, rate: 46 },
  ];
  const routes = [];
  for (const { rate: _r, ...r } of routeData)
    routes.push(await prisma.route.create({ data: { ...r, companyId } }));

  const DIESEL_PRICE = 91;
  let n = 0;
  const total = 30;
  for (let i = 0; i < total; i++) {
    n++;
    const ri = Math.floor(rand() * routes.length);
    const route = routes[ri];
    const rd = routeData[ri];
    const ti = Math.floor(rand() * trucks.length);
    const km = Number(route.distanceKm);
    const age = Math.round(((total - i) / total) * 150); // oldest first, newest about now
    const start = daysFromNow(-age);
    const days = Math.max(1, Math.ceil(km / 450));
    const status =
      age > 20
        ? age > 45
          ? "CLOSED"
          : "COMPLETED"
        : age > 3
          ? rand() > 0.5
            ? "RUNNING"
            : "COMPLETED"
          : i === total - 1
            ? "PLANNED"
            : "RUNNING";
    const freight = round(km * rd.rate * between(0.92, 1.1), 100);
    const trip = await prisma.trip.create({
      data: {
        companyId,
        tripNo: `T-${String(n).padStart(5, "0")}`,
        truckId: trucks[ti].id,
        driverId: drivers[ti].id,
        partyId: pick(parties).id,
        routeId: route.id,
        startDate: start,
        endDate:
          status === "COMPLETED" || status === "CLOSED"
            ? new Date(start.getTime() + days * 86400000)
            : null,
        loadDesc: pick([
          "Steel coils",
          "Cement bags",
          "FMCG cartons",
          "Cotton bales",
          "Machinery",
        ]),
        freightAmount: freight,
        status: status as any,
      },
    });
    if (status === "PLANNED") continue;

    const litres = Math.round(km / truckData[ti].kmpl);
    const exp = (
      category: string,
      amount: number,
      extra: object = {},
      approvalStatus = "APPROVED",
      by = owner.id,
    ) =>
      prisma.tripExpense.create({
        data: {
          companyId,
          tripId: trip.id,
          category: category as any,
          amount: Math.round(amount),
          date: new Date(
            start.getTime() + Math.floor(rand() * days) * 86400000,
          ),
          enteredById: by,
          approvalStatus: approvalStatus as any,
          ...extra,
        },
      });
    await exp("DIESEL", litres * DIESEL_PRICE * between(0.97, 1.04), {
      liters: litres,
    });
    await exp("TOLL", km * between(2.6, 3.4));
    await exp("DRIVER_FOOD", days * between(250, 400));
    await exp("LOADING", between(1200, 2200));
    if (rand() > 0.7)
      await exp("REPAIR", between(1500, 9000), {
        notes: "Tyre puncture / minor repair",
      });
    if (rand() > 0.6) await exp("POLICE_RTO", between(300, 1200));
  }

  // One live trip for the demo driver, with a few driver-entered expenses still waiting for approval.
  n++;
  const live = await prisma.trip.create({
    data: {
      companyId,
      tripNo: `T-${String(n).padStart(5, "0")}`,
      truckId: trucks[0].id,
      driverId: drivers[0].id,
      partyId: parties[0].id,
      routeId: routes[0].id,
      startDate: daysFromNow(-1),
      loadDesc: "Steel coils",
      freightAmount: 61500,
      status: "RUNNING",
    },
  });
  await prisma.tripExpense.create({
    data: {
      companyId,
      tripId: live.id,
      category: "DIESEL",
      amount: 14500,
      liters: 160,
      date: daysFromNow(-1),
      enteredById: owner.id,
      approvalStatus: "APPROVED",
    },
  });
  for (const [category, amount, notes] of [
    ["REPAIR", 4200, "Tyre replaced at highway garage"],
    ["POLICE_RTO", 800, "Checkpost"],
    ["DRIVER_FOOD", 650, "Dhaba, two meals"],
  ] as const) {
    await prisma.tripExpense.create({
      data: {
        companyId,
        tripId: live.id,
        category,
        amount,
        notes,
        date: new Date(),
        enteredById: driverUser.id,
        approvalStatus: "PENDING",
      },
    });
  }
  console.log("Seeded demo company with 31 trips.");
  console.log(
    "Logins (password123): owner@demo.in, manager@demo.in, accountant@demo.in, driver@demo.in  (development only)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
