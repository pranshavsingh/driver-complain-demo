import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COMPLAINT_STATUSES,
  PRIORITIES,
  type AdminSummary,
  type DriverListItem,
  type VehiclePublic,
} from '@driver-complaint/shared-types';
import { ClipboardList, RotateCw, Download, Search, Zap } from '../components/Icons';
import * as api from '../api/endpoints';
import { EMPTY_FILTER, type ComplaintFilterInput } from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useRealtime } from '../realtime/RealtimeProvider';
import { ErrorBanner } from '../components/ErrorBanner';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { Pagination } from '../components/Pagination';
import { formatDateTime, formatEnum, fullName } from '../lib/format';

const PAGE_SIZE = 20;
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

export function ComplaintsListPage(): ReactElement {
  const [params, setParams] = useSearchParams();

  const filter = useMemo(() => readFilter(params), [params]);
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [searchDraft, setSearchDraft] = useState(filter.search);
  const debouncedSearch = useDebouncedValue(searchDraft);
  const lastPushedSearch = useRef(filter.search);

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
    setParams(new URLSearchParams());
  };

  const driversRes = useApiResource<DriverListItem[]>('drivers', () => api.drivers.list());
  const vehiclesRes = useApiResource<VehiclePublic[]>('vehicles', () => api.vehicles.list());
  const adminsRes = useApiResource<AdminSummary[]>('admins', () => api.users.admins());

  const key = params.toString();
  const listRes = useApiResource(`complaints?${key}`, () =>
    api.complaints.list(filter, page, PAGE_SIZE),
  );

  const driverNames = useMemo(
    () => new Map((driversRes.data ?? []).map((d) => [d.id, `${fullName(d)} · ${d.employeeId}`])),
    [driversRes.data],
  );
  const vehiclePlates = useMemo(
    () => new Map((vehiclesRes.data ?? []).map((v) => [v.id, v.plateNumber])),
    [vehiclesRes.data],
  );
  const adminNames = useMemo(
    () => new Map((adminsRes.data ?? []).map((a) => [a.id, fullName(a)])),
    [adminsRes.data],
  );

  const { subscribe } = useRealtime();
  const [pending, setPending] = useState(0);
  useEffect(
    () =>
      subscribe(() => {
        setPending((n) => n + 1);
      }),
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
      () => {
        setExporting(false);
      },
      (err: unknown) => {
        setExportError(err);
        setExporting(false);
      },
    );
  };

  const rows = listRes.data?.data ?? [];
  const totalRows = listRes.data?.meta.total ?? rows.length;
  const lookupError = driversRes.error ?? vehiclesRes.error ?? adminsRes.error;

  return (
    <div className="page-container">
      {/* Top Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={24} color="#1d4ed8" /> Complaints Management
          </h1>
          <p className="page-subtitle">Search, triage, and export fleet vehicle fault reports</p>
        </div>

        <div className="header-action-group">
          <button type="button" className="btn-secondary" onClick={refresh} disabled={listRes.loading}>
            <RotateCw size={14} style={{ marginRight: 6 }} className={listRes.loading ? 'spin' : ''} />
            {listRes.loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="btn-primary" onClick={handleExport} disabled={exporting}>
            <Download size={15} style={{ marginRight: 6 }} />
            {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      <ErrorBanner error={exportError} />
      <ErrorBanner error={lookupError} />

      {pending > 0 ? (
        <div className="live-notification-banner">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} color="#1d4ed8" />
            <strong>{pending}</strong> new complaint update{pending === 1 ? '' : 's'} received.
          </span>
          <button type="button" className="btn-live-refresh" onClick={refresh}>
            Update List
          </button>
        </div>
      ) : null}

      {/* Structured Filter Card Panel */}
      <div className="filter-card">
        <div className="filter-grid">
          {/* Row 1 */}
          <div className="filter-group filter-wide">
            <label htmlFor="search" className="filter-label">Search</label>
            <div className="filter-input-box">
              <Search size={15} className="filter-icon" />
              <input
                id="search"
                className="filter-input"
                placeholder="Search complaint no, title or description..."
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="status" className="filter-label">Status</label>
            <select
              id="status"
              className="filter-select"
              value={filter.status}
              onChange={(e) => setFilter({ status: e.target.value })}
            >
              <option value="">Any status</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatEnum(s)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priority" className="filter-label">Priority</label>
            <select
              id="priority"
              className="filter-select"
              value={filter.priority}
              onChange={(e) => setFilter({ priority: e.target.value })}
            >
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {formatEnum(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="driverId" className="filter-label">Driver</label>
            <select
              id="driverId"
              className="filter-select"
              value={filter.driverId}
              onChange={(e) => setFilter({ driverId: e.target.value })}
            >
              <option value="">Any driver</option>
              {(driversRes.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {fullName(d)} · {d.employeeId}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2 */}
          <div className="filter-group">
            <label htmlFor="vehicleId" className="filter-label">Vehicle</label>
            <select
              id="vehicleId"
              className="filter-select"
              value={filter.vehicleId}
              onChange={(e) => setFilter({ vehicleId: e.target.value })}
            >
              <option value="">Any vehicle</option>
              {(vehiclesRes.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="assignedToId" className="filter-label">Assigned To</label>
            <select
              id="assignedToId"
              className="filter-select"
              value={filter.assignedToId}
              onChange={(e) => setFilter({ assignedToId: e.target.value })}
            >
              <option value="">Anyone</option>
              {(adminsRes.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {fullName(a)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="createdFrom" className="filter-label">Created From</label>
            <input
              id="createdFrom"
              type="date"
              className="filter-input-date"
              value={filter.createdFrom}
              onChange={(e) => setFilter({ createdFrom: e.target.value })}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="createdTo" className="filter-label">Created To</label>
            <input
              id="createdTo"
              type="date"
              className="filter-input-date"
              value={filter.createdTo}
              onChange={(e) => setFilter({ createdTo: e.target.value })}
            />
          </div>

          <div className="filter-group filter-action-btn-group">
            <button type="button" className="btn-clear-filters" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner error={listRes.error} />

      {/* Main Complaints Table Card */}
      <div className="table-card">
        <div className="table-card-header">
          <h2 className="table-card-title">
            Complaints Queue <span className="badge-pill">{totalRows}</span>
          </h2>
        </div>

        {listRes.loading && rows.length === 0 ? (
          <div className="loading-state">Loading complaints list…</div>
        ) : rows.length === 0 ? (
          <div className="empty-table-state">
            <p>No complaints match these filters.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>COMPLAINT</th>
                  <th>TITLE</th>
                  <th>CATEGORY</th>
                  <th>STATUS</th>
                  <th>PRIORITY</th>
                  <th>DRIVER</th>
                  <th>VEHICLE</th>
                  <th>ASSIGNED TO</th>
                  <th>CREATED</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/complaints/${c.id}`} className="complaint-no">
                        {c.complaintNo}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/complaints/${c.id}`} className="complaint-title-link">
                        {c.title}
                      </Link>
                    </td>
                    <td>
                      {c.category ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: '#075E54',
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {c.category}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td>
                      <span className="driver-name-text">
                        {driverNames.get(c.driverId) ?? c.driverId}
                      </span>
                    </td>
                    <td>
                      {c.vehicleId ? (
                        <span className="vehicle-badge">{vehiclePlates.get(c.vehicleId) ?? c.vehicleId}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="assignee-text">
                        {c.assignedToId
                          ? (adminNames.get(c.assignedToId) ?? c.assignedToId)
                          : 'Unassigned'}
                      </span>
                    </td>
                    <td>
                      <span className="created-date-text">{formatDateTime(c.createdAt)}</span>
                    </td>
                    <td>
                      <Link to={`/complaints/${c.id}`} className="btn-view">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listRes.data ? (
          <div className="table-footer-pagination">
            <Pagination meta={listRes.data.meta} onPageChange={goToPage} disabled={listRes.loading} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
