import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { post, setTokens } from "../api/client";
import { Icon } from "../components/Icon";
import { Field } from "../components/ui";

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { role: string };
}

const DEMOS = [
  { label: "Owner", email: "owner@demo.in" },
  { label: "Manager", email: "manager@demo.in" },
  { label: "Accountant", email: "accountant@demo.in" },
  { label: "Driver", email: "driver@demo.in" },
];

export default function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      const res = await post<AuthResponse>(`/auth/${mode}`, body);
      setTokens(res.accessToken, res.refreshToken);
      qc.clear();
      nav(res.user.role === "DRIVER" ? "/trips" : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="stripe" style={{ position: "absolute", left: 0, right: 0, top: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div className="brand-mark">
            <Icon name="truck" size={24} stroke={2.2} />
          </div>
          <div className="brand-name" style={{ fontSize: 22 }}>Transport SaaS</div>
        </div>
        <div style={{ margin: "34px 0" }}>
          <h1>Know what every trip really earns.</h1>
          <p style={{ color: "#c6cbf0", fontSize: 17, maxWidth: 460, marginTop: 14 }}>
            Replace the Excel sheets. Track every rupee spent on every route, and see which trucks and lanes make money.
          </p>
        </div>
        <div style={{ display: "grid", gap: 12, maxWidth: 440 }}>
          {[
            ["receipt", "Every expense in one place", "Diesel, toll, food and repairs, entered in seconds."],
            ["route", "Routes that pay", "Cost per km and the freight to ask for."],
            ["check", "Driver entries you approve", "Nothing counts until you say so."],
          ].map(([icon, title, body]) => (
            <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", flex: "none", color: "var(--gold)" }}>
                <Icon name={icon as any} />
              </span>
              <div>
                <div style={{ fontWeight: 800 }}>{title}</div>
                <div style={{ color: "#aab0e0", fontSize: 14 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
        <svg className="road-art" width="420" height="260" viewBox="0 0 420 260" aria-hidden="true">
          <path d="M-10 250 C 120 200, 160 120, 260 110 S 400 60, 440 10" fill="none" stroke="#fff" strokeWidth="46" strokeLinecap="round" />
          <path d="M-10 250 C 120 200, 160 120, 260 110 S 400 60, 440 10" fill="none" stroke="#14173b" strokeWidth="3" strokeDasharray="14 16" />
        </svg>
      </section>

      <section className="login-panel">
        <form onSubmit={submit} className="card pop-in" style={{ width: "100%", maxWidth: 420, padding: 26 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{mode === "login" ? "Welcome back" : "Start your company"}</h2>
          <p className="muted" style={{ marginBottom: 20 }}>{mode === "login" ? "Log in to see your trips and expenses." : "Free to set up. Add your trucks in two minutes."}</p>
          <div className="grid gap-3">
            {mode === "signup" && (
              <>
                <Field label="Company name">
                  <input className="input" value={form.companyName} onChange={set("companyName")} required minLength={2} autoComplete="organization" />
                </Field>
                <Field label="Your name">
                  <input className="input" value={form.name} onChange={set("name")} required minLength={2} autoComplete="name" />
                </Field>
              </>
            )}
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={set("email")} required autoComplete="email" inputMode="email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
              <input className="input" type="password" value={form.password} onChange={set("password")} required minLength={mode === "signup" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </Field>
          </div>
          {error && (
            <div className="verdict tone-bad" role="alert" style={{ marginTop: 14 }}>
              <Icon name="alert" />
              <div>{error}</div>
            </div>
          )}
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create company"}
          </button>
          <button
            type="button"
            className="btn btn-block"
            style={{ background: "transparent", color: "var(--violet-d)", marginTop: 6 }}
            onClick={() => {
              setError("");
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "New company? Sign up" : "Have an account? Log in"}
          </button>
          {import.meta.env.DEV && mode === "login" && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Demo logins (after npm run seed)</div>
              <div className="chips">
                {DEMOS.map((d) => (
                  <button key={d.email} type="button" className="chip" onClick={() => setForm({ ...form, email: d.email, password: "password123" })}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
