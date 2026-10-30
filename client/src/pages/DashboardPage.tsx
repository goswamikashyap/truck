import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, post } from "../api/client";
import type { Me, LedgerExpense } from "../lib/types";
import { canManage, KEYS } from "../lib/types";
import { catMeta, fmtDate, greeting, inr, inrShort, num, routeName, VERDICT } from "../lib/format";
import { useCountUp, Badge, Button, ErrorBox, PageSkeleton, Segmented, useToast, Empty } from "../components/ui";
import { Donut, HBars, MonthBars } from "../components/charts";
import { Icon } from "../components/Icon";
import { useDashboard, useRefreshAll } from "../lib/hooks";

const RANGES = [
  { value: 30, label: "30 days" },
  { value: 90, label: "3 months" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
];

const TONE_ICON = { good: "trend", warn: "alert", bad: "alert", info: "spark" } as const;

export default function DashboardPage({ me }: { me: Me }) {
  const nav = useNavigate();
  const toast = useToast();
  const refresh = useRefreshAll();
  const [days, setDays] = useState(180);
  const { data, isLoading, error, refetch } = useDashboard(days);
  const manage = canManage(me.role);
  const pending = useQuery({
    queryKey: [...KEYS.pending, "full"],
    queryFn: () => api<LedgerExpense[]>("/expenses/pending"),
    enabled: manage,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) => post(`/expenses/${id}/approve`, { decision }),
    onSuccess: (_d, v) => {
      refresh();
      pending.refetch();
      toast(v.decision === "APPROVE" ? "Approved" : "Rejected");
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });

  const money = data?.showMoney ?? false;
  const headline = useCountUp(money ? data?.kpis.profit : data?.kpis.expenses);
  const k = data?.kpis;

  if (isLoading) return <PageSkeleton />;
  if (error || !data || !k) return <ErrorBox error={error} retry={() => refetch()} />;

  const noData = data.monthly.every((m) => m.trips === 0) && k.tripsInRange === 0;
  const first = me.name.split(" ")[0];

  return (
    <div className="grid gap-5">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">{greeting()}, {first}</h1>
          <p className="page-sub">Here is how {me.company?.name ?? "your company"} is doing.</p>
        </div>
        <Segmented value={days} onChange={setDays} options={RANGES} />
      </div>

      {noData ? (
        <div className="card">
          <Empty
            icon="truck"
            title="No trips in this period yet"
            body="Add your trucks, drivers and routes, then create your first trip. Profit and expenses will appear here."
            action={<Link to="/fleet" className="btn btn-primary">Add trucks and drivers</Link>}
          />
        </div>
      ) : (
        <section className="hero">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between" }}>
            <div style={{ minWidth: 220 }}>
              <div style={{ color: "#aab0e0", fontWeight: 700 }}>{money ? "Profit on finished trips" : "Spent on expenses"} · last {RANGES.find((r) => r.value === days)?.label}</div>
              <div className="hero-num num" style={{ margin: "10px 0 12px", color: money && (k.profit ?? 0) < 0 ? "#ff9aa6" : "#fff" }}>
                {inrShort(headline)}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {money && k.marginPct != null && <span className="badge" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>{k.marginPct}% margin</span>}
                <span className="badge" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>{k.tripsInRange} trips</span>
                {k.kmPerLitre != null && <span className="badge" style={{ background: "rgba(255,179,0,.25)", color: "#ffd777" }}>{k.kmPerLitre} km/l</span>}
              </div>
            </div>
            <div style={{ flex: "1 1 340px", minWidth: 280 }}>
              <div style={{ display: "flex", gap: 14, color: "#aab0e0", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                {money && <span><i className="dot" style={{ color: "#8f7bff" }} /> Freight</span>}
                <span><i className="dot" style={{ color: "#ffb300" }} /> Expenses</span>
                <span style={{ marginLeft: "auto", opacity: 0.8 }}>tap a month</span>
              </div>
              <MonthBars data={data.monthly} showMoney={money} />
            </div>
          </div>
          <div className="hero-road" />
        </section>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {money && (
          <button className="tile tile-violet interactive" onClick={() => nav("/trips")}>
            <span className="tile-label">Freight earned</span>
            <span className="tile-value num">{inrShort(k.freight)}</span>
            <span className="tile-note">{k.lossTrips ? `${k.lossTrips} trip${k.lossTrips > 1 ? "s" : ""} made a loss` : "No loss-making trips"}</span>
          </button>
        )}
        <button className="tile tile-coral interactive" onClick={() => nav("/expenses")}>
          <span className="tile-label">Expenses</span>
          <span className="tile-value num">{inrShort(k.expenses)}</span>
          <span className="tile-note">{k.costPerKm != null ? `${inr(k.costPerKm)} per km` : "Add routes to see cost per km"}</span>
        </button>
        <button className="tile tile-teal interactive" onClick={() => nav("/trips?status=RUNNING")}>
          <span className="tile-label">Trucks on the road</span>
          <span className="tile-value num">{k.running}</span>
          <span className="tile-note">{k.planned} planned next</span>
        </button>
        <button className="tile tile-gold interactive" onClick={() => nav("/expenses?status=PENDING")}>
          <span className="tile-label">Waiting for approval</span>
          <span className="tile-value num">{k.pendingApprovals}</span>
          <span className="tile-note">{k.pendingApprovals ? "Tap to review" : "All caught up"}</span>
        </button>
      </div>

      {manage && (pending.data?.length ?? 0) > 0 && (
        <section className="card">
          <div className="card-title">
            <Icon name="clock" /> Approve driver expenses
            <Badge tone="badge-gold">{pending.data!.length}</Badge>
          </div>
          <div className="grid gap-2">
            {pending.data!.slice(0, 5).map((x: any) => {
              const c = catMeta(x.category);
              return (
                <div key={x.id} className="card-flat" style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <span style={{ width: 42, height: 42, borderRadius: 14, background: c.light, color: c.color, display: "grid", placeItems: "center" }}>
                    <Icon name={c.icon as any} />
                  </span>
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{c.label} <span className="num">{inr(Number(x.amount) * Number(x.fxRate || 1))}</span></div>
                    <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {x.trip.tripNo} · {x.trip.truck?.regNo} · {fmtDate(x.date)}{x.notes ? ` · ${x.notes}` : ""}
                    </div>
                  </div>
                  <Button variant="soft-coral" onClick={() => decide.mutate({ id: x.id, decision: "REJECT" })} icon="x" disabled={decide.isPending}>Reject</Button>
                  <Button variant="success" onClick={() => decide.mutate({ id: x.id, decision: "APPROVE" })} icon="check" disabled={decide.isPending}>Approve</Button>
                </div>
              );
            })}
          </div>
          {pending.data!.length > 5 && <Link to="/expenses?status=PENDING" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>See all {pending.data!.length}</Link>}
        </section>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        <section className="card">
          <div className="card-title"><Icon name="spark" /> What needs your attention</div>
          {data.insights.length === 0 ? (
            <p className="muted">Nothing urgent. Keep entering expenses and findings will show up here.</p>
          ) : (
            <div className="grid gap-2">
              {data.insights.map((i, idx) => (
                <div key={idx} className={`insight tone-${i.tone}`}>
                  <span className="ico"><Icon name={TONE_ICON[i.tone]} size={20} /></span>
                  <div>
                    <div style={{ fontWeight: 800 }}>{i.title}</div>
                    <div style={{ fontSize: 14, color: "var(--muted)" }}>{i.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title"><Icon name="receipt" /> Where the money goes</div>
          {data.categories.length === 0 ? (
            <p className="muted">No approved expenses yet.</p>
          ) : (
            <Donut
              items={data.categories.map((c) => ({ key: c.category, label: catMeta(c.category).label, value: c.amount, color: catMeta(c.category).color }))}
              onPick={(key) => nav(`/expenses?category=${key}`)}
            />
          )}
        </section>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        <section className="card">
          <div className="card-title" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="route" /> {money ? "Best routes" : "Busiest routes"}</span>
            <Link to="/routes" className="btn btn-soft btn-sm">All routes</Link>
          </div>
          {data.topRoutes.length === 0 ? (
            <p className="muted">Pick a route when you create trips and the best ones will rank here.</p>
          ) : (
            <div className="grid gap-3">
              {data.topRoutes.map((r) => (
                <div key={r.id} className="card-flat" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{routeName(r)}</div>
                    {r.verdict && <Badge tone={VERDICT[r.verdict].badge}>{VERDICT[r.verdict].label}</Badge>}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {r.trips} trip{r.trips > 1 ? "s" : ""} · {num(r.distanceKm)} km
                    {r.costPerKm != null && ` · cost ${inr(r.costPerKm)}/km`}
                    {money && r.profitPerKm != null && ` · profit ${inr(r.profitPerKm)}/km`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title"><Icon name="truck" /> {money ? "Truck by truck" : "Trucks"}</div>
          {data.trucks.length === 0 ? (
            <p className="muted">No truck has completed a trip in this period.</p>
          ) : (
            <HBars
              rows={data.trucks.slice(0, 6).map((t) => ({
                key: t.id,
                label: t.regNo,
                sub: `${t.trips} trips${t.kmPerLitre ? ` · ${t.kmPerLitre} km/l` : ""}`,
                value: money ? t.profit ?? 0 : t.expenses,
                color: money && (t.profit ?? 0) < 0 ? "#f2455a" : "#00a99b",
                right: money ? inrShort(t.profit) : inrShort(t.expenses),
              }))}
            />
          )}
        </section>
      </div>

      {data.alerts.length > 0 && (
        <section className="card">
          <div className="card-title"><Icon name="flag" /> Papers to renew</div>
          <div className="chips">
            {data.alerts.map((a, i) => (
              <Link key={i} to="/fleet" className={`badge ${a.level === "expired" ? "badge-coral" : "badge-gold"}`} style={{ height: 40, padding: "0 14px", fontSize: 14, textDecoration: "none" }}>
                {a.label} · {a.doc} · {a.level === "expired" ? `expired ${-a.daysLeft}d ago` : a.daysLeft === 0 ? "today" : `${a.daysLeft}d left`}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
