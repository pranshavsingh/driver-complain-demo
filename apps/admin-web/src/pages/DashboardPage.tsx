import { useMemo, useState, useEffect, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type {
  ComplaintPublic,
  VehiclePublic,
  ComplaintCategory,
  SparePartRequestPublic,
  LoadingRecord,
} from '@driver-complaint/shared-types';
import {
  ClipboardList,
  Clock,
  RotateCw,
  Search,
  X,
  Truck,
  Users,
  Package,
  MapPin,
  ArrowRight,
  ShieldAlert,
  Zap,
  Settings,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';
import { describeVehicle, formatDateTime, fullName } from '../lib/format';
import { useAuth, isSuperAdmin } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { APP_CATEGORY_OPTIONS, getCategoryLabel } from './UsersPage';

type StatFilterMode = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'URGENT' | 'RESOLVED';
type DashboardTab = 'complaints' | 'loading' | 'spare-parts' | 'fleet';

export function DashboardPage(): ReactElement {
  const { user } = useAuth();
  const { connected, subscribeCustom } = useRealtime();

  // Tab & Filter States
  const [activeTab, setActiveTab] = useState<DashboardTab>('complaints');
  const [selectedStat, setSelectedStat] = useState<StatFilterMode>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ComplaintCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Resources
  const complaintsResource = useApiResource('dashboard:complaints', () =>
    api.complaints.list(api.EMPTY_FILTER, 1, 100),
  );
  const vehiclesResource = useApiResource('dashboard:vehicles', () => api.vehicles.list());
  const loadingResource = useApiResource('dashboard:loading', () => api.loading.list());
  const sparePartsResource = useApiResource('dashboard:spare-parts', () =>
    api.spareParts.list({ limit: 15 }),
  );
  const usersResource = useApiResource('dashboard:users', () => api.users.list());
  const sitesResource = useApiResource('dashboard:sites', () => api.sites.list());

  const complaintsList: ComplaintPublic[] = complaintsResource.data?.data ?? [];
  const vehicleList: VehiclePublic[] = vehiclesResource.data ?? [];
  const loadingList: LoadingRecord[] = loadingResource.data?.data ?? [];
  const sparePartsList: SparePartRequestPublic[] = sparePartsResource.data?.data ?? [];
  const usersList = usersResource.data ?? [];
  const sitesList = sitesResource.data ?? [];

  // Realtime Subscriptions
  useEffect(() => {
    const handleComplaintChange = () => {
      void complaintsResource.reload();
    };
    const handleUserChange = () => {
      void usersResource.reload();
    };
    const handleSparePartChange = () => {
      void sparePartsResource.reload();
    };
    const handleLoadingChange = () => {
      void loadingResource.reload();
    };

    const unsubC1 = subscribeCustom('complaint:created', handleComplaintChange);
    const unsubC2 = subscribeCustom('complaint:status-changed', handleComplaintChange);
    const unsubC3 = subscribeCustom('complaint:assigned', handleComplaintChange);
    const unsubU1 = subscribeCustom('user:created', handleUserChange);
    const unsubU2 = subscribeCustom('user:approved', handleUserChange);
    const unsubU3 = subscribeCustom('user:rejected', handleUserChange);
    const unsubU4 = subscribeCustom('user:approval-requested', handleUserChange);
    const unsubSP1 = subscribeCustom('spare-part:created', handleSparePartChange);
    const unsubSP2 = subscribeCustom('spare-part:status-changed', handleSparePartChange);
    const unsubL1 = subscribeCustom('loading:updated', handleLoadingChange);

    return () => {
      unsubC1();
      unsubC2();
      unsubC3();
      unsubU1();
      unsubU2();
      unsubU3();
      unsubU4();
      unsubSP1();
      unsubSP2();
      unsubL1();
    };
  }, [subscribeCustom, complaintsResource, usersResource, sparePartsResource, loadingResource]);

  const reloadAll = () => {
    void complaintsResource.reload();
    void vehiclesResource.reload();
    void loadingResource.reload();
    void sparePartsResource.reload();
    void usersResource.reload();
    void sitesResource.reload();
  };

  const isAnyLoading =
    complaintsResource.loading ||
    vehiclesResource.loading ||
    loadingResource.loading ||
    sparePartsResource.loading;

  // Vehicle Map
  const vehicleMap = useMemo(() => {
    const map = new Map<string, VehiclePublic>();
    for (const v of vehicleList) {
      map.set(v.id, v);
    }
    return map;
  }, [vehicleList]);

  // Complaints Metrics
  const totalComplaints = complaintsResource.data?.meta.total ?? complaintsList.length;
  const newComplaints = complaintsList.filter((c) => c.status === 'NEW').length;
  const inProgressComplaints = complaintsList.filter((c) => c.status === 'IN_PROGRESS').length;
  const urgentComplaints = complaintsList.filter(
    (c) => (c.priority === 'URGENT' || c.priority === 'HIGH') && (c.status === 'NEW' || c.status === 'IN_PROGRESS'),
  );
  const resolvedComplaints = complaintsList.filter(
    (c) => c.status === 'RESOLVED' || c.status === 'CLOSED',
  ).length;

  // Pending Approvals & Assignments
  const pendingAssignmentComplaints = complaintsList.filter((c) => c.assignmentStatus === 'PENDING');
  const pendingUserApprovals = usersList.filter((u) => u.approvalStatus === 'PENDING_APPROVAL');

  // Loading & Detention Metrics
  const activeTrips = loadingList.filter((t) => t.status !== 'TRIP_COMPLETED');
  const detainedTrips = loadingList.filter((t) => (t.waitingTimeMinutes ?? 0) >= 240 && t.status !== 'TRIP_COMPLETED');
  const completedTrips = loadingList.filter((t) => t.status === 'TRIP_COMPLETED').length;

  // Spare Parts Metrics
  const pendingSpareParts = sparePartsList.filter((s) => s.status === 'PENDING_APPROVAL').length;

  // Fleet Metrics
  const totalVehicles = vehicleList.length;

  // Category Distribution Matrix
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of APP_CATEGORY_OPTIONS) {
      counts[opt.value] = 0;
    }
    for (const c of complaintsList) {
      if (c.category && counts[c.category] !== undefined) {
        counts[c.category] = (counts[c.category] || 0) + 1;
      }
    }
    return counts;
  }, [complaintsList]);

  // Filtered Complaints for Table
  const filteredComplaints = useMemo(() => {
    return complaintsList.filter((item) => {
      if (selectedStat === 'NEW' && item.status !== 'NEW') return false;
      if (selectedStat === 'IN_PROGRESS' && item.status !== 'IN_PROGRESS') return false;
      if (selectedStat === 'URGENT' && item.priority !== 'URGENT' && item.priority !== 'HIGH') return false;
      if (selectedStat === 'RESOLVED' && item.status !== 'RESOLVED' && item.status !== 'CLOSED') return false;

      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchNo = item.complaintNo.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchDriver = item.driverName ? item.driverName.toLowerCase().includes(q) : false;
        const matchPlate = item.vehiclePlateNumber ? item.vehiclePlateNumber.toLowerCase().includes(q) : false;
        if (!matchTitle && !matchNo && !matchDesc && !matchDriver && !matchPlate) return false;
      }
      return true;
    });
  }, [complaintsList, selectedStat, selectedCategory, searchQuery]);

  const paginatedComplaints = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredComplaints.slice(start, start + pageSize);
  }, [filteredComplaints, page, pageSize]);

  // Greeting Message
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* 1. Mission Control Header & Context Bar */}
      <div
        style={{
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              {greeting}, {user?.firstName || 'Fleet Leader'}! 👋
            </h1>
            {user?.role ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  padding: '3px 10px',
                  borderRadius: 20,
                  backgroundColor:
                    user.role === 'SUPER_ADMIN'
                      ? 'rgba(168, 85, 247, 0.12)'
                      : user.role === 'ADMIN'
                      ? 'rgba(59, 130, 246, 0.12)'
                      : 'rgba(249, 115, 22, 0.12)',
                  color:
                    user.role === 'SUPER_ADMIN'
                      ? '#9333ea'
                      : user.role === 'ADMIN'
                      ? '#2563eb'
                      : '#ea580c',
                  border: '1px solid currentColor',
                }}
              >
                {user.role === 'SUPER_ADMIN'
                  ? 'SUPER ADMIN'
                  : user.role === 'ADMIN'
                  ? `DEPT HEAD: ${getCategoryLabel(user.category)}`
                  : `EXECUTIVE: ${user.site || 'General Site'}`}
              </span>
            ) : null}

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: connected ? '#16a34a' : '#ea580c',
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 88, 12, 0.1)',
              }}
              title={connected ? 'Connected to live WebSocket updates' : 'Reconnecting to live server...'}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: connected ? '#16a34a' : '#ea580c',
                  display: 'inline-block',
                }}
              />
              {connected ? 'Live Sync Active' : 'Connecting...'}
            </div>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
            Fleet operations, active driver complaints, loading turnaround times, and logistics telemetry.
          </p>
        </div>

        {/* Quick Action Navigation Bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={reloadAll}
            disabled={isAnyLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCw size={14} className={isAnyLoading ? 'spin' : ''} />
            {isAnyLoading ? 'Syncing...' : 'Refresh All'}
          </button>

          <Link
            to="/complaints"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, textDecoration: 'none' }}
          >
            <ClipboardList size={16} />
            Complaints Hub
          </Link>

          <Link
            to="/loading"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, textDecoration: 'none' }}
          >
            <Truck size={16} />
            Loading Tracker
          </Link>
        </div>
      </div>

      {complaintsResource.error ? <ErrorBanner error={complaintsResource.error} /> : null}

      {/* 2. Critical Action Banners (Conditional Alerts) */}

      {/* Alert 1: SuperAdmin Pending Driver / User Registrations */}
      {isSuperAdmin(user) && pendingUserApprovals.length > 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>
                {pendingUserApprovals.length} User Registration{pendingUserApprovals.length > 1 ? 's' : ''} Awaiting SuperAdmin Approval
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                {pendingUserApprovals.map((u) => `${fullName(u)} (${u.employeeId})`).slice(0, 4).join(', ')}
                {pendingUserApprovals.length > 4 ? ` and ${pendingUserApprovals.length - 4} more...` : ''}
              </div>
            </div>
          </div>
          <Link
            to="/users"
            className="btn btn-primary"
            style={{
              backgroundColor: '#dc2626',
              borderColor: '#dc2626',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Review User Approvals ({pendingUserApprovals.length})
          </Link>
        </div>
      ) : null}

      {/* Alert 2: Pending Complaint Assignment Requests */}
      {pendingAssignmentComplaints.length > 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#b45309' }}>
                {pendingAssignmentComplaints.length} Complaint Assignment Request{pendingAssignmentComplaints.length > 1 ? 's' : ''} Pending Review
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                Complaints assigned awaiting confirmation: {pendingAssignmentComplaints.map((c) => c.complaintNo).join(', ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pendingAssignmentComplaints.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                to={`/complaints/${p.id}`}
                className="btn btn-secondary"
                style={{ fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
              >
                Review {p.complaintNo}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Alert 3: Critical Detentions Alert */}
      {detainedTrips.length > 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 12,
            padding: '14px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldAlert size={20} color="#ef4444" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>
              <strong>Detention Alert:</strong> {detainedTrips.length} vehicle(s) waiting over 4 hours at loading/unloading points.
            </span>
          </div>
          <Link
            to="/loading"
            style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Open Detention Radar <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}

      {/* 3. Operational KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Card 1: Complaints Overview */}
        <button
          type="button"
          onClick={() => {
            setSelectedStat('ALL');
            setActiveTab('complaints');
            setPage(1);
          }}
          style={{
            padding: 18,
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: selectedStat === 'ALL' && activeTab === 'complaints' ? '2px solid #3b82f6' : '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 14,
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Complaints
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <ClipboardList size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-main, #0f172a)', marginTop: 8 }}>
            {totalComplaints}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: '#0284c7' }}>{newComplaints} New</span>
            <span style={{ color: '#d97706' }}>{inProgressComplaints} In Progress</span>
            <span style={{ color: '#16a34a' }}>{resolvedComplaints} Resolved</span>
          </div>
        </button>

        {/* Card 2: Urgent / Safety Alerts */}
        <button
          type="button"
          onClick={() => {
            setSelectedStat('URGENT');
            setActiveTab('complaints');
            setPage(1);
          }}
          style={{
            padding: 18,
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: selectedStat === 'URGENT' && activeTab === 'complaints' ? '2px solid #ef4444' : '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 14,
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Urgent & High Priority
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <Zap size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: urgentComplaints.length > 0 ? '#ef4444' : 'var(--text-main, #0f172a)', marginTop: 8 }}>
            {urgentComplaints.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 10 }}>
            Breakdowns, tyre immobilizations & safety escalations
          </div>
        </button>

        {/* Card 3: Fleet Vehicles */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('fleet');
          }}
          style={{
            padding: 18,
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: activeTab === 'fleet' ? '2px solid #10b981' : '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 14,
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fleet Vehicles
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <Truck size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-main, #0f172a)', marginTop: 8 }}>
            {totalVehicles}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: '#10b981' }}>{totalVehicles} Registered Vehicles</span>
            <span style={{ color: 'var(--text-muted, #64748b)' }}>{sitesList.length} Operating Hubs</span>
          </div>
        </button>

        {/* Card 4: Loading & Detention Radar */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('loading');
          }}
          style={{
            padding: 18,
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: activeTab === 'loading' ? '2px solid #f59e0b' : '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 14,
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Loading & Trips
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-main, #0f172a)', marginTop: 8 }}>
            {activeTrips.length}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: '#d97706' }}>{activeTrips.length} Active / In-Transit</span>
            <span style={{ color: '#16a34a' }}>{completedTrips} Trips Done</span>
          </div>
        </button>
      </div>

      {/* 4. Department & Category Matrix (6 Mobile App Categories) */}
      <div
        style={{
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main, #0f172a)' }}>
              Department & Category Workload Distribution
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
              Click any department category to filter complaints and view assigned team tasks.
            </p>
          </div>
          {selectedCategory !== 'ALL' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelectedCategory('ALL')}
              style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <X size={13} /> Reset Filter ({getCategoryLabel(selectedCategory)})
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {APP_CATEGORY_OPTIONS.map((cat) => {
            const count = categoryCounts[cat.value] || 0;
            const isSelected = selectedCategory === cat.value;
            const pct = totalComplaints > 0 ? Math.round((count / totalComplaints) * 100) : 0;

            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => {
                  setSelectedCategory(isSelected ? 'ALL' : cat.value);
                  setActiveTab('complaints');
                  setPage(1);
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-color, #e2e8f0)',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg, #f8fafc)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: count > 0 ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #94a3b8)',
                    }}
                  >
                    {count}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 6,
                    color: isSelected ? '#2563eb' : 'var(--text-main, #334155)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={cat.label}
                >
                  {cat.label}
                </div>
                {/* Visual Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: 4,
                    backgroundColor: 'var(--border-color, #e2e8f0)',
                    borderRadius: 2,
                    marginTop: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: isSelected ? '#3b82f6' : '#94a3b8',
                      borderRadius: 2,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Main Multi-Tab Operations Console */}
      <div
        style={{
          backgroundColor: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Navigation Tabs Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            backgroundColor: 'var(--table-header-bg, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setActiveTab('complaints');
                setPage(1);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: activeTab === 'complaints' ? 700 : 500,
                cursor: 'pointer',
                backgroundColor: activeTab === 'complaints' ? 'var(--primary, #3b82f6)' : 'transparent',
                color: activeTab === 'complaints' ? '#ffffff' : 'var(--text-main, #475569)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ClipboardList size={16} />
              <span>Complaints Stream</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: activeTab === 'complaints' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0,0,0,0.06)',
                  color: activeTab === 'complaints' ? '#ffffff' : 'inherit',
                }}
              >
                {filteredComplaints.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('loading')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: activeTab === 'loading' ? 700 : 500,
                cursor: 'pointer',
                backgroundColor: activeTab === 'loading' ? 'var(--primary, #3b82f6)' : 'transparent',
                color: activeTab === 'loading' ? '#ffffff' : 'var(--text-main, #475569)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Clock size={16} />
              <span>Loading & Detention Radar</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: activeTab === 'loading' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0,0,0,0.06)',
                  color: activeTab === 'loading' ? '#ffffff' : 'inherit',
                }}
              >
                {activeTrips.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('spare-parts')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: activeTab === 'spare-parts' ? 700 : 500,
                cursor: 'pointer',
                backgroundColor: activeTab === 'spare-parts' ? 'var(--primary, #3b82f6)' : 'transparent',
                color: activeTab === 'spare-parts' ? '#ffffff' : 'var(--text-main, #475569)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Package size={16} />
              <span>Spare Parts Requests</span>
              {pendingSpareParts > 0 && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 800,
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                  }}
                >
                  {pendingSpareParts}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fleet')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: activeTab === 'fleet' ? 700 : 500,
                cursor: 'pointer',
                backgroundColor: activeTab === 'fleet' ? 'var(--primary, #3b82f6)' : 'transparent',
                color: activeTab === 'fleet' ? '#ffffff' : 'var(--text-main, #475569)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Truck size={16} />
              <span>Fleet & Hub Status</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: activeTab === 'fleet' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0,0,0,0.06)',
                  color: activeTab === 'fleet' ? '#ffffff' : 'inherit',
                }}
              >
                {totalVehicles}
              </span>
            </button>
          </div>

          <Link
            to={
              activeTab === 'complaints'
                ? '/complaints'
                : activeTab === 'loading'
                ? '/loading'
                : activeTab === 'spare-parts'
                ? '/spare-parts'
                : '/vehicles'
            }
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--primary, #3b82f6)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Open Dedicated Page <ArrowRight size={14} />
          </Link>
        </div>

        {/* TAB 1: Live Complaints Feed */}
        {activeTab === 'complaints' && (
          <div>
            {/* Table Toolbar */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, maxWidth: 400 }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search
                    size={15}
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted, #94a3b8)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search complaints by title, ID, vehicle, driver..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      borderRadius: 8,
                      border: '1px solid var(--border-color, #cbd5e1)',
                      backgroundColor: 'var(--input-bg, #ffffff)',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted, #94a3b8)',
                      }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Status Filter Pills */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {(['ALL', 'NEW', 'IN_PROGRESS', 'URGENT', 'RESOLVED'] as const).map((stat) => (
                  <button
                    key={stat}
                    type="button"
                    onClick={() => {
                      setSelectedStat(stat);
                      setPage(1);
                    }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: selectedStat === stat ? '1px solid #3b82f6' : '1px solid var(--border-color, #e2e8f0)',
                      backgroundColor: selectedStat === stat ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                      color: selectedStat === stat ? '#2563eb' : 'var(--text-main, #475569)',
                    }}
                  >
                    {stat === 'ALL'
                      ? 'All Statuses'
                      : stat === 'NEW'
                      ? 'New'
                      : stat === 'IN_PROGRESS'
                      ? 'In Progress'
                      : stat === 'URGENT'
                      ? '🚨 Urgent/High'
                      : 'Resolved'}
                  </button>
                ))}
              </div>
            </div>

            {/* Complaints Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Complaint ID
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Category / Dept
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Title & Details
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Vehicle / Driver
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Priority
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                      Created
                    </th>
                    <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', textAlign: 'right' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {complaintsResource.loading && complaintsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                        <RotateCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                        <div>Loading driver complaints...</div>
                      </td>
                    </tr>
                  ) : filteredComplaints.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                        <ClipboardList size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main, #1e293b)' }}>
                          No complaints match the current filter
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>
                          {searchQuery || selectedStat !== 'ALL' || selectedCategory !== 'ALL'
                            ? 'Try clearing your filters.'
                            : 'All complaints are currently cleared.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedComplaints.map((c) => {
                      const veh = c.vehicleId ? vehicleMap.get(c.vehicleId) : null;
                      return (
                        <tr
                          key={c.id}
                          style={{
                            borderBottom: '1px solid var(--border-color, #e2e8f0)',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          <td style={{ padding: '14px 20px', fontWeight: 700, fontFamily: 'monospace', color: '#2563eb' }}>
                            <Link to={`/complaints/${c.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                              {c.complaintNo}
                            </Link>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                color: '#1d4ed8',
                              }}
                            >
                              {getCategoryLabel(c.category)}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px', maxWidth: 280 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main, #0f172a)', fontSize: 13 }}>
                              {c.title}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--text-muted, #64748b)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: 2,
                              }}
                            >
                              {c.description}
                            </div>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {veh ? describeVehicle(veh) : c.vehiclePlateNumber || 'Vehicle #—'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                              {c.driverName || 'Unassigned driver'}
                            </div>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <PriorityBadge priority={c.priority} />
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <StatusBadge status={c.status} />
                          </td>
                          <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>
                            {formatDateTime(c.createdAt)}
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            <Link
                              to={`/complaints/${c.id}`}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              Review
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredComplaints.length > pageSize && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                <Pagination
                  meta={{
                    page,
                    pageSize,
                    total: filteredComplaints.length,
                    totalPages: Math.ceil(filteredComplaints.length / pageSize) || 1,
                  }}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="complaint"
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Loading & Detention Radar */}
        {activeTab === 'loading' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                  Active Loading & Unloading Trips
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                  Live tracking of vehicle waiting times at warehouse docks and plant yards.
                </p>
              </div>
              <Link
                to="/loading"
                className="btn btn-secondary"
                style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
              >
                Open Full Loading Tracker →
              </Link>
            </div>

            {loadingList.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                <Truck size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>No active loading records logged today</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                {loadingList.slice(0, 6).map((trip) => {
                  const isDetained = (trip.waitingTimeMinutes ?? 0) >= 240;
                  return (
                    <div
                      key={trip.id}
                      style={{
                        padding: 16,
                        backgroundColor: 'var(--bg, #f8fafc)',
                        border: isDetained ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main, #0f172a)' }}>
                          {trip.driverName || 'Driver'}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            backgroundColor: isDetained ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: isDetained ? '#ef4444' : '#2563eb',
                          }}
                        >
                          {trip.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 6 }}>
                        📍 Reached: {trip.reachedAddress || 'Loading Point'} ({formatDateTime(trip.reachedAt)})
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border-color, #cbd5e1)' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                          Waiting Time: <strong>{trip.waitingTimeMinutes != null ? `${trip.waitingTimeMinutes} mins` : 'In Progress'}</strong>
                        </span>
                        {isDetained && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444' }}>
                            ⚠️ OVERDUE (&gt;4h)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Spare Parts Requests */}
        {activeTab === 'spare-parts' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                  Recent Spare Part Requisitions
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                  Driver part requests from warehouse inventory for vehicle maintenance.
                </p>
              </div>
              <Link
                to="/spare-parts"
                className="btn btn-secondary"
                style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
              >
                Manage Inventory & Requisitions →
              </Link>
            </div>

            {sparePartsList.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                <Package size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>No spare part requests logged yet</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                {sparePartsList.slice(0, 6).map((req) => (
                  <div
                    key={req.id}
                    style={{
                      padding: 16,
                      backgroundColor: 'var(--bg, #f8fafc)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main, #0f172a)' }}>
                        {req.partName || req.requestNo} ({req.quantity} pcs)
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          backgroundColor:
                            req.status === 'ISSUED'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : req.status === 'PENDING_APPROVAL'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            req.status === 'ISSUED'
                              ? '#16a34a'
                              : req.status === 'PENDING_APPROVAL'
                              ? '#d97706'
                              : '#ef4444',
                        }}
                      >
                        {req.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 6 }}>
                      🚗 Vehicle: {req.vehicle?.plateNumber || 'Vehicle'} • Driver:{' '}
                      {req.driver?.user ? fullName(req.driver.user) : 'Driver'}
                    </div>
                    {req.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-main, #475569)', marginTop: 4, fontStyle: 'italic' }}>
                        "{req.description}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Fleet Overview & Hub Sites */}
        {activeTab === 'fleet' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                  Fleet Summary & Operating Hubs
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                  Total {totalVehicles} registered vehicles across {sitesList.length} operational hub locations.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  to="/settings"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                >
                  <Settings size={13} style={{ marginRight: 4 }} /> Manage Sites
                </Link>
                <Link
                  to="/vehicles"
                  className="btn btn-primary"
                  style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                >
                  <Truck size={13} style={{ marginRight: 4 }} /> Vehicle Directory
                </Link>
              </div>
            </div>

            {/* Hub Sites Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
              {sitesList.map((site) => {
                const siteVehicles = vehicleList.filter(
                  (v) => (v.siteInchargeName && v.siteInchargeName.toLowerCase() === site.name.toLowerCase()),
                );
                return (
                  <div
                    key={site.id}
                    style={{
                      padding: 14,
                      backgroundColor: 'var(--bg, #f8fafc)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={16} color={site.isActive ? '#3b82f6' : '#94a3b8'} />
                      <strong style={{ fontSize: 14, color: 'var(--text-main, #0f172a)' }}>{site.name}</strong>
                      {site.code && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                          {site.code}
                        </span>
                      )}
                    </div>
                    {site.address && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {site.address}
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#0284c7' }}>
                      🚗 {siteVehicles.length} Vehicles Stationed
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Vehicle Sample Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Plate Number</th>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Make & Model</th>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Wheels</th>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Driver</th>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Supervising Incharge</th>
                    <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Agreement</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleList.slice(0, 5).map((v) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 700, fontFamily: 'monospace' }}>{v.plateNumber}</td>
                      <td style={{ padding: '10px 16px' }}>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>{v.wheels || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>{v.driverName || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>{v.siteInchargeName || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>
                          {v.agreementStatus || 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
