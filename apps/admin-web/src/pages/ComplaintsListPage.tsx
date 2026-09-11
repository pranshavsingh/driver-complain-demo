import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COMPLAINT_STATUSES,
  PRIORITIES,
  COMPLAINT_CATEGORIES,
  TRIP_PHASES,
  type AdminSummary,
  type ComplaintPublic,
  type ComplaintCategory,
  type TripPhase,
} from '@driver-complaint/shared-types';
import {
  ClipboardList,
  RotateCw,
  Download,
  Search,
  Zap,
  Truck,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Phone,
  X,
  ArrowRight,
  Clock,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { EMPTY_FILTER, type ComplaintFilterInput } from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { PriorityBadge, StatusBadge, SlaBadge } from '../components/Badges';
import { Pagination } from '../components/Pagination';
import { formatDateTime, formatEnum, computeSlaInfo } from '../lib/format';

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

/** Category color badges mapping */
const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  FUEL_DEF: { bg: 'rgba(2, 132, 199, 0.12)', color: '#0284c7', border: 'rgba(2, 132, 199, 0.35)' },
  BREAKDOWN: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.35)' },
  TYRE_ISSUE: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', border: 'rgba(249, 115, 22, 0.35)' },
  LOADING: { bg: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4', border: 'rgba(6, 182, 212, 0.35)' },
  UNLOADING: { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.35)' },
  ACCOUNTS: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16, 185, 129, 0.35)' },
  VEHICLE_MAINTENANCE: { bg: 'rgba(234, 179, 8, 0.12)', color: '#eab308', border: 'rgba(234, 179, 8, 0.35)' },
  MEDICAL_EMERGENCY: { bg: 'rgba(225, 29, 72, 0.16)', color: '#e11d48', border: 'rgba(225, 29, 72, 0.4)' },
  SUPPORT: { bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--muted)', border: 'var(--border)' },
};

/** Trip Phase visual config */
const TRIP_PHASE_CONFIG: Record<
  TripPhase,
  { label: string; bg: string; color: string; border: string; icon: string }
