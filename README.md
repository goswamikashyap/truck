# Transport SaaS

Web app for small and mid-size Indian transporters (5 to 50 trucks) to replace Excel.
The **Trip** is the hub: every expense, invoice, payment, fuel entry and driver advance
attaches to a trip, so profit per trip, truck and party is automatic.

This repository is **Phase 1**: login, roles, trucks / drivers / parties / routes,
trips, trip expenses with driver approval, closed-trip lock, trip profit, audit log.
It now also has the **expense ledger, route analysis, dashboard, fuel mileage and paper-expiry alerts**
(see `CHANGES.md` for everything that was added and fixed).
Invoices, receivables, driver salary and Excel import come in later phases.

## Folder layout

```
client/    React + Vite + Tailwind + React Query (PWA-ready for the driver portal)
server/    Node + Express + TypeScript + Prisma (PostgreSQL)
  prisma/    schema.prisma and seed.ts
  src/
    routes/       auth, masters (trucks/drivers/parties/routes), trips
    middleware/   auth (JWT + roles), tenant (company from token), error handler
    services/     business rules (trip profit, trip numbers, status moves) + unit tests
    utils/        env validation, db client, audit log
docker/    Dockerfiles and nginx config
.vscode/   recommended extensions, tasks, debug config
requests.http   ready-made API calls (VS Code REST Client extension)
```

## Rules the code follows (do not break these)

1. Every table has `companyId`, and every query filters on it on the server.
2. The company comes from the login token, never from a body or query parameter.
3. Role checks live in backend middleware, not only in hidden buttons.
4. Driver-entered expenses are `PENDING` until a manager approves them.
5. Closed trips are locked; only the company owner can reopen.
6. Financial and master-data changes are written to `AuditLog`.

## Option A: run in VS Code on your laptop (best while developing)

Needs: Node 20+, Docker Desktop (only for the database), VS Code.

```bash
# 1. open the folder:  File > Open Folder > transport-saas   (accept "install recommended extensions")

# 2. database (Postgres in Docker)
docker compose up -d db

# 3. API
cd server
cp .env.example .env          # then edit the two JWT secrets to any long random text
npm install                   # also creates package-lock.json: commit it
npm install-scripts approve --all
npm install bcrypt@npm:bcryptjs
npx prisma generate
npx prisma migrate dev --name init   # creates the tables + a migrations folder: commit it
npm run seed                  # demo data (31 trips). Logins, password password123:
                              #   owner@demo.in  manager@demo.in  accountant@demo.in  driver@demo.in

npm run dev                   # http://localhost:4000/health

# 4. web app (new terminal)
cd client
npm install                   # also creates package-lock.json: commit it
npm install
npm install-scripts approve --all
npm run dev                   # http://localhost:5173
```
#how to check data in db->
1. Keep your app running. Open a new terminal tab in VS Code.
2. cd server
3. npx prisma studio
4. In browser open new tab and search http://localhost:5555 

In VS Code you can also press `Ctrl+Shift+P` > "Tasks: Run Task" > **dev: everything**.
Press `F5` for the debugger on the API. Open `requests.http` and click "Send Request" to try the API.

Checks before every commit:

```bash
cd server && npm run lint && npm run build && npm test
cd client && npm run lint && npm run build
```

## Option B: everything in Docker

```bash
cp server/.env.example server/.env     # edit the JWT secrets
docker compose up --build
# web app: http://localhost:5173    API: http://localhost:4000/health
docker compose exec server npm run seed    # optional demo data
```

The server container runs `prisma db push` on start. After you create migrations with
`npx prisma migrate dev`, change that line in `docker/server.Dockerfile` to `npx prisma migrate deploy`.

> **Upgrading an existing database?** The schema gained `TripExpense.liters` and a few indexes.
> Run `npx prisma migrate dev --name expense-liters` (or `npx prisma db push` while developing).

## Screens

| Screen | Who | What it does |
| --- | --- | --- |
| Home (dashboard) | owner, manager, accountant | Profit, freight, expenses, cost per km, mileage, 6-month chart, expense mix, best routes, truck results, papers to renew, plain-language findings, one-tap approvals |
| Trips | everyone (drivers see their own) | Trip cards with spend meter, start / complete / close buttons, trip detail drawer, new / edit trip with a "quick check" of what that route usually costs |
| Expenses | everyone (drivers see their own) | Ledger across all trips, date / type / status filters, breakdown by type, truck or route, "higher than usual" flag, approve all, CSV export |
| Routes | owner, manager, accountant | Cost per km, mileage, margin and the freight to ask for, per route; quote calculator; add a route and its return in one go |
| Fleet | owner, manager, accountant | Trucks, drivers, parties: add, edit, delete, paper-expiry badges |

