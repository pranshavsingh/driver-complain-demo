import { useState, useEffect, useRef, useMemo, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Truck, ClipboardList, Bell, Menu, X, Trash2, CheckCircle2 } from './Icons';

import { isAdmin, isSuperAdmin, isExecutive, useAuth } from '../auth/AuthContext';
import { canAccessPath } from '../auth/permissions';
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

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

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
  if (pathname.startsWith('/settings')) return 'Settings & Hub Management';
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notifRef = useRef<HTMLDivElement>(null);

  const pendingApprovalsResource = useApiResource('users:pendingCount', () =>
    isAdmin(user) && !isExecutive(user) ? api.users.pendingCount() : Promise.resolve({ pendingCount: 0 }),
  );
  const pendingCount = pendingApprovalsResource.data?.pendingCount ?? 0;

  const complaintsUnreadResource = useApiResource('complaints:unreadCount', () =>
    api.complaints.unreadCount(),
  );
  const [complaintBadgeCount, setComplaintBadgeCount] = useState<number>(0);

  useEffect(() => {
    if (typeof complaintsUnreadResource.data?.unreadCount === 'number') {
      setComplaintBadgeCount(complaintsUnreadResource.data.unreadCount);
    }
  }, [complaintsUnreadResource.data?.unreadCount]);

  const loadingResource = useApiResource('layout:loading', () =>
    canAccessPath(user, '/loading') ? api.loading.list() : Promise.resolve({ data: [] }),
  );
  const loadingDelayedCount = useMemo(() => {
    const list = loadingResource.data?.data ?? [];
    const now = Date.now();
    return list.filter((r) => {
      if (r.waitingTimeMinutes && r.waitingTimeMinutes > 180) return true;
      if (r.unloadingDurationMinutes && r.unloadingDurationMinutes > 180) return true;
      if (!r.completedAt && r.reachedAt) {
        const diffMins = Math.floor((now - new Date(r.reachedAt).getTime()) / 60000);
        return diffMins > 180;
      }
      if (r.tripCompletedAt && !r.unloadingCompletedAt) {
        const diffMins = Math.floor((now - new Date(r.tripCompletedAt).getTime()) / 60000);
        return diffMins > 180;
      }
      return false;
    }).length;
  }, [loadingResource.data]);

  const sparePartsResource = useApiResource('layout:sparePartsStats', () =>
    canAccessPath(user, '/spare-parts')
      ? api.spareParts.stats().catch(() => ({ totalPending: 0, totalIssuePending: 0 } as any))
      : Promise.resolve({ totalPending: 0, totalIssuePending: 0 } as any),
  );
  const sparePartsNewCount =
    (sparePartsResource.data?.totalPending ?? 0) + (sparePartsResource.data?.totalIssuePending ?? 0);

  const supportResource = useApiResource('layout:supportUnread', () =>
    canAccessPath(user, '/support')
      ? api.support.getUnreadCount().catch(() => ({ unreadCount: 0 }))
      : Promise.resolve({ unreadCount: 0 }),
  );
  const supportUnreadCount = supportResource.data?.unreadCount ?? 0;

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
      .list({ page: 1, pageSize: 25 })
      .then((res: any) => {
        if (res?.data && Array.isArray(res.data)) {
          setNotifications(
            res.data.map((n: any) => ({
              id: n.id,
              msg: n.body || n.title,
              time: formatRelativeTime(n.createdAt),
              type: n.type?.toLowerCase().includes('complaint') ? 'complaint' : 'trip',
              unread: !n.isRead,
            })),
          );
        }
      })
      .catch(() => {});
  }, [user]);

  const pendingRef = useRef(pendingApprovalsResource);
  pendingRef.current = pendingApprovalsResource;

  const complaintsRef = useRef(complaintsUnreadResource);
  complaintsRef.current = complaintsUnreadResource;

  const loadingRef = useRef(loadingResource);
  loadingRef.current = loadingResource;

  const sparePartsRef = useRef(sparePartsResource);
  sparePartsRef.current = sparePartsResource;

  const supportRef = useRef(supportResource);
  supportRef.current = supportResource;

  // Realtime Live Updates for Approvals, Complaints & Notifications
  useEffect(() => {
    const reloadApprovals = () => {
      void pendingRef.current.reload();
    };

    const reloadComplaintsCount = () => {
      void complaintsRef.current.reload();
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
      setComplaintBadgeCount((prev) => prev + 1);
      reloadComplaintsCount();
      showToast(
        'New Complaint Registered',
        payload?.title ? `[${payload.complaintNo ?? 'CMP'}] ${payload.title}` : 'A new driver complaint has been registered.',
        'info',
      );
    });

    const unsubComplaintStatus = subscribeCustom('complaint:status-changed', () => {
      reloadComplaintsCount();
    });

    const unsubComplaintAssigned = subscribeCustom('complaint:assigned', () => {
      reloadComplaintsCount();
    });

    const unsubNotif = subscribeCustom('notification:new', (payload: any) => {
      reloadComplaintsCount();
      if (payload) {
        setNotifications((prev) => [
          {
            id: payload.id || `notif-${Date.now()}`,
            msg: payload.body || payload.title || 'New notification',
            time: 'Just now',
            type: payload.type?.toLowerCase().includes('complaint') ? 'complaint' : 'trip',
            unread: true,
          },
          ...prev.filter((p) => p.id !== payload.id),
        ]);
        if (payload.type !== 'COMPLAINT_CREATED') {
          showToast(payload.title || 'Notification', payload.body || '', 'info');
        }
      }
    });

    // Realtime listeners for Loading, Spare Parts & Support Chats
    const unsubLoadingReached = subscribeCustom('loading:reached', () => {
      void loadingRef.current.reload();
    });
    const unsubLoadingCompleted = subscribeCustom('loading:completed', () => {
      void loadingRef.current.reload();
    });
    const unsubSparePartCreated = subscribeCustom('spare-part:created', () => {
      void sparePartsRef.current.reload();
    });
    const unsubSparePartUpdated = subscribeCustom('spare-part:updated', () => {
      void sparePartsRef.current.reload();
    });
    const unsubSupportMsg = subscribeCustom('support:message-received', () => {
      void supportRef.current.reload();
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
      unsubLoadingReached();
      unsubLoadingCompleted();
      unsubSparePartCreated();
      unsubSparePartUpdated();
      unsubSupportMsg();
    };
  }, [subscribeCustom, user]);

  // Keep unread count fresh when navigating to complaints page
  useEffect(() => {
    if (location.pathname === '/complaints') {
      void complaintsRef.current.reload();
    }
  }, [location.pathname]);

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
  const isFleetOpsRoute =
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/complaints') ||
    location.pathname === '/';

  return (
    <div className={`admin-app-container ${sidebarOpen ? 'sidebar-expanded' : ''} ${isFleetOpsRoute ? 'fleetops-active' : ''}`}>
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
        <div className="fo-sidebar-top">
          {/* 1. FleetOps v2.4 Brand Header */}
          <div className="fo-sidebar-brand">
            <div className="fo-brand-left">
              <div className="fo-brand-logo-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  hub
                </span>
              </div>
              <span className="fo-brand-title">FleetOps</span>
            </div>
            <span className="fo-brand-version">v2.4</span>
          </div>

          {/* 2. Role Switcher Badge Card */}
          <div className="fo-role-box" title={`Current logged-in identity: ${user?.role || 'Staff'}`}>
            <div className="fo-role-inner">
              <span className="fo-role-label">Role Switcher</span>
              <span className="fo-role-val">
                {user?.role === 'SUPER_ADMIN'
                  ? 'SUPER ADMIN'
                  : user?.category
                    ? `DEPT: ${user.category}`
                    : user?.role || 'OPERATOR'}
              </span>
            </div>
            <span className="material-symbols-outlined fo-role-chevron">unfold_more</span>
          </div>

          {/* 3. Categorized Section Dividers & Navigation Groups */}
          <nav className="fo-sidebar-nav">
            {/* Section: MAIN OPERATIONS */}
            <div className="fo-nav-section">
              <span className="fo-nav-section-title">Main Operations</span>

              {canAccessPath(user, '/dashboard') && (
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    isActive || location.pathname === '/' ? 'fo-nav-item active' : 'fo-nav-item'
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">dashboard</span>
                        <span className="fo-nav-label">Dashboard</span>
                      </div>
                      {(isActive || location.pathname === '/') && <span className="fo-nav-active-dot" />}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/complaints') && (
                <NavLink
                  to="/complaints"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">report_problem</span>
                        <span className="fo-nav-label">Complaints & Triage</span>
                      </div>
                      {isActive ? (
                        <span className="fo-nav-active-dot" />
                      ) : complaintBadgeCount > 0 ? (
                        <span className="fo-badge-red" title={`${complaintBadgeCount} unread or escalated`}>
                          {complaintBadgeCount}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/loading') && (
                <NavLink
                  to="/loading"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">timer</span>
                        <span className="fo-nav-label">Loading & Detention</span>
                      </div>
                      {isActive ? (
                        <span className="fo-nav-active-dot" />
                      ) : loadingDelayedCount > 0 ? (
                        <span className="fo-badge-cyan" title={`${loadingDelayedCount} trucks delayed / detained`}>
                          {loadingDelayedCount} Delayed
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )}
            </div>

            {/* Section: OPERATIONS */}
            <div className="fo-nav-section">
              <span className="fo-nav-section-title">Operations</span>

              {canAccessPath(user, '/vehicles') && (
                <NavLink
                  to="/vehicles"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">local_shipping</span>
                        <span className="fo-nav-label">Vehicles Directory</span>
                      </div>
                      {isActive && <span className="fo-nav-active-dot" />}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/maintenance') && (
                <NavLink
                  to="/maintenance"
                  className={({ isActive }) =>
                    isActive || location.pathname.startsWith('/fuel-logs')
                      ? 'fo-nav-item active'
                      : 'fo-nav-item'
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">build</span>
                        <span className="fo-nav-label">Maintenance</span>
                      </div>
                      {(isActive || location.pathname.startsWith('/fuel-logs')) && (
                        <span className="fo-nav-active-dot" />
                      )}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/spare-parts') && (
                <NavLink
                  to="/spare-parts"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">inventory_2</span>
                        <span className="fo-nav-label">Spare Parts</span>
                      </div>
                      {isActive ? (
                        <span className="fo-nav-active-dot" />
                      ) : sparePartsNewCount > 0 ? (
                        <span className="fo-badge-blue" title={`${sparePartsNewCount} pending requisitions`}>
                          {sparePartsNewCount} New
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/trips') && (
                <NavLink
                  to="/trips"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">route</span>
                        <span className="fo-nav-label">Trip Analytics & Logs</span>
                      </div>
                      {isActive && <span className="fo-nav-active-dot" />}
                    </>
                  )}
                </NavLink>
              )}
            </div>

            {/* Section: ADMINISTRATION */}
            <div className="fo-nav-section">
              <span className="fo-nav-section-title">Administration</span>

              {canAccessPath(user, '/users') && isAdmin(user) && !isExecutive(user) && (
                <NavLink
                  to="/users"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">how_to_reg</span>
                        <span className="fo-nav-label">Driver Approvals</span>
                      </div>
                      {isActive ? (
                        <span className="fo-nav-active-dot" />
                      ) : pendingCount > 0 ? (
                        <span className="fo-badge-blue" title={`${pendingCount} pending approvals`}>
                          {pendingCount} Pending
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/support') && isSuperAdmin(user) && (
                <NavLink
                  to="/support"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">support_agent</span>
                        <span className="fo-nav-label">Helpline Chat</span>
                      </div>
                      {isActive ? (
                        <span className="fo-nav-active-dot" />
                      ) : supportUnreadCount > 0 ? (
                        <span className="fo-badge-cyan" title={`${supportUnreadCount} unread support messages`}>
                          {supportUnreadCount}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/reports') && (
                <NavLink
                  to="/reports"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">analytics</span>
                        <span className="fo-nav-label">Reports & Exports</span>
                      </div>
                      {isActive && <span className="fo-nav-active-dot" />}
                    </>
                  )}
                </NavLink>
              )}

              {canAccessPath(user, '/settings') && (isSuperAdmin(user) || user?.role === 'ADMIN') && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) => (isActive ? 'fo-nav-item active' : 'fo-nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <div className="fo-nav-left">
                        <span className="material-symbols-outlined fo-nav-icon">settings</span>
                        <span className="fo-nav-label">SLA & Settings</span>
                      </div>
                      {isActive && <span className="fo-nav-active-dot" />}
                    </>
                  )}
                </NavLink>
              )}
            </div>
          </nav>
        </div>

        {/* 4. Modern Bottom Operator Card */}
        <div className="fo-sidebar-footer">
          {user ? (
            <div className="fo-operator-card">
              <div className="fo-operator-left">
                <div className="fo-operator-avatar-wrapper">
                  <div className="fo-operator-avatar">
                    {user.firstName ? user.firstName[0] : 'U'}
                    {user.lastName ? user.lastName[0] : ''}
                  </div>
                  <span className="fo-operator-status-dot" title="Console Active" />
                </div>
                <div className="fo-operator-meta">
                  <span className="fo-operator-name">{fullName(user) || 'Console Operator'}</span>
                  <span className="fo-operator-role">
                    {user.role === 'SUPER_ADMIN'
                      ? 'Global Fleet Dir.'
                      : user.employeeId
                        ? `${user.employeeId} • ${user.role}`
                        : user.role}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="fo-btn-logout"
                onClick={handleLogout}
                disabled={signingOut}
                title="Sign out of FleetOps"
                aria-label="Sign out"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  logout
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Backdrop for Mobile Sidebar Overlay */}
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}

      {/* Main Workspace Content Area */}
      <main className={`main-content ${isFleetOpsRoute ? 'fleetops-active' : ''}`}>
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

        <div className={`workspace-body ${isFleetOpsRoute ? 'fleetops-body' : ''}`}>
          <PageErrorBoundary routeKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}
