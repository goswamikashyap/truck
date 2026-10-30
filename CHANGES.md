# What changed in this version

## Bugs fixed

Security
1. **Drivers could read every master list.** `GET /trucks`, `/drivers`, `/parties`, `/routes` had no role check, so a
   driver could read other drivers' phone numbers and salaries, and the customer list. Now owner, manager, accountant only.
2. **Login lockout for a whole office.** The login limiter counted successful logins, so 20 logins from one office
   IP in 15 minutes locked everyone out. Only failed attempts count now.
3. JWT verification now pins the algorithm (HS256).
4. Suspended companies (`Company.status`) can no longer log in or refresh a token.

Money and logic
5. **A foreign-currency expense with no rate was counted at rate 1** (100 USD became ₹100). A rate is now required for
   non-INR expenses, and INR expenses always use rate 1 (a stray rate could inflate costs).
6. **Closing a trip with pending expenses froze them forever** (approving is blocked on closed trips, so they silently
   never counted). Closing is now refused until they are approved or rejected.
7. **Running trips inflated profit and mileage.** A running trip has full freight but only part of its costs. Profit,
   margin, route and truck results now use finished trips only.
8. **Trips dated yesterday in India.** The browser used the UTC date (`toISOString`), which is still "yesterday" before
   5:30 am IST. All dates now use the user's own time zone.
9. Trip end date could be before the start date. Validated now; completing a trip stamps the end date.
10. Drivers could not see their own expenses or their approval status. They can now.
11. Trip numbers: the next number loaded every trip of the company. Now one query, and still correct past T-99999.
12. Several requests failing together when the token expired each tried to refresh. They now share one refresh call.
13. Deleting a record used by trips gave a raw database error. Now a clear 409 message.
14. Network failures showed "Failed to fetch". Now "Cannot reach the server".
15. A unit test used an invalid role name (`OWNER`).

## New: expenses and routes
- **Expenses page**: ledger across all trips, filters (dates, type, status, search), breakdown by type / truck / route,
  "higher than usual" flag, approve all, CSV export. Diesel entries take litres, so mileage (km/l) is tracked.
- **Routes page**: add / edit / delete routes (and the return route together); per-route cost per km, mileage,
  margin, and the freight to ask for; a quote calculator.
- Trips can now be created with a route. The new-trip form shows what that route usually costs and warns if the truck
  or driver is still on another running trip.
- Entering an expense warns when the amount is far above the usual for that route.

## New: other features
- Dashboard with profit, freight, expenses, cost per km, mileage, 6-month chart, expense mix, best routes, truck
  results, papers to renew and plain-language findings; one-tap approval of driver expenses.
- Edit / delete screens for trucks, drivers, parties; edit and delete for trips and expenses.
- Paper-expiry tracking for insurance, permit, fitness, PUC and driving licence, with alerts.
- Demo seed now has 31 trips, 4 logins (owner, manager, accountant, driver) and expiring papers.

## New look and feel
Truck-art colours, large touch targets (44px and up), bottom tab bar and floating "Add expense" button on phones,
sidebar on desktop, bottom-sheet dialogs, toasts and confirm dialogs instead of browser pop-ups, skeleton loaders,
installable PWA manifest.

## Files
Server: `prisma/schema.prisma` (+`liters`, indexes), `prisma/seed.ts`, `src/routes/{auth,masters,trips,insights}.ts`,
`src/services/{analytics,dashboard,validation,tripService}.ts` and tests, `src/middleware/{auth,error}.ts`, `src/app.ts`.
Client: all of `src/` rewritten (`pages/MastersPage.tsx` became `pages/FleetPage.tsx`), `index.html`, `vite.config.ts`,
`public/`. No new npm packages were added.
