import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { DriverListItem, DriverMonthlyTripSummary, LoadingRecord } from '@driver-complaint/shared-types';
import {
  Clock,
  MapPin,
  CheckCircle2,
  RotateCw,
  ExternalLink,
  ImageIcon,
  Search,
  Download,
  Truck,
  Calendar,
  X,
  Trophy,
  BarChart3,
  Timer,
  AlertTriangle,
  PackageOpen,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';
import { useRealtime } from '../realtime/RealtimeProvider';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human-readable "Hh Mm" for a raw minute total (e.g. 125 -> "2h 5m"). */
function formatMinutes(total: number): string {
  if (!total || total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Formats start/end ISO dates or duration fallback into HH:MM:SS (e.g. 01:15:30). */
function formatHms(startISO?: string | null, endISO?: string | null, fallbackFormatted?: string | null): string | null {
  if (startISO && endISO) {
    const s = new Date(startISO).getTime();
    const e = new Date(endISO).getTime();
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      const diffSec = Math.floor((e - s) / 1000);
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const sec = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(h)}:${pad(m)}:${pad(sec)}`;
    }
  }
  if (!fallbackFormatted) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(fallbackFormatted)) return fallbackFormatted;
  const matchHours = fallbackFormatted.match(/(\d+)h/);
  const matchMins = fallbackFormatted.match(/(\d+)m/);
  let totalSec = 0;
  if (matchHours || matchMins) {
    const h = matchHours && matchHours[1] ? parseInt(matchHours[1], 10) : 0;
    const m = matchMins && matchMins[1] ? parseInt(matchMins[1], 10) : 0;
    totalSec = (h * 3600) + (m * 60);
  } else if (!isNaN(Number(fallbackFormatted))) {
    totalSec = Math.round(Number(fallbackFormatted) * 60);
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function TripDetailsPage(): ReactElement {
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string; address?: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'logs'>('matrix');

  // Filter state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | ''>(new Date().getMonth() + 1); // 1-12 or '' for all
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch Drivers list for dropdown filter
  const driversResource = useApiResource('admin:drivers', () => api.drivers.list());
  const driverList: DriverListItem[] = driversResource.data ?? [];

  // Query object
  const queryObj = useMemo(
    () => ({
      year: selectedYear,
      month: selectedMonth !== '' ? selectedMonth : undefined,
      driverId: selectedDriverId || undefined,
      status: selectedStatus || undefined,
      search: searchTerm || undefined,
    }),
    [selectedYear, selectedMonth, selectedDriverId, selectedStatus, searchTerm],
  );

  // Fetch Trip Logs & Monthly Summaries with JSON stringified keys
  const logsResource = useApiResource(
    JSON.stringify(['admin:trips:logs', queryObj]),
    () => api.loading.list(queryObj),
  );
  const summaryResource = useApiResource(
    JSON.stringify(['admin:trips:summary', queryObj]),
    () => api.loading.monthlySummary(queryObj),
  );

  const { subscribe } = useRealtime();

  // Reload on realtime socket events
  useEffect(() => {
    return subscribe(({ event }) => {
      if (
        event === 'loading:reached' ||
        event === 'loading:completed' ||
        event === 'complaint:created' ||
        event === 'complaint:status-changed'
      ) {
        logsResource.reload();
        summaryResource.reload();
      }
    });
  }, [subscribe, logsResource, summaryResource]);

  const records: LoadingRecord[] = logsResource.data?.data ?? [];
  const summaries: DriverMonthlyTripSummary[] = summaryResource.data?.data ?? [];

  const [matrixPage, setMatrixPage] = useState(1);
  const [matrixPageSize, setMatrixPageSize] = useState(15);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(15);

  const totalMatrixItems = summaries.length;
  const totalMatrixPages = Math.ceil(totalMatrixItems / matrixPageSize) || 1;
  const paginatedSummaries = useMemo(() => {
    const start = (matrixPage - 1) * matrixPageSize;
    return summaries.slice(start, start + matrixPageSize);
  }, [summaries, matrixPage, matrixPageSize]);

  const totalLogsItems = records.length;
  const totalLogsPages = Math.ceil(totalLogsItems / logsPageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (logsPage - 1) * logsPageSize;
    return records.slice(start, start + logsPageSize);
  }, [records, logsPage, logsPageSize]);

  // Compute stat metrics
  const totalCompletedTrips = useMemo(() => {
    return summaries.reduce((acc, curr) => acc + curr.completedTripsCount, 0);
  }, [summaries]);

  const activeTripsCount = useMemo(() => {
    return records.filter((r) => r.status === 'TRIP_STARTED').length;
  }, [records]);

  const avgDurationMins = useMemo(() => {
    const completed = records.filter((r) => r.tripDurationMinutes !== null && r.tripDurationMinutes !== undefined);
    if (completed.length === 0) return 0;
    const sum = completed.reduce((acc, r) => acc + (r.tripDurationMinutes ?? 0), 0);
    return Math.round(sum / completed.length);
  }, [records]);

  // Total detention (sum of monthly waiting time across driver-months in view)
  const totalDetentionMins = useMemo(
    () => summaries.reduce((acc, s) => acc + s.totalWaitingTimeMinutes, 0),
    [summaries],
  );

  // Trips whose individual detention exceeded 2h (matches the logs-tab threshold)
  const highDetentionCount = useMemo(
    () => records.filter((r) => (r.waitingTimeMinutes ?? 0) > 120).length,
    [records],
  );

  // Total unloading wait at the destination (tripCompletedAt -> unloadingCompletedAt), summed
  // across driver-months. Sourced from `summaries` rather than `records` because the summary
  // endpoint honours the year/month/driver filters — the logs endpoint does not.
  const totalUnloadingMins = useMemo(
    () => summaries.reduce((acc, s) => acc + s.totalUnloadingTimeMinutes, 0),
    [summaries],
  );

  // Trips still sitting at the unloading bay right now
  const unloadingNowCount = useMemo(
    () => records.filter((r) => r.status === 'UNLOADING').length,
    [records],
  );

  // Top drivers by completed trips, aggregated across every driver-month in view
  const topDrivers = useMemo(() => {
    const map = new Map<string, { driverId: string; driverName: string; trips: number }>();
    for (const s of summaries) {
      const cur = map.get(s.driverId);
      if (cur) cur.trips += s.completedTripsCount;
      else map.set(s.driverId, { driverId: s.driverId, driverName: s.driverName, trips: s.completedTripsCount });
    }
    return [...map.values()].sort((a, b) => b.trips - a.trips);
  }, [summaries]);

  const topDriversTop = useMemo(() => topDrivers.slice(0, 8), [topDrivers]);
  const maxDriverTrips = topDriversTop[0]?.trips ?? 0;

  // Completed trips per calendar month (index 0 = Jan), for the column chart
  const monthlyVolume = useMemo(() => {
    const arr = new Array<number>(12).fill(0);
    for (const s of summaries) {
      if (s.month >= 1 && s.month <= 12) arr[s.month - 1] = (arr[s.month - 1] ?? 0) + s.completedTripsCount;
    }
    return arr;
  }, [summaries]);

  const distinctMonthsWithData = useMemo(() => monthlyVolume.filter((v) => v > 0).length, [monthlyVolume]);
  const maxMonthly = useMemo(() => monthlyVolume.reduce((m, v) => Math.max(m, v), 0), [monthlyVolume]);

  // Per-trip fleet averages (weighted by trip counts), shown when a single month is filtered
  const fleetAvg = useMemo(() => {
    const trips = summaries.reduce((a, s) => a + s.completedTripsCount, 0);
    const transit = summaries.reduce((a, s) => a + s.totalTripDurationMinutes, 0);
    const detention = summaries.reduce((a, s) => a + s.totalWaitingTimeMinutes, 0);
    const unloading = summaries.reduce((a, s) => a + s.totalUnloadingTimeMinutes, 0);
    return {
      avgTransit: trips > 0 ? Math.round(transit / trips) : 0,
      avgDetention: trips > 0 ? Math.round(detention / trips) : 0,
      avgUnloading: trips > 0 ? Math.round(unloading / trips) : 0,
      driverMonths: summaries.length,
    };
  }, [summaries]);

  // Largest single driver-month trip count, for the matrix share bars
  const maxSummaryTrips = useMemo(
    () => summaries.reduce((m, s) => Math.max(m, s.completedTripsCount), 0),
    [summaries],
  );

  const handleExportCsv = async () => {
    try {
      await api.loading.exportCsv(queryObj);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Failed to export CSV: ' + msg);
    }
  };

  const handleResetFilters = () => {
    setSelectedYear(new Date().getFullYear());
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedDriverId('');
    setSelectedStatus('');
    setSearchTerm('');
  };

  const MONTH_OPTIONS = [
    { value: '', label: 'All Months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fleet Trip Analytics & Monthly Breakdown 🚛</h1>
          <p className="page-subtitle">
            Driver-wise and month-wise completed trips analytics, transit times, detention logs & proof verification
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn-secondary" onClick={handleExportCsv}>
            <Download size={14} style={{ marginRight: 6 }} />
            Export CSV Report
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              logsResource.reload();
              summaryResource.reload();
            }}
            disabled={logsResource.loading || summaryResource.loading}
          >
            <RotateCw
              size={14}
              style={{ marginRight: 6 }}
              className={logsResource.loading || summaryResource.loading ? 'spin' : ''}
            />
            {logsResource.loading || summaryResource.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <ErrorBanner error={logsResource.error || summaryResource.error} />

      {/* 5 Key Stat Cards */}
      <div className="stat-cards-grid is-five">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Completed Trips</span>
            <CheckCircle2 size={22} color="#16a34a" />
          </div>
          <div className="stat-card-value">{totalCompletedTrips}</div>
          <div className="stat-card-footer">Across {summaries.length} driver-month{summaries.length === 1 ? '' : 's'}</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-card-title">Active Live Trips</span>
            <Truck size={22} color="#d97706" />
          </div>
          <div className="stat-card-value">{activeTripsCount}</div>
          <div className="stat-card-footer">Currently on road</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Avg Transit Time</span>
            <Clock size={22} color="#2563eb" />
          </div>
          <div className="stat-card-value">{formatMinutes(avgDurationMins)}</div>
          <div className="stat-card-footer">Per completed trip in view</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Detention Time</span>
            <Timer size={22} color="#d97706" />
          </div>
          <div className="stat-card-value">{formatMinutes(totalDetentionMins)}</div>
          <div className="stat-card-footer">
            {highDetentionCount > 0 ? (
              <span className="stat-delta alert">
                <AlertTriangle size={12} /> {highDetentionCount} trip{highDetentionCount === 1 ? '' : 's'} over 2h wait
              </span>
            ) : (
              'Total waiting across driver-months'
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Unloading Time</span>
            <PackageOpen size={22} color="#ea580c" />
          </div>
          <div className="stat-card-value">{formatMinutes(totalUnloadingMins)}</div>
          <div className="stat-card-footer">
            {unloadingNowCount > 0 ? (
              <span className="stat-delta alert">
                <AlertTriangle size={12} /> {unloadingNowCount} vehicle{unloadingNowCount === 1 ? '' : 's'} unloading now
              </span>
            ) : (
              `${formatMinutes(fleetAvg.avgUnloading)} avg per trip`
            )}
          </div>
        </div>
      </div>

      {/* Analytics Panel — hand-rolled CSS/SVG charts (no chart library) */}
      <div className="analytics-grid" style={{ marginBottom: 20 }}>
        {/* Left: Top drivers by completed trips (single-hue magnitude, #1 emphasized) */}
        <div className="analytics-card">
          <h3 className="chart-title">
            <Trophy size={16} color="#1d4ed8" /> Top Drivers by Completed Trips
          </h3>
          <p className="chart-subtitle">Ranked across all driver-months in the current view</p>
          {topDriversTop.length === 0 ? (
            <div className="chart-empty">No completed trips match the current filters.</div>
          ) : (
            <div className="bar-list">
              {topDriversTop.map((d, i) => {
                const pct = maxDriverTrips > 0 ? Math.max(4, Math.round((d.trips / maxDriverTrips) * 100)) : 0;
                return (
                  <div className="bar-row" key={d.driverId} title={`${d.driverName}: ${d.trips} completed trips`}>
                    <div className="bar-head">
                      <span className="bar-name">
                        <span className="bar-rank">#{i + 1}</span>
                        {d.driverName}
                      </span>
                      <span className="bar-value">{d.trips}</span>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${i === 0 ? 'is-top' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {topDrivers.length > topDriversTop.length ? (
                <div className="chart-note">+{topDrivers.length - topDriversTop.length} more drivers</div>
              ) : null}
            </div>
          )}
        </div>

        {/* Right: Monthly volume column chart when spanning >=2 months, else fleet averages */}
        <div className="analytics-card">
          {distinctMonthsWithData >= 2 ? (
            <>
              <h3 className="chart-title">
                <BarChart3 size={16} color="#1d4ed8" /> Monthly Trip Volume
              </h3>
              <p className="chart-subtitle">Completed trips per month · {selectedYear}</p>
              <div className="column-chart">
                {monthlyVolume.map((v, i) => {
                  const h = maxMonthly > 0 && v > 0 ? Math.max(6, Math.round((v / maxMonthly) * 100)) : 0;
                  const isSel = selectedMonth !== '' && selectedMonth === i + 1;
                  return (
                    <div className="col" key={MONTH_SHORT[i]} title={`${MONTH_SHORT[i]}: ${v} completed trips`}>
                      <div className="col-bar-wrap">
                        {v > 0 ? (
                          <div className={`col-bar ${isSel ? 'is-selected' : ''}`} style={{ height: `${h}%` }}>
                            <span className="col-value">{v}</span>
                          </div>
                        ) : null}
                      </div>
                      <span className="col-label">{MONTH_SHORT[i]}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h3 className="chart-title">
                <Timer size={16} color="#1d4ed8" /> Fleet Averages
              </h3>
              <p className="chart-subtitle">Per-trip averages across the current view</p>
              <div className="fleet-avg-grid is-four">
                <div className="fleet-avg-item">
                  <span className="fleet-avg-value">{formatMinutes(fleetAvg.avgTransit)}</span>
                  <span className="fleet-avg-label">Avg transit / trip</span>
                </div>
                <div className="fleet-avg-item">
                  <span className="fleet-avg-value">{formatMinutes(fleetAvg.avgDetention)}</span>
                  <span className="fleet-avg-label">Avg detention / trip</span>
                </div>
                <div className="fleet-avg-item">
                  <span className="fleet-avg-value">{formatMinutes(fleetAvg.avgUnloading)}</span>
                  <span className="fleet-avg-label">Avg unloading / trip</span>
                </div>
                <div className="fleet-avg-item">
                  <span className="fleet-avg-value">{fleetAvg.driverMonths}</span>
                  <span className="fleet-avg-label">Driver-months</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="table-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 200px', minWidth: 200, position: 'relative' }}>
            <Search
              size={16}
              color="#64748b"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              className="form-control"
              placeholder="Search driver, license, plate, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 36, height: 38 }}
            />
          </div>

          {/* Month Selector */}
          <div style={{ width: 140 }}>
            <select
              className="form-control"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ height: 38 }}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.label} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div style={{ width: 110 }}>
            <select
              className="form-control"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ height: 38 }}
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>
          </div>

          {/* Driver Selector */}
          <div style={{ width: 220 }}>
            <select
              className="form-control"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              style={{ height: 38 }}
            >
              <option value="">All Drivers</option>
              {driverList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} ({d.employeeId})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ width: 160 }}>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ height: 38 }}
            >
              <option value="">All Statuses</option>
              <option value="TRIP_COMPLETED">Trip Completed</option>
              <option value="UNLOADING">Unloading In Progress</option>
              <option value="TRIP_STARTED">Trip Started (Active)</option>
              <option value="COMPLETED">Loading Completed</option>
              <option value="REACHED">Reached Loading Point</option>
            </select>
          </div>

          <button type="button" className="btn-secondary" onClick={handleResetFilters} style={{ height: 38 }}>
            Reset Filters
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={activeTab === 'matrix' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('matrix')}
          style={{ padding: '8px 18px', borderRadius: 8 }}
        >
          <Calendar size={16} style={{ marginRight: 6 }} />
          Driver Monthly Summary Matrix ({summaries.length})
        </button>

        <button
          type="button"
          className={activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('logs')}
          style={{ padding: '8px 18px', borderRadius: 8 }}
        >
          <Truck size={16} style={{ marginRight: 6 }} />
          Detailed Trip Logs ({records.length})
        </button>
      </div>

      {/* TAB 1: Driver Monthly Summary Matrix */}
      {activeTab === 'matrix' ? (
        <div className="table-card">
          <div className="table-card-header">
            <h2 className="table-card-title">
              Driver Monthly Trip Breakdown
              <span className="badge-pill">{summaries.length} Driver Months</span>
            </h2>
          </div>

          {summaryResource.loading && summaries.length === 0 ? (
            <div className="loading-state">Loading monthly trip summaries…</div>
          ) : summaries.length === 0 ? (
            <div className="empty-table-state">
              <p>No monthly completed trips found for the selected filters.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>License Number</th>
                    <th>Vehicle Plate</th>
                    <th>Month & Year</th>
                    <th>Completed Trips</th>
                    <th>Avg Trip Duration</th>
                    <th>Total Waiting Time</th>
                    <th>Total Unloading Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSummaries.map((s, idx) => (
                    <tr key={`${s.driverId}_${s.year}_${s.month}_${idx}`}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text)' }}>{s.driverName}</div>
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: '13px' }}>{s.licenseNumber}</span>
                      </td>
                      <td>
                        <span className="vehicle-badge">{s.vehiclePlate}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: '#047857', fontSize: '13px' }}>
                          {s.monthLabel}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span className="trips-count-pill">{s.completedTripsCount} Trips</span>
                          <div
                            className="share-bar"
                            title={`${s.completedTripsCount} of ${maxSummaryTrips} (busiest driver-month in view)`}
                          >
                            <div
                              className="share-fill"
                              style={{
                                width: `${
                                  maxSummaryTrips > 0
                                    ? Math.max(4, Math.round((s.completedTripsCount / maxSummaryTrips) * 100))
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="duration-pill">
                          <Clock size={12} style={{ marginRight: 4 }} />
                          {s.avgTripDurationMinutes} mins
                        </span>
                      </td>
                      <td>
                        <span className="duration-pill">
                          {s.totalWaitingTimeMinutes} mins
                        </span>
                      </td>
                      <td>
                        <span
                          className="duration-pill"
                          title={`${s.avgUnloadingTimeMinutes} mins average per completed trip`}
                        >
                          {s.totalUnloadingTimeMinutes} mins
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          onClick={() => {
                            setSelectedDriverId(s.driverId);
                            setActiveTab('logs');
                          }}
                        >
                          View Trips Log
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summaries.length > 0 ? (
            <Pagination
              meta={{ page: matrixPage, pageSize: matrixPageSize, total: totalMatrixItems, totalPages: totalMatrixPages }}
              onPageChange={setMatrixPage}
              onPageSizeChange={(sz) => {
                setMatrixPageSize(sz);
                setMatrixPage(1);
              }}
              itemLabel="summary"
            />
          ) : null}
        </div>
      ) : (
        /* TAB 2: Detailed Trip Logs Table */
        <div className="table-card">
          <div className="table-card-header">
            <h2 className="table-card-title">
              Comprehensive Trip & Loading Logs
              <span className="badge-pill">{records.length} Records</span>
            </h2>
          </div>

          {logsResource.loading && records.length === 0 ? (
            <div className="loading-state">Loading trip logs…</div>
          ) : records.length === 0 ? (
            <div className="empty-table-state">
              <p>No trip records found matching your filters.</p>
            </div>
          ) : (
            <>
              <div className="table-responsive table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Driver & Vehicle</th>
                      <th>Status</th>
                      <th>Departure & Arrival Timestamps</th>
                      <th>Start & End Address</th>
                      <th>Duration & Detention</th>
                      <th>Proof Photos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((rec) => {
                      const isLongTrip = (rec.tripDurationMinutes ?? 0) > 240;
                      const isHighUnloading = (rec.unloadingDurationMinutes ?? 0) > 120;
                      const mapsStartUrl = rec.tripStartLatitude
                        ? `https://www.google.com/maps?q=${rec.tripStartLatitude},${rec.tripStartLongitude}`
                        : null;
                      const mapsCompletedUrl = rec.tripCompletedLatitude
                        ? `https://www.google.com/maps?q=${rec.tripCompletedLatitude},${rec.tripCompletedLongitude}`
                        : null;

                      return (
                        <tr key={rec.id}>
                          <td>
                            <div style={{ fontWeight: '700', color: 'var(--text)' }}>
                              {rec.driverName || 'Driver'}
                            </div>
                            {rec.vehiclePlate ? (
                              <span className="vehicle-badge">{rec.vehiclePlate}</span>
                            ) : null}
                          </td>

                          <td>
                            {rec.status === 'TRIP_COMPLETED' ? (
                              <span className="status-badge badge-success">
                                <CheckCircle2 size={12} style={{ marginRight: 4 }} /> TRIP COMPLETED
                              </span>
                            ) : rec.status === 'UNLOADING' ? (
                              <span className="status-badge badge-warning">
                                <span className="pulsing-dot" /> UNLOADING
                              </span>
                            ) : rec.status === 'TRIP_STARTED' ? (
                              <span className="status-badge badge-warning">
                                <span className="pulsing-dot" /> TRIP STARTED
                              </span>
                            ) : rec.status === 'COMPLETED' ? (
                              <span className="status-badge badge-info">LOADING DONE</span>
                            ) : (
                              <span className="status-badge badge-warning">REACHED</span>
                            )}
                          </td>

                          <td>
                            <div style={{ fontSize: '12px' }}>
                              {rec.tripStartedAt ? (
                                <div>
                                  <span className="muted">Started:</span> {formatDateTime(rec.tripStartedAt)}
                                </div>
                              ) : null}
                              {rec.tripCompletedAt ? (
                                <div style={{ marginTop: 2 }}>
                                  <span className="muted">Completed:</span> {formatDateTime(rec.tripCompletedAt)}
                                </div>
                              ) : (
                                <div>
                                  <span className="muted">Arrived:</span> {formatDateTime(rec.reachedAt)}
                                </div>
                              )}
                              {rec.unloadingCompletedAt ? (
                                <div style={{ marginTop: 2 }}>
                                  <span className="muted">Unloaded:</span> {formatDateTime(rec.unloadingCompletedAt)}
                                </div>
                              ) : null}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontSize: '12px', maxWidth: 220 }}>
                              {rec.tripStartAddress ? (
                                <div style={{ marginBottom: 4 }}>
                                  <strong style={{ color: 'var(--text)' }}>Start: </strong>
                                  <span>{rec.tripStartAddress}</span>
                                  {mapsStartUrl ? (
                                    <a
                                      href={mapsStartUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ marginLeft: 4, color: '#2563eb' }}
                                    >
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : null}
                                </div>
                              ) : null}

                              {rec.tripCompletedAddress ? (
                                <div>
                                  <strong style={{ color: 'var(--text)' }}>End: </strong>
                                  <span>{rec.tripCompletedAddress}</span>
                                  {mapsCompletedUrl ? (
                                    <a
                                      href={mapsCompletedUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ marginLeft: 4, color: '#2563eb' }}
                                    >
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="muted">{rec.reachedAddress || rec.locationName || 'N/A'}</span>
                              )}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {formatHms(rec.tripStartedAt, rec.tripCompletedAt, rec.formattedTripDuration) ? (
                                <span className={`duration-pill ${isLongTrip ? 'high-detention' : ''}`}>
                                  <Clock size={12} style={{ marginRight: 4 }} />
                                  Trip: {formatHms(rec.tripStartedAt, rec.tripCompletedAt, rec.formattedTripDuration)}
                                </span>
                              ) : null}

                              {formatHms(rec.tripCompletedAt, rec.unloadingCompletedAt, rec.formattedUnloadingDuration) ? (
                                <span className={`duration-pill ${isHighUnloading ? 'high-detention' : ''}`}>
                                  Unload: {formatHms(rec.tripCompletedAt, rec.unloadingCompletedAt, rec.formattedUnloadingDuration)}
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {rec.tripCompletedPhotoUrl ? (
                                <button
                                  type="button"
                                  className="photo-thumb-btn"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: rec.tripCompletedPhotoUrl!,
                                      title: `Trip Completion Proof — ${rec.driverName || 'Driver'}`,
                                      address: rec.tripCompletedAddress,
                                    })
                                  }
                                >
                                  <ImageIcon size={11} /> Trip End
                                </button>
                              ) : null}

                              {rec.unloadingPhotoUrl ? (
                                <button
                                  type="button"
                                  className="photo-thumb-btn"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: rec.unloadingPhotoUrl!,
                                      title: `Unloading Proof — ${rec.driverName || 'Driver'}`,
                                      address: rec.unloadingAddress,
                                    })
                                  }
                                >
                                  <ImageIcon size={11} /> Unloading
                                </button>
                              ) : null}

                              {!rec.tripCompletedPhotoUrl && !rec.unloadingPhotoUrl ? (
                                <span className="muted">—</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                meta={{ page: logsPage, pageSize: logsPageSize, total: totalLogsItems, totalPages: totalLogsPages }}
                onPageChange={setLogsPage}
                onPageSizeChange={(sz) => {
                  setLogsPageSize(sz);
                  setLogsPage(1);
                }}
                itemLabel="trip record"
              />
            </>
          )}
        </div>
      )}

      {/* Proof Photo Modal */}
      {selectedPhoto ? (
        <div className="modal-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedPhoto.title}</h3>
              <button type="button" className="close-btn" onClick={() => setSelectedPhoto(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <img src={selectedPhoto.url} alt="Proof preview" className="full-proof-img" />
              {selectedPhoto.address ? (
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                  <MapPin size={14} style={{ marginRight: 4, display: 'inline' }} />
                  {selectedPhoto.address}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
