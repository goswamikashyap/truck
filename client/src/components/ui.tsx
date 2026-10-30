import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

/* ----------------------------------------------------------------- Button */

type Variant = "primary" | "gold" | "success" | "danger" | "soft" | "soft-teal" | "soft-coral" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", block, icon, loading, children, className = "", disabled, ...rest }: ButtonProps) {
  const cls = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="dot" style={{ animation: "shimmer 1s infinite alternate" }} /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 20} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, danger, small, ...rest }: { icon: IconName; label: string; danger?: boolean; small?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${danger ? "danger" : ""} ${small ? "sm" : ""}`} {...rest}>
      <Icon name={icon} size={small ? 16 : 20} />
    </button>
  );
}

/* ------------------------------------------------------------------ Modal */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  side?: boolean;
}

/** Centered dialog on desktop, bottom sheet on phones. `side` makes it a right-hand drawer. */
export function Modal({ open, onClose, title, children, footer, wide, side }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose in a ref: the effect below must run only when the modal opens or closes,
  // otherwise every keystroke in a form would re-run it and pull focus back to the first field.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard and screen-reader users land inside it.
    // Focus the first form field if there is one, otherwise the dialog itself. (Never a footer button:
    // focusing it would scroll a long drawer straight to the bottom.)
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea");
      (first ?? ref.current)?.focus({ preventScroll: true });
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={`overlay ${side ? "side" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="grabber" />
        {title !== undefined && (
          <div className="modal-head">
            <div className="modal-title">{title}</div>
            <IconButton icon="x" label="Close" onClick={onClose} small />
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- small bits */

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder, required, autoFocus, min = 1 }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; autoFocus?: boolean; min?: number }) {
  return (
    <div className="input-money">
      <span>₹</span>
      <input
        className="input num"
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        placeholder={placeholder ?? "0"}
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children, count }: { on?: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

export function Badge({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art">
        <Icon name={icon} size={38} />
      </div>
      <h3 style={{ fontSize: 19, fontWeight: 800 }}>{title}</h3>
      {body && <p className="muted" style={{ margin: "6px auto 16px", maxWidth: 360 }}>{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 20, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function PageSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton h={34} w={220} />
      <Skeleton h={150} r={26} />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton h={120} r={22} />
        <Skeleton h={120} r={22} />
      </div>
      <Skeleton h={220} r={22} />
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card" style={{ borderColor: "var(--coral)" }}>
      <div className="card-title" style={{ color: "var(--coral-d)" }}>
        <Icon name="alert" /> Could not load this
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>{(error as Error)?.message ?? "Something went wrong."}</p>
      {retry && <Button variant="soft" onClick={retry}>Try again</Button>}
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */

type ToastTone = "ok" | "bad" | "warn";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: ToastTone = "ok") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "ok" ? 3200 : 5200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span className="ico">
              <Icon name={t.tone === "ok" ? "check" : "alert"} size={16} stroke={2.6} />
            </span>
            <span style={{ flex: 1 }}>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- Confirm */

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

/** `if (await confirm({ title: "Delete trip?" })) ...` : replaces the browser's ugly confirm box. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const value = useMemo(() => ask, [ask]);
  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => done(false)}
        title={state?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => done(false)}>Cancel</Button>
            <Button variant={state?.tone === "primary" ? "primary" : "danger"} onClick={() => done(true)}>
              {state?.confirmLabel ?? "Delete"}
            </Button>
          </>
        }
      >
        {state?.body && <p className="muted" style={{ fontSize: 16 }}>{state.body}</p>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ------------------------------------------------------------ misc hooks */

/** Animates a number from 0 to `value` once. Used on the dashboard headline only. */
export function useCountUp(value: number | undefined, ms = 900) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value == null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}