> = {
  AT_LOADING_PLANT: {
    label: 'At Loading Plant',
    bg: 'rgba(6, 182, 212, 0.12)',
    color: '#06b6d4',
    border: 'rgba(6, 182, 212, 0.35)',
    icon: '🏭',
  },
  IN_TRANSIT: {
    label: 'In Transit / Highway',
    bg: 'rgba(249, 115, 22, 0.12)',
    color: '#f97316',
    border: 'rgba(249, 115, 22, 0.35)',
    icon: '🚚',
  },
  AT_UNLOADING_POINT: {
    label: 'At Unloading Point',
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#a855f7',
    border: 'rgba(168, 85, 247, 0.35)',
    icon: '📦',
  },
  YARD_IDLE: {
    label: 'Parking',
    bg: 'rgba(148, 163, 184, 0.1)',
    color: 'var(--muted)',
    border: 'var(--border)',
    icon: '🅿️',
  },
};

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

    function handleScrollOrResize() {
      if (isOpen) {
        updatePosition();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
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

  const isAssigned = Boolean(complaint.assignedToId);
  const isPendingApproval = complaint.assignmentStatus === 'PENDING';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isUpdating}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 8,
          background: isPendingApproval
            ? 'rgba(234, 179, 8, 0.12)'
            : isAssigned
              ? 'var(--surface)'
              : 'rgba(239, 68, 68, 0.12)',
          border: isPendingApproval
            ? '1px solid var(--warning-border)'
            : isAssigned
              ? '1px solid var(--border)'
              : '1px solid rgba(239, 68, 68, 0.35)',
          color: isPendingApproval
            ? 'var(--warning-text)'
            : isAssigned
              ? 'var(--text)'
              : 'var(--danger-text)',
          cursor: isUpdating ? 'wait' : 'pointer',
          fontSize: 12,
          fontWeight: 700,
          outline: 'none',
          transition: 'all 0.15s ease',
          maxWidth: 180,
        }}
        title="Click to assign maintenance staff / team"
      >
        {isUpdating ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted)', fontSize: 11 }}>
            <RotateCw size={11} className="spin" /> Updating…
          </span>
        ) : isPendingApproval ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⏳ Pending Approval
          </span>
        ) : isAssigned ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            👤 {complaint.assignedToName || 'Assigned'}
          </span>
        ) : (
          <span style={{ color: 'var(--danger-text)' }}>+ Assign</span>
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
              width: 320,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.6), 0 8px 16px -4px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.12s ease-out',
            }}
          >
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '5px 10px',
                }}
              >
                <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search staff, team, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--text)',
                    width: '100%',
                  }}
                />
              </div>
            </div>
            <div style={{ maxHeight: 270, overflowY: 'auto', padding: '6px' }}>
              {sortedAndFilteredAdmins.length === 0 ? (
                <div style={{ padding: '16px 8px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  No team members found matching "{search}"
                </div>
              ) : (
                sortedAndFilteredAdmins.map((admin) => {
                  const isSelected = admin.id === complaint.assignedToId;
                  const isCategoryMatch = admin.category === complaint.category;
                  return (
                    <button
                      key={admin.id}
                      type="button"
                      onClick={() => handleSelect(admin.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: isSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginBottom: 2,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--bg)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {admin.firstName} {admin.lastName}
                          {isCategoryMatch && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 4,
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                fontWeight: 700,
                              }}
                            >
                              Recommended
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {admin.employeeId} · {formatEnum(admin.role)}
                          {admin.category ? ` · ${formatEnum(admin.category)}` : ''}
                        </div>
                      </div>
                      {isSelected && <span style={{ color: 'var(--accent)', fontWeight: 800 }}>✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ComplaintsListPage(): ReactElement {
  const [params, setParams] = useSearchParams();

  const filter = useMemo(() => readFilter(params), [params]);
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [searchDraft, setSearchDraft] = useState(filter.search);
  const debouncedSearch = useDebouncedValue(searchDraft);
  const lastPushedSearch = useRef(filter.search);

  const [triageTab, setTriageTab] = useState<'ALL' | 'NEEDS_ACTION' | 'ACTIVE_TRIPS' | 'IN_PROGRESS' | 'RESOLVED'>(
    params.get('needsAction') === 'true'
      ? 'NEEDS_ACTION'
      : (params.get('tab') as 'ALL' | 'NEEDS_ACTION' | 'ACTIVE_TRIPS' | 'IN_PROGRESS' | 'RESOLVED') || 'ALL',
  );
  const [updatingComplaintId, setUpdatingComplaintId] = useState<string | null>(null);

  const setFilter = useCallback(
    (patch: Partial<ComplaintFilterInput>, options?: { replace?: boolean }): void => {
      setParams((prev) => writeParams({ ...readFilter(prev), ...patch }, 1), {
        replace: options?.replace ?? false,
      });
    },
    [setParams],
  );

  useEffect(() => {
    if (debouncedSearch === lastPushedSearch.current) return;
    lastPushedSearch.current = debouncedSearch;
    setFilter({ search: debouncedSearch }, { replace: true });
  }, [debouncedSearch, setFilter]);

  const goToPage = (nextPage: number): void => {
    setParams(writeParams(filter, nextPage));
  };

  const clearFilters = (): void => {
    lastPushedSearch.current = '';
    setSearchDraft('');
    setTriageTab('ALL');
    setParams(new URLSearchParams());
  };

  const adminsRes = useApiResource<AdminSummary[]>('admins', () => api.users.admins());
  const adminsList: AdminSummary[] = adminsRes.data ?? [];

  const key = params.toString();
  const listRes = useApiResource(`complaints?${key}`, () =>
    api.complaints.list(filter, page, PAGE_SIZE),
  );

  const { subscribe } = useRealtime();
  const [pending, setPending] = useState(0);
  useEffect(
    () => subscribe(() => setPending((n) => n + 1)),
    [subscribe],
  );
  useEffect(() => {
    setPending(0);
  }, [key]);

  const refresh = (): void => {
    setPending(0);
    listRes.reload();
  };

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const handleExport = (): void => {
    setExportError(null);
    setExporting(true);
    api.complaints.exportXlsx(filter).then(
      () => setExporting(false),
      (err: unknown) => {
        setExportError(err);
        setExporting(false);
      },
    );
  };

  const handleInlineAssign = async (complaintId: string, targetAdminId: string) => {
    try {
      setUpdatingComplaintId(complaintId);
      await api.complaints.assign(complaintId, targetAdminId);
      void listRes.reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingComplaintId(null);
    }
  };

  const allRows: ComplaintPublic[] = listRes.data?.data ?? [];

  // Triage filtered rows
  const displayedRows = useMemo(() => {
    if (triageTab === 'NEEDS_ACTION') {
      return allRows.filter((c) => c.status === 'NEW' && (!c.assignedToId || (c.updatesCount ?? 0) <= 1));
    }
    if (triageTab === 'ACTIVE_TRIPS') {
      return allRows.filter((c) => c.tripPhase && c.tripPhase !== 'YARD_IDLE');
    }
    if (triageTab === 'IN_PROGRESS') {
      return allRows.filter((c) => c.status === 'IN_PROGRESS');
    }
    if (triageTab === 'RESOLVED') {
      return allRows.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED');
    }
    return allRows;
  }, [allRows, triageTab]);

  const totalRows = listRes.data?.meta.total ?? allRows.length;
  const needsActionCount = allRows.filter(
    (c) => c.status === 'NEW' && (!c.assignedToId || (c.updatesCount ?? 0) <= 1),
  ).length;
  const inTripIssuesCount = allRows.filter((c) => c.tripPhase && c.tripPhase !== 'YARD_IDLE').length;
  const inProgressCount = allRows.filter((c) => c.status === 'IN_PROGRESS').length;
  const resolvedCount = allRows.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;

  const renderTripPhaseBadge = (c: ComplaintPublic) => {
    const phaseKey: TripPhase = c.tripPhase || 'YARD_IDLE';
    const cfg = TRIP_PHASE_CONFIG[phaseKey] || TRIP_PHASE_CONFIG.YARD_IDLE;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        {c.vehiclePlateNumber ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
              {c.vehiclePlateNumber}
            </span>
            {c.vehicleModel && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {c.vehicleModel}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vehicle Unlinked</span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 6,
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <span>{cfg.icon}</span> {cfg.label}
          </span>
        </div>

        {c.tripLocationName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            <MapPin size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.tripLocationName}
            </span>
          </div>
        )}
      </div>
    );
  };

  const getCategoryBadge = (cat?: ComplaintCategory | string | null) => {
    const key = cat || 'SUPPORT';
    const fallback = { bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--muted)', border: 'var(--border)' };
    const cfg = (key && CATEGORY_COLORS[key]) || CATEGORY_COLORS.SUPPORT || fallback;
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: cfg.bg,
          color: cfg.color,
          border: `1px solid ${cfg.border}`,
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {formatEnum(key)}
      </span>
    );
  };

  return (
    <div className="page-container">
      {/* Header Bar */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={26} color="var(--accent)" /> Complaints Queue & Triage
          </h1>
          <p className="page-subtitle">
            Monitor real-time vehicle issues, track live loading/transit phases, SLA targets, and assign maintenance teams.
          </p>
        </div>
        <div className="header-action-group">
          {pending > 0 && (
            <button
              type="button"
              className="btn-accent"
              onClick={refresh}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'var(--accent)',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Zap size={14} /> {pending} New Update{pending > 1 ? 's' : ''} (Refresh)
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={refresh} title="Reload complaints">
            <RotateCw size={15} style={{ marginRight: 6 }} /> Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExport}
            disabled={exporting}
            title="Export Excel report"
          >
            <Download size={15} style={{ marginRight: 6 }} />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      <ErrorBanner error={exportError} />
      <ErrorBanner error={listRes.error} />

      {/* Triage KPI Segmented Cards (Single row of 5) */}
      <div className="stat-cards-grid is-five" style={{ marginBottom: 20 }}>
        <div
          className={`stat-card ${triageTab === 'ALL' ? 'stat-card-active' : ''}`}
          onClick={() => setTriageTab('ALL')}
          style={{
            cursor: 'pointer',
            border: triageTab === 'ALL' ? '2px solid var(--accent)' : '1px solid var(--border)',
            transition: 'all 0.15s ease',
          }}
        >
          <div className="stat-card-title">Total Records</div>
          <div className="stat-card-value">{totalRows}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>All logged complaints</div>
        </div>

        <div
          className={`stat-card ${triageTab === 'NEEDS_ACTION' ? 'stat-card-active' : ''}`}
          onClick={() => setTriageTab('NEEDS_ACTION')}
          style={{
            cursor: 'pointer',
            border: triageTab === 'NEEDS_ACTION' ? '2px solid #ef4444' : '1px solid var(--border)',
            background: triageTab === 'NEEDS_ACTION' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface)',
            transition: 'all 0.15s ease',
          }}
        >
          <div className="stat-card-title" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} color="#ef4444" /> Needs Action
          </div>
          <div className="stat-card-value" style={{ color: '#ef4444' }}>{needsActionCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Untouched / Unassigned</div>
        </div>

        <div
          className={`stat-card ${triageTab === 'ACTIVE_TRIPS' ? 'stat-card-active' : ''}`}
          onClick={() => setTriageTab('ACTIVE_TRIPS')}
          style={{
            cursor: 'pointer',
            border: triageTab === 'ACTIVE_TRIPS' ? '2px solid #f97316' : '1px solid var(--border)',
            background: triageTab === 'ACTIVE_TRIPS' ? 'rgba(249, 115, 22, 0.08)' : 'var(--surface)',
            transition: 'all 0.15s ease',
          }}
        >
          <div className="stat-card-title" style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Truck size={15} color="#f97316" /> In-Trip Issues
          </div>
          <div className="stat-card-value" style={{ color: '#f97316' }}>{inTripIssuesCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Transit / Highway / Plant</div>
        </div>

        <div
          className={`stat-card ${triageTab === 'IN_PROGRESS' ? 'stat-card-active' : ''}`}
          onClick={() => setTriageTab('IN_PROGRESS')}
          style={{
            cursor: 'pointer',
            border: triageTab === 'IN_PROGRESS' ? '2px solid #0284c7' : '1px solid var(--border)',
            transition: 'all 0.15s ease',
          }}
        >
          <div className="stat-card-title" style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} color="#0284c7" /> In Progress
          </div>
          <div className="stat-card-value" style={{ color: '#0284c7' }}>{inProgressCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Under investigation</div>
        </div>

        <div
          className={`stat-card ${triageTab === 'RESOLVED' ? 'stat-card-active' : ''}`}
          onClick={() => setTriageTab('RESOLVED')}
          style={{
            cursor: 'pointer',
            border: triageTab === 'RESOLVED' ? '2px solid #10b981' : '1px solid var(--border)',
            transition: 'all 0.15s ease',
          }}
        >
          <div className="stat-card-title" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={15} color="#10b981" /> Resolved
          </div>
          <div className="stat-card-value" style={{ color: '#10b981' }}>{resolvedCount}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Completed & closed</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="table-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {/* Search Box */}
          <div style={{ gridColumn: 'span 2', minWidth: 240 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '7px 12px',
              }}
            >
              <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search complaint #, title, driver, plate..."
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                style={{
                  border: 'none',
                  background: 'none',
                  outline: 'none',
                  fontSize: 13,
                  color: 'var(--text)',
                  width: '100%',
                }}
              />
              {searchDraft && (
                <button
                  type="button"
                  onClick={() => setSearchDraft('')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <select
              className="form-select"
              value={filter.category}
              onChange={(e) => setFilter({ category: e.target.value })}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', height: 38 }}
            >
              <option value="">All Categories</option>
              {COMPLAINT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {formatEnum(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              className="form-select"
              value={filter.status}
              onChange={(e) => setFilter({ status: e.target.value })}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', height: 38 }}
            >
              <option value="">All Statuses</option>
              {COMPLAINT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {formatEnum(st)}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              className="form-select"
              value={filter.priority}
              onChange={(e) => setFilter({ priority: e.target.value })}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', height: 38 }}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>
                  {formatEnum(pr)}
                </option>
              ))}
            </select>
          </div>

          {/* Trip Phase Filter */}
          <div>
            <select
              className="form-select"
              value={filter.tripPhase}
              onChange={(e) => setFilter({ tripPhase: e.target.value })}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', height: 38 }}
            >
              <option value="">All Trip Phases</option>
              {TRIP_PHASES.map((ph) => {
                const cfg = TRIP_PHASE_CONFIG[ph] || TRIP_PHASE_CONFIG.YARD_IDLE;
                return (
                  <option key={ph} value={ph}>
                    {cfg.icon} {cfg.label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Clear Filters Button */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={clearFilters}
              style={{ width: '100%', height: 38, fontSize: 13, padding: '0 12px' }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Complaints Table Card */}
      <div className="table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Complaint & Priority</th>
                <th style={{ minWidth: 200 }}>Vehicle & Phase</th>
                <th style={{ minWidth: 180 }}>Driver</th>
                <th style={{ minWidth: 140 }}>Category</th>
                <th style={{ minWidth: 150 }}>Status & SLA</th>
                <th style={{ minWidth: 170 }}>Assigned To</th>
                <th style={{ minWidth: 130, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listRes.loading && displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
                    Loading complaints queue…
                  </td>
                </tr>
              ) : displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      No complaints found
                    </div>
                    <div style={{ fontSize: 12 }}>Try adjusting your search or active filters.</div>
                  </td>
                </tr>
              ) : (
                displayedRows.map((c) => {
                  const sla = computeSlaInfo(c.createdAt, c.priority, c.resolvedAt);
                  const isUntouched = c.status === 'NEW' && (!c.assignedToId || (c.updatesCount ?? 0) <= 1);

                  return (
                    <tr key={c.id}>
                      {/* Complaint & Priority Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>
                              {c.complaintNo}
                            </span>
                            <PriorityBadge priority={c.priority} />
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--text)',
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={c.title}
                          >
                            {c.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                            <span>{sla.elapsedText}</span>
                            <span>·</span>
                            <span>{formatDateTime(c.createdAt)}</span>
                          </div>
                          {isUntouched && (
                            <div style={{ marginTop: 2 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '2px 6px',
                                  borderRadius: 6,
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  letterSpacing: '0.02em',
                                }}
                                title="Untouched: Newly filed complaint awaiting team assignment and first response."
                              >
                                ⚠️ Needs Action
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Vehicle & Trip Phase Column */}
                      <td>{renderTripPhaseBadge(c)}</td>

                      {/* Driver Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                            {c.driverName}
                          </div>
                          {c.driverEmployeeId && (
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: <strong>{c.driverEmployeeId}</strong>
                            </div>
                          )}
                          {c.driverPhone ? (
                            <a
                              href={`tel:${c.driverPhone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                marginTop: 2,
                              }}
                              title={`Call driver ${c.driverName} (${c.driverPhone})`}
                            >
                              <Phone size={11} /> {c.driverPhone}
                            </a>
                          ) : null}
                        </div>
                      </td>

                      {/* Category Column */}
                      <td>{getCategoryBadge(c.category)}</td>

                      {/* Status & SLA Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <StatusBadge status={c.status} />
                          <SlaBadge sla={sla} />
                        </div>
                      </td>

                      {/* Assigned To Column with Inline Selection */}
                      <td>
                        <InlineAssigneeSelect
                          complaint={c}
                          adminsList={adminsList}
                          onAssign={handleInlineAssign}
                          isUpdating={updatingComplaintId === c.id}
                        />
                      </td>

                      {/* Actions Column */}
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          to={`/complaints/${c.id}`}
                          className="btn-secondary btn-sm"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 8,
                            textDecoration: 'none',
                          }}
                        >
                          View Details <ArrowRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {listRes.data && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <Pagination meta={listRes.data.meta} onPageChange={goToPage} />
          </div>
        )}
      </div>
    </div>
  );
}
