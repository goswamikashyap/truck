import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, del, post } from "../api/client";
import type { LedgerExpense, Me } from "../lib/types";
import { canManage, KEYS } from "../lib/types";
import { CATEGORY_KEYS, catMeta, daysAgoLocal, downloadCsv, fmtDate, inr, inrShort, monthStartLocal, num, routeName, todayLocal } from "../lib/format";
import { useMedia, useRefreshAll } from "../lib/hooks";
import { Badge, Button, Chip, Empty, ErrorBox, IconButton, PageSkeleton, SearchBox, Segmented, useConfirm, useToast } from "../components/ui";
import { Donut, HBars } from "../components/charts";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { ExpenseModal } from "../components/ExpenseModal";

type Preset = "month" | "30" | "90" | "all";
type Group = "category" | "truck" | "route";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

function rangeFor(p: Preset) {
  if (p === "month") return { from: monthStartLocal(), to: todayLocal() };
  if (p === "30") return { from: daysAgoLocal(30), to: todayLocal() };
  if (p === "90") return { from: daysAgoLocal(90), to: todayLocal() };
  return { from: "", to: "" };
}

const STATUS_TONE = { PENDING: "badge-gold", APPROVED: "badge-teal", REJECTED: "badge-coral" } as const;

export default function ExpensesPage({ me }: { me: Me }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const refresh = useRefreshAll();
  const [sp, setSp] = useSearchParams();
  const [preset, setPreset] = useState<Preset>(sp.get("status") === "PENDING" ? "all" : "90");
  const [{ from, to }, setRange] = useState(() => rangeFor(sp.get("status") === "PENDING" ? "all" : "90"));
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group>("category");
  const [adding, setAdding] = useState(false);
  const wide = useMedia("(min-width: 820px)");
  const manage = canManage(me.role);

  const status = sp.get("status") ?? "ALL";
  const category = sp.get("category") ?? "ALL";
  const tripFilter = sp.get("trip");
  const setParam = (k: string, v: string | null) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v == null || v === "ALL") n.delete(k);
      else n.set(k, v);
      return n;
    }, { replace: true });

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...KEYS.expenses, from, to],
    queryFn: () => api<LedgerExpense[]>(`/expenses?${qs.toString()}`),
  });

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

  const all = useMemo(() => data ?? [], [data]);

  /** "Higher than usual" flag: more than 1.8x that category's average, once there are 4+ entries to compare. */
  const usual = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const e of all) {
      if (e.approvalStatus !== "APPROVED") continue;
      const x = m.get(e.category) ?? { sum: 0, n: 0 };
      x.sum += e.amountInr;
      x.n++;
      m.set(e.category, x);
    }
    return m;
  }, [all]);
  const isHigh = (e: LedgerExpense) => {
    const u = usual.get(e.category);
    return !!u && u.n >= 4 && e.amountInr > (u.sum / u.n) * 1.8;
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (status !== "ALL" && e.approvalStatus !== status) return false;
      if (category !== "ALL" && e.category !== category) return false;
      if (tripFilter && e.tripId !== tripFilter) return false;
      if (!needle) return true;
      return [e.trip.tripNo, e.trip.truck?.regNo, e.notes, catMeta(e.category).label, e.trip.route?.origin, e.trip.route?.destination]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [all, status, category, tripFilter, q]);

  const approved = visible.filter((e) => e.approvalStatus === "APPROVED");
  const pending = visible.filter((e) => e.approvalStatus === "PENDING");
  const total = approved.reduce((s, e) => s + e.amountInr, 0);
  const pendingTotal = pending.reduce((s, e) => s + e.amountInr, 0);
  const litres = approved.reduce((s, e) => s + Number(e.liters ?? 0), 0);
  const tripCount = new Set(approved.map((e) => e.tripId)).size;

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; value: number; color: string }>();
    approved.forEach((e) => {
      const key = group === "category" ? e.category : group === "truck" ? e.trip.truck?.regNo ?? "Unknown" : routeName(e.trip.route);
      const cur = m.get(key) ?? {
        label: group === "category" ? catMeta(e.category).label : key,
        value: 0,
        color: group === "category" ? catMeta(e.category).color : "#5b3df5",
      };
      cur.value += e.amountInr;
      m.set(key, cur);
    });
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value);
  }, [approved, group]);

  function pickPreset(p: Preset) {
    setPreset(p);
    setRange(rangeFor(p));
  }

  async function approveAll() {
    const ok = await confirm({
      title: `Approve ${pending.length} expense${pending.length > 1 ? "s" : ""}?`,
      body: `Together they are ${inr(pendingTotal)} and will count in trip profit.`,
      confirmLabel: "Approve all",
      tone: "primary",
    });
    if (!ok) return;
    const results = await Promise.allSettled(pending.map((e) => post(`/expenses/${e.id}/approve`, { decision: "APPROVE" })));
    refresh();
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `${pending.length - failed} approved, ${failed} failed` : "All approved", failed ? "warn" : "ok");
  }

  function exportCsv() {
    downloadCsv(`expenses-${todayLocal()}.csv`, [
      ["Date", "Trip", "Truck", "Route", "Category", "Note", "Litres", "Amount", "Currency", "Rate to INR", "Amount in INR", "Status"],
      ...visible.map((e) => [
        fmtDate(e.date, true),
        e.trip.tripNo,
        e.trip.truck?.regNo ?? "",
        e.trip.route ? routeName(e.trip.route) : "",
        catMeta(e.category).label,
        e.notes ?? "",
        e.liters ?? "",
        Number(e.amount),
        e.currency,
        Number(e.fxRate),
        e.amountInr,
        e.approvalStatus,
      ]),
    ]);
    toast(`Exported ${visible.length} expenses`);
  }

  const canRemove = (e: LedgerExpense) => e.trip.status !== "CLOSED" && (manage || (e.enteredById === me.id && e.approvalStatus === "PENDING"));

  async function askRemove(e: LedgerExpense) {
    if (await confirm({ title: "Remove this expense?", body: `${catMeta(e.category).label} ${inr(e.amountInr)} on ${e.trip.tripNo} will be deleted.`, confirmLabel: "Remove" })) {
      remove.mutate(e.id);
    }
  }

  const actions = (e: LedgerExpense) => (
    <span style={{ display: "inline-flex", gap: 6 }} onClick={(ev) => ev.stopPropagation()}>
      {manage && e.approvalStatus === "PENDING" && e.trip.status !== "CLOSED" && (
        <>
          <IconButton icon="x" label="Reject" small danger onClick={() => decide.mutate({ id: e.id, decision: "REJECT" })} />
          <IconButton icon="check" label="Approve" small onClick={() => decide.mutate({ id: e.id, decision: "APPROVE" })} />
        </>
      )}
      {canRemove(e) && <IconButton icon="trash" label="Remove" small danger onClick={() => askRemove(e)} />}
    </span>
  );

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorBox error={error} retry={() => refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">{manage || me.role !== "DRIVER" ? "Expenses" : "My expenses"}</h1>
          <p className="page-sub">Where the money went, across every trip.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {me.role !== "DRIVER" && <Button variant="ghost" icon="download" onClick={exportCsv} disabled={visible.length === 0}>Export</Button>}
          <Button size="lg" icon="plus" onClick={() => setAdding(true)}>Add expense</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented value={preset} onChange={pickPreset} options={PRESETS} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input" type="date" style={{ width: 160, minHeight: 44 }} value={from} max={to || undefined} aria-label="From date" onChange={(e) => { setRange({ from: e.target.value, to }); setPreset("all"); }} />
          <span className="muted">to</span>
          <input className="input" type="date" style={{ width: 160, minHeight: 44 }} value={to} min={from || undefined} aria-label="To date" onChange={(e) => { setRange({ from, to: e.target.value }); setPreset("all"); }} />
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div className="tile tile-coral">
          <span className="tile-label">Approved spend</span>
          <span className="tile-value num">{inrShort(total)}</span>
          <span className="tile-note">{approved.length} entries on {tripCount} trip{tripCount === 1 ? "" : "s"}</span>
        </div>
        <button className="tile tile-gold interactive" onClick={() => setParam("status", status === "PENDING" ? "ALL" : "PENDING")}>
          <span className="tile-label">Waiting for approval</span>
          <span className="tile-value num">{inrShort(pendingTotal)}</span>
          <span className="tile-note">{pending.length} entr{pending.length === 1 ? "y" : "ies"}{status === "PENDING" ? " · showing only these" : ""}</span>
        </button>
        <div className="tile tile-ink">
          <span className="tile-label">Average per trip</span>
          <span className="tile-value num">{inrShort(tripCount ? total / tripCount : 0)}</span>
          <span className="tile-note">{litres > 0 ? `${num(litres)} L of diesel` : "Add litres to diesel entries"}</span>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="scroll-x">
          <div className="chips" style={{ flexWrap: "nowrap" }}>
            <Chip on={category === "ALL"} onClick={() => setParam("category", "ALL")}>All types</Chip>
            {CATEGORY_KEYS.map((k) => (
              <Chip key={k} on={category === k} onClick={() => setParam("category", category === k ? "ALL" : k)}>
                <span style={{ color: category === k ? "#fff" : catMeta(k).color, display: "flex" }}><Icon name={catMeta(k).icon as IconName} size={16} /></span>
                {catMeta(k).label}
              </Chip>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search trip, truck, route or note" />
          <Segmented
            value={status}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "ALL", label: "All" }, { value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }]}
          />
        </div>
        {tripFilter && (
          <div><Button size="sm" variant="soft" icon="x" onClick={() => setParam("trip", null)}>Showing one trip only. Clear</Button></div>
        )}
      </div>

      {manage && status === "PENDING" && pending.length > 1 && (
        <div className="verdict tone-info" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <Icon name="clock" />
          <div style={{ flex: 1 }}>Seen them all? Approve the {pending.length} pending entries in one go.</div>
          <Button variant="success" icon="check" onClick={approveAll}>Approve all</Button>
        </div>
      )}

      {approved.length > 0 && (
        <section className="card">
          <div className="card-title" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="gauge" /> Breakdown</span>
            <Segmented value={group} onChange={setGroup} options={[{ value: "category", label: "By type" }, { value: "truck", label: "By truck" }, { value: "route", label: "By route" }]} />
          </div>
          {group === "category" ? (
            <Donut items={groups} onPick={(k) => setParam("category", category === k ? "ALL" : k)} active={category === "ALL" ? null : category} />
          ) : (
            <HBars rows={groups.slice(0, 8)} />
          )}
        </section>
      )}

      <section className="card" style={{ padding: wide ? 8 : 12 }}>
        {visible.length === 0 ? (
          all.length === 0 ? (
            <Empty icon="receipt" title="No expenses in this period" body="Add the first one right after a fill-up or toll. It takes ten seconds." action={<Button icon="plus" onClick={() => setAdding(true)}>Add expense</Button>} />
          ) : (
            <Empty icon="search" title="Nothing matches these filters" body="Clear a filter or widen the dates." action={<Button variant="soft" onClick={() => { setQ(""); setSp({}, { replace: true }); pickPreset("all"); }}>Clear filters</Button>} />
          )
        ) : wide ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Trip</th><th>Note</th><th className="r">Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const c = catMeta(e.category);
                  return (
                    <tr key={e.id} style={{ cursor: "pointer", opacity: e.approvalStatus === "REJECTED" ? 0.55 : 1 }} onClick={() => nav(`/trips?open=${e.tripId}`)}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                          <span style={{ width: 32, height: 32, borderRadius: 10, background: c.light, color: c.color, display: "grid", placeItems: "center" }}><Icon name={c.icon as IconName} size={16} /></span>
                          {c.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{e.trip.tripNo} <span className="muted" style={{ fontWeight: 600 }}>{e.trip.truck?.regNo}</span></div>
                        <div className="faint" style={{ fontSize: 12.5 }}>{e.trip.route ? routeName(e.trip.route) : "No route"}</div>
                      </td>
                      <td className="muted" style={{ maxWidth: 220 }}>{e.liters ? `${num(e.liters, 1)} L` : ""}{e.liters && e.notes ? " · " : ""}{e.notes}</td>
                      <td className="r num" style={{ fontWeight: 800 }}>
                        {inr(e.amountInr)}
                        {e.currency !== "INR" && <div className="faint" style={{ fontSize: 12 }}>{num(e.amount, 2)} {e.currency}</div>}
                        {isHigh(e) && <div><Badge tone="badge-coral">Higher than usual</Badge></div>}
                      </td>
                      <td><Badge tone={STATUS_TONE[e.approvalStatus]}>{e.approvalStatus[0] + e.approvalStatus.slice(1).toLowerCase()}</Badge></td>
                      <td className="r">{actions(e)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-2">
            {visible.map((e) => {
              const c = catMeta(e.category);
              return (
                <div key={e.id} className="card-flat interactive" style={{ padding: 12, opacity: e.approvalStatus === "REJECTED" ? 0.55 : 1 }} onClick={() => nav(`/trips?open=${e.tripId}`)}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ width: 42, height: 42, borderRadius: 14, background: c.light, color: c.color, display: "grid", placeItems: "center", flex: "none" }}><Icon name={c.icon as IconName} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{c.label}</div>
                      <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.trip.tripNo} · {e.trip.truck?.regNo} · {fmtDate(e.date)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="num display" style={{ fontWeight: 800, fontSize: 18 }}>{inr(e.amountInr)}</div>
                      <Badge tone={STATUS_TONE[e.approvalStatus]}>{e.approvalStatus[0] + e.approvalStatus.slice(1).toLowerCase()}</Badge>
                    </div>
                  </div>
                  {(e.notes || e.liters || isHigh(e)) && (
                    <div className="muted" style={{ fontSize: 13, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {e.liters ? <span>{num(e.liters, 1)} L</span> : null}
                      {e.notes && <span>{e.notes}</span>}
                      {isHigh(e) && <Badge tone="badge-coral">Higher than usual</Badge>}
                    </div>
                  )}
                  {(canRemove(e) || (manage && e.approvalStatus === "PENDING")) && <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>{actions(e)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ExpenseModal open={adding} onClose={() => setAdding(false)} me={me} />
    </div>
  );
}
