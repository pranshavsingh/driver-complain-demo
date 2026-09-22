import { useState, useEffect, useRef, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Truck, LayoutDashboard, Users, ClipboardList, LogOut, Bell, Menu, X, Trash2, CheckCircle2, Wrench, FileSpreadsheet, Package, Headphones } from './Icons';


import { isAdmin, isSuperAdmin, useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PageErrorBoundary } from './ErrorBoundary';
import { fullName } from '../lib/format';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';

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
  if (pathname.startsWith('/vehicles')) return 'Vehicle Directory & Entry';
  if (pathname.startsWith('/users')) return 'Users & Approvals';
  if (pathname.startsWith('/complaints')) return 'Complaints Management';
  if (pathname.startsWith('/loading')) return 'Loading & Detention Analytics';
  if (pathname.startsWith('/trips')) return 'Trip Analytics & Logs';
  if (pathname.startsWith('/maintenance') || pathname.startsWith('/fuel-logs'))
    return 'Vehicle Maintenance & Servicing';
  if (pathname.startsWith('/spare-parts')) return 'Spare Parts & Inventory Requisition';
  if (pathname.startsWith('/support')) return 'Helpline & Realtime Support';
  if (pathname.startsWith('/reports')) return 'Vehicle Reports & Analytics';
  return 'Fleet Administration';
}

interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { connected, subscribeCustom } = useRealtime();
  const location = useLocation();

  const [signingOut, setSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notifRef = useRef<HTMLDivElement>(null);

  const pendingApprovalsResource = useApiResource('users:pendingCount', () =>
    isAdmin(user) ? api.users.pendingCount() : Promise.resolve({ pendingCount: 0 }),
  );
  const pendingCount = pendingApprovalsResource.data?.pendingCount ?? 0;

  const complaintsUnreadResource = useApiResource('complaints:unreadCount', () =>
    api.complaints.unreadCount(),
  );
  const unreadComplaintsCount = complaintsUnreadResource.data?.unreadCount ?? 0;

  const showToast = (title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  // Load database notifications on mount
  useEffect(() => {
    if (!user) return;
    api.notifications
      .list({ page: 1, pageSize: 15 })
      .then((res: any) => {
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          setNotifications(
            res.data.map((n: any) => ({
              id: n.id,
              msg: n.body || n.title,
              time: new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: n.type?.toLowerCase().includes('complaint') ? 'complaint' : 'trip',
              unread: !n.isRead,
            })),
          );
        }
      })
      .catch(() => {});
  }, [user]);

  // Realtime Live Updates for Approvals, Complaints & Notifications
  useEffect(() => {
    const reloadApprovals = () => {
      void pendingApprovalsResource.reload();
    };

    const reloadComplaintsCount = () => {
      void complaintsUnreadResource.reload();
    };

    const unsubReq = subscribeCustom('user:approval-requested', (payload: any) => {
      reloadApprovals();
      if (isSuperAdmin(user)) {
        showToast(
          'New Driver Approval Request',
          payload?.name ? `Driver ${payload.name} (${payload.employeeId}) requires approval.` : 'New driver submitted for approval.',
          'info'
        );
      }
    });

    const unsubAppr = subscribeCustom('user:approved', (payload: any) => {
      reloadApprovals();
      showToast(
        'Driver Approved',
        payload?.name ? `Driver ${payload.name} (${payload.employeeId}) has been approved.` : 'Driver approved.',
        'success'
      );
    });

    const unsubRej = subscribeCustom('user:rejected', (payload: any) => {
      reloadApprovals();
      showToast(
        'Driver Approval Rejected',
        payload?.name ? `Driver ${payload.name} (${payload.employeeId}) was rejected.` : 'Driver rejected.',
        'warning'
      );
    });

    const unsubCreate = subscribeCustom('user:created', reloadApprovals);
    const unsubUpdate = subscribeCustom('user:updated', reloadApprovals);
    const unsubDel = subscribeCustom('user:deleted', reloadApprovals);

    // Complaint Realtime Listeners for Live Unread Count Badge
    const unsubComplaintCreated = subscribeCustom('complaint:created', (payload: any) => {
      reloadComplaintsCount();
      showToast(
        'New Complaint Registered',
        payload?.title ? `[${payload.complaintNo ?? 'CMP'}] ${payload.title}` : 'A new driver complaint has been registered.',
        'info',
      );
    });

    const unsubComplaintStatus = subscribeCustom('complaint:status-changed', reloadComplaintsCount);
    const unsubComplaintAssigned = subscribeCustom('complaint:assigned', reloadComplaintsCount);

    const unsubNotif = subscribeCustom('notification:new', (payload: any) => {
      if (payload) {
        setNotifications((prev) => [
          {
            id: payload.id || `notif-${Date.now()}`,
            msg: payload.body || payload.title || 'New notification',
            time: 'Just now',
            type: payload.type?.toLowerCase().includes('complaint') ? 'complaint' : 'trip',
            unread: true,
          },
          ...prev,
        ]);
        showToast(payload.title || 'Notification', payload.body || '', 'info');
      }
    });

    return () => {
      unsubReq();
      unsubAppr();
      unsubRej();
      unsubCreate();
      unsubUpdate();
      unsubDel();
      unsubComplaintCreated();
      unsubComplaintStatus();
      unsubComplaintAssigned();
      unsubNotif();
    };
  }, [subscribeCustom, pendingApprovalsResource, complaintsUnreadResource, user]);

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
    void api.notifications.markAllRead().catch(() => {});
  };

  const handleDismissNotification = (id: string): void => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    void api.notifications.markRead(id).catch(() => {});
  };

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className={`admin-app-container ${sidebarOpen ? 'sidebar-expanded' : ''}`}>
      {/* Floating Toast Notification Container */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 380,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              backgroundColor: 'var(--surface-bg, #1e293b)',
              color: 'var(--text-main, #f8fafc)',
              borderRadius: 12,
              padding: '12px 16px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
              border: `1.5px solid ${
                t.type === 'success'
                  ? '#22c55e'
                  : t.type === 'warning'
                    ? '#ef4444'
                    : '#3b82f6'
              }`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color:
                    t.type === 'success'
                      ? '#22c55e'
                      : t.type === 'warning'
                        ? '#ef4444'
                        : '#60a5fa',
                }}
              >
                <span>{t.type === 'success' ? '✓' : t.type === 'warning' ? '✕' : '🔔'}</span>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.4 }}>
                {t.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

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
            to="/vehicles"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <Truck size={18} className="nav-icon" />
            <span className="nav-label">Vehicle Entry</span>
          </NavLink>

          {isAdmin(user) ? (
            <NavLink
              to="/users"
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={18} className="nav-icon" />
                <span className="nav-label">
                  {isSuperAdmin(user) ? 'Users & Approvals' : 'Drivers & Approvals'}
                </span>
              </div>
              {pendingCount > 0 && isSuperAdmin(user) ? (
                <span
                  style={{
                    backgroundColor: 'var(--danger-text)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 10,
                    marginLeft: 'auto',
                    minWidth: 18,
                    textAlign: 'center',
                    lineHeight: '13px',
                    boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                  }}
                  title={`${pendingCount} pending approvals waiting for review`}
                >
                  {pendingCount}
                </span>
              ) : null}
            </NavLink>
          ) : null}

          <NavLink
            to="/complaints"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClipboardList size={18} className="nav-icon" />
              <span className="nav-label">Complaints</span>
            </div>
            {unreadComplaintsCount > 0 ? (
              <span
                style={{
                  backgroundColor: 'var(--danger-text)',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 10,
                  marginLeft: 'auto',
                  minWidth: 18,
                  textAlign: 'center',
                  lineHeight: '13px',
                  boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                }}
                title={`${unreadComplaintsCount} unread/new complaints waiting for review`}
              >
                {unreadComplaintsCount}
              </span>
            ) : null}
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

          <NavLink
            to="/maintenance"
            className={({ isActive }) =>
              isActive || location.pathname.startsWith('/fuel-logs')
                ? 'nav-item active'
                : 'nav-item'
            }
          >
            <Wrench size={18} className="nav-icon" />
            <span className="nav-label">Vehicle Maintenance</span>
          </NavLink>

          <NavLink
            to="/spare-parts"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <Package size={18} className="nav-icon" />
            <span className="nav-label">Spare Parts</span>
          </NavLink>

          <NavLink
            to="/support"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <Headphones size={18} className="nav-icon" />
            <span className="nav-label">Support Chat</span>
          </NavLink>

          <NavLink
            to="/reports"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          >
            <FileSpreadsheet size={18} className="nav-icon" />
            <span className="nav-label">Vehicle Reports</span>
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
