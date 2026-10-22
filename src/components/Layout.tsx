import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  QrCode,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/qr-codes', label: 'QR Codes', icon: QrCode },
  { to: '/logs', label: 'Verification Logs', icon: ListChecks },
  { to: '/demo', label: 'Live Demo', icon: FlaskConical, pill: 'POC' },
  { to: '/security', label: 'Security & Limitations', icon: ShieldAlert },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }}>
      <ShieldCheck size={size * 0.56} color="#7ea2ff" />
    </div>
  );
}

export function Layout() {
  const { operator, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = `${current?.label ?? 'VERIQ'} · VERIQ`;
  }, [current]);

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <BrandMark />
          <div>
            <div className="brand-name">VERIQ</div>
            <div className="brand-sub">Product Authentication</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Workspace</div>
          {NAV.slice(0, 4).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
          <div className="nav-section">Demonstration</div>
          {NAV.slice(4, 6).map((n) => (
            <NavLink key={n.to} to={n.to}>
              <n.icon size={17} />
              {n.label}
              {n.pill && <span className="nav-pill">{n.pill}</span>}
            </NavLink>
          ))}
          <div className="nav-section">System</div>
          {NAV.slice(6).map((n) => (
            <NavLink key={n.to} to={n.to}>
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="op">
            <div className="avatar">{operator?.email[0].toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="op-email">{operator?.email}</div>
              <div>{operator?.role}</div>
            </div>
            <button onClick={() => logout()} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className={`backdrop${open ? ' show' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <span className="crumb">{current?.label ?? 'VERIQ'}</span>
          <span className="spacer" />
          <span className="demo-chip" title="All products, brands and scan events are fictional demonstration data.">
            <TriangleAlert size={13} />
            Demo data<span className="long">&nbsp;— fictional brands &amp; events</span>
          </span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
