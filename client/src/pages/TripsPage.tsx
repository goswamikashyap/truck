import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { del, patch, post, put } from "../api/client";
import type { Me, Trip } from "../lib/types";
import { canManage, canSeeProfit, isOffice } from "../lib/types";
import { CATEGORY_KEYS, catMeta, fmtDate, inr, inrShort, isoDay, num, routeName, STATUS, STATUS_ORDER, todayLocal, VERDICT } from "../lib/format";
import { tripCost, tripLiters, tripPending, useDrivers, useParties, useRefreshAll, useRouteStats, useRoutes, useTrips, useTrucks } from "../lib/hooks";
import { Badge, Button, Chip, Empty, ErrorBox, Field, IconButton, Modal, MoneyInput, PageSkeleton, SearchBox, useConfirm, useToast } from "../components/ui";
import { ExpenseModal } from "../components/ExpenseModal";
import { HBars } from "../components/charts";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";

const NEXT: Record<string, { to: Trip["status"]; label: string; icon: IconName; variant: "primary" | "success" | "gold" } | undefined> = {
  PLANNED: { to: "RUNNING", label: "Start trip", icon: "arrow", variant: "primary" },
  RUNNING: { to: "COMPLETED", label: "Mark completed", icon: "check", variant: "success" },
  COMPLETED: { to: "CLOSED", label: "Close trip", icon: "shield", variant: "gold" },
};

const isFinished = (t: Trip) => t.status === "COMPLETED" || t.status === "CLOSED";
const profitOf = (t: Trip) => (t.freightAmount == null ? null : Number(t.freightAmount) - tripCost(t));

/** Moves a trip along Planned → Running → Completed → Closed, with the right confirmation. */
function useTripActions(me: Me) {
  const refresh = useRefreshAll();
  const toast = useToast();
  const confirm = useConfirm();
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      patch(`/trips/${id}/status`, { status, ...(status === "COMPLETED" ? { endDate: todayLocal() } : {}) }),
    onSuccess: (_d, v) => {
      refresh();
      toast(({ RUNNING: "Trip started", COMPLETED: "Trip completed", CLOSED: "Trip closed and locked", PLANNED: "Trip planned" } as Record<string, string>)[v.status] ?? "Updated");
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });
  async function advance(t: Trip) {
    const n = NEXT[t.status];
    if (!n) return;
    if (n.to === "CLOSED") {
      const waiting = (t.expenses ?? []).filter((e) => e.approvalStatus === "PENDING").length;
      if (waiting) return toast(`Approve or reject the ${waiting} pending expense${waiting > 1 ? "s" : ""} first`, "warn");
      const ok = await confirm({
        title: `Close ${t.tripNo}?`,
        body: "Closing locks the trip. Nobody can add or change its expenses afterwards, and only the owner can reopen it.",
        confirmLabel: "Close trip",
        tone: "primary",
      });
      if (!ok) return;
    }
    move.mutate({ id: t.id, status: n.to });
  }
  async function reopen(t: Trip) {
    if (me.role !== "COMPANY_OWNER") return;
    const ok = await confirm({ title: `Reopen ${t.tripNo}?`, body: "The trip becomes editable again.", confirmLabel: "Reopen", tone: "primary" });
    if (ok) move.mutate({ id: t.id, status: "COMPLETED" });
  }
  return { advance, reopen, moving: move.isPending };
}

/* ====================================================================== page */