## Who can do what (Phase 1)

| Action | Owner | Manager | Accountant | Driver |
| --- | --- | --- | --- | --- |
| See trips | all | all | all | own trips only, no freight |
| Create trucks / drivers / routes | yes | yes | no | no |
| Create parties | yes | yes | yes | no |
| Create trip, change trip status | yes | yes | no | no |
| Add expense | approved at once | approved at once | approved at once | own trips only, goes to PENDING |
| Approve / reject expense | yes | yes | no | no |
| See trip profit | yes | no | yes | no |
| Reopen a closed trip | yes | no | no | no |
| See profit, margin, route profit | yes | no (costs only) | yes | no |
| Read trucks / drivers / parties / routes lists | yes | yes | yes | **no** |
| Edit or delete a trip | yes | yes | no | no |
| Delete an expense | yes | yes | no | own pending only |

## How the numbers are worked out

- Only **approved** expenses count. Pending and rejected ones are left out.
- Foreign-currency expenses are converted to INR with the rate entered on the expense.
- **Profit, margin, route and truck results use finished trips only** (completed or closed). A running trip has
  its full freight but only part of its costs, so counting it would overstate profit and mileage.
  The "Expenses" total does include running trips, because that money is already spent.
- Mileage (km per litre) = route distance / diesel litres, only for trips where litres were entered.
- "Freight to ask for" = average cost on that route / (1 - 15%), rounded up to the next ₹100.

## Known gaps (build next, in this order)

1. Excel import (map columns, preview, commit).
2. Invoices, payments, party ledger, ageing report (receivables, payments arrive 3 to 6 months late).
3. Driver salary and advances.
4. Create driver login accounts (the `Driver.userId` link exists, the screen does not).
5. Bill uploads to S3 (env variables exist, upload code does not).
6. Automated API tests that run against a test database (the pure logic in `services/` is tested; the routes are not).
7. Tokens are kept in localStorage: fine for development, review before real customers.
8. Lists are not paginated (fine for a few thousand trips).

## Security notes before real customers

- Replace both JWT secrets and the demo password; never commit `.env`.
- Run behind HTTPS, and keep daily database backups (and test a restore).
- Add refresh-token revocation and email verification before opening public signup.

# How to close the project.............................

Step 1: Stop the Front-end and Back-end Servers->
1. Go to your active terminal windows at the bottom of VS Code.
2. Click inside the terminal panel where the backend or frontend is running.
3. Press Ctrl + C on your keyboard.
4. Repeat this for your other open terminals tab until all live codes stop looping


Step 2: Shut Down the Docker Database->

Even if you close VS Code, your PostgreSQL database will continue running in the background via Docker. To turn it off:
1. In your terminal, make sure you are in the main project folder root (transport-saas). If you are still in a subfolder, type cd .. to go back.
2. Run this command to stop and remove the active container safely: docker compose down
3. Alternatively, you can open Docker Desktop and click the square Stop (Square Stop Icon) button next to the transport-saas container list.


Step 3: Close the Project Folder
• In the top-left menu of VS Code, click File > Close Folder (or simply close the VS Code window entirely).
Your project is now safely closed.

# NOW HOW TO RERUN THE PROJECT IF IT'S ALREADY COMPILED ONCE:

Step 1: Turn on the Database
1. Launch Docker Desktop on your computer and wait for the icon to turn green.
2. Open your project folder in VS Code and open a new terminal (`Ctrl + ``).
3. Start your database container by running BASH command : docker compose up -d db


Step 2: Launch the Backend Server
1. In your current terminal, navigate into the server folder: cd server
2. Start the backend application: npm run dev


Step 3: Launch the Frontend Interface
1. Open a second terminal split tab (click the + icon on the right side of the terminal bar, or press `Ctrl + Shift + ``).
2. Move into the client folder: cd client
3. Start the interface: npm run dev

Once the frontend terminal displays the blue link (http://localhost:5173), hold Ctrl and click it to open your operational dashboard in the browser! You can log in using owner@demo.in with the password password123

