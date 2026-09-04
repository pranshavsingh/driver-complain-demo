import { useState, useEffect, useRef, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Truck, LayoutDashboard, Users, ClipboardList, LogOut, Bell, Menu, X, Trash2, CheckCircle2 } from './Icons';
import { isSuperAdmin, useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PageErrorBoundary } from './ErrorBoundary';
import { fullName } from '../lib/format';

interface NotificationItem {
  id: string;
  msg: string;
  time: string;
  type: 'complaint' | 'loading' | 'trip';
  unread: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    msg: 'New complaint CMP-2026-004 registered by Dana Driver.',
    time: '5 mins ago',
    type: 'complaint',
    unread: true,
  },
  {
    id: 'n2',
    msg: 'Driver reached loading point at Warehouse B.',
    time: '12 mins ago',
    type: 'loading',
    unread: true,
  },
  {
    id: 'n3',
    msg: 'Trip completed successfully for vehicle ABC-1234.',
    time: '1 hr ago',
    type: 'trip',
    unread: true,
  },
];

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'Executive Dashboard';
  if (pathname.startsWith('/drivers')) return 'Drivers Directory';
  if (pathname.startsWith('/users')) return 'Users & Approvals';
  if (pathname.startsWith('/complaints')) return 'Complaints Management';
  if (pathname.startsWith('/loading')) return 'Loading & Detention Analytics';
  if (pathname.startsWith('/trips')) return 'Trip Analytics & Logs';
  return 'Fleet Administration';
}

export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  const location = useLocation();

  const [signingOut, setSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

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

  const handleClearNotifications = (): void => {
    setNotifications([]);
  };

  const handleDismissNotification = (id: string): void => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className={`admin-app-container ${sidebarOpen ? 'sidebar-expanded' : ''}`}>
      {/* Full-Height Left Sidebar (Starts at top: 0, bottom: 0 - Never cut off) */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo-icon">
            <Truck size={22} color="#ffffff" />
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

        {/* Sidebar Footer with User Profile Identity & Restored Logout Button (Pinned at bottom, flex-shrink: 0) */}
        <div className="sidebar-footer">
          {user ? (
            <div className="user-profile-box">
              <div className="user-avatar-circle">
                {user.firstName ? user.firstName[0] : 'U'}
                {user.lastName ? user.lastName[0] : ''}
              </div>
              <div className="user-profile-meta">
                <div className="user-full-name">{fullName(user)}</div>
                <div className="user-employee-id">{user.employeeId}</div>
                <div className="user-role-badge">{user.role}</div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="btn-sidebar-logout"
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out of Fleet Admin"
          >
            <LogOut size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      {/* Backdrop for Mobile Sidebar Overlay */}
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}

      {/* Main Workspace Content Area */}
      <main className="main-content">
        {/* Workspace Top Header Bar (Contains Breadcrumbs, Sync Status, Theme Switcher & Notifications) */}
        <header className="workspace-header">
          <div className="workspace-header-left">
            <button
              type="button"
              className="btn-toggle-sidebar-mobile"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle Navigation Menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="workspace-breadcrumb">
              <span className="breadcrumb-title">{getPageTitle(location.pathname)}</span>
            </div>
          </div>

          <div className="workspace-header-right">
            {/* Live Sync Status Badge */}
            <div className="connection-badge" title={connected ? 'Connected to Realtime Server' : 'Offline'}>
              <span className={connected ? 'live-dot live-on' : 'live-dot live-off'} />
              <span className="connection-text">{connected ? 'Live Sync' : 'Offline'}</span>
            </div>

            {/* Segmented Theme Switcher Control */}
            <ThemeSwitcher />

            {/* Notification Dropdown */}
            <div className="notif-dropdown-wrapper" ref={notifRef}>
              <button
                type="button"
                className={`notif-bell-btn ${showNotifications ? 'active' : ''}`}
                onClick={() => setShowNotifications((prev) => !prev)}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 ? <span className="notif-badge">{unreadCount}</span> : null}
              </button>

              {showNotifications ? (
                <div className="notif-dropdown-menu">
                  <div className="notif-header">
                    <div>
                      <span className="notif-title">Notifications</span>
                      <span className="notif-count">{notifications.length} alerts</span>
                    </div>
                    {notifications.length > 0 ? (
                      <button
                        type="button"
                        className="btn-clear-notifs"
                        onClick={handleClearNotifications}
                        title="Clear all notifications"
                      >
                        <Trash2 size={13} /> Clear All
                      </button>
                    ) : null}
                  </div>

                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty-state">
                        <CheckCircle2 size={24} color="#16a34a" />
                        <p>No new notifications</p>
                      </div>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className="notif-item">
                          <div className={`notif-icon-circle ${item.type}`}>
                            {item.type === 'complaint' ? (
                              <ClipboardList size={14} />
                            ) : (
                              <Truck size={14} />
                            )}
                          </div>
                          <div className="notif-content">
                            <p className="notif-msg">{item.msg}</p>
                            <span className="notif-time">{item.time}</span>
                          </div>
                          <button
                            type="button"
                            className="btn-dismiss-notif"
                            onClick={() => handleDismissNotification(item.id)}
                            title="Dismiss notification"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="workspace-body">
          <PageErrorBoundary routeKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}