export default function TripsPage({ me }: { me: Me }) {
  const [sp, setSp] = useSearchParams();
  const { data: trips, isLoading, error, refetch } = useTrips();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(sp.get("new") === "1");
  const [editing, setEditing] = useState<Trip | null>(null);
  const [expenseFor, setExpenseFor] = useState<string | null>(null);
  const actions = useTripActions(me);
  const manage = canManage(me.role);
  const money = canSeeProfit(me.role);
  const office = isOffice(me.role);

  const status = sp.get("status") ?? "ALL";
  const openId = sp.get("open");
  const setParam = (k: string, v: string | null) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v == null || v === "ALL") n.delete(k);
      else n.set(k, v);
      return n;
    }, { replace: true });

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: trips?.length ?? 0, LOSS: 0 };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const t of trips ?? []) {
      c[t.status]++;
      if (money && isFinished(t) && (profitOf(t) ?? 0) < 0) c.LOSS++;
    }
    return c;
  }, [trips, money]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (trips ?? []).filter((t) => {
      if (status === "LOSS") {
        if (!isFinished(t) || (profitOf(t) ?? 0) >= 0) return false;
      } else if (status !== "ALL" && t.status !== status) return false;
      if (!needle) return true;
      return [t.tripNo, t.truck?.regNo, t.driver?.name, t.party?.name, t.route?.origin, t.route?.destination, t.loadDesc]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [trips, status, q]);

  const openTrip = trips?.find((t) => t.id === openId) ?? null;

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorBox error={error} retry={() => refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">{office ? "Trips" : "My trips"}</h1>
          <p className="page-sub">{office ? "Every trip, its route and what it cost." : "Your trips. Tap one to add an expense."}</p>
        </div>
        {manage && <Button size="lg" icon="plus" onClick={() => setCreating(true)}>New trip</Button>}
      </div>

      <div className="scroll-x">
        <div className="chips" style={{ flexWrap: "nowrap" }}>
          <Chip on={status === "ALL"} onClick={() => setParam("status", "ALL")} count={counts.ALL}>All</Chip>
          {STATUS_ORDER.map((s) => (
            <Chip key={s} on={status === s} onClick={() => setParam("status", s)} count={counts[s]}>{STATUS[s].label}</Chip>
          ))}
          {money && counts.LOSS > 0 && (
            <Chip on={status === "LOSS"} onClick={() => setParam("status", "LOSS")} count={counts.LOSS}>Made a loss</Chip>
          )}
        </div>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Search trip, truck, driver, party or route" />

      {shown.length === 0 ? (
        <div className="card">
          {(trips?.length ?? 0) === 0 ? (
            <Empty
              icon="truck"
              title={office ? "No trips yet" : "No trips assigned to you"}
              body={office ? "Add a truck, a driver and a party under Fleet, then create your first trip." : "Your manager will assign trips to you. They show up here."}
              action={manage ? <Button icon="plus" onClick={() => setCreating(true)}>Create the first trip</Button> : undefined}
            />
          ) : (
            <Empty icon="search" title="No trips match" body="Try another status or clear the search." action={<Button variant="soft" onClick={() => { setQ(""); setParam("status", "ALL"); }}>Show all trips</Button>} />
          )}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 480px), 1fr))" }}>
          {shown.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              money={money}
              office={office}
              manage={manage}
              me={me}
              onOpen={() => setParam("open", t.id)}
              onExpense={() => setExpenseFor(t.id)}
              actions={actions}
            />
          ))}
        </div>
      )}

      <TripFormModal open={creating} onClose={() => { setCreating(false); if (sp.get("new")) setParam("new", null); }} me={me} presetRoute={sp.get("route") ?? undefined} />
      <TripFormModal open={!!editing} onClose={() => setEditing(null)} me={me} trip={editing ?? undefined} />
      <TripDrawer
        trip={openTrip}
        me={me}
        onClose={() => setParam("open", null)}
        onEdit={(t) => setEditing(t)}
        onExpense={(id) => setExpenseFor(id)}
        actions={actions}
      />
      <ExpenseModal open={!!expenseFor} onClose={() => setExpenseFor(null)} me={me} tripId={expenseFor ?? undefined} />
    </div>
  );
}

/* ================================================================= trip card */

