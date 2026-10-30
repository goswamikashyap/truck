import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del, post, put } from "../api/client";
import type { Me } from "../lib/types";
import { KEYS } from "../lib/types";
import { daysFromToday, fmtDate, inr, isoDay, num } from "../lib/format";
import { useDrivers, useParties, useRefreshAll, useTrucks } from "../lib/hooks";
import { Badge, Button, Chip, Empty, ErrorBox, Field, IconButton, Modal, PageSkeleton, SearchBox, useConfirm, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";

type Kind = "trucks" | "drivers" | "parties";

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  half?: boolean;
}

const CONFIG: Record<Kind, { title: string; one: string; icon: IconName; fields: FieldDef[]; writeRoles: string[] }> = {
  trucks: {
    title: "Trucks",
    one: "truck",
    icon: "truck",
    writeRoles: ["COMPANY_OWNER", "MANAGER"],
    fields: [
      { key: "regNo", label: "Registration number", required: true, hint: "e.g. MH04AB1234" },
      { key: "type", label: "Type", required: true, type: "select", options: ["Trailer", "Container", "Open body", "Tanker", "Tipper", "Mini truck"].map((v) => ({ value: v, label: v })), half: true },
      { key: "capacityTons", label: "Capacity (tons)", type: "number", half: true },
      { key: "insuranceExp", label: "Insurance expires", type: "date", half: true },
      { key: "permitExp", label: "Permit expires", type: "date", half: true },
      { key: "fitnessExp", label: "Fitness expires", type: "date", half: true },
      { key: "pucExp", label: "PUC expires", type: "date", half: true },
    ],
  },
  drivers: {
    title: "Drivers",
    one: "driver",
    icon: "user",
    writeRoles: ["COMPANY_OWNER", "MANAGER"],
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "phone", label: "Phone", required: true, half: true },
      { key: "licenceNo", label: "Licence number", half: true },
      { key: "licenceExp", label: "Licence expires", type: "date", half: true },
      { key: "salaryType", label: "Paid", type: "select", half: true, options: [{ value: "", label: "Not set" }, { value: "monthly", label: "Monthly" }, { value: "per_trip", label: "Per trip" }] },
      { key: "baseSalary", label: "Salary (₹)", type: "number", half: true },
    ],
  },
  parties: {
    title: "Parties",
    one: "party",
    icon: "fleet",
    writeRoles: ["COMPANY_OWNER", "MANAGER", "ACCOUNTANT"],
    fields: [
      { key: "name", label: "Company name", required: true },
      { key: "gstNo", label: "GST number", half: true },
      { key: "phone", label: "Phone", half: true },
      { key: "creditDays", label: "Credit days", type: "number", half: true, hint: "How long they take to pay" },
      { key: "address", label: "Address" },
    ],
  },
};

/** Colour and wording for a document expiry date. */
function expiry(label: string, v?: string | null) {
  if (!v) return { label: `${label}: not set`, tone: "", days: null as number | null };
  const d = daysFromToday(v);
  if (d < 0) return { label: `${label} expired ${-d}d ago`, tone: "badge-coral", days: d };
  if (d <= 30) return { label: `${label} in ${d}d`, tone: "badge-gold", days: d };
  return { label: `${label} ${fmtDate(v, true)}`, tone: "badge-teal", days: d };
}

