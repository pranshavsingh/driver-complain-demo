import { useState, useEffect, useRef, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Truck, LayoutDashboard, Users, ClipboardList, LogOut, Sun, Moon, Bell, Menu, X } from './Icons';
import { isSuperAdmin, useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { useTheme } from '../context/ThemeContext';
import { PageErrorBoundary } from './ErrorBoundary';
import { fullName } from '../lib/format';

export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const [signingOut, setSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = (): void => {
    setSigningOut(true);
    void logout().finally(() => {
      setSigningOut(false);
    });
  };

  return (
    <div className={`admin-app-container ${sidebarOpen ? 'sidebar-expanded' : ''}`}>
      {/* Fixed Top Navbar */}
      <header className="top-navbar">
        <div className="navbar-left">
          <button
            type="button"
            className="btn-toggle-sidebar"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle Navigation Menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="navbar-brand">
            <div className="brand-logo">
              <Truck size={22} color="#38bdf8" />
            </div>
            <div className="brand-text">
              <span className="brand-title">Driver Complaint</span>
              <span className="brand-subtitle">Fleet Workspace</span>
            </div>
          </div>
        </div>

        <div className="navbar-right">
          {/* Live Connection Badge */}
          <div className="connection-badge" title={connected ? 'Connected to Realtime Server' : 'Offline'}>
            <span className={connected ? 'live-dot live-on' : 'live-dot live-off'} />
            <span className="connection-text">{connected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Theme Switcher Button */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={18} color="#475569" /> : <Sun size={18} color="#f59e0b" />}
          </button>

          {/* Notification Icon & Dropdown */}
          <div className="notif-dropdown-wrapper" ref={notifRef}>
            <button
              type="button"
              className={`notif-bell-btn ${showNotifications ? 'active' : ''}`}
              onClick={() => setShowNotifications((prev) => !prev)}
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="notif-badge">3</span>
            </button>

            {showNotifications ? (
              <div className="notif-dropdown-menu">
                <div className="notif-header">
                  <span className="notif-title">Live Notifications</span>
                  <span className="notif-count">3 unread</span>
                </div>
                <div className="notif-list">
                  <div className="notif-item">
                    <div className="notif-icon-circle new-complaint">
                      <ClipboardList size={14} />
                    </div>
                    <div className="notif-content">
                      <p className="notif-msg">New complaint <strong>CMP-2026-004</strong> registered by Dana Driver.</p>
                      <span className="notif-time">5 mins ago</span>
                    </div>
                  </div>
                  <div className="notif-item">
                    <div className="notif-icon-circle detention-alert">
                      <Truck size={14} />
                    </div>
                    <div className="notif-content">
                      <p className="notif-msg">Driver reached loading point at Warehouse B.</p>
                      <span className="notif-time">12 mins ago</span>
                    </div>
                  </div>
                  <div className="notif-item">
                    <div className="notif-icon-circle status-update">
                      <Truck size={14} />
                    </div>
                    <div className="notif-content">
                      <p className="notif-msg">Trip completed successfully for vehicle ABC-1234.</p>
                      <span className="notif-time">1 hr ago</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* User Profile Info */}
          {user ? (
            <div className="user-profile">
              <div className="user-avatar">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <div className="user-info">
                <div className="user-name">{fullName(user)}</div>
                <div className="user-role">{user.role}</div>
              </div>
            </div>
          ) : null}

          {/* Sign Out */}
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out of Fleet Admin"
          >
            <LogOut size={16} />
            <span className="logout-text">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </header>

      {/* Admin Shell Body with Left Sidebar & Main Content */}
      <div className="admin-layout-body">
        {/* Responsive Left Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
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
              <span className="nav-label">Drivers Directory</span>
            </NavLink>

            {isSuperAdmin(user) ? (
              <NavLink
                to="/users"
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
                <Users size={18} className="nav-icon" />
                <span className="nav-label">Users & Approvals</span>
              </NavLink>
            ) : null}

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
              <span className="nav-label">Loading & Detention</span>
            </NavLink>

            <NavLink
              to="/trips"
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <Truck size={18} className="nav-icon" />
              <span className="nav-label">Trip Analytics & Logs</span>
            </NavLink>
          </nav>
        </aside>

        {/* Backdrop for Mobile Sidebar Overlay */}
        {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}

        {/* Main Workspace Content */}
        <main className="main-content">
          <PageErrorBoundary routeKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