function TripCard({ trip: t, money, office, manage, me, onOpen, onExpense, actions }: {
  trip: Trip;
  money: boolean;
  office: boolean;
  manage: boolean;
  me: Me;
  onOpen: () => void;
  onExpense: () => void;
  actions: ReturnType<typeof useTripActions>;
}) {
  const cost = tripCost(t);
  const pend = tripPending(t);
  const freight = t.freightAmount == null ? null : Number(t.freightAmount);
  const profit = freight == null ? null : freight - cost;
  const used = freight ? Math.min(100, (cost / freight) * 100) : 0;
  const next = NEXT[t.status];
  const st = STATUS[t.status];
  const loss = money && isFinished(t) && profit != null && profit < 0;
  const live = t.status === "RUNNING";
  return (
    <article className="row-card interactive" style={{ ["--accent" as any]: loss ? "var(--coral)" : st.accent, paddingLeft: 22 }} onClick={onOpen}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="display" style={{ fontWeight: 800, fontSize: 15 }}>{t.tripNo}</span>
            <Badge tone={st.badge}>{st.label}</Badge>
            {pend > 0 && <Badge tone="badge-gold"><Icon name="clock" size={12} /> {inr(pend)} pending</Badge>}
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 800, marginTop: 8, lineHeight: 1.15 }}>
            {t.route ? routeName(t.route) : <span className="faint">No route set</span>}
          </h3>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            {t.truck?.regNo} · {t.driver?.name} · {t.party?.name}
          </div>
        </div>
        {office && freight != null && (
          <div style={{ textAlign: "right", flex: "none" }}>
            <div className="num display" style={{ fontWeight: 800, fontSize: 20 }}>{inrShort(money && t.status !== "PLANNED" ? profit : freight)}</div>
            <div className="faint" style={{ fontSize: 12, fontWeight: 700 }}>{money && t.status !== "PLANNED" ? (live ? "profit so far" : loss ? "loss" : "profit") : "freight"}</div>
          </div>
        )}
      </div>

      {office && freight != null && t.status !== "PLANNED" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
            <span className="muted">Spent {inr(cost)}</span>
            <span className="faint">of {inr(freight)} freight</span>
          </div>
          <div className="meter"><i style={{ width: `${used}%`, ["--c" as any]: used > 90 ? "var(--coral)" : used > 70 ? "var(--gold)" : "var(--teal)" }} /></div>
        </div>
      )}
      {!office && (
        <div className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>
          Approved so far {inr(cost)} · started {fmtDate(t.startDate)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
        {t.status !== "CLOSED" && <Button variant="soft" size="sm" icon="plus" onClick={onExpense}>Expense</Button>}
        {manage && next && (
          <Button variant={next.variant} size="sm" icon={next.icon} onClick={() => actions.advance(t)} disabled={actions.moving}>{next.label}</Button>
        )}
        {me.role === "COMPANY_OWNER" && t.status === "CLOSED" && (
          <Button variant="ghost" size="sm" onClick={() => actions.reopen(t)}>Reopen</Button>
        )}
        <Button variant="ghost" size="sm" onClick={onOpen} style={{ marginLeft: "auto" }}>Details</Button>
      </div>
    </article>
  );
}

/* ============================================================== trip drawer */

function TripDrawer({ trip, me, onClose, onEdit, onExpense, actions }: {
  trip: Trip | null;
  me: Me;
  onClose: () => void;
  onEdit: (t: Trip) => void;
  onExpense: (tripId: string) => void;
  actions: ReturnType<typeof useTripActions>;
}) {
  const refresh = useRefreshAll();
  const toast = useToast();
  const confirm = useConfirm();
  const manage = canManage(me.role);
  const money = canSeeProfit(me.role);
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) => post(`/expenses/${id}/approve`, { decision }),
    onSuccess: (_d, v) => {
      refresh();
      toast(v.decision === "APPROVE" ? "Approved" : "Rejected");
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/expenses/${id}`),
    onSuccess: () => {
      refresh();
      toast("Expense removed");
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });
  const removeTrip = useMutation({
    mutationFn: (id: string) => del(`/trips/${id}`),
    onSuccess: () => {
      refresh();
      toast("Trip deleted");
      onClose();
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });

  if (!trip) return null;
  const t = trip;
  const expenses = t.expenses ?? [];
  const cost = tripCost(t);
  const pend = tripPending(t);
  const freight = t.freightAmount == null ? null : Number(t.freightAmount);
  const profit = freight == null ? null : freight - cost;
  const margin = freight && profit != null ? (profit / freight) * 100 : null;
  const liters = tripLiters(t);
  const km = t.route ? Number(t.route.distanceKm) : 0;
  // Mileage is only meaningful once the trip is over and all the diesel has been entered.
  const kmpl = isFinished(t) && liters > 0 && km > 0 ? km / liters : null;
  const byCat = CATEGORY_KEYS.map((k) => ({
    key: k,
    label: catMeta(k).label,
    value: expenses.filter((e) => e.category === k && e.approvalStatus === "APPROVED").reduce((s, e) => s + Number(e.amount) * Number(e.fxRate || 1), 0),
    color: catMeta(k).color,
  })).filter((r) => r.value > 0);
  const step = STATUS_ORDER.indexOf(t.status);
  const next = NEXT[t.status];
  const canDeleteTrip = manage && t.status === "PLANNED" && expenses.length === 0;
  const verdict = margin == null || !isFinished(t) ? null : margin >= 20 ? "great" : margin >= 10 ? "good" : margin >= 0 ? "thin" : "loss";

  return (
    <Modal
      open
      side
      onClose={onClose}
      title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}>{t.tripNo} <Badge tone={STATUS[t.status].badge}>{STATUS[t.status].label}</Badge></span>}
      footer={
        <>
          {t.status !== "CLOSED" && <Button variant="soft" icon="plus" onClick={() => onExpense(t.id)}>Add expense</Button>}
          {manage && next && <Button variant={next.variant} icon={next.icon} onClick={() => actions.advance(t)} disabled={actions.moving}>{next.label}</Button>}
          {me.role === "COMPANY_OWNER" && t.status === "CLOSED" && <Button variant="ghost" onClick={() => actions.reopen(t)}>Reopen trip</Button>}
        </>
      }
    >
      <div className="grid gap-5">
        <div className="stepper" aria-label="Trip progress">
          {STATUS_ORDER.map((s, i) => (
            <div key={s} className={`step ${i < step ? "done" : i === step ? "now" : ""}`}><i />{STATUS[s].label}</div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{t.route ? routeName(t.route) : "No route set"}</h3>
          {t.route && <div className="muted" style={{ marginTop: 4 }}>{num(t.route.distanceKm)} km</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="kv"><span className="k">Truck</span><span className="v">{t.truck?.regNo}</span></div>
          <div className="kv"><span className="k">Driver</span><span className="v">{t.driver?.name}</span></div>
          <div className="kv"><span className="k">Party</span><span className="v">{t.party?.name}</span></div>
          <div className="kv"><span className="k">Load</span><span className="v">{t.loadDesc || "–"}</span></div>
          <div className="kv"><span className="k">Started</span><span className="v">{fmtDate(t.startDate, true)}</span></div>
          <div className="kv"><span className="k">Finished</span><span className="v">{t.endDate ? fmtDate(t.endDate, true) : "–"}</span></div>
        </div>

        {freight != null && (
          <div className="card-flat" style={{ padding: 14 }}>
            <div className="grid grid-cols-3 gap-2">
              <div className="kv"><span className="k">Freight</span><span className="v num">{inr(freight)}</span></div>
              <div className="kv"><span className="k">Spent</span><span className="v num">{inr(cost)}</span></div>
              {money && <div className="kv"><span className="k">Profit</span><span className="v num" style={{ color: (profit ?? 0) < 0 ? "var(--coral-d)" : "var(--teal-d)" }}>{inr(profit)}</span></div>}
            </div>
            {money && verdict && (
              <div className={`verdict tone-${VERDICT[verdict].tone}`} style={{ marginTop: 12 }}>
                <Icon name={verdict === "loss" ? "alert" : "trend"} />
                <div>{VERDICT[verdict].label}: {margin!.toFixed(1)}% of freight kept{pend > 0 ? `. Another ${inr(pend)} is waiting for approval.` : "."}</div>
              </div>
            )}
          </div>
        )}
        {freight == null && (
          <div className="card-flat" style={{ padding: 14 }}>
            <div className="kv"><span className="k">Approved expenses</span><span className="v num">{inr(cost)}</span></div>
            {pend > 0 && <div className="muted" style={{ marginTop: 6 }}>{inr(pend)} waiting for approval</div>}
          </div>
        )}

        {kmpl != null && (
          <div className="verdict tone-info">
            <Icon name="fuel" />
            <div>Mileage {kmpl.toFixed(2)} km per litre ({num(liters, 1)} L over {num(km)} km). {kmpl < 3.5 ? "That is low for a loaded truck." : ""}</div>
          </div>
        )}

        {byCat.length > 0 && (
          <div>
            <div className="card-title" style={{ fontSize: 15 }}>Spending by type</div>
            <HBars rows={byCat} />
          </div>
        )}

        <div>
          <div className="card-title" style={{ fontSize: 15 }}>Expenses ({expenses.length})</div>
          {expenses.length === 0 ? (
            <p className="muted">No expenses yet.</p>
          ) : (
            <div className="grid gap-2">
              {expenses.map((e) => {
                const c = catMeta(e.category);
                const own = e.enteredById === me.id && e.approvalStatus === "PENDING";
                const canRemove = t.status !== "CLOSED" && (manage || own);
                return (
                  <div key={e.id} className="card-flat" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", opacity: e.approvalStatus === "REJECTED" ? 0.6 : 1 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 13, background: c.light, color: c.color, display: "grid", placeItems: "center", flex: "none" }}>
                      <Icon name={c.icon as IconName} size={20} />
                    </span>
                    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>
                        {c.label} <span className="num">{inr(Number(e.amount) * Number(e.fxRate || 1))}</span>
                        {e.currency !== "INR" && <span className="faint" style={{ fontSize: 12 }}> ({num(e.amount, 2)} {e.currency})</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtDate(e.date)}{e.liters ? ` · ${num(e.liters, 1)} L` : ""}{e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                    {e.approvalStatus !== "APPROVED" && <Badge tone={e.approvalStatus === "PENDING" ? "badge-gold" : "badge-coral"}>{e.approvalStatus === "PENDING" ? "Pending" : "Rejected"}</Badge>}
                    {manage && e.approvalStatus === "PENDING" && t.status !== "CLOSED" && (
                      <>
                        <IconButton icon="x" label="Reject" small danger onClick={() => decide.mutate({ id: e.id, decision: "REJECT" })} />
                        <IconButton icon="check" label="Approve" small onClick={() => decide.mutate({ id: e.id, decision: "APPROVE" })} />
                      </>
                    )}
                    {canRemove && (
                      <IconButton
                        icon="trash"
                        label="Remove expense"
                        small
                        danger
                        onClick={async () => {
                          if (await confirm({ title: "Remove this expense?", body: `${c.label} ${inr(Number(e.amount) * Number(e.fxRate || 1))} will be deleted from ${t.tripNo}.`, confirmLabel: "Remove" })) remove.mutate(e.id);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {manage && t.status !== "CLOSED" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" icon="edit" onClick={() => onEdit(t)}>Edit trip</Button>
            {canDeleteTrip && (
              <Button
                variant="soft-coral"
                icon="trash"
                onClick={async () => {
                  if (await confirm({ title: `Delete ${t.tripNo}?`, body: "This planned trip has no expenses. It will be removed.", confirmLabel: "Delete trip" })) removeTrip.mutate(t.id);
                }}
              >
                Delete trip
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ============================================================= trip form */

function TripFormModal({ open, onClose, me, trip, presetRoute }: { open: boolean; onClose: () => void; me: Me; trip?: Trip; presetRoute?: string }) {
  const refresh = useRefreshAll();
  const toast = useToast();
  const money = canSeeProfit(me.role);
  const trucks = useTrucks(open);
  const drivers = useDrivers(open);
  const parties = useParties(open);
  const routes = useRoutes(open);
  const stats = useRouteStats(open);
  const all = useTrips();
  const editing = !!trip;
  const blank = { truckId: "", driverId: "", partyId: "", routeId: "", startDate: todayLocal(), freightAmount: "", loadDesc: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (trip) {
      setF({
        truckId: trip.truckId,
        driverId: trip.driverId,
        partyId: trip.partyId,
        routeId: trip.routeId ?? "",
        startDate: isoDay(trip.startDate),
        freightAmount: trip.freightAmount != null ? String(Number(trip.freightAmount)) : "",
        loadDesc: trip.loadDesc ?? "",
      });
    } else {
      setF({ ...blank, startDate: todayLocal(), routeId: presetRoute ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip?.id, presetRoute]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const busy = (kind: "truckId" | "driverId") => {
    const id = f[kind];
    if (!id) return null;
    return (all.data ?? []).find((t) => t.status === "RUNNING" && t[kind] === id && t.id !== trip?.id) ?? null;
  };
  const busyTruck = busy("truckId");
  const busyDriver = busy("driverId");

  const stat = stats.data?.find((s) => s.id === f.routeId);
  const freight = Number(f.freightAmount);
  const expected = stat && stat.trips > 0 ? stat.avgExpense : null;
  const exProfit = expected != null && freight > 0 ? freight - expected : null;
  const exMargin = exProfit != null ? (exProfit / freight) * 100 : null;
  const verdictKey = exMargin == null ? null : exMargin >= 20 ? "great" : exMargin >= 10 ? "good" : exMargin >= 0 ? "thin" : "loss";

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (editing ? put<any>(`/trips/${trip!.id}`, body) : post<any>("/trips", body)),
    onSuccess: (res) => {
      refresh();
      toast(editing ? "Trip updated" : "Trip created");
      (res?.warnings ?? []).forEach((w: string) => toast(w, "warn"));
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit() {
    setError("");
    if (!f.truckId || !f.driverId || !f.partyId) return setError("Choose a truck, a driver and a party.");
    if (!(freight > 0)) return setError("Enter the freight amount.");
    save.mutate({
      truckId: f.truckId,
      driverId: f.driverId,
      partyId: f.partyId,
      startDate: f.startDate,
      freightAmount: freight,
      ...(f.routeId ? { routeId: f.routeId } : {}),
      ...(f.loadDesc.trim() ? { loadDesc: f.loadDesc.trim() } : {}),
    });
  }

  const missing = open && !trucks.isLoading && !drivers.isLoading && !parties.isLoading && (!trucks.data?.length || !drivers.data?.length || !parties.data?.length);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? `Edit ${trip!.tripNo}` : "New trip"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending} icon="check">{editing ? "Save changes" : "Create trip"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {missing && (
          <div className="verdict tone-warn"><Icon name="alert" /><div>Add at least one truck, driver and party under Fleet before creating a trip.</div></div>
        )}

        <Field label="Route" hint="Pick a route to see what trips here usually cost.">
          <select className="select" value={f.routeId} onChange={set("routeId")}>
            <option value="">No route / one-off</option>
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>{routeName(r)} · {num(r.distanceKm)} km</option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Field label="Truck" error={busyTruck ? `Still on ${busyTruck.tripNo}` : undefined}>
            <select className="select" value={f.truckId} onChange={set("truckId")}>
              <option value="">Choose…</option>
              {trucks.data?.map((t) => <option key={t.id} value={t.id}>{t.regNo} · {t.type}</option>)}
            </select>
          </Field>
          <Field label="Driver" error={busyDriver ? `Still on ${busyDriver.tripNo}` : undefined}>
            <select className="select" value={f.driverId} onChange={set("driverId")}>
              <option value="">Choose…</option>
              {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Party (customer)">
            <select className="select" value={f.partyId} onChange={set("partyId")}>
              <option value="">Choose…</option>
              {parties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Freight (what the party pays)">
            <MoneyInput value={f.freightAmount} onChange={(v) => setF({ ...f, freightAmount: v })} required />
          </Field>
          <Field label="Start date">
            <input className="input" type="date" value={f.startDate} onChange={set("startDate")} />
          </Field>
        </div>

        {f.routeId && stat && (
          <div className="card-flat" style={{ padding: 14, background: "#fafaff" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800, marginBottom: 6 }}>
              <Icon name="gauge" /> Quick check for {routeName(stat)}
            </div>
            {stat.trips === 0 ? (
              <p className="muted">No finished trips on this route yet, so there is nothing to compare. This trip will become the first data point.</p>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Across {stat.trips} past trip{stat.trips > 1 ? "s" : ""} the cost was about <b className="num">{inr(stat.avgExpense)}</b>
                  {stat.costPerKm != null && <> ({inr(stat.costPerKm)} per km)</>}.
                </p>
                {money && stat.suggestedFreight ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span>To keep 15% profit, ask for <b className="num">{inr(stat.suggestedFreight)}</b></span>
                    <Button size="sm" variant="soft" onClick={() => setF({ ...f, freightAmount: String(stat.suggestedFreight) })}>Use this</Button>
                  </div>
                ) : null}
                {money && exProfit != null && verdictKey && (
                  <div className={`verdict tone-${VERDICT[verdictKey].tone}`}>
                    <Icon name={verdictKey === "loss" ? "alert" : "trend"} />
                    <div>
                      At {inr(freight)} you would make about <b className="num">{inr(exProfit)}</b> ({exMargin!.toFixed(0)}%). {VERDICT[verdictKey].label}.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(busyTruck || busyDriver) && (
          <div className="verdict tone-warn">
            <Icon name="alert" />
            <div>
              {busyTruck && <div>{busyTruck.truck?.regNo} is still on running trip {busyTruck.tripNo}.</div>}
              {busyDriver && <div>{busyDriver.driver?.name} is still on running trip {busyDriver.tripNo}.</div>}
              <div style={{ fontWeight: 500 }}>You can still save, but check the plan.</div>
            </div>
          </div>
        )}

        <Field label="Load" hint="Optional">
          <input className="input" placeholder="e.g. 24 tons steel coils" value={f.loadDesc} onChange={set("loadDesc")} />
        </Field>

        {error && (
          <div className="verdict tone-bad" role="alert"><Icon name="alert" /><div>{error}</div></div>
        )}
      </div>
    </Modal>
  );
}
