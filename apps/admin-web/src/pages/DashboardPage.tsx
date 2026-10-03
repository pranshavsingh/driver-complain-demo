import { useMemo, useState, useEffect, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  ComplaintPublic,
  VehiclePublic,
  ComplaintCategory,
  SparePartRequestPublic,
  LoadingRecord,
} from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { computeSlaInfo } from '../lib/format';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { getUserCategories, canAccessPath } from '../auth/permissions';
import { useRealtime } from '../realtime/RealtimeProvider';
import { useCategorySlaMap } from '../hooks/useCategorySlaMap';
import { getCategoryLabel } from './UsersPage';

type DashboardTab = 'complaints' | 'loading' | 'spare-parts';

export function DashboardPage(): ReactElement {
  const { user } = useAuth();
  const { connected, subscribeCustom } = useRealtime();
  const { slaMap } = useCategorySlaMap();
  const navigate = useNavigate();

  const userCategories = useMemo(() => getUserCategories(user), [user]);
  const isDeptAdmin = user?.role === 'ADMIN' && userCategories.length > 0;

  // Tab & Filter States
  const [activeTab, setActiveTab] = useState<DashboardTab>('complaints');
  const [selectedCategory, setSelectedCategory] = useState<ComplaintCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [syncCount, setSyncCount] = useState<number>(0);

  // Resources
  const complaintsResource = useApiResource('dashboard:complaints', () =>
    api.complaints.list(api.EMPTY_FILTER, 1, 100),
  );
  const vehiclesResource = useApiResource('dashboard:vehicles', () => api.vehicles.list());
  const loadingResource = useApiResource('dashboard:loading', () => api.loading.list());
  const sparePartsResource = useApiResource('dashboard:spare-parts', () =>
    api.spareParts.list({ limit: 25 }),
  );
  const usersResource = useApiResource('dashboard:users', () =>
    isSuperAdmin(user) || user?.role === 'ADMIN' ? api.users.list() : Promise.resolve([]),
  );
  const sitesResource = useApiResource('dashboard:sites', () => api.sites.list());
  const driversResource = useApiResource('dashboard:drivers', () => api.drivers.list());

  const complaintsList: ComplaintPublic[] = complaintsResource.data?.data ?? [];
  const vehicleList: VehiclePublic[] = vehiclesResource.data ?? [];
  const loadingList: LoadingRecord[] = loadingResource.data?.data ?? [];
  const sparePartsList: SparePartRequestPublic[] = sparePartsResource.data?.data ?? [];
  const usersList = usersResource.data ?? [];
  const sitesList = sitesResource.data ?? [];
  const driversList = driversResource.data ?? [];

  // Realtime Subscriptions
  useEffect(() => {
    const handleUpdate = () => {
      void complaintsResource.reload();
      void loadingResource.reload();
      setLastSyncTime('Just now');
    };

    const unsubC1 = subscribeCustom('complaint:created', handleUpdate);
    const unsubC2 = subscribeCustom('complaint:status-changed', handleUpdate);
    const unsubC3 = subscribeCustom('complaint:assigned', handleUpdate);
    const unsubU1 = subscribeCustom('user:approval-requested', () => void usersResource.reload());
    const unsubU2 = subscribeCustom('user:approved', () => void usersResource.reload());
    const unsubSP1 = subscribeCustom('spare-part:created', () => void sparePartsResource.reload());
    const unsubL1 = subscribeCustom('loading:updated', () => void loadingResource.reload());

    return () => {
      unsubC1();
      unsubC2();
      unsubC3();
      unsubU1();
      unsubU2();
      unsubSP1();
      unsubL1();
    };
  }, [subscribeCustom, complaintsResource, loadingResource, usersResource, sparePartsResource]);

  const handleSyncNow = () => {
    setSyncCount((prev) => prev + 1);
    void complaintsResource.reload();
    void vehiclesResource.reload();
    void loadingResource.reload();
    void sparePartsResource.reload();
    void usersResource.reload();
    setLastSyncTime('Just now');
  };

  // Timer to update sync pill display
  useEffect(() => {
    const interval = setInterval(() => {
      setLastSyncTime((prev) => (prev === 'Just now' ? '30s ago' : '1m ago'));
    }, 30000);
    return () => clearInterval(interval);
  }, [syncCount]);

  // Active Complaints Metrics
  const activeComplaints = complaintsList.filter(
    (c) => c.status === 'NEW' || c.status === 'IN_PROGRESS',
  );
  const newComplaints = complaintsList.filter((c) => c.status === 'NEW').length;
  const inProgressComplaints = complaintsList.filter((c) => c.status === 'IN_PROGRESS').length;
  const urgentComplaints = complaintsList.filter(
    (c) =>
      (c.priority === 'URGENT' || c.priority === 'HIGH') &&
      (c.status === 'NEW' || c.status === 'IN_PROGRESS'),
  );

  const todayComplaintsCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return complaintsList.filter((c) => new Date(c.createdAt).toDateString() === todayStr).length;
  }, [complaintsList]);

  const needsActionComplaintsCount = useMemo(() => {
    return complaintsList.filter((c) => {
      if (c.status === 'RESOLVED' || c.status === 'CLOSED' || c.status === 'IN_PROGRESS') return false;
      const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
      return sla.isOverdue || Boolean(c.needsAction);
    }).length;
  }, [complaintsList, slaMap]);

  // Loading & Detention Metrics
  const activeTrips = loadingList.filter((t) => t.status !== 'TRIP_COMPLETED');
  const detainedTrips = loadingList.filter(
    (t) => (t.waitingTimeMinutes ?? 0) >= 180 && t.status !== 'TRIP_COMPLETED',
  );

  const totalVehicles = vehicleList.length;
  const vehiclesInTripCount = activeTrips.length;

  const utilizationPct = useMemo(() => {
    if (totalVehicles <= 0) return '0.0';
    return ((vehiclesInTripCount / totalVehicles) * 100).toFixed(1);
  }, [vehiclesInTripCount, totalVehicles]);

  const standbyVehiclesCount = Math.max(0, totalVehicles - vehiclesInTripCount);

  // Driver Overview Metrics
  const totalDriversCount = driversList.length;
  const assignedDriversCount = useMemo(() => {
    const assignedDriverIds = new Set(vehicleList.map((v) => v.driverId).filter(Boolean));
    if (!driversList.length) {
      return assignedDriverIds.size;
    }
    return driversList.filter((d) => assignedDriverIds.has(d.id) || assignedDriverIds.has(d.userId)).length;
  }, [driversList, vehicleList]);
  const freeDriversCount = Math.max(0, totalDriversCount - assignedDriversCount);

  const overSlaComplaintsCount = useMemo(() => {
    return complaintsList.filter((c) => {
      if (c.status === 'RESOLVED' || c.status === 'CLOSED') return false;
      const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
      return sla.isOverdue;
    }).length;
  }, [complaintsList, slaMap]);

  // Pending Approvals
  const pendingApprovals = usersList.filter((u) => u.approvalStatus === 'PENDING_APPROVAL');

  // Category Distribution Counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      BREAKDOWN: 0,
      FUEL_DEF: 0,
      TYRE_ISSUE: 0,
      LOADING: 0,
      ACCOUNTS: 0,
      VEHICLE_MAINTENANCE: 0,
    };
    for (const c of activeComplaints) {
      const cat = c.category;
      if (cat && typeof counts[cat] === 'number') {
        const current = counts[cat] ?? 0;
        counts[cat] = current + 1;
      }
    }
    return counts;
  }, [activeComplaints]);

  const getCategoryBarWidth = (cat: string) => {
    if (activeComplaints.length <= 0) return '0%';
    const count = categoryCounts[cat] || 0;
    if (count <= 0) return '0%';
    const pct = Math.min(100, Math.max(5, Math.round((count / activeComplaints.length) * 100)));
    return `${pct}%`;
  };

  // Filtered Complaints for Table
  const filteredComplaints = useMemo(() => {
    return complaintsList.filter((item) => {
      // Department admin filter
      if (isDeptAdmin && !userCategories.includes(item.category as any)) {
        return false;
      }
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchNo = item.complaintNo?.toLowerCase().includes(q);
        const matchDriver = item.driverName?.toLowerCase().includes(q);
        const matchPlate = item.vehiclePlateNumber?.toLowerCase().includes(q);
        if (!matchTitle && !matchNo && !matchDriver && !matchPlate) return false;
      }
      return true;
    });
  }, [complaintsList, isDeptAdmin, userCategories, selectedCategory, searchQuery]);

  const paginatedComplaints = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredComplaints.slice(start, start + pageSize);
  }, [filteredComplaints, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredComplaints.length / pageSize));

  // Dynamic Greeting based on current local hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* ==========================================================================
            1. TOP MISSION CONTROL HEADER
            ========================================================================== */}
        <section className="fo-mission-header">
          <div className="fo-header-glow" />
          <div className="fo-header-content">
            <div className="fo-header-titles">
              <h1>
                <span>{greeting}, {user?.firstName || 'Fleetops'}!</span>
                <span>👋</span>
                <span className="fo-role-badge">
                  {user?.role === 'SUPER_ADMIN'
                    ? 'SUPER ADMIN VIEW'
                    : isDeptAdmin
                      ? `DEPT ADMIN: ${userCategories.map((c) => getCategoryLabel(c)).join(', ')}`
                      : `${user?.role || 'OPERATOR'} VIEW`}
                </span>
                <span className="fo-live-pill">
                  <span className="fo-ping-dot" />
                  {connected ? 'LIVE HUB CONNECTED' : 'OFFLINE MODE'}
                </span>
              </h1>
              <p className="fo-header-sub">
                Global Fleet Operations Center • Realtime System Telemetry & Rapid Incident Dispatch
              </p>
            </div>

            <div className="fo-header-actions">
              <button
                type="button"
                className="fo-btn-sync"
                onClick={handleSyncNow}
                title="Refresh telemetry streams"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  sync
                </span>
                <span>Sync Now</span>
                <span className="fo-sync-time">{lastSyncTime}</span>
              </button>

              <button
                type="button"
                className="fo-btn-primary"
                onClick={() => navigate('/complaints')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  add_circle
                </span>
                <span>+ New Dispatch / Ticket</span>
              </button>
            </div>
          </div>
        </section>

        {/* ==========================================================================
            2. CRITICAL OPERATIONAL ALERTS STACK
            ========================================================================== */}
        <section className="fo-alerts-grid">
          {/* Detention SLA Escalation Alert */}
          <div className="fo-alert-card danger">
            <div className="fo-alert-left">
              <div className="fo-alert-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  timer_off
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="fo-alert-title">
                  <span>Detention SLA Escalation</span>
                  <span className="fo-ping-dot" style={{ backgroundColor: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                </div>
                <p className="fo-alert-desc">
                  {detainedTrips.length > 0
                    ? `${detainedTrips.length} Trucks detained >180m at Plant Bay. Demurrage penalties accumulating.`
                    : `${overSlaComplaintsCount} Trucks / Complaints over SLA detained at Plant Bay.`}
                </p>
              </div>
            </div>
            {canAccessPath(user, '/loading') && (
              <Link to="/loading" className="fo-alert-action">
                <span>View Radar</span>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  arrow_forward
                </span>
              </Link>
            )}
          </div>

          {/* Compliance Review Action Alert */}
          <div className="fo-alert-card info">
            <div className="fo-alert-left">
              <div className="fo-alert-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  badge
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="fo-alert-title">
                  <span>Compliance Review Action</span>
                </div>
                <p className="fo-alert-desc">
                  {`${pendingApprovals.length} Pending Driver Onboarding Approvals awaiting background verification.`}
                </p>
              </div>
            </div>
            {canAccessPath(user, '/users') && (
              <Link to="/users" className="fo-alert-action">
                <span>Review Approvals</span>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  arrow_forward
                </span>
              </Link>
            )}
          </div>
        </section>

        {/* ==========================================================================
            3. 4 KPI METRIC CARDS
            ========================================================================== */}
        <section className="fo-kpi-grid">
          {/* Card 1: Active Complaints */}
          <div className="fo-kpi-card">
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Active Complaints</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  report_problem
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value">{activeComplaints.length}</span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93ccff' }}>
                +{todayComplaintsCount} today
              </span>
            </div>
            <p className="fo-kpi-sub">
              <span>{newComplaints} New</span>
              <span>•</span>
              <span>{inProgressComplaints} In Progress</span>
              <span>•</span>
              <span style={{ color: '#ffb4ab' }}>{urgentComplaints.length} Escalated</span>
            </p>
          </div>

          {/* Card 2: Needs Action Complaints */}
          <div className="fo-kpi-card">
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Needs Action Complaints</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#4cd7f6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  pending_actions
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value" style={{ color: '#4cd7f6' }}>
                {String(needsActionComplaintsCount).padStart(2, '0')}
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(6, 182, 212, 0.25)', color: '#4cd7f6' }}>
                ACTION REQUIRED
              </span>
            </div>
            <p className="fo-kpi-sub">
              <span>{needsActionComplaintsCount} Tickets Requiring Admin Action</span>
            </p>
          </div>

          {/* Card 3: Fleet Utilization */}
          <div className="fo-kpi-card">
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Fleet Utilization</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(76, 215, 246, 0.15)', color: '#4cd7f6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  local_shipping
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value">
                {totalVehicles}
                <span style={{ fontSize: 14, color: 'var(--fo-text-muted)', fontWeight: 500 }}>
                  {' '}/ {vehiclesInTripCount} / {totalVehicles}
                </span>
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>
                {utilizationPct}% In-Use
              </span>
            </div>
            <p className="fo-kpi-sub">
              <span>Active across {sitesList.length} Regional Depots</span>
              <span>•</span>
              <span>{standbyVehiclesCount} Standby</span>
            </p>
          </div>

          {/* Card 4: Fleet Drivers */}
          <div className="fo-kpi-card">
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Fleet Drivers Overview</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  badge
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value">{totalDriversCount}</span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe' }}>
                DRIVERS DIRECTORY
              </span>
            </div>
            <p className="fo-kpi-sub">
              <span>{assignedDriversCount} Assigned to Vehicle</span>
              <span>•</span>
              <span style={{ color: '#6ee7b7' }}>{freeDriversCount} Free / Unassigned</span>
            </p>
          </div>
        </section>

        {/* ==========================================================================
            4. DEPARTMENT INCIDENT DISPATCH MATRIX
            ========================================================================== */}
        <section className="fo-matrix-section">
          <div className="fo-matrix-head">
            <div className="fo-matrix-title">
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--fo-primary)' }}>
                hub
              </span>
              <span>Department Incident Dispatch Matrix</span>
            </div>
            <span className="fo-matrix-sub">Auto-refreshing SLA targets • Realtime queues</span>
          </div>

          <div className="fo-matrix-grid">
            {/* Tile 1: Breakdowns */}
            {(!isDeptAdmin || userCategories.includes('BREAKDOWN')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'BREAKDOWN' ? 'active' : ''}`}
                onClick={() => setSelectedCategory((prev) => (prev === 'BREAKDOWN' ? 'ALL' : 'BREAKDOWN'))}
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>
                      car_crash
                    </span>
                    Breakdowns
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#ffb4ab' }}>
                    {categoryCounts.BREAKDOWN || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.BREAKDOWN ?? 4}h</span>
                  <span style={{ color: (categoryCounts.BREAKDOWN || 0) > 0 ? '#ffb4ab' : '#6ee7b7' }}>
                    {(categoryCounts.BREAKDOWN || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('BREAKDOWN'), background: '#ef4444' }} />
                </div>
              </div>
            )}

            {/* Tile 2: Fuel & DEF */}
            {(!isDeptAdmin || userCategories.includes('FUEL_DEF')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'FUEL_DEF' ? 'active' : ''}`}
                onClick={() => setSelectedCategory((prev) => (prev === 'FUEL_DEF' ? 'ALL' : 'FUEL_DEF'))}
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3b82f6' }}>
                      local_gas_station
                    </span>
                    Fuel & DEF
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(59, 130, 246, 0.25)', color: '#93ccff' }}>
                    {categoryCounts.FUEL_DEF || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.FUEL_DEF ?? 2}h</span>
                  <span style={{ color: (categoryCounts.FUEL_DEF || 0) > 0 ? '#93ccff' : '#6ee7b7' }}>
                    {(categoryCounts.FUEL_DEF || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('FUEL_DEF'), background: '#3b82f6' }} />
                </div>
              </div>
            )}

            {/* Tile 3: Tyres & Wheels */}
            {(!isDeptAdmin || userCategories.includes('TYRE_ISSUE')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'TYRE_ISSUE' ? 'active' : ''}`}
                onClick={() => setSelectedCategory((prev) => (prev === 'TYRE_ISSUE' ? 'ALL' : 'TYRE_ISSUE'))}
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f97316' }}>
                      trip_origin
                    </span>
                    Tyres & Wheels
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(249, 115, 22, 0.25)', color: '#fed65b' }}>
                    {categoryCounts.TYRE_ISSUE || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.TYRE_ISSUE ?? 3}h</span>
                  <span style={{ color: (categoryCounts.TYRE_ISSUE || 0) > 0 ? '#fed65b' : '#6ee7b7' }}>
                    {(categoryCounts.TYRE_ISSUE || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('TYRE_ISSUE'), background: '#f97316' }} />
                </div>
              </div>
            )}

            {/* Tile 4: Loading Bays */}
            {(!isDeptAdmin || userCategories.includes('LOADING')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'LOADING' ? 'active' : ''}`}
                onClick={() => setSelectedCategory((prev) => (prev === 'LOADING' ? 'ALL' : 'LOADING'))}
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#06b6d4' }}>
                      view_agenda
                    </span>
                    Loading Bays
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(6, 182, 212, 0.25)', color: '#4cd7f6' }}>
                    {categoryCounts.LOADING || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.LOADING ?? 6}h</span>
                  <span style={{ color: (categoryCounts.LOADING || 0) > 0 ? '#4cd7f6' : '#6ee7b7' }}>
                    {(categoryCounts.LOADING || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('LOADING'), background: '#06b6d4' }} />
                </div>
              </div>
            )}

            {/* Tile 5: Demurrage / Accounts */}
            {(!isDeptAdmin || userCategories.includes('ACCOUNTS')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'ACCOUNTS' ? 'active' : ''}`}
                onClick={() => setSelectedCategory((prev) => (prev === 'ACCOUNTS' ? 'ALL' : 'ACCOUNTS'))}
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981' }}>
                      payments
                    </span>
                    Accounts.
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#6ee7b7' }}>
                    {categoryCounts.ACCOUNTS || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.ACCOUNTS ?? 12}h</span>
                  <span style={{ color: (categoryCounts.ACCOUNTS || 0) > 0 ? '#6ee7b7' : '#6ee7b7' }}>
                    {(categoryCounts.ACCOUNTS || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('ACCOUNTS'), background: '#10b981' }} />
                </div>
              </div>
            )}

            {/* Tile 6: Scheduled Shop */}
            {(!isDeptAdmin || userCategories.includes('VEHICLE_MAINTENANCE')) && (
              <div
                className={`fo-matrix-tile ${selectedCategory === 'VEHICLE_MAINTENANCE' ? 'active' : ''}`}
                onClick={() =>
                  setSelectedCategory((prev) => (prev === 'VEHICLE_MAINTENANCE' ? 'ALL' : 'VEHICLE_MAINTENANCE'))
                }
              >
                <div className="fo-tile-top">
                  <span className="fo-tile-name">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#eab308' }}>
                      build
                    </span>
                    Scheduled Shop
                  </span>
                  <span className="fo-tile-count" style={{ background: 'rgba(234, 179, 8, 0.25)', color: '#fde047' }}>
                    {categoryCounts.VEHICLE_MAINTENANCE || 0} Active
                  </span>
                </div>
                <div className="fo-tile-stats">
                  <span>SLA: {slaMap.VEHICLE_MAINTENANCE ?? 8}h</span>
                  <span style={{ color: (categoryCounts.VEHICLE_MAINTENANCE || 0) > 0 ? '#fde047' : '#6ee7b7' }}>
                    {(categoryCounts.VEHICLE_MAINTENANCE || 0) > 0 ? 'Active Queue' : 'Queue Clear'}
                  </span>
                </div>
                <div className="fo-tile-bar">
                  <div className="fo-tile-fill" style={{ width: getCategoryBarWidth('VEHICLE_MAINTENANCE'), background: '#eab308' }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ==========================================================================
            5. LIVE INCIDENT STREAM TABLE
            ========================================================================== */}
        <section className="fo-table-card">
          <div className="fo-table-toolbar">
            <div className="fo-table-tabs">
              <button
                type="button"
                className={`fo-tab-btn ${activeTab === 'complaints' ? 'active' : ''}`}
                onClick={() => setActiveTab('complaints')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  campaign
                </span>
                <span>Complaints Stream</span>
                <span className="fo-tab-count">{filteredComplaints.length}</span>
              </button>

              {canAccessPath(user, '/loading') && (
                <button
                  type="button"
                  className={`fo-tab-btn ${activeTab === 'loading' ? 'active' : ''}`}
                  onClick={() => setActiveTab('loading')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    timer
                  </span>
                  <span>Loading & Detention Radar</span>
                  <span className="fo-tab-count" style={{ color: '#ffb4ab' }}>
                    {detainedTrips.length} Breached
                  </span>
                </button>
              )}

              {canAccessPath(user, '/spare-parts') && (
                <button
                  type="button"
                  className={`fo-tab-btn ${activeTab === 'spare-parts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('spare-parts')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    inventory_2
                  </span>
                  <span>Spare Parts Requisitions</span>
                  <span className="fo-tab-count">{sparePartsList.length} New</span>
                </button>
              )}
            </div>

            <div className="fo-table-actions">
              <div className="fo-search-box">
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  placeholder="Quick filter ID, Plate, City..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <Link
                to="/complaints"
                className="fo-btn-sync"
                style={{ textDecoration: 'none' }}
                title="Open full Complaints Triage Hub"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  open_in_new
                </span>
                <span>Full Triage Hub</span>
              </Link>
            </div>
          </div>

          <div className="fo-table-wrapper">
            {activeTab === 'complaints' && (
              <table className="fo-data-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Incident ID</th>
                    <th style={{ width: 140 }}>Vehicle</th>
                    <th style={{ width: 170 }}>Driver</th>
                    <th style={{ width: 140 }}>Category</th>
                    <th style={{ width: 160 }}>Location / Hub</th>
                    <th style={{ width: 150 }}>SLA Remaining</th>
                    <th style={{ width: 150 }}>Assigned Desk</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedComplaints.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--fo-text-muted)' }}>
                        No incidents matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedComplaints.map((c) => {
                      const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
                      const isBreached = sla.isOverdue;

                      const targetHours = sla.targetHours || 12;
                      const targetMs = targetHours * 60 * 60 * 1000;
                      const createdMs = new Date(c.createdAt).getTime();
                      const endMs = c.resolvedAt ? new Date(c.resolvedAt).getTime() : Date.now();
                      const elapsedMs = Math.max(0, endMs - createdMs);

                      let slaPercent = 100;
                      if (isBreached) {
                        slaPercent = 100;
                      } else if (c.resolvedAt) {
                        slaPercent = 100;
                      } else {
                        slaPercent = Math.min(100, Math.max(5, Math.round((elapsedMs / targetMs) * 100)));
                      }

                      const slaTextColor = isBreached
                        ? '#ffb4ab'
                        : sla.status === 'WARNING'
                          ? '#fde047'
                          : '#6ee7b7';

                      const slaBarColor = isBreached
                        ? '#ef4444'
                        : sla.status === 'WARNING'
                          ? '#f59e0b'
                          : '#10b981';

                      const isNeedAction = c.status !== 'RESOLVED' && c.status !== 'CLOSED' && c.status !== 'IN_PROGRESS' && (isBreached || Boolean(c.needsAction));

                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: 'var(--fo-primary)' }}>
                                #{c.complaintNo}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span
                                    className="fo-ping-dot"
                                    style={{
                                      width: 4,
                                      height: 4,
                                      backgroundColor: isBreached ? '#ef4444' : '#10b981',
                                      boxShadow: 'none',
                                    }}
                                  />
                                  {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isNeedAction && (
                                  <span
                                    className="fo-badge-mono"
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.25)',
                                      color: '#ffb4ab',
                                      border: '1px solid rgba(239, 68, 68, 0.5)',
                                      fontSize: 9,
                                      padding: '1px 5px',
                                      fontWeight: 700,
                                      borderRadius: 4,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                    }}
                                  >
                                    NEED ACTION
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span
                                className="fo-badge-mono"
                                style={{
                                  background: 'var(--fo-surface-highest)',
                                  color: '#ffffff',
                                  width: 'fit-content',
                                }}
                              >
                                {c.vehiclePlateNumber || 'NA-11-11-1111'}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', marginTop: 2 }}>
                                {c.vehicleModel || 'NA'}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: '50%',
                                  background: 'var(--fo-surface-high)',
                                  color: 'var(--fo-text)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {c.driverName ? c.driverName[0] : 'F'}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: '#ffffff', fontSize: 12 }}>
                                  {c.driverName || 'FallBack'}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--fo-text-muted)' }}>
                                  {c.driverPhone || '+91 98231-XXXXX'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span
                              className="fo-badge-mono"
                              style={{
                                background:
                                  c.category === 'BREAKDOWN'
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : c.category === 'FUEL_DEF'
                                      ? 'rgba(59, 130, 246, 0.2)'
                                      : c.category === 'TYRE_ISSUE'
                                        ? 'rgba(249, 115, 22, 0.2)'
                                        : 'rgba(6, 182, 212, 0.2)',
                                color:
                                  c.category === 'BREAKDOWN'
                                    ? '#ffb4ab'
                                    : c.category === 'FUEL_DEF'
                                      ? '#93ccff'
                                      : c.category === 'TYRE_ISSUE'
                                        ? '#fed65b'
                                        : '#4cd7f6',
                                textTransform: 'uppercase',
                              }}
                            >
                              {getCategoryLabel(c.category as any)}
                            </span>
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fo-tertiary)' }}>
                                near_me
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--fo-text)', maxWidth: 140 }} className="truncate">
                                {c.tripLocationName || 'NA'}
                              </span>
                            </div>
                          </td>

                          <td>
                            <div className="fo-sla-countdown">
                              <span
                                className="sla-time"
                                style={{ color: slaTextColor }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                                  timer
                                </span>
                                {sla.slaText}
                              </span>
                              <div className="fo-sla-progress">
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${slaPercent}%`,
                                    background: slaBarColor,
                                    transition: 'width 0.3s ease',
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#ffffff' }}>
                                {c.assignedToName || 'NAN'}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--fo-text-muted)' }}>
                                Triage Desk
                              </span>
                            </div>
                          </td>

                          <td>
                            <span
                              className="fo-badge-mono"
                              style={{
                                background:
                                  c.status === 'NEW'
                                    ? 'rgba(59, 130, 246, 0.2)'
                                    : c.status === 'IN_PROGRESS'
                                      ? 'rgba(168, 85, 247, 0.2)'
                                      : c.status === 'RESOLVED' || c.status === 'CLOSED'
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : 'rgba(245, 158, 11, 0.2)',
                                color:
                                  c.status === 'NEW'
                                    ? '#93ccff'
                                    : c.status === 'IN_PROGRESS'
                                      ? '#d8b4fe'
                                      : c.status === 'RESOLVED' || c.status === 'CLOSED'
                                        ? '#6ee7b7'
                                        : '#fed65b',
                              }}
                            >
                              {c.status}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <Link
                              to={`/complaints/${c.id}`}
                              className="fo-btn-investigate"
                            >
                              <span>Investigate</span>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                                arrow_forward
                              </span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'loading' && (
              <table className="fo-data-table">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Truck Plate</th>
                    <th>Driver</th>
                    <th>Site / Plant</th>
                    <th>Stage</th>
                    <th>Waiting Time</th>
                    <th>Demurrage Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList.slice(0, 8).map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: 'var(--fo-primary)' }}>
                        #{l.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td style={{ fontFamily: 'var(--fo-font-mono)' }}>{l.vehiclePlate || '11-11-1111'}</td>
                      <td>{l.driverName || 'Fallback'}</td>
                      <td>{l.locationName || 'NA'}</td>
                      <td>
                        <span className="fo-badge-mono" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#4cd7f6' }}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--fo-font-mono)' }}>
                        {l.waitingTimeMinutes ? `${Math.floor(l.waitingTimeMinutes / 60)}h ${l.waitingTimeMinutes % 60}m` : '0m'}
                      </td>
                      <td>
                        {(l.waitingTimeMinutes ?? 0) >= 180 ? (
                          <span className="fo-badge-mono" style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#ffb4ab' }}>
                            DEMURRAGE BREACH
                          </span>
                        ) : (
                          <span className="fo-badge-mono" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>
                            IN SLA
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link to="/loading" className="fo-btn-investigate">
                          <span>View Radar</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'spare-parts' && (
              <table className="fo-data-table">
                <thead>
                  <tr>
                    <th>Part Request #</th>
                    <th>Driver ID</th>
                    <th>Part Name</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sparePartsList.slice(0, 8).map((sp) => (
                    <tr key={sp.id}>
                      <td style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: 'var(--fo-primary)' }}>
                        #{sp.requestNo || sp.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td style={{ fontFamily: 'var(--fo-font-mono)' }}>{sp.driverId?.slice(0, 8) || 'FAL-4523'}</td>
                      <td>{sp.partName || sp.description || 'NA'}</td>
                      <td style={{ fontFamily: 'var(--fo-font-mono)' }}>{sp.quantity ?? 0}</td>
                      <td>
                        <span className="fo-badge-mono" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#fde047' }}>
                          {sp.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link to="/spare-parts" className="fo-btn-investigate">
                          <span>Review</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {activeTab === 'complaints' && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--fo-border)' }}>
              <span style={{ fontSize: 11, color: 'var(--fo-text-muted)', fontFamily: 'var(--fo-font-mono)' }}>
                Showing {Math.min(filteredComplaints.length, (page - 1) * pageSize + 1)} to{' '}
                {Math.min(filteredComplaints.length, page * pageSize)} of {filteredComplaints.length} active incidents
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="fo-btn-sync"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '4px 10px' }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="fo-btn-sync"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '4px 10px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