export default function FleetPage({ me }: { me: Me }) {
  const [sp, setSp] = useSearchParams();
  const kind = (["trucks", "drivers", "parties"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "trucks") as Kind;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | "new" | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const refresh = useRefreshAll();
  const qc = useQueryClient();
  const trucks = useTrucks();
  const drivers = useDrivers();
  const parties = useParties();
  const cfg = CONFIG[kind];
  const canWrite = cfg.writeRoles.includes(me.role);
  const query = { trucks, drivers, parties }[kind];

  const remove = useMutation({
    mutationFn: (id: string) => del(`/${kind}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS[kind] });
      refresh();
      toast(`${cfg.one[0].toUpperCase() + cfg.one.slice(1)} deleted`);
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const data = (query.data ?? []) as any[];
    return data.filter((r) => !needle || Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(needle)));
  }, [query.data, q]);

  if (trucks.isLoading || drivers.isLoading || parties.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorBox error={query.error} retry={() => query.refetch()} />;

  const total = (k: Kind) => ({ trucks, drivers, parties }[k].data?.length ?? 0);

  return (
    <div className="grid gap-4">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Fleet</h1>
          <p className="page-sub">Your trucks, drivers and customers. Keep papers up to date and you get a warning before they lapse.</p>
        </div>
        {canWrite && <Button size="lg" icon="plus" onClick={() => setEditing("new")}>Add {cfg.one}</Button>}
      </div>

      <div className="chips">
        {(Object.keys(CONFIG) as Kind[]).map((k) => (
          <Chip key={k} on={k === kind} count={total(k)} onClick={() => { setSp({ tab: k }, { replace: true }); setQ(""); }}>
            <Icon name={CONFIG[k].icon} size={16} /> {CONFIG[k].title}
          </Chip>
        ))}
      </div>
      <SearchBox value={q} onChange={setQ} placeholder={`Search ${cfg.title.toLowerCase()}`} />

      {rows.length === 0 ? (
        <div className="card">
          <Empty
            icon={cfg.icon}
            title={q ? "No match" : `No ${cfg.title.toLowerCase()} yet`}
            body={q ? "Try a different spelling." : `Add your first ${cfg.one} to start creating trips.`}
            action={canWrite && !q ? <Button icon="plus" onClick={() => setEditing("new")}>Add {cfg.one}</Button> : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
          {rows.map((r) => (
            <article key={r.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>{r.regNo ?? r.name}</h3>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {kind === "trucks" && `${r.type}${r.capacityTons ? ` · ${num(r.capacityTons)} t` : ""}`}
                    {kind === "drivers" && (r.licenceNo || "No licence number")}
                    {kind === "parties" && (r.gstNo || "No GST number")}
                  </div>
                </div>
                {canWrite && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconButton icon="edit" label={`Edit ${cfg.one}`} small onClick={() => setEditing(r)} />
                    <IconButton
                      icon="trash"
                      label={`Delete ${cfg.one}`}
                      small
                      danger
                      onClick={async () => {
                        if (await confirm({ title: `Delete ${r.regNo ?? r.name}?`, body: `If any trip uses this ${cfg.one}, it cannot be deleted.` })) remove.mutate(r.id);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="chips" style={{ marginTop: 12, gap: 6 }}>
                {kind === "trucks" &&
                  [expiry("Insurance", r.insuranceExp), expiry("Permit", r.permitExp), expiry("Fitness", r.fitnessExp), expiry("PUC", r.pucExp)]
                    .filter((e) => e.days != null)
                    .map((e) => <Badge key={e.label} tone={e.tone}>{e.label}</Badge>)}
                {kind === "trucks" && !r.insuranceExp && !r.permitExp && !r.fitnessExp && !r.pucExp && <Badge>Add paper dates to get alerts</Badge>}
                {kind === "drivers" && <Badge tone={expiry("Licence", r.licenceExp).tone}>{expiry("Licence", r.licenceExp).label}</Badge>}
                {kind === "drivers" && r.baseSalary != null && <Badge tone="badge-violet">{inr(r.baseSalary)} {r.salaryType === "per_trip" ? "per trip" : "a month"}</Badge>}
                {kind === "parties" && <Badge tone="badge-violet">{r.creditDays ? `Pays in ${r.creditDays} days` : "Pays on delivery"}</Badge>}
              </div>

              {(r.phone || r.address) && (
                <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 14 }}>
                  {r.phone && (
                    <a href={`tel:${r.phone}`} className="btn btn-ghost btn-sm" style={{ justifySelf: "start", textDecoration: "none" }}>
                      <Icon name="phone" size={16} /> {r.phone}
                    </a>
                  )}
                  {r.address && <span className="muted">{r.address}</span>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <FleetModal kind={kind} open={editing != null} item={editing && editing !== "new" ? editing : undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

function FleetModal({ kind, open, item, onClose }: { kind: Kind; open: boolean; item?: Record<string, any>; onClose: () => void }) {
  const cfg = CONFIG[kind];
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = useRefreshAll();
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const editing = !!item;

  useEffect(() => {
    if (!open) return;
    setError("");
    const init: Record<string, string> = {};
    for (const f of cfg.fields) {
      const raw = item?.[f.key];
      init[f.key] = raw == null ? "" : f.type === "date" ? isoDay(raw) : String(f.type === "number" ? Number(raw) : raw);
    }
    if (!editing && kind === "trucks") init.type = "Trailer";
    setV(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, kind]);

  const save = useMutation({
    mutationFn: () => {
      // Empty fields are left out. (So a value can be changed but not blanked out.)
      const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""));
      return editing ? put(`/${kind}/${item!.id}`, body) : post(`/${kind}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS[kind] });
      refresh();
      toast(editing ? "Saved" : `${cfg.one[0].toUpperCase() + cfg.one.slice(1)} added`);
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit() {
    setError("");
    const missing = cfg.fields.find((f) => f.required && !v[f.key]?.trim());
    if (missing) return setError(`Enter the ${missing.label.toLowerCase()}.`);
    save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${editing ? "Edit" : "Add"} ${cfg.one}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending} icon="check">{editing ? "Save changes" : `Add ${cfg.one}`}</Button>
        </>
      }
    >
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {cfg.fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} className={f.half ? "" : "col-span-2"}>
            {f.type === "select" ? (
              <select className="select" value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                className="input"
                type={f.type ?? "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                min={f.type === "number" ? 0 : undefined}
                step={f.type === "number" ? "any" : undefined}
                value={v[f.key] ?? ""}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                required={f.required}
              />
            )}
          </Field>
        ))}
        {error && <div className="verdict tone-bad col-span-2" role="alert"><Icon name="alert" /><div>{error}</div></div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
