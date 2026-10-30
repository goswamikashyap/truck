import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { post } from "../api/client";
import type { Me, Trip } from "../lib/types";
import { isOffice } from "../lib/types";
import { CATEGORY, CATEGORY_KEYS, catMeta, inr, routeName, todayLocal } from "../lib/format";
import { typicalExpense, useRefreshAll, useTrips } from "../lib/hooks";
import { Button, Field, Modal, MoneyInput, useToast } from "./ui";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  me: Me;
  /** Pre-select a trip (and hide the trip picker). */
  tripId?: string;
}

/** The one place expenses are entered: big category buttons, amount, and a "is this normal?" check. */
export function ExpenseModal({ open, onClose, me, tripId }: Props) {
  const trips = useTrips();
  const refresh = useRefreshAll();
  const toast = useToast();
  const office = isOffice(me.role);
  const [tid, setTid] = useState(tripId ?? "");
  const [category, setCategory] = useState("DIESEL");
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [fx, setFx] = useState("");
  const [error, setError] = useState("");

  const usable = useMemo(() => (trips.data ?? []).filter((t) => t.status !== "CLOSED"), [trips.data]);
  const running = usable.filter((t) => t.status === "RUNNING");

  // Each time the dialog opens: fresh date, and the trip the caller asked for (or the only running trip).
  useEffect(() => {
    if (!open) return;
    setDate(todayLocal());
    setError("");
    if (tripId) setTid(tripId);
    else if (!tid && running.length === 1) setTid(running[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tripId, running.length]);

  const trip: Trip | undefined = usable.find((t) => t.id === tid);
  const typical = office && trip ? typicalExpense(trips.data ?? [], trip.routeId, category, trip.id) : null;
  const amt = Number(amount) * (currency === "INR" ? 1 : Number(fx) || 0);
  const high = typical != null && amt > typical * 1.5;
  const perLitre = category === "DIESEL" && Number(liters) > 0 && Number(amount) > 0 && currency === "INR" ? Number(amount) / Number(liters) : null;

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(`/trips/${tid}/expenses`, body),
    onError: (e) => setError((e as Error).message),
  });

  async function save(another: boolean) {
    setError("");
    if (!tid) return setError("Pick the trip this expense belongs to.");
    if (!(Number(amount) > 0)) return setError("Enter the amount.");
    if (currency !== "INR" && !(Number(fx) > 0)) return setError(`Enter the ${currency} to INR exchange rate (₹ per 1 ${currency}).`);
    const body: Record<string, unknown> = { category, amount: Number(amount), date, currency };
    if (currency !== "INR") body.fxRate = Number(fx);
    if (category === "DIESEL" && Number(liters) > 0) body.liters = Number(liters);
    if (notes.trim()) body.notes = notes.trim();
    try {
      await add.mutateAsync(body);
    } catch {
      return;
    }
    refresh();
    toast(office ? `${catMeta(category).label} ${inr(amt)} added` : "Sent to your manager for approval");
    setAmount("");
    setLiters("");
    setNotes("");
    if (!another) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add expense"
      footer={
        <>
          <Button variant="ghost" onClick={() => save(true)} loading={add.isPending}>Save and add another</Button>
          <Button onClick={() => save(false)} loading={add.isPending} icon="check">Add expense</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!tripId && (
          <Field label="Trip">
            <select className="select" value={tid} onChange={(e) => setTid(e.target.value)}>
              <option value="">Choose a trip…</option>
              {usable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tripNo} · {t.truck?.regNo} · {routeName(t.route)} {t.status === "RUNNING" ? "· running" : ""}
                </option>
              ))}
            </select>
            {usable.length === 0 && !trips.isLoading && <span className="hint">No open trips. Create a trip first.</span>}
          </Field>
        )}

        <div>
          <div className="label" style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>What was it for?</div>
          <div className="chips" style={{ gap: 8 }}>
            {CATEGORY_KEYS.map((k) => {
              const c = CATEGORY[k];
              const on = category === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  className={`chip chip-cat ${on ? "on" : ""}`}
                  style={{ ["--cat" as any]: c.color, ["--cat-l" as any]: c.light, ["--cat-d" as any]: c.dark }}
                  onClick={() => setCategory(k)}
                >
                  <span style={{ color: on ? c.color : "var(--faint)" }}>
                    <Icon name={c.icon as IconName} size={22} />
                  </span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={currency === "INR" ? "Amount" : `Amount in ${currency}`}>
            <MoneyInput value={amount} onChange={setAmount} required autoFocus={false} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {category === "DIESEL" && (
          <Field label="Litres filled" hint={perLitre ? `That is ${inr(perLitre)} per litre.` : "Optional. Lets the app work out mileage (km per litre)."}>
            <input className="input num" type="number" inputMode="decimal" min="1" step="any" placeholder="e.g. 180" value={liters} onChange={(e) => setLiters(e.target.value)} />
          </Field>
        )}

        {typical != null && Number(amount) > 0 && (
          <div className={`verdict ${high ? "tone-warn" : "tone-good"}`}>
            <Icon name={high ? "alert" : "check"} />
            <div>
              {high
                ? `That is ${(amt / typical).toFixed(1)}× the usual ${catMeta(category).label.toLowerCase()} cost on this route (${inr(typical)}). Double-check the amount.`
                : `Normal for this route. Usual ${catMeta(category).label.toLowerCase()} cost is about ${inr(typical)}.`}
            </div>
          </div>
        )}

        <Field label="Note" hint="Optional: pump name, receipt number, what was repaired.">
          <input className="input" placeholder="e.g. HP pump, Nashik" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--muted)", minHeight: 36 }}>Paid in another currency (foreign trips)</summary>
          <div className="grid grid-cols-2 gap-3" style={{ marginTop: 10 }}>
            <Field label="Currency">
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {["INR", "USD", "NPR", "BDT", "AED", "EUR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {currency !== "INR" && (
              <Field label={`₹ per 1 ${currency}`} hint="Today's rate you paid at">
                <input className="input num" type="number" inputMode="decimal" min="0" step="any" value={fx} onChange={(e) => setFx(e.target.value)} />
              </Field>
            )}
          </div>
        </details>

        {!office && (
          <div className="verdict tone-info">
            <Icon name="clock" />
            <div>Your manager will approve this before it counts in the trip's cost.</div>
          </div>
        )}
        {error && (
          <div className="verdict tone-bad" role="alert">
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
