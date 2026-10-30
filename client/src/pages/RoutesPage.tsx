import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { del, post, put } from "../api/client";
import type { Me, Route, RouteStat } from "../lib/types";
import { canManage, canSeeProfit, KEYS } from "../lib/types";
import { inr, inrShort, num, routeName, VERDICT } from "../lib/format";
import { useRefreshAll, useRouteStats, useRoutes } from "../lib/hooks";
import { Badge, Button, Empty, ErrorBox, Field, IconButton, Modal, PageSkeleton, SearchBox, Segmented, useConfirm, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { useQueryClient } from "@tanstack/react-query";

type Sort = "profit" | "cost" | "trips" | "distance";

export default function RoutesPage({ me }: { me: Me }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const money = canSeeProfit(me.role);
  const manage = canManage(me.role);
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const routes = useRoutes();
  const stats = useRouteStats();
  const [sort, setSort] = useState<Sort>(money ? "profit" : "cost");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Route | "new" | null>(sp.get("new") === "1" ? "new" : null);

  const remove = useMutation({
    mutationFn: (id: string) => del(`/routes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.routes });
      refresh();
      toast("Route deleted");
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (stats.data ?? []).filter((r) => !needle || `${r.origin} ${r.destination}`.toLowerCase().includes(needle));
    const val = (r: RouteStat) =>
      sort === "profit" ? r.profitPerKm ?? -Infinity : sort === "cost" ? -(r.costPerKm ?? Infinity) : sort === "trips" ? r.trips : r.distanceKm;
    return [...rows].sort((a, b) => val(b) - val(a));
  }, [stats.data, q, sort]);

  // "Best" needs at least 2 routes with history to mean anything.
  const ranked = (stats.data ?? []).filter((r) => r.trips > 0 && r.profitPerKm != null);
  const bestId = money && ranked.length >= 2 ? [...ranked].sort((a, b) => b.profitPerKm! - a.profitPerKm!)[0].id : null;

  if (routes.isLoading || stats.isLoading) return <PageSkeleton />;
  if (routes.error || stats.error) return <ErrorBox error={routes.error ?? stats.error} retry={() => { routes.refetch(); stats.refetch(); }} />;

  return (
    <div className="grid gap-4">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Routes</h1>
          <p className="page-sub">Which lanes pay, and what to quote for the next load.</p>
        </div>
        {manage && <Button size="lg" icon="plus" onClick={() => setEditing("new")}>Add route</Button>}
      </div>

      <Estimator routes={routes.data ?? []} stats={stats.data ?? []} money={money} />

      {(stats.data?.length ?? 0) === 0 ? (
        <div className="card">
          <Empty
            icon="route"
            title="No routes yet"
            body="Add the lanes you run often, like Mumbai to Delhi with the distance. Then pick them on each trip to learn what they really cost."
            action={manage ? <Button icon="plus" onClick={() => setEditing("new")}>Add your first route</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <SearchBox value={q} onChange={setQ} placeholder="Search routes" />
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                ...(money ? [{ value: "profit" as Sort, label: "Most profitable" }] : []),
                { value: "cost" as Sort, label: "Lowest cost/km" },
                { value: "trips" as Sort, label: "Most trips" },
                { value: "distance" as Sort, label: "Longest" },
              ]}
            />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))" }}>
            {list.map((r) => (
              <RouteCard
                key={r.id}
                r={r}
                best={r.id === bestId}
                money={money}
                manage={manage}
                onPlan={() => nav(`/trips?new=1&route=${r.id}`)}
                onEdit={() => setEditing(routes.data?.find((x) => x.id === r.id) ?? null)}
                onDelete={async () => {
                  if (await confirm({ title: `Delete ${routeName(r)}?`, body: r.trips > 0 ? "Trips already using this route will block deletion." : "This route has no trips." })) remove.mutate(r.id);
                }}
              />
            ))}
          </div>
        </>
      )}

      <RouteModal
        open={editing != null}
        route={editing && editing !== "new" ? editing : undefined}
        onClose={() => {
          setEditing(null);
          if (sp.get("new")) setSp({}, { replace: true });
        }}
      />
    </div>
  );
}

function RouteCard({ r, best, money, manage, onPlan, onEdit, onDelete }: { r: RouteStat; best: boolean; money: boolean; manage: boolean; onPlan: () => void; onEdit: () => void; onDelete: () => void }) {
  const v = r.verdict ? VERDICT[r.verdict] : null;
  const freight = r.avgFreight ?? 0;
  const pct = freight > 0 ? Math.min(100, (r.avgExpense / freight) * 100) : 0;
  return (
    <article className="row-card" style={{ ["--accent" as any]: best ? "var(--gold)" : v?.tone === "bad" ? "var(--coral)" : v?.tone === "good" ? "var(--teal)" : "var(--faint)", paddingLeft: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {best && <Badge tone="badge-gold"><Icon name="flag" size={12} /> Best route</Badge>}
            {money && v && <Badge tone={v.badge}>{v.label}</Badge>}
            {r.trips === 0 && <Badge>No trips yet</Badge>}
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15 }}>{routeName(r)}</h3>
          <div className="muted" style={{ marginTop: 3 }}>{num(r.distanceKm)} km</div>
        </div>
        {manage && (
          <div style={{ display: "flex", gap: 6 }}>
            <IconButton icon="edit" label="Edit route" small onClick={onEdit} />
            <IconButton icon="trash" label="Delete route" small danger onClick={onDelete} />
          </div>
        )}
      </div>

      {r.trips > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 14 }}>
            <div className="kv"><span className="k">Trips</span><span className="v num">{r.trips}</span></div>
            <div className="kv"><span className="k">Average cost</span><span className="v num">{inr(r.avgExpense)}</span></div>
            <div className="kv"><span className="k">Cost per km</span><span className="v num">{r.costPerKm != null ? inr(r.costPerKm) : "–"}</span></div>
            <div className="kv"><span className="k">Mileage</span><span className="v num">{r.kmPerLitre != null ? `${r.kmPerLitre} km/l` : "no litres yet"}</span></div>
            {money && <div className="kv"><span className="k">Average freight</span><span className="v num">{inr(r.avgFreight)}</span></div>}
            {money && <div className="kv"><span className="k">Profit per km</span><span className="v num" style={{ color: (r.profitPerKm ?? 0) < 0 ? "var(--coral-d)" : "var(--teal-d)" }}>{r.profitPerKm != null ? inr(r.profitPerKm) : "–"}</span></div>}
          </div>
          {money && freight > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
                <span className="muted">Cost takes {Math.round(pct)}% of freight</span>
                <span style={{ color: (r.marginPct ?? 0) < 0 ? "var(--coral-d)" : "var(--teal-d)" }}>{r.marginPct}% kept</span>
              </div>
              <div className="meter"><i style={{ width: `${pct}%`, ["--c" as any]: pct > 100 ? "var(--coral)" : pct > 85 ? "var(--gold)" : "var(--teal)" }} /></div>
            </div>
          )}
          {money && r.suggestedFreight ? (
            <div className="verdict tone-info" style={{ marginTop: 12, fontSize: 14 }}>
              <Icon name="rupee" />
              <div>To keep 15% profit, ask for about <b className="num">{inrShort(r.suggestedFreight)}</b> per trip.</div>
            </div>
          ) : null}
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <Button variant="soft" size="sm" icon="truck" onClick={onPlan}>Plan a trip here</Button>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------- estimator */

function Estimator({ routes, stats, money }: { routes: Route[]; stats: RouteStat[]; money: boolean }) {
  const mileageAvg = useMemo(() => {
    const m = stats.filter((s) => s.kmPerLitre).map((s) => s.kmPerLitre as number);
    return m.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 10) / 10 : 4;
  }, [stats]);
  const [routeId, setRouteId] = useState("");
  const [custom, setCustom] = useState("");
  const [mileage, setMileage] = useState("");
  const [diesel, setDiesel] = useState("92");
  const [toll, setToll] = useState("3");
  const [food, setFood] = useState("350");
  const [loading, setLoading] = useState("1500");
  const [emptyReturn, setEmptyReturn] = useState(false);
  const [open, setOpen] = useState(false);

  const route = routes.find((r) => r.id === routeId);
  const km = route ? Number(route.distanceKm) : Number(custom) || 0;
  const kmpl = Number(mileage) || mileageAvg;
  const days = Math.max(1, Math.ceil(km / 450));
  const outLitres = km / kmpl;
  const backLitres = emptyReturn ? (km / kmpl) * 0.75 : 0;
  const rows = [
    { label: "Diesel", note: `${num(outLitres + backLitres, 0)} L at ${inr(Number(diesel))}`, value: (outLitres + backLitres) * (Number(diesel) || 0) },
    { label: "Toll", note: `${inr(Number(toll))} per km`, value: km * (Number(toll) || 0) },
    { label: "Driver food", note: `${days} day${days > 1 ? "s" : ""}`, value: days * (Number(food) || 0) },
    { label: "Loading", note: "", value: Number(loading) || 0 },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);
  const past = stats.find((s) => s.id === routeId && s.trips > 0);

  return (
    <section className="card">
      <button type="button" className="card-title" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", justifyContent: "space-between", marginBottom: open ? 14 : 0, minHeight: 44, color: "inherit" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="gauge" /> Quote calculator <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}>· what will this trip cost, and what should I ask for?</span></span>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", display: "flex" }}><Icon name="chevron" /></span>
      </button>
      {open && (
        <div className="grid gap-4 pop-in" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
          <div className="grid gap-3" style={{ alignContent: "start" }}>
            <Field label="Route">
              <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">Type a distance instead</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{routeName(r)} · {num(r.distanceKm)} km</option>)}
              </select>
            </Field>
            {!route && (
              <Field label="Distance (km)">
                <input className="input num" type="number" inputMode="decimal" min="1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 850" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Truck mileage (km/l)" hint={mileage ? undefined : `Using ${mileageAvg} from your trips`}>
                <input className="input num" type="number" inputMode="decimal" min="1" step="0.1" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder={String(mileageAvg)} />
              </Field>
              <Field label="Diesel ₹ per litre">
                <input className="input num" type="number" inputMode="decimal" value={diesel} onChange={(e) => setDiesel(e.target.value)} />
              </Field>
              <Field label="Toll ₹ per km">
                <input className="input num" type="number" inputMode="decimal" step="0.1" value={toll} onChange={(e) => setToll(e.target.value)} />
              </Field>
              <Field label="Driver food ₹ per day">
                <input className="input num" type="number" inputMode="decimal" value={food} onChange={(e) => setFood(e.target.value)} />
              </Field>
              <Field label="Loading ₹">
                <input className="input num" type="number" inputMode="decimal" value={loading} onChange={(e) => setLoading(e.target.value)} />
              </Field>
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44, fontWeight: 600 }}>
              <input type="checkbox" checked={emptyReturn} onChange={(e) => setEmptyReturn(e.target.checked)} style={{ width: 22, height: 22, accentColor: "#5b3df5" }} />
              Truck comes back empty (adds return diesel, about 25% less than loaded)
            </label>
          </div>

          <div>
            {km <= 0 ? (
              <Empty icon="route" title="Pick a route or enter a distance" body="You will see the estimated cost and the freight to quote." />
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  {rows.map((r) => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 700 }}>{r.label} {r.note && <span className="faint" style={{ fontWeight: 600, fontSize: 13 }}>{r.note}</span>}</span>
                      <span className="num" style={{ fontWeight: 800 }}>{inr(r.value)}</span>
                    </div>
                  ))}
                  <div className="divider" style={{ margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 800 }}>Estimated cost</span>
                    <span className="display num" style={{ fontWeight: 800, fontSize: 26 }}>{inr(total)}</span>
                  </div>
                  <div className="muted" style={{ textAlign: "right", fontSize: 13 }}>{inr(total / km)} per km · repairs and fines not included</div>
                </div>
                {money && (
                  <div className="card-flat" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>What to quote</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Break-even", 0],
                        ["10% profit", 10],
                        ["15% profit", 15],
                        ["20% profit", 20],
                      ].map(([label, m]) => (
                        <div key={label as string} className="kv" style={{ background: "#f6f6fd", padding: 10, borderRadius: 12 }}>
                          <span className="k">{label}</span>
                          <span className="v num">{inr(Math.ceil(total / (1 - (m as number) / 100) / 100) * 100)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {past && (
                  <div className={`verdict tone-${Math.abs(past.avgExpense - total) / past.avgExpense > 0.2 ? "warn" : "good"}`}>
                    <Icon name="spark" />
                    <div>
                      Your {past.trips} past trip{past.trips > 1 ? "s" : ""} here averaged <b className="num">{inr(past.avgExpense)}</b>, {Math.abs(past.avgExpense - total) / past.avgExpense < 0.01 ? "so this estimate is about the same." : `so this estimate is ${total < past.avgExpense ? "lower" : "higher"} by ${Math.round((Math.abs(past.avgExpense - total) / past.avgExpense) * 100)}%.`}
                      {total < past.avgExpense * 0.85 ? " Real trips cost more (repairs, waiting, detours). Quote from the real average." : ""}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ add / edit */

function RouteModal({ open, route, onClose }: { open: boolean; route?: Route; onClose: () => void }) {
  const qc = useQueryClient();
  const refresh = useRefreshAll();
  const toast = useToast();
  const [f, setF] = useState({ origin: "", destination: "", distanceKm: "", notes: "" });
  const [both, setBoth] = useState(true);
  const [error, setError] = useState("");
  const editing = !!route;

  useEffect(() => {
    if (!open) return;
    setError("");
    setF(route ? { origin: route.origin, destination: route.destination, distanceKm: String(Number(route.distanceKm)), notes: route.notes ?? "" } : { origin: "", destination: "", distanceKm: "", notes: "" });
    setBoth(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { origin: f.origin.trim(), destination: f.destination.trim(), distanceKm: Number(f.distanceKm), ...(f.notes.trim() ? { notes: f.notes.trim() } : {}) };
      if (editing) return put(`/routes/${route!.id}`, body);
      await post("/routes", body);
      if (both) {
        try {
          await post("/routes", { ...body, origin: body.destination, destination: body.origin });
        } catch {
          toast("The return route already exists", "warn");
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.routes });
      refresh();
      toast(editing ? "Route updated" : both ? "Both routes added" : "Route added");
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit() {
    setError("");
    if (f.origin.trim().length < 2 || f.destination.trim().length < 2) return setError("Enter both the starting place and the destination.");
    if (!(Number(f.distanceKm) > 0)) return setError("Enter the distance in km.");
    save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit route" : "Add route"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending} icon="check">{editing ? "Save changes" : "Add route"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} placeholder="Mumbai" /></Field>
          <Field label="To"><input className="input" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="Delhi" /></Field>
        </div>
        <Field label="Distance (km)" hint="One way, by road.">
          <input className="input num" type="number" inputMode="decimal" min="1" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} placeholder="1400" />
        </Field>
        <Field label="Note" hint="Optional: highway used, ghat sections, usual stops.">
          <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {!editing && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44, fontWeight: 600 }}>
            <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} style={{ width: 22, height: 22, accentColor: "#5b3df5" }} />
            Also add the return route{f.origin && f.destination ? ` (${f.destination} → ${f.origin})` : ""}
          </label>
        )}
        {error && <div className="verdict tone-bad" role="alert"><Icon name="alert" /><div>{error}</div></div>}
      </div>
    </Modal>
  );
}
