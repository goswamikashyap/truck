import { useState } from "react";
import { inr, inrShort, monthLabel, num } from "../lib/format";

/** Paired bars per month (money in vs money out) with a hover/tap tooltip. */
export function MonthBars({ data, showMoney }: { data: { month: string; freight?: number; expenses: number; profit?: number; trips: number }[]; showMoney: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 210;
  const pad = { l: 8, r: 8, t: 14, b: 28 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.freight ?? 0, d.expenses)));
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.min(26, slot / 2.6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const base = H - pad.b;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Monthly freight and expenses" style={{ display: "block", overflow: "visible" }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 5" />
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const on = hover === i;
          const f = d.freight ?? 0;
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(on ? null : i)} style={{ cursor: "pointer" }}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill={on ? "rgba(255,255,255,0.07)" : "transparent"} rx={10} />
              {showMoney && (
                <rect className="bar-grow" style={{ animationDelay: `${i * 60}ms` }} x={cx - bw - 2} y={y(f)} width={bw} height={Math.max(0, base - y(f))} rx={6} fill="#8f7bff" />
              )}
              <rect className="bar-grow" style={{ animationDelay: `${i * 60 + 40}ms` }} x={showMoney ? cx + 2 : cx - bw / 2} y={y(d.expenses)} width={bw} height={Math.max(0, base - y(d.expenses))} rx={6} fill="#ffb300" />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={on ? "#fff" : "#9aa0d6"}>
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`, top: 0 }}>
          <div style={{ fontWeight: 800 }}>{monthLabel(data[hover].month)} · {data[hover].trips} trip{data[hover].trips === 1 ? "" : "s"}</div>
          {showMoney && <div>Freight {inr(data[hover].freight)}</div>}
          <div>Expenses {inr(data[hover].expenses)}</div>
          {showMoney && <div style={{ color: (data[hover].profit ?? 0) >= 0 ? "#7be8dc" : "#ff9aa6" }}>Profit {inr(data[hover].profit)}</div>}
        </div>
      )}
    </div>
  );
}

/** Donut with a centre label that changes as you hover a slice or legend row. */
export function Donut({ items, onPick, active }: { items: { key: string; label: string; value: number; color: string }[]; onPick?: (key: string) => void; active?: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const focus = items.find((i) => i.key === (hover ?? active));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
      <svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="Expense mix" style={{ flex: "none" }}>
        <g transform="rotate(-90 85 85)">
          <circle cx="85" cy="85" r={R} fill="none" stroke="#eceefa" strokeWidth="26" />
          {total > 0 &&
            items.map((it) => {
              const len = (it.value / total) * C;
              const dim = (hover ?? active) && (hover ?? active) !== it.key;
              const el = (
                <circle
                  key={it.key}
                  cx="85"
                  cy="85"
                  r={R}
                  fill="none"
                  stroke={it.color}
                  strokeWidth={(hover ?? active) === it.key ? 32 : 26}
                  strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`}
                  strokeDashoffset={-offset}
                  opacity={dim ? 0.35 : 1}
                  style={{ transition: "all .2s", cursor: "pointer" }}
                  onMouseEnter={() => setHover(it.key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onPick?.(it.key)}
                />
              );
              offset += len;
              return el;
            })}
        </g>
        <text x="85" y="80" textAnchor="middle" fontSize="12" fontWeight="700" fill="#686e93">
          {focus ? focus.label : "Total"}
        </text>
        <text x="85" y="102" textAnchor="middle" fontSize="19" fontWeight="800" fill="#191c3f" fontFamily="var(--font-display)">
          {inrShort(focus ? focus.value : total)}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 6 }}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onMouseEnter={() => setHover(it.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(it.key)}
            style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: (hover ?? active) === it.key ? "#f4f5fc" : "transparent", borderRadius: 12, padding: "7px 8px", cursor: "pointer", textAlign: "left", minHeight: 40 }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 4, background: it.color, flex: "none" }} />
            <span style={{ flex: 1, fontWeight: 700 }}>{it.label}</span>
            <span className="num muted" style={{ fontWeight: 700 }}>{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One horizontal bar per row, scaled to the biggest value. */
export function HBars({ rows, format = inr }: { rows: { key: string; label: string; sub?: string; value: number; color: string; right?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5, fontWeight: 700 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.label}
              {r.sub && <span className="faint" style={{ fontWeight: 600, marginLeft: 8, fontSize: 13 }}>{r.sub}</span>}
            </span>
            <span className="num">{r.right ?? format(r.value)}</span>
          </div>
          <div className="meter">
            <i style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, ["--c" as any]: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const fmtKm = (n: number | null | undefined) => (n == null ? "–" : `${num(n)} km`);
