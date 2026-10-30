import { useState } from "react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, clearTokens, getToken } from "./api/client";
import { canManage, isOffice, KEYS } from "./lib/types";
import { roleLabel } from "./lib/format";
import type { Me } from "./lib/types";
import { Icon } from "./components/Icon";
import type { IconName } from "./components/Icon";
import { ExpenseModal } from "./components/ExpenseModal";
import { PageSkeleton } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TripsPage from "./pages/TripsPage";
import ExpensesPage from "./pages/ExpensesPage";
import RoutesPage from "./pages/RoutesPage";
import FleetPage from "./pages/FleetPage";

export type { Me };

interface NavDef {
  to: string;
  label: string;
  icon: IconName;
  badge?: number;
}

function navFor(me: Me, pending: number): NavDef[] {
  if (!isOffice(me.role)) {
    return [
      { to: "/trips", label: "My trips", icon: "truck" },
      { to: "/expenses", label: "My expenses", icon: "receipt" },
    ];
  }
  return [
    { to: "/dashboard", label: "Home", icon: "home" },
    { to: "/trips", label: "Trips", icon: "truck" },
    { to: "/expenses", label: "Expenses", icon: "receipt", badge: canManage(me.role) ? pending : 0 },
    { to: "/routes", label: "Routes", icon: "route" },
    { to: "/fleet", label: "Fleet", icon: "fleet" },
  ];
}

function Layout({ me, children }: { me: Me; children: ReactNode }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const pending = useQuery({
    queryKey: KEYS.pending,
    queryFn: () => api<unknown[]>("/expenses/pending"),
    enabled: canManage(me.role),
  });
  const items = navFor(me, pending.data?.length ?? 0);
  const initials = me.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function logout() {
    clearTokens();
    qc.clear();
    nav("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main">
        <div className="stripe" />
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Icon name="truck" size={24} stroke={2.2} />
          </div>
          <div>
            <div className="brand-name">Transport SaaS</div>
            <div className="brand-sub">{me.company?.name}</div>
          </div>
        </div>
        <nav className="nav">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon name={i.icon} />
              {i.label}
              {!!i.badge && <span className="nav-badge">{i.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "0 14px 12px" }}>
          <button className="btn btn-gold btn-block" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add expense
          </button>
        </div>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name}</div>
              <div style={{ fontSize: 12, color: "#aab0e0" }}>{roleLabel(me.role)}</div>
            </div>
            <button className="icon-btn sm" onClick={logout} aria-label="Log out" title="Log out" style={{ background: "transparent", borderColor: "rgba(255,255,255,.2)", color: "#c6cbf0" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 11 }}>
          <Icon name="truck" size={20} stroke={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontWeight: 800, lineHeight: 1.1 }}>Transport SaaS</div>
          <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {me.company?.name} · {roleLabel(me.role)}
          </div>
        </div>
        <button className="icon-btn" onClick={logout} aria-label="Log out">
          <Icon name="logout" />
        </button>
      </header>

      <main className="main">
        <div className="main-inner">{children}</div>
      </main>

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add expense">
        <Icon name="plus" size={22} stroke={2.6} /> Expense
      </button>

      <nav className="tabbar" aria-label="Main">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name={i.icon} size={22} />
            {i.label}
            {!!i.badge && <span className="nav-badge">{i.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <ExpenseModal open={adding} onClose={() => setAdding(false)} me={me} />
    </div>
  );
}

/**
 * Login gate + shared layout. It is ONE layout route, so the sidebar and the "Add expense" dialog
 * stay mounted while you move between pages (no flicker, no lost state).
 */
function AuthLayout() {
  const hasToken = !!getToken();
  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me"),
    retry: false,
    enabled: hasToken,
    staleTime: 5 * 60_000,
  });
  if (!hasToken) return <Navigate to="/login" replace />;
  if (isLoading)
    return (
      <div style={{ padding: 24 }}>
        <PageSkeleton />
      </div>
    );
  if (!me) return <Navigate to="/login" replace />;
  return (
    <Layout me={me}>
      <Outlet context={me} />
    </Layout>
  );
}

/** Hands the logged-in user to a page. `office` pages send drivers back to their trips. */
function Page({ render, office }: { render: (me: Me) => ReactNode; office?: boolean }) {
  const me = useOutletContext<Me>();
  if (office && !isOffice(me.role)) return <Navigate to="/trips" replace />;
  return <>{render(me)}</>;
}

/** Office staff land on the dashboard, drivers on their trips. */
function Home() {
  const me = useOutletContext<Me>();
  return <Navigate to={isOffice(me.role) ? "/dashboard" : "/trips"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthLayout />}>
        <Route path="/dashboard" element={<Page office render={(me) => <DashboardPage me={me} />} />} />
        <Route path="/trips" element={<Page render={(me) => <TripsPage me={me} />} />} />
        <Route path="/expenses" element={<Page render={(me) => <ExpensesPage me={me} />} />} />
        <Route path="/routes" element={<Page office render={(me) => <RoutesPage me={me} />} />} />
        <Route path="/fleet" element={<Page office render={(me) => <FleetPage me={me} />} />} />
        <Route path="/masters" element={<Navigate to="/fleet" replace />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
