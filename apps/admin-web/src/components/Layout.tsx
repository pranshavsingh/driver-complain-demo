import { useState, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Truck, LayoutDashboard, Users, ClipboardList, LogOut } from './Icons';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { PageErrorBoundary } from './ErrorBoundary';
import { fullName } from '../lib/format';

/** App shell with professional left sidebar navigation, live connection state, and sign-out. */
export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = (): void => {
    setSigningOut(true);
    void logout().finally(() => {
      setSigningOut(false);
    });
  };

  return (
    <div className="admin-layout">
      {/* Left Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <Truck size={24} color="#38bdf8" />
          </div>
          <div>
            <div className="brand-title">Driver Complaint</div>
            <div className="brand-subtitle">Fleet Admin</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive || location.pathname === '/' ? 'nav-item active' : 'nav-item'
            }
          >
            <LayoutDashboard size={18} className="nav-icon" />
            <span className="nav-label">Dashboard</span>
          </NavLink>

          <NavLink
            to="/drivers"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <Users size={18} className="nav-icon" />
            <span className="nav-label">Drivers</span>
          </NavLink>

          <NavLink
            to="/complaints"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <ClipboardList size={18} className="nav-icon" />
            <span className="nav-label">Complaints</span>
          </NavLink>

          <NavLink
            to="/loading"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <Truck size={18} className="nav-icon" />
            <span className="nav-label">Loading & Waiting</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-badge">
            <span className={connected ? 'live-dot live-on' : 'live-dot live-off'} />
            <span className="connection-text">{connected ? 'Live Sync' : 'Offline'}</span>
          </div>

          {user ? (
            <div className="user-profile">
              <div className="user-avatar">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <div className="user-info">
                <div className="user-name">{fullName(user)}</div>
                <div className="user-id">ID: {user.employeeId}</div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            disabled={signingOut}
          >
            <LogOut size={14} style={{ marginRight: 6 }} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <PageErrorBoundary routeKey={location.pathname}>
          <Outlet />
        </PageErrorBoundary>
      </main>
    </div>
  );
}
