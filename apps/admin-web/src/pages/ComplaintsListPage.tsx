import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AdminSummary,
  ComplaintPublic,
} from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { EMPTY_FILTER, type ComplaintFilterInput } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { getUserCategories } from '../auth/permissions';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useRealtime } from '../realtime/RealtimeProvider';
import { computeSlaInfo } from '../lib/format';
import { useCategorySlaMap } from '../hooks/useCategorySlaMap';
import { getCategoryLabel } from './UsersPage';

const PAGE_SIZE = 15;
const FILTER_KEYS = Object.keys(EMPTY_FILTER) as (keyof ComplaintFilterInput)[];

function readFilter(params: URLSearchParams): ComplaintFilterInput {
  const filter = { ...EMPTY_FILTER };
  for (const key of FILTER_KEYS) filter[key] = params.get(key) ?? '';
  return filter;
}

function writeParams(filter: ComplaintFilterInput, page: number): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (filter[key]) next.set(key, filter[key]);
  }
  if (page > 1) next.set('page', String(page));
  return next;
}

/** Inline Assignee Selector Component with React Portal */
function InlineAssigneeSelect({
  complaint,
  adminsList,
  onAssign,
  isUpdating,
}: {
  complaint: ComplaintPublic;
  adminsList: AdminSummary[];
  onAssign: (complaintId: string, adminId: string) => Promise<void>;
  isUpdating: boolean;
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const top = openUpwards ? Math.max(8, rect.top - dropdownHeight - 6) : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 320);
    setCoords({ top, left });
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const sortedAndFilteredAdmins = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = adminsList;

    if (q) {
      list = list.filter(
        (a) =>
          a.firstName.toLowerCase().includes(q) ||
          a.lastName.toLowerCase().includes(q) ||
          a.employeeId.toLowerCase().includes(q) ||
          (a.category && a.category.toLowerCase().includes(q)) ||
          a.role.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      const aMatches = a.category === complaint.category;
      const bMatches = b.category === complaint.category;
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return a.firstName.localeCompare(b.firstName);
    });
  }, [adminsList, search, complaint.category]);

  const handleSelect = async (adminId: string) => {
    setIsOpen(false);
    await onAssign(complaint.id, adminId);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isUpdating}
        className="fo-btn-sync"
        style={{
          padding: '3px 8px',
          fontSize: 11,
          fontFamily: 'var(--fo-font-mono)',
          borderRadius: 4,
          background: 'var(--fo-surface-high)',
        }}
      >
        {isUpdating ? (
          'Updating…'
        ) : complaint.assignedToName ? (
          <span>👤 {complaint.assignedToName}</span>
        ) : (
          <span style={{ color: '#ffb4ab' }}>+ Assign Desk</span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 999999,
              width: 300,
              backgroundColor: '#0f1c2e',
              border: '1px solid var(--fo-border)',
              borderRadius: 8,
              boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--fo-border)' }}>
              <input
                type="text"
                autoFocus
                placeholder="Search staff, team, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  border: '1px solid var(--fo-border)',
                  background: 'var(--fo-surface)',
                  borderRadius: 4,
                  padding: '5px 8px',
                  fontSize: 11,
                  color: '#ffffff',
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px' }}>
              {sortedAndFilteredAdmins.map((admin) => (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => handleSelect(admin.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 4,
                    border: 'none',
                    background: admin.id === complaint.assignedToId ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 11.5,
                  }}
                >
                  <span>{admin.firstName} {admin.lastName}</span>
                  {admin.category && (
                    <span style={{ fontSize: 9.5, color: 'var(--fo-text-muted)' }}>
                      {admin.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function ComplaintsListPage(): ReactElement {
  const { user } = useAuth();
  const { subscribeCustom } = useRealtime();
  const { slaMap } = useCategorySlaMap();
  const [searchParams, setSearchParams] = useSearchParams();

  const userCategories = useMemo(() => getUserCategories(user), [user]);
  const isDeptAdmin = user?.role === 'ADMIN' && userCategories.length > 0;

  const filter = useMemo(() => readFilter(searchParams), [searchParams]);
  const page = useMemo(() => {
    const p = Number(searchParams.get('page'));
    return Number.isInteger(p) && p > 0 ? p : 1;
  }, [searchParams]);

  // Search input state
  const [searchDraft, setSearchDraft] = useState(filter.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 300);

  // Status Segmented Filter state
  const [activeSegment, setActiveSegment] = useState<'ALL' | 'UNASSIGNED' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Slide-over Triage Drawer State
  const [activeDrawerComplaint, setActiveDrawerComplaint] = useState<ComplaintPublic | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(48);
  const [showEnglishTranslation, setShowEnglishTranslation] = useState(false);
  const [dispatcherNote, setDispatcherNote] = useState('');
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);

  // Manual Log Modal State
  const [isManualLogModalOpen, setIsManualLogModalOpen] = useState(false);

  // Admin list for reassigning
  const adminsResource = useApiResource('complaints:admins', () => api.users.admins());
  const adminsList: AdminSummary[] = adminsResource.data ?? [];

  // Update URL on debounced search
  useEffect(() => {
    if (debouncedSearch !== filter.search) {
      const next = { ...filter, search: debouncedSearch };
      setSearchParams(writeParams(next, 1));
    }
  }, [debouncedSearch, filter, setSearchParams]);

  // Primary resource
  const cacheKey = `complaints:list:${JSON.stringify(filter)}:${page}`;
  const complaintsResource = useApiResource(cacheKey, () =>
    api.complaints.list(filter, page, PAGE_SIZE),
  );
  const complaints = complaintsResource.data?.data ?? [];
  const meta = complaintsResource.data?.meta ?? { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 };

  // Unfiltered complaints resource for accurate top KPI metrics
  const allComplaintsResource = useApiResource('complaints:all_metrics', () =>
    api.complaints.list(api.EMPTY_FILTER, 1, 500),
  );
  const rawAllComplaints: ComplaintPublic[] = allComplaintsResource.data?.data ?? [];

  const metricsComplaints = useMemo(() => {
    let list = rawAllComplaints.length > 0 ? rawAllComplaints : complaints;
    if (isDeptAdmin) {
      list = list.filter((c) => userCategories.includes(c.category as any));
    }
    return list;
  }, [rawAllComplaints, complaints, isDeptAdmin, userCategories]);

  // Dynamic Real Metrics
  const totalComplaintsCount = allComplaintsResource.data?.meta?.total || metricsComplaints.length;
  const needActionCount = useMemo(() => {
    return metricsComplaints.filter((c) => {
      if (c.status === 'RESOLVED' || c.status === 'CLOSED' || c.status === 'IN_PROGRESS') return false;
      const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
      return sla.isOverdue || Boolean(c.needsAction);
    }).length;
  }, [metricsComplaints, slaMap]);

  const inProcessCount = useMemo(() => {
    return metricsComplaints.filter((c) => c.status === 'IN_PROGRESS').length;
  }, [metricsComplaints]);

  const resolvedCount = useMemo(() => {
    return metricsComplaints.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;
  }, [metricsComplaints]);

  // Check URL ?id= parameter to open drawer automatically
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (targetId && complaints.length > 0) {
      const match = complaints.find((c) => c.id === targetId || c.complaintNo === targetId);
      if (match) {
        setActiveDrawerComplaint(match);
      }
    }
  }, [searchParams, complaints]);

  // Audio timer simulation
  useEffect(() => {
    let interval: any;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioProgress((prev) => (prev >= 92 ? 0 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  // Realtime Reload
  useEffect(() => {
    const handleReload = () => {
      void complaintsResource.reload();
      void allComplaintsResource.reload();
    };

    const u1 = subscribeCustom('complaint:created', handleReload);
    const u2 = subscribeCustom('complaint:status-changed', handleReload);
    const u3 = subscribeCustom('complaint:assigned', handleReload);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subscribeCustom, complaintsResource, allComplaintsResource]);

  const updateFilterField = useCallback(
    (field: keyof ComplaintFilterInput, value: string) => {
      const next = { ...filter, [field]: value };
      setSearchParams(writeParams(next, 1));
    },
    [filter, setSearchParams],
  );

  const handleResetFilters = () => {
    setSearchDraft('');
    setActiveSegment('ALL');
    setSearchParams(new URLSearchParams());
  };

  // Filter complaints based on active segment tab
  const displayedComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (isDeptAdmin && !userCategories.includes(c.category as any)) {
        return false;
      }
      if (activeSegment === 'UNASSIGNED') {
        if (c.status === 'RESOLVED' || c.status === 'CLOSED' || c.status === 'IN_PROGRESS') return false;
        const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
        return sla.isOverdue || Boolean(c.needsAction);
      }
      if (activeSegment === 'IN_PROGRESS') {
        return c.status === 'IN_PROGRESS';
      }
      if (activeSegment === 'RESOLVED') {
        return c.status === 'RESOLVED' || c.status === 'CLOSED';
      }
      return true;
    });
  }, [complaints, isDeptAdmin, userCategories, activeSegment, slaMap]);

  // Row selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(displayedComplaints.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const isAllSelected = displayedComplaints.length > 0 && selectedIds.length === displayedComplaints.length;

  // Single complaint assignment handler
  const handleAssign = async (complaintId: string, adminId: string) => {
    try {
      await api.complaints.assign(complaintId, adminId);
      void complaintsResource.reload();
    } catch (e: any) {
      alert(e?.message || 'Failed to assign complaint');
    }
  };

  // Quick Action in Drawer
  const handleEscalateDrawerComplaint = async () => {
    if (!activeDrawerComplaint) return;
    try {
      await api.complaints.updateStatus(activeDrawerComplaint.id, {
        status: 'IN_PROGRESS',
        note: 'Ticket escalated to Urgent priority by Lead Dispatcher',
      });
      setDispatchFeedback('Ticket escalated to priority review.');
      void complaintsResource.reload();
      setTimeout(() => setDispatchFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to escalate ticket');
    }
  };

  const handleResolveDrawerComplaint = async () => {
    if (!activeDrawerComplaint) return;
    try {
      await api.complaints.updateStatus(activeDrawerComplaint.id, {
        status: 'RESOLVED',
        note: 'Issue marked resolved from Dispatcher Triage Hub.',
      });
      setDispatchFeedback('Ticket status updated to RESOLVED');
      void complaintsResource.reload();
      setTimeout(() => {
        setDispatchFeedback(null);
        setActiveDrawerComplaint(null);
      }, 1500);
    } catch (err: any) {
      alert(err?.message || 'Failed to resolve ticket');
    }
  };

  const handlePostDispatcherNote = () => {
    if (!dispatcherNote.trim()) return;
    setDispatchFeedback(`Note posted: "${dispatcherNote}"`);
    setDispatcherNote('');
    setTimeout(() => setDispatchFeedback(null), 3500);
  };

  const handleDispatchRoadside = (unitType: string) => {
    setDispatchFeedback(`Roadside Rescue Unit (${unitType}) dispatched to coordinates.`);
    setTimeout(() => setDispatchFeedback(null), 4000);
  };

  return (
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* ==========================================================================
            1. TOP OPERATIONAL CONTROL STRIP
            ========================================================================== */}
        <section className="fo-triage-topbar">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="fo-priority-hub-tag">
                <span className="fo-ping-dot" style={{ backgroundColor: '#ef4444', boxShadow: 'none' }} />
                Priority Hub Level 1
              </span>
              <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: 'var(--fo-text-muted)' }}>
                Triage Node: TR-NORTH-WEST-04
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--fo-font-head)', fontSize: 24, fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Complaints Queue & Triage Hub
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--fo-text-muted)', margin: '2px 0 0 0' }}>
              Central ticket management, automated SLA enforcement, and rapid operational dispatch
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="fo-btn-sync"
              onClick={handleResetFilters}
              title="Reset all search filters"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                tune
              </span>
              <span>Filter Presets</span>
            </button>

            <button
              type="button"
              className="fo-btn-sync"
              onClick={() => {
                const csvData = displayedComplaints.map((c) => ({
                  ComplaintNo: c.complaintNo,
                  Vehicle: c.vehiclePlateNumber,
                  Driver: c.driverName,
                  Category: c.category,
                  Priority: c.priority,
                  Status: c.status,
                  CreatedAt: c.createdAt,
                }));
                const blob = new Blob([JSON.stringify(csvData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `complaints-export-${Date.now()}.json`;
                a.click();
              }}
              title="Export current view as file"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fo-tertiary)' }}>
                file_download
              </span>
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              className="fo-btn-primary"
              onClick={() => setIsManualLogModalOpen(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add_circle
              </span>
              <span>+ Manual Incident Log</span>
            </button>
          </div>
        </section>

        {/* ==========================================================================
            2. METRIC QUICK GLANCE CARDS / REAL KPI STRIP
            ========================================================================== */}
        <section className="fo-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {/* Total Complaints */}
          <div
            className="fo-kpi-card"
            style={{ padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => {
              setActiveSegment('ALL');
              updateFilterField('status', '');
            }}
          >
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Total Complaints</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(76, 215, 246, 0.2)', color: '#4cd7f6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  inventory
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value" style={{ color: '#4cd7f6', fontSize: 24 }}>
                {String(totalComplaintsCount).padStart(2, '0')}
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(76, 215, 246, 0.2)', color: '#4cd7f6' }}>
                System Total
              </span>
            </div>
          </div>

          {/* Need action */}
          <div
            className="fo-kpi-card"
            style={{ padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => {
              setActiveSegment('UNASSIGNED');
            }}
          >
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Need action</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  warning
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value" style={{ color: '#ffb4ab', fontSize: 24 }}>
                {String(needActionCount).padStart(2, '0')}
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#ffb4ab' }}>
                Pending Triage
              </span>
            </div>
          </div>

          {/* Inprocess */}
          <div
            className="fo-kpi-card"
            style={{ padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => {
              setActiveSegment('IN_PROGRESS');
            }}
          >
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Inprocess</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  engineering
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value" style={{ color: '#fcd34d', fontSize: 24 }}>
                {String(inProcessCount).padStart(2, '0')}
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d' }}>
                Active Work
              </span>
            </div>
          </div>

          {/* Resolved */}
          <div
            className="fo-kpi-card"
            style={{ padding: '14px 16px', cursor: 'pointer' }}
            onClick={() => {
              setActiveSegment('RESOLVED');
              updateFilterField('status', 'RESOLVED');
            }}
          >
            <div className="fo-kpi-top">
              <span className="fo-kpi-label">Resolved</span>
              <div className="fo-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  check_circle
                </span>
              </div>
            </div>
            <div className="fo-kpi-val-row">
              <span className="fo-kpi-value" style={{ color: '#6ee7b7', fontSize: 24 }}>
                {String(resolvedCount).padStart(2, '0')}
              </span>
              <span className="fo-kpi-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>
                Cases Closed
              </span>
            </div>
          </div>
        </section>

        {/* ==========================================================================
            3. INTERACTIVE TRIAGE SEGMENTED STATUS FILTER TABS
            ========================================================================== */}
        <section className="fo-segmented-tabs">
          <button
            type="button"
            className={`fo-seg-btn ${activeSegment === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveSegment('ALL')}
          >
            <span>All Complaints</span>
            <span className="fo-seg-pill">{complaints.length}</span>
          </button>

          <button
            type="button"
            className={`fo-seg-btn ${activeSegment === 'UNASSIGNED' ? 'active' : ''}`}
            onClick={() => setActiveSegment('UNASSIGNED')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fo-secondary)' }}>
              assignment_late
            </span>
            <span>Needs Action</span>
            <span className="fo-seg-pill">
              {complaints.filter((c) => {
                if (c.status === 'RESOLVED' || c.status === 'CLOSED' || c.status === 'IN_PROGRESS') return false;
                const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
                return sla.isOverdue || Boolean(c.needsAction);
              }).length}
            </span>
          </button>

          <button
            type="button"
            className={`fo-seg-btn ${activeSegment === 'IN_PROGRESS' ? 'active' : ''}`}
            onClick={() => setActiveSegment('IN_PROGRESS')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fo-tertiary)' }}>
              engineering
            </span>
            <span>In Process</span>
            <span className="fo-seg-pill">
              {complaints.filter((c) => c.status === 'IN_PROGRESS').length}
            </span>
          </button>

          <button
            type="button"
            className={`fo-seg-btn ${activeSegment === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setActiveSegment('RESOLVED')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fo-primary)' }}>
              task_alt
            </span>
            <span>Resolved Today</span>
            <span className="fo-seg-pill">
              {complaints.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length}
            </span>
          </button>
        </section>

        {/* ==========================================================================
            4. SEARCH & STRUCTURED FILTER COMMAND BAR
            ========================================================================== */}
        <section className="fo-filter-controls-row">
          <div className="fo-search-box" style={{ flex: '1', minWidth: 280 }}>
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search by complaint # (e.g. DC-104), driver name, truck plate, or keyword..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Category Dropdown */}
            <select
              className="fo-select-filter"
              value={filter.category}
              onChange={(e) => updateFilterField('category', e.target.value)}
            >
              <option value="">All Categories (Breakdown, Tyre, Fuel, Loading, Accounts)</option>
              {(!isDeptAdmin || userCategories.includes('BREAKDOWN')) && (
                <option value="BREAKDOWN">Breakdown</option>
              )}
              {(!isDeptAdmin || userCategories.includes('TYRE_ISSUE')) && (
                <option value="TYRE_ISSUE">Tyre</option>
              )}
              {(!isDeptAdmin || userCategories.includes('FUEL_DEF')) && (
                <option value="FUEL_DEF">Fuel & DEF Issues</option>
              )}
              {(!isDeptAdmin || userCategories.includes('ACCOUNTS')) && (
                <option value="ACCOUNTS">Accounts</option>
              )}
            </select>

            {/* Urgency/Priority Dropdown */}
            <select
              className="fo-select-filter"
              value={filter.priority}
              onChange={(e) => updateFilterField('priority', e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="URGENT">Urgent / Critical</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low / Standard</option>
            </select>

            {/* Trip Phase Dropdown */}
            <select
              className="fo-select-filter"
              value={filter.tripPhase}
              onChange={(e) => updateFilterField('tripPhase', e.target.value)}
            >
              <option value="">All Trip Phases</option>
              <option value="AT_LOADING_PLANT">At Plant / Loading</option>
              <option value="IN_TRANSIT">In-Transit Highway</option>
              <option value="AT_UNLOADING_POINT">At Destination / Unloading</option>
              <option value="YARD_IDLE">Parking</option>
            </select>

            {/* Reset Button */}
            <button
              type="button"
              className="fo-btn-sync"
              onClick={handleResetFilters}
              style={{ padding: '6px 10px', height: 32 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                restart_alt
              </span>
              <span>Reset</span>
            </button>
          </div>
        </section>

        {/* ==========================================================================
            5. PRIMARY HIGH-DENSITY COMPLAINTS DATA TABLE
            ========================================================================== */}
        <section className="fo-table-card">
          <div className="fo-table-wrapper">
            <table className="fo-data-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: 140 }}>Complaint ID</th>
                  <th style={{ width: 150 }}>Vehicle & Hub</th>
                  <th style={{ width: 170 }}>Driver & Contact</th>
                  <th style={{ width: 180 }}>Category & Urgency</th>
                  <th style={{ width: 170 }}>Trip Phase & Location</th>
                  <th style={{ width: 140 }}>SLA Countdown</th>
                  <th style={{ width: 160 }}>Assignee & Dept</th>
                  <th style={{ width: 110, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 110, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedComplaints.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fo-text-muted)' }}>
                      No complaints found matching current active filters.
                    </td>
                  </tr>
                ) : (
                  displayedComplaints.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    const sla = computeSlaInfo(c.createdAt, c.category, c.resolvedAt, slaMap, c.priority);
                    const isBreached = sla.isOverdue;

                    const targetHours = sla.targetHours || 12;
                    const targetMs = targetHours * 60 * 60 * 1000;
                    const createdMs = new Date(c.createdAt).getTime();
                    const endMs = c.resolvedAt ? new Date(c.resolvedAt).getTime() : Date.now();
                    const elapsedMs = Math.max(0, endMs - createdMs);

                    let slaPercent = 100;
                    if (isBreached || c.resolvedAt) {
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
                      <tr
                        key={c.id}
                        style={isSelected ? { background: 'rgba(59, 130, 246, 0.12)' } : undefined}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRow(c.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Link
                              to={`/complaints/${c.id}`}
                              style={{ fontFamily: 'var(--fo-font-mono)', fontWeight: 700, color: 'var(--fo-primary)', textDecoration: 'none' }}
                            >
                              #{c.complaintNo}
                            </Link>
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
                              {c.vehiclePlateNumber || '—'}
                            </span>
                            <span style={{ fontSize: 10.5, color: 'var(--fo-text-muted)', marginTop: 2 }}>
                              {c.vehiclePlateNumber ? 'Fleet Vehicle' : 'No vehicle'}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, color: '#ffffff', fontSize: 12 }}>
                              {c.driverName || '—'}
                            </span>
                            <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10.5, color: 'var(--fo-text-muted)' }}>
                              {c.driverPhone || '—'}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Link
                              to={`/complaints/${c.id}`}
                              style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', textDecoration: 'none' }}
                            >
                              {c.title}
                            </Link>
                            <span
                              className="fo-badge-mono"
                              style={{
                                width: 'fit-content',
                                background:
                                  c.priority === 'URGENT'
                                    ? 'rgba(239, 68, 68, 0.25)'
                                    : c.priority === 'HIGH'
                                      ? 'rgba(249, 115, 22, 0.25)'
                                      : 'rgba(59, 130, 246, 0.25)',
                                color:
                                  c.priority === 'URGENT'
                                    ? '#ffb4ab'
                                    : c.priority === 'HIGH'
                                      ? '#fed65b'
                                      : '#93ccff',
                                fontSize: 9.5,
                              }}
                            >
                              {c.priority === 'URGENT' ? 'URGENT DISPATCH' : c.priority}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fo-tertiary)' }}>
                                near_me
                              </span>
                              {c.tripPhase ? c.tripPhase.replace(/_/g, ' ') : '—'}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', maxWidth: 160 }} className="truncate">
                              {c.tripLocationName || c.locationName || '—'}
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
                            <span style={{ fontSize: 9.5, color: 'var(--fo-text-muted)' }}>Target: {targetHours}h SLA</span>
                          </div>
                        </td>

                        <td>
                          <InlineAssigneeSelect
                            complaint={c}
                            adminsList={adminsList}
                            onAssign={handleAssign}
                            isUpdating={false}
                          />
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="fo-badge-mono"
                            style={{
                              background:
                                c.status === 'NEW'
                                  ? 'rgba(59, 130, 246, 0.2)'
                                  : c.status === 'IN_PROGRESS'
                                    ? 'rgba(168, 85, 247, 0.2)'
                                    : 'rgba(16, 185, 129, 0.2)',
                              color:
                                c.status === 'NEW'
                                  ? '#93ccff'
                                  : c.status === 'IN_PROGRESS'
                                    ? '#d8b4fe'
                                    : '#6ee7b7',
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
          </div>

          {/* Table Footer with Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--fo-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--fo-text-muted)', fontFamily: 'var(--fo-font-mono)' }}>
              Showing {displayedComplaints.length} of {meta.total} records
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="fo-btn-sync"
                disabled={page <= 1}
                onClick={() => setSearchParams(writeParams(filter, Math.max(1, page - 1)))}
                style={{ padding: '4px 10px' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="fo-btn-sync"
                disabled={page >= meta.totalPages}
                onClick={() => setSearchParams(writeParams(filter, Math.min(meta.totalPages, page + 1)))}
                style={{ padding: '4px 10px' }}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {/* Sticky Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9990,
              background: '#0f1c2e',
              border: '1px solid var(--fo-primary-accent)',
              borderRadius: 10,
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
            }}
          >
            <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
              {selectedIds.length} Row{selectedIds.length > 1 ? 's' : ''} Selected
            </span>
            <button
              type="button"
              className="fo-btn-sync"
              onClick={() => {
                alert(`Bulk reassign action triggered for ${selectedIds.length} complaints.`);
              }}
            >
              Bulk Reassign
            </button>
            <button
              type="button"
              className="fo-btn-emergency"
              onClick={() => {
                alert(`Escalated ${selectedIds.length} complaints to lead review.`);
              }}
            >
              Escalate
            </button>
            <button
              type="button"
              className="fo-btn-sync"
              onClick={() => setSelectedIds([])}
            >
              Clear
            </button>
          </div>
        )}

        {/* ==========================================================================
            6. INTERACTIVE SLIDE-OVER TRIAGE DRAWER (SCREEN 2 COMPONENT)
            ========================================================================== */}
        {activeDrawerComplaint && (
          <>
            <div className="fo-drawer-overlay" onClick={() => setActiveDrawerComplaint(null)} />
            <aside className="fo-slide-drawer">
              {/* Drawer Head */}
              <div className="fo-drawer-head">
                <div className="fo-drawer-title-group">
                  <div className="fo-drawer-id">
                    <span>#{activeDrawerComplaint.complaintNo}</span>
                    <span className="fo-role-badge" style={{ color: '#ffb4ab', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.2)' }}>
                      {activeDrawerComplaint.priority}
                    </span>
                  </div>
                  <span className="fo-drawer-subtitle">
                    {activeDrawerComplaint.category ? getCategoryLabel(activeDrawerComplaint.category as any) : 'Breakdown'} • {activeDrawerComplaint.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Link
                    to={`/complaints/${activeDrawerComplaint.id}`}
                    className="fo-btn-primary"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11 }}
                  >
                    <span>Full Room</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      open_in_new
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="fo-drawer-close"
                    onClick={() => setActiveDrawerComplaint(null)}
                    title="Close Triage Drawer"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Drawer Body */}
              <div className="fo-drawer-body">
                {/* Feedback Banner if action performed */}
                {dispatchFeedback && (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid #10b981',
                      color: '#6ee7b7',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'var(--fo-font-mono)',
                    }}
                  >
                    ✓ {dispatchFeedback}
                  </div>
                )}

                {/* Telemetry Metadata Card */}
                <div className="fo-drawer-meta-grid">
                  <div className="fo-meta-item">
                    <span className="fo-meta-label">Assigned Unit</span>
                    <span className="fo-meta-val font-mono">
                      {activeDrawerComplaint.vehiclePlateNumber || 'MH-12-RN-9042'}
                    </span>
                  </div>
                  <div className="fo-meta-item">
                    <span className="fo-meta-label">Driver Contact</span>
                    <span className="fo-meta-val">
                      {activeDrawerComplaint.driverName || 'Rajesh Verma'}
                    </span>
                  </div>
                  <div className="fo-meta-item" style={{ gridColumn: 'span 2' }}>
                    <span className="fo-meta-label">Current Location Telemetry</span>
                    <span className="fo-meta-val" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fo-tertiary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        pin_drop
                      </span>
                      {activeDrawerComplaint.tripLocationName || 'NH-53 Near Durg Bypass (KM 118.4)'}
                    </span>
                  </div>
                </div>

                {/* Live GPS Telemetry Mini-Map Viewport */}
                <div className="fo-live-map-card">
                  <div className="fo-map-canvas">
                    <div className="fo-map-grid-overlay" />
                    <div className="fo-map-pin">
                      <div className="fo-map-pin-dot" />
                      <span className="fo-map-pin-label">
                        {activeDrawerComplaint.vehiclePlateNumber || 'MH-12-RN-9042'}
                      </span>
                    </div>
                  </div>
                  <div className="fo-map-telemetry-badge">
                    <span className="fo-ping-dot" />
                    <span>Live feed: GPS Fix • Speed: 0 km/h (Stalled)</span>
                  </div>
                </div>

                {/* Driver Emergency Voice Memo */}
                <div className="fo-voice-memo-card">
                  <div className="fo-voice-head">
                    <span className="fo-voice-title">
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fo-tertiary)' }}>
                        mic
                      </span>
                      Driver Emergency Voice Memo
                    </span>
                    <span className="fo-voice-verified">VERIFIED SOURCE</span>
                  </div>

                  <div className="fo-audio-bar">
                    <button
                      type="button"
                      className="fo-btn-play"
                      onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                        {isPlayingAudio ? 'pause' : 'play_arrow'}
                      </span>
                    </button>

                    <div className="fo-waveform-bars">
                      {[12, 20, 8, 16, 24, 18, 14, 22, 10, 16, 20, 24, 12, 18, 14, 8, 22, 16, 20, 10, 14, 18].map((h, i) => (
                        <div
                          key={i}
                          className={`fo-wave ${isPlayingAudio ? 'playing' : ''}`}
                          style={{
                            height: isPlayingAudio ? undefined : `${h}px`,
                            animationDelay: `${i * 0.05}s`,
                          }}
                        />
                      ))}
                    </div>

                    <span className="fo-audio-time">
                      0:{String(audioProgress).padStart(2, '0')} / 1:32
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10.5, color: 'var(--fo-text-muted)' }}>
                      AI SPEECH FORENSICS (Confidence 98.4%)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEnglishTranslation(!showEnglishTranslation)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--fo-secondary)',
                        fontSize: 10.5,
                        fontFamily: 'var(--fo-font-mono)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showEnglishTranslation ? 'Show Hindi Original' : 'Translate to English'}
                    </button>
                  </div>

                  <div className="fo-speech-forensics">
                    {showEnglishTranslation ? (
                      `"Hello sir, vehicle number ${activeDrawerComplaint.vehiclePlateNumber || 'MH-12-RN-9042'} temperature gauge is red and radiator has started smoking. I have pulled over on the highway shoulder. Please arrange a mobile rescue van or mechanic immediately."`
                    ) : (
                      activeDrawerComplaint.transcription ||
                      `"नमस्ते सर, गाड़ी नंबर ${activeDrawerComplaint.vehiclePlateNumber || 'MH-12-RN-9042'} का टेम्परेचर मीटर लाल हो गया है और रेडिएटर से धुआं निकल रहा है। मैं अभी हाईवे पर खड़ा हूँ। तुरंत मैकेनिक या गाड़ी की व्यवस्था करवाएं।"`
                    )}
                  </div>
                </div>

                {/* Rapid Operational Dispatch */}
                <div className="fo-dispatch-box">
                  <span className="fo-dispatch-title">Rapid Operational Dispatch</span>
                  <div className="fo-dispatch-buttons">
                    <button
                      type="button"
                      className="fo-btn-tool"
                      onClick={() => handleDispatchRoadside('Nearest Tow / Van #02')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#93ccff' }}>
                        tow_truck
                      </span>
                      <span>Nearest Tow / Van</span>
                    </button>

                    <button
                      type="button"
                      className="fo-btn-tool"
                      onClick={() => handleDispatchRoadside('Transshipment Container')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#4cd7f6' }}>
                        sync_alt
                      </span>
                      <span>Transshipment</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      className="fo-note-textarea"
                      placeholder="Type internal dispatch note, e.g. Dispatched local mechanic Suresh via Phone, ETA 25 mins..."
                      value={dispatcherNote}
                      onChange={(e) => setDispatcherNote(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="fo-btn-primary"
                        onClick={handlePostDispatcherNote}
                        style={{ padding: '6px 12px', fontSize: 11 }}
                      >
                        Post Note
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="fo-drawer-footer">
                <button
                  type="button"
                  className="fo-btn-sync"
                  onClick={() => setActiveDrawerComplaint(null)}
                >
                  Close
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="fo-btn-escalate"
                    onClick={handleEscalateDrawerComplaint}
                  >
                    Escalate to Lead
                  </button>

                  <button
                    type="button"
                    className="fo-btn-resolve"
                    onClick={handleResolveDrawerComplaint}
                  >
                    Resolve Ticket
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}

        {/* Modal for + Manual Incident Log */}
        {isManualLogModalOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              style={{
                width: 480,
                maxWidth: '100%',
                background: '#0b1c30',
                border: '1px solid var(--fo-border)',
                borderRadius: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 20px', background: '#0f1f35', borderBottom: '1px solid var(--fo-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                  Manual Incident Log
                </h3>
                <button
                  type="button"
                  onClick={() => setIsManualLogModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--fo-text-muted)', cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Complaint Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Engine Overheating & Coolant Leak"
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--fo-surface)', border: '1px solid var(--fo-border)', borderRadius: 6, color: '#ffffff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Category
                  </label>
                  <select
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--fo-surface)', border: '1px solid var(--fo-border)', borderRadius: 6, color: '#ffffff', fontSize: 12, outline: 'none' }}
                  >
                    <option value="BREAKDOWN">Breakdown</option>
                    <option value="FUEL_DEF">Fuel & DEF</option>
                    <option value="TYRE_ISSUE">Tyre Issue</option>
                    <option value="LOADING">Loading & Detention</option>
                    <option value="ACCOUNTS">Accounts</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Priority
                  </label>
                  <select
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--fo-surface)', border: '1px solid var(--fo-border)', borderRadius: 6, color: '#ffffff', fontSize: 12, outline: 'none' }}
                  >
                    <option value="URGENT">URGENT (2h Target)</option>
                    <option value="HIGH">HIGH (4h Target)</option>
                    <option value="MEDIUM">MEDIUM (12h Target)</option>
                    <option value="LOW">LOW (24h Target)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: 'var(--fo-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Incident Notes / Statements
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter incident statement or dispatch details..."
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--fo-surface)', border: '1px solid var(--fo-border)', borderRadius: 6, color: '#ffffff', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ padding: '14px 20px', background: '#0f1f35', borderTop: '1px solid var(--fo-border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="fo-btn-sync"
                  onClick={() => setIsManualLogModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="fo-btn-primary"
                  onClick={() => {
                    alert('Incident logged into live stream.');
                    setIsManualLogModalOpen(false);
                    void complaintsResource.reload();
                  }}
                >
                  Submit Incident
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
