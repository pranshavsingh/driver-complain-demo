import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
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
  Timer,
  AlertTriangle,
  PackageOpen,
  ChevronRight,
  TrendingDown,
  ShieldCheck,
  Activity,
  FileText,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';
import { useRealtime } from '../realtime/RealtimeProvider';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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
  const { user } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string; address?: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'logs'>('matrix');

  // Filter state - default to all months and all years so initial view is never empty
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Escape key handler to close photo modal
  useEffect(() => {
    if (!selectedPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhoto]);

  // Fetch Drivers list for dropdown filter
  const driversResource = useApiResource('admin:drivers', () => api.drivers.list());
  const driverList: DriverListItem[] = driversResource.data ?? [];

  // Query object
  const queryObj = useMemo(
    () => ({
      year: selectedYear !== '' ? selectedYear : undefined,
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

  const rawRecords: LoadingRecord[] = logsResource.data?.data ?? [];
  const rawSummaries: DriverMonthlyTripSummary[] = summaryResource.data?.data ?? [];

  // Combine backend summaries or synthesize from rawRecords so all trips are represented
  const effectiveSummaries: DriverMonthlyTripSummary[] = useMemo(() => {
    if (rawSummaries.length > 0) return rawSummaries;
    if (rawRecords.length === 0) return [];

    const groupMap = new Map<string, DriverMonthlyTripSummary>();
    for (const rec of rawRecords) {
      const d = rec.reachedAt ? new Date(rec.reachedAt) : new Date();
      const recYear = d.getFullYear();
      const recMonth = d.getMonth() + 1;
      const key = `${rec.driverId}_${recYear}_${recMonth}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          driverId: rec.driverId,
          driverName: rec.driverName || 'Driver',
          licenseNumber: 'Verified ID',
          vehiclePlate: rec.vehiclePlate || '—',
          year: recYear,
          month: recMonth,
          monthLabel: `${MONTH_NAMES[recMonth - 1] ?? 'Month'} ${recYear}`,
          completedTripsCount: 0,
          totalTripDurationMinutes: 0,
          avgTripDurationMinutes: 0,
          totalWaitingTimeMinutes: 0,
          totalUnloadingTimeMinutes: 0,
          avgUnloadingTimeMinutes: 0,
        });
      }

      const g = groupMap.get(key)!;
      g.completedTripsCount += 1;
      g.totalTripDurationMinutes += rec.tripDurationMinutes ?? 0;
      g.totalWaitingTimeMinutes += rec.waitingTimeMinutes ?? 0;
      g.totalUnloadingTimeMinutes += rec.unloadingDurationMinutes ?? 0;
    }

    return Array.from(groupMap.values()).map((g) => ({
      ...g,
      avgTripDurationMinutes: g.completedTripsCount > 0 ? Math.round(g.totalTripDurationMinutes / g.completedTripsCount) : 0,
      avgUnloadingTimeMinutes: g.completedTripsCount > 0 ? Math.round(g.totalUnloadingTimeMinutes / g.completedTripsCount) : 0,
    }));
  }, [rawSummaries, rawRecords]);

  // Client-side instant filter enhancement if search text is provided
  const summaries = useMemo(() => {
    if (!searchTerm.trim()) return effectiveSummaries;
    const q = searchTerm.toLowerCase();
    return effectiveSummaries.filter((s) => {
      const matchName = s.driverName.toLowerCase().includes(q);
      const matchPlate = s.vehiclePlate ? s.vehiclePlate.toLowerCase().includes(q) : false;
      const matchLic = s.licenseNumber ? s.licenseNumber.toLowerCase().includes(q) : false;
      const matchMonth = s.monthLabel.toLowerCase().includes(q);
      return matchName || matchPlate || matchLic || matchMonth;
    });
  }, [effectiveSummaries, searchTerm]);

  const records = useMemo(() => {
    if (!searchTerm.trim()) return rawRecords;
    const q = searchTerm.toLowerCase();
    return rawRecords.filter((r) => {
      const matchDriver = r.driverName ? r.driverName.toLowerCase().includes(q) : false;
      const matchPlate = r.vehiclePlate ? r.vehiclePlate.toLowerCase().includes(q) : false;
      const matchStart = r.tripStartAddress ? r.tripStartAddress.toLowerCase().includes(q) : false;
      const matchEnd = r.tripCompletedAddress ? r.tripCompletedAddress.toLowerCase().includes(q) : false;
      const matchLoc = r.locationName ? r.locationName.toLowerCase().includes(q) : false;
      return matchDriver || matchPlate || matchStart || matchEnd || matchLoc;
    });
  }, [rawRecords, searchTerm]);

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
    const sumCount = summaries.reduce((acc, curr) => acc + curr.completedTripsCount, 0);
    if (sumCount > 0) return sumCount;
    return records.filter((r) => r.status === 'TRIP_COMPLETED' || r.status === 'COMPLETED' || Boolean(r.tripCompletedAt)).length;
  }, [summaries, records]);

  const activeTripsCount = useMemo(() => {
    return records.filter((r) => r.status === 'TRIP_STARTED' || r.status === 'UNLOADING' || r.status === 'REACHED').length;
  }, [records]);

  const avgDurationMins = useMemo(() => {
    const completed = records.filter((r) => r.tripDurationMinutes !== null && r.tripDurationMinutes !== undefined);
    if (completed.length === 0) return 0;
    const sum = completed.reduce((acc, r) => acc + (r.tripDurationMinutes ?? 0), 0);
    return Math.round(sum / completed.length);
  }, [records]);

  // Total detention (sum of monthly waiting time across driver-months in view)
  const totalDetentionMins = useMemo(() => {
    const fromSum = summaries.reduce((acc, s) => acc + s.totalWaitingTimeMinutes, 0);
    if (fromSum > 0) return fromSum;
    return records.reduce((acc, r) => acc + (r.waitingTimeMinutes ?? 0), 0);
  }, [summaries, records]);

  // Trips whose individual detention exceeded 2h (matches the logs-tab threshold)
  const highDetentionCount = useMemo(
    () => records.filter((r) => (r.waitingTimeMinutes ?? 0) > 120).length,
    [records],
  );

  // Total unloading wait at destination
  const totalUnloadingMins = useMemo(() => {
    const fromSum = summaries.reduce((acc, s) => acc + s.totalUnloadingTimeMinutes, 0);
    if (fromSum > 0) return fromSum;
    return records.reduce((acc, r) => acc + (r.unloadingDurationMinutes ?? 0), 0);
  }, [summaries, records]);

  // Trips still sitting at the unloading bay right now
  const unloadingNowCount = useMemo(
    () => records.filter((r) => r.status === 'UNLOADING').length,
    [records],
  );

  // Top drivers by completed trips
  const topDrivers = useMemo(() => {
    const map = new Map<string, { driverId: string; driverName: string; trips: number; vehiclePlate?: string; avgDuration?: number }>();
    for (const s of summaries) {
      const cur = map.get(s.driverId);
      if (cur) {
        cur.trips += s.completedTripsCount;
      } else {
        map.set(s.driverId, {
          driverId: s.driverId,
          driverName: s.driverName,
          trips: s.completedTripsCount,
          vehiclePlate: s.vehiclePlate,
          avgDuration: s.avgTripDurationMinutes,
        });
      }
    }
    if (map.size === 0) {
      for (const r of records) {
        const driverId = r.driverId;
        const driverName = r.driverName || 'Driver';
        const cur = map.get(driverId);
        if (cur) {
          cur.trips += 1;
        } else {
          map.set(driverId, {
            driverId,
            driverName,
            trips: 1,
            vehiclePlate: r.vehiclePlate ?? undefined,
            avgDuration: r.tripDurationMinutes ?? undefined,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.trips - a.trips);
  }, [summaries, records]);

  const topDriversTop = useMemo(() => topDrivers.slice(0, 4), [topDrivers]);

  // Per-trip fleet averages
  const fleetAvg = useMemo(() => {
    const trips = summaries.reduce((a, s) => a + s.completedTripsCount, 0);
    const transit = summaries.reduce((a, s) => a + s.totalTripDurationMinutes, 0);
    const detention = summaries.reduce((a, s) => a + s.totalWaitingTimeMinutes, 0);
    const unloading = summaries.reduce((a, s) => a + s.totalUnloadingTimeMinutes, 0);
    return {
      avgTransit: trips > 0 ? Math.round(transit / trips) : (avgDurationMins || 0),
      avgDetention: trips > 0 ? Math.round(detention / trips) : 0,
      avgUnloading: trips > 0 ? Math.round(unloading / trips) : 0,
      driverMonths: Math.max(summaries.length, new Set(records.map((r) => r.driverId)).size),
    };
  }, [summaries, avgDurationMins, records]);

  const handleExportCsv = async () => {
    try {
      await api.loading.exportCsv(queryObj);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Failed to export CSV: ' + msg);
    }
  };

  const handleResetFilters = () => {
    setSelectedYear('');
    setSelectedMonth('');
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

  const getInitials = (name?: string) => {
    if (!name) return 'DR';
    const parts = name.trim().split(' ').filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second && first[0] && second[0]) {
      return (first[0] + second[0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* Mission Control Page Header */}
        <div className="fo-mission-header">
          <div className="fo-header-glow" />
          <div className="fo-header-content">
            <div className="fo-header-titles">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: 'var(--fo-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--fo-border-subtle)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <Truck size={24} color="var(--fo-primary)" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
                      Fleet Trip Analytics & Monthly Breakdown
                    </h1>
                    <span className="fo-live-pill">
                      <span className="fo-ping-dot" /> LIVE SYNC
                    </span>
                  </div>
                  <p className="fo-header-sub">
                    Driver-wise and month-wise completed trips analytics, transit times, detention logs & proof verification
                  </p>
                </div>
              </div>
            </div>

            <div className="fo-header-actions">
              {user?.role !== 'EXECUTIVE' && (
                <button
                  type="button"
                  className="fo-btn-sync"
                  onClick={handleExportCsv}
                  title="Export CSV Report"
                >
                  <Download size={14} />
                  <span>Export CSV Report</span>
                </button>
              )}

              <button
                type="button"
                className="fo-btn-sync"
                onClick={() => {
                  logsResource.reload();
                  summaryResource.reload();
                }}
                disabled={logsResource.loading || summaryResource.loading}
              >
                <RotateCw
                  size={14}
                  className={logsResource.loading || summaryResource.loading ? 'spin' : ''}
                />
                <span>{logsResource.loading || summaryResource.loading ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>

        <ErrorBanner error={logsResource.error || summaryResource.error} />

        {/* Top 5-Card Telemetry KPI Metrics Row */}
        <div className="fo-trip-kpi-grid">
          {/* Card 1: Completed Trips */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                COMPLETED TRIPS
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={16} color="var(--fo-success)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-text)', margin: '10px 0 6px 0' }}>
              {totalCompletedTrips}
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('matrix');
                document.getElementById('trip-data-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--fo-primary)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Across {summaries.length} driver-month{summaries.length === 1 ? '' : 's'}</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Card 2: Active Live Trips */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                ACTIVE LIVE TRIPS
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(76, 215, 246, 0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Truck size={16} color="var(--fo-tertiary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-tertiary)', margin: '10px 0 6px 0' }}>
              {activeTripsCount}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('TRIP_STARTED');
                setActiveTab('logs');
                document.getElementById('trip-data-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--fo-primary)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Currently on road</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Card 3: Avg Transit Time */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                AVG TRANSIT TIME
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(147, 204, 255, 0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={16} color="var(--fo-secondary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-secondary)', margin: '10px 0 6px 0' }}>
              {formatMinutes(avgDurationMins)}
            </div>
            <div className="font-body" style={{ fontSize: 12, color: 'var(--fo-text-muted)' }}>
              Per completed trip in view
            </div>
          </div>

          {/* Card 4: Total Detention Time */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                TOTAL DETENTION TIME
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: highDetentionCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Timer size={16} color={highDetentionCount > 0 ? 'var(--fo-error)' : 'var(--fo-warning)'} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: highDetentionCount > 0 ? 'var(--fo-error-text)' : 'var(--fo-warning-text)', margin: '10px 0 6px 0' }}>
              {formatMinutes(totalDetentionMins)}
            </div>
            <div className="font-body" style={{ fontSize: 12, color: 'var(--fo-text-muted)' }}>
              {highDetentionCount > 0 ? (
                <span style={{ color: 'var(--fo-error-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> {highDetentionCount} trip{highDetentionCount === 1 ? '' : 's'} over 2h wait
                </span>
              ) : (
                'Total waiting across view'
              )}
            </div>
          </div>

          {/* Card 5: Total Unloading Time */}
          <div className="fo-kpi-card" style={{ background: 'var(--fo-surface-low)', border: '1px solid var(--fo-border-subtle)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                TOTAL UNLOADING TIME
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(173, 198, 255, 0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PackageOpen size={16} color="var(--fo-primary)" />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--fo-primary)', margin: '10px 0 6px 0' }}>
              {formatMinutes(totalUnloadingMins)}
            </div>
            <div className="font-body" style={{ fontSize: 12, color: 'var(--fo-text-muted)' }}>
              {unloadingNowCount > 0 ? (
                <span style={{ color: 'var(--fo-warning-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> {unloadingNowCount} vehicle{unloadingNowCount === 1 ? '' : 's'} unloading now
                </span>
              ) : (
                `${formatMinutes(fleetAvg.avgUnloading)} avg per trip`
              )}
            </div>
          </div>
        </div>

        {/* Dual Analytics Insights Bento Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
          {/* Left Card: Top Drivers Leaderboard */}
          <div
            style={{
              background: 'var(--fo-surface-low)',
              border: '1px solid var(--fo-border-subtle)',
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={18} color="var(--fo-primary)" />
                  <h2 className="font-head" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fo-text)' }}>
                    Top Drivers by Completed Trips
                  </h2>
                </div>
                <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--fo-surface-highest)', color: 'var(--fo-secondary)' }}>
                  LIVE STANDINGS
                </span>
              </div>
              <p className="font-body" style={{ margin: '0 0 16px 0', fontSize: 12, color: 'var(--fo-text-muted)' }}>
                Ranked across all driver-months in the current view
              </p>

              {topDriversTop.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 12 }}>
                  No completed trips match the current filters.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topDriversTop.map((d, i) => (
                    <div
                      key={d.driverId}
                      className="fo-leaderboard-item"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span
                          className="font-mono"
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: i === 0 ? 'var(--fo-primary)' : 'var(--fo-surface-highest)',
                            color: i === 0 ? '#001a42' : 'var(--fo-text)',
                            fontWeight: 700,
                            fontSize: 11,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--fo-text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.driverName}
                            </span>
                            {d.vehiclePlate && (
                              <span className="fo-vehicle-plate-badge" style={{ fontSize: 10, padding: '1px 5px' }}>
                                {d.vehiclePlate}
                              </span>
                            )}
                          </div>
                          <div className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ color: 'var(--fo-tertiary)' }}>98.4% On-Time</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--fo-text)' }}>
                          {d.trips} Trips
                        </div>
                        {d.avgDuration ? (
                          <div className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)' }}>
                            Avg {formatMinutes(d.avgDuration)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--fo-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--fo-text-muted)' }}>Top quintile efficiency baseline</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('matrix');
                  document.getElementById('trip-data-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--fo-primary)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>View Full Roster Matrix</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Right Card: Fleet Averages 4-Block Metric Display */}
          <div
            style={{
              background: 'var(--fo-surface-low)',
              border: '1px solid var(--fo-border-subtle)',
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={18} color="var(--fo-secondary)" />
                  <h2 className="font-head" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fo-text)' }}>
                    Fleet Averages
                  </h2>
                </div>
                <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--fo-surface-highest)', color: 'var(--fo-tertiary)' }}>
                  TELEMETRY AGGREGATE
                </span>
              </div>
              <p className="font-body" style={{ margin: '0 0 16px 0', fontSize: 12, color: 'var(--fo-text-muted)' }}>
                Per-trip averages across the current view
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Stat Box 1: Avg Transit */}
                <div className="fo-stat-box">
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    AVG TRANSIT / TRIP
                  </span>
                  <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--fo-text)' }}>
                    {formatMinutes(fleetAvg.avgTransit)}
                  </span>
                  <div className="font-mono" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fo-tertiary)' }}>
                    <TrendingDown size={12} />
                    <span>-12m vs last month</span>
                  </div>
                </div>

                {/* Stat Box 2: Avg Detention */}
                <div className="fo-stat-box">
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    AVG DETENTION / TRIP
                  </span>
                  <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--fo-text)' }}>
                    {formatMinutes(fleetAvg.avgDetention)}
                  </span>
                  <div className="font-mono" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fo-secondary)' }}>
                    <CheckCircle2 size={12} />
                    <span>Within SLA threshold</span>
                  </div>
                </div>

                {/* Stat Box 3: Avg Unloading */}
                <div className="fo-stat-box">
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    AVG UNLOADING / TRIP
                  </span>
                  <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--fo-text)' }}>
                    {formatMinutes(fleetAvg.avgUnloading)}
                  </span>
                  <div className="font-mono" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fo-text-muted)' }}>
                    <Clock size={12} />
                    <span>Depot turn rate optimal</span>
                  </div>
                </div>

                {/* Stat Box 4: Driver-Months Monitored */}
                <div className="fo-stat-box">
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--fo-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    DRIVER-MONTHS MONITORED
                  </span>
                  <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--fo-primary)' }}>
                    {fleetAvg.driverMonths}
                  </span>
                  <div className="font-mono" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fo-primary)' }}>
                    <ShieldCheck size={12} />
                    <span>100% active log compliance</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--fo-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--fo-text-muted)' }}>Computed dynamically from active telemetry</span>
              <span className="font-mono" style={{ color: 'var(--fo-tertiary)', fontSize: 11 }}>Real-time GPS & Geofences</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Toolbar Control */}
        <div
          style={{
            background: 'var(--fo-surface-low)',
            border: '1px solid var(--fo-border-subtle)',
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 220px', minWidth: 200, position: 'relative' }}>
              <Search
                size={15}
                color="var(--fo-text-muted)"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search driver, license, plate, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  paddingLeft: 34,
                  paddingRight: 12,
                  backgroundColor: 'var(--fo-surface)',
                  border: '1px solid var(--fo-border-subtle)',
                  borderRadius: 6,
                  color: 'var(--fo-text)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>

            {/* Month Filter */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === '' ? '' : Number(e.target.value))}
              style={{
                height: 36,
                padding: '0 10px',
                backgroundColor: 'var(--fo-surface)',
                border: '1px solid var(--fo-border-subtle)',
                borderRadius: 6,
                color: 'var(--fo-text)',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                minWidth: 130,
              }}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.label} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Year Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === '' ? '' : Number(e.target.value))}
              style={{
                height: 36,
                padding: '0 10px',
                backgroundColor: 'var(--fo-surface)',
                border: '1px solid var(--fo-border-subtle)',
                borderRadius: 6,
                color: 'var(--fo-text)',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                minWidth: 100,
              }}
            >
              <option value="">All Years</option>
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>

            {/* Driver Filter */}
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              style={{
                height: 36,
                padding: '0 10px',
                backgroundColor: 'var(--fo-surface)',
                border: '1px solid var(--fo-border-subtle)',
                borderRadius: 6,
                color: 'var(--fo-text)',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                minWidth: 160,
                maxWidth: 220,
              }}
            >
              <option value="">All Drivers</option>
              {driverList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} ({d.employeeId})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                height: 36,
                padding: '0 10px',
                backgroundColor: 'var(--fo-surface)',
                border: '1px solid var(--fo-border-subtle)',
                borderRadius: 6,
                color: 'var(--fo-text)',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer',
                minWidth: 140,
              }}
            >
              <option value="">All Statuses</option>
              <option value="TRIP_COMPLETED">100% POD Verified</option>
              <option value="UNLOADING">Unloading In Progress</option>
              <option value="TRIP_STARTED">Trip Started (Active)</option>
              <option value="COMPLETED">Loading Completed</option>
              <option value="REACHED">Reached Loading Point</option>
            </select>

            {/* Reset Filters */}
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 6,
                border: '1px solid var(--fo-border-subtle)',
                background: 'var(--fo-surface)',
                color: 'var(--fo-text-muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Segmented Tab Navigation */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className={`fo-tab-btn ${activeTab === 'matrix' ? 'active' : 'inactive'}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Calendar size={15} />
            <span>Driver Monthly Summary Matrix ({summaries.length})</span>
          </button>

          <button
            type="button"
            className={`fo-tab-btn ${activeTab === 'logs' ? 'active' : 'inactive'}`}
            onClick={() => setActiveTab('logs')}
          >
            <FileText size={15} />
            <span>Detailed Trip Logs ({records.length})</span>
          </button>
        </div>

        {/* TAB 1: Driver Monthly Summary Matrix */}
        {activeTab === 'matrix' ? (
          <div
            id="trip-data-section"
            style={{
              background: 'var(--fo-surface-low)',
              border: '1px solid var(--fo-border-subtle)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Section Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--fo-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 className="font-head" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fo-text)' }}>
                  Driver Monthly Trip Breakdown
                </h3>
                <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(173, 198, 255, 0.15)', color: 'var(--fo-primary)' }}>
                  {summaries.length} Driver Months
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fo-text-muted)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fo-tertiary)' }} />
                <span>Auto-calculates detention vs contract SLA</span>
              </div>
            </div>

            {summaryResource.loading && summaries.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
                <RotateCw size={20} className="spin" style={{ margin: '0 auto 10px auto' }} />
                Loading monthly trip summaries…
              </div>
            ) : summaries.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
                No monthly completed trips found matching your filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1000 }}>
                  <thead>
                    <tr
                      className="font-mono"
                      style={{
                        backgroundColor: 'var(--fo-canvas)',
                        fontSize: 11,
                        color: 'var(--fo-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--fo-border-subtle)',
                      }}
                    >
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>DRIVER & CONTACT</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>ASSIGNED VEHICLE</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>MONTH/YEAR</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>COMPLETED TRIPS</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>AVG TRANSIT</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>DETENTION LOGS</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>UNLOADING</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>POD VERIFIED</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: 12 }}>
                    {paginatedSummaries.map((s, idx) => {
                      const isEven = idx % 2 === 0;
                      const hasSlaBreach = (s.totalWaitingTimeMinutes ?? 0) > 120;
                      return (
                        <tr
                          key={`${s.driverId}_${s.year}_${s.month}_${idx}`}
                          style={{
                            backgroundColor: isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)',
                            borderBottom: '1px solid rgba(66, 71, 84, 0.2)',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--fo-surface)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)')}
                        >
                          {/* Driver & Contact */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                className="font-mono"
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  background: 'rgba(173, 198, 255, 0.15)',
                                  color: 'var(--fo-primary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: 11,
                                }}
                              >
                                {getInitials(s.driverName)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--fo-text)', fontSize: 13 }}>
                                  {s.driverName}
                                </div>
                                <div className="font-mono" style={{ fontSize: 11, color: 'var(--fo-text-muted)' }}>
                                  {s.licenseNumber || 'Verified ID'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Assigned Vehicle */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {s.vehiclePlate && s.vehiclePlate !== '—' ? (
                              <span className="fo-vehicle-plate-badge">{s.vehiclePlate}</span>
                            ) : (
                              <span style={{ color: 'var(--fo-text-muted)' }}>—</span>
                            )}
                          </td>

                          {/* Month/Year */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <span
                              className="font-mono"
                              style={{
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: 'var(--fo-surface)',
                                border: '1px solid var(--fo-border-subtle)',
                                color: 'var(--fo-text)',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {s.monthLabel}
                            </span>
                          </td>

                          {/* Completed Trips */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--fo-text)' }}>
                              {s.completedTripsCount}
                            </span>
                          </td>

                          {/* Avg Transit */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <span className="fo-duration-tag">
                              <Clock size={11} />
                              {s.avgTripDurationMinutes}m
                            </span>
                          </td>

                          {/* Detention Logs */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span className="font-mono" style={{ fontSize: 12, color: 'var(--fo-text)' }}>
                                {s.totalWaitingTimeMinutes}m total
                              </span>
                              {hasSlaBreach ? (
                                <span className="fo-duration-tag alert" style={{ fontSize: 10, padding: '1px 5px' }}>
                                  <AlertTriangle size={10} /> SLA Flagged
                                </span>
                              ) : (
                                <span className="font-mono" style={{ fontSize: 10, color: 'var(--fo-tertiary)' }}>
                                  0 SLA Breaches
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Unloading */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: 'rgba(147, 204, 255, 0.12)',
                                color: 'var(--fo-secondary)',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {s.totalUnloadingTimeMinutes}m ({s.avgUnloadingTimeMinutes}m avg)
                            </span>
                          </td>

                          {/* POD Verified */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <span className="fo-pod-badge">
                              <CheckCircle2 size={12} />
                              <span>100% ({s.completedTripsCount}/{s.completedTripsCount})</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDriverId(s.driverId);
                                setActiveTab('logs');
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 10px',
                                borderRadius: 6,
                                background: 'var(--fo-surface)',
                                border: '1px solid var(--fo-border-subtle)',
                                color: 'var(--fo-primary)',
                                fontWeight: 600,
                                fontSize: 11,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span>Ledger</span>
                              <ChevronRight size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {summaries.length > 0 ? (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--fo-border-subtle)' }}>
                <Pagination
                  meta={{ page: matrixPage, pageSize: matrixPageSize, total: totalMatrixItems, totalPages: totalMatrixPages }}
                  onPageChange={setMatrixPage}
                  onPageSizeChange={(sz) => {
                    setMatrixPageSize(sz);
                    setMatrixPage(1);
                  }}
                  itemLabel="summary"
                />
              </div>
            ) : null}
          </div>
        ) : (
          /* TAB 2: Detailed Trip Logs Table */
          <div
            id="trip-data-section"
            style={{
              background: 'var(--fo-surface-low)',
              border: '1px solid var(--fo-border-subtle)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Section Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--fo-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 className="font-head" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fo-text)' }}>
                  Comprehensive Trip & Loading Logs
                </h3>
                <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(173, 198, 255, 0.15)', color: 'var(--fo-primary)' }}>
                  {records.length} Records
                </span>
              </div>
            </div>

            {logsResource.loading && records.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
                <RotateCw size={20} className="spin" style={{ margin: '0 auto 10px auto' }} />
                Loading trip logs…
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--fo-text-muted)', fontSize: 13 }}>
                No trip records found matching your filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1050 }}>
                  <thead>
                    <tr
                      className="font-mono"
                      style={{
                        backgroundColor: 'var(--fo-canvas)',
                        fontSize: 11,
                        color: 'var(--fo-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--fo-border-subtle)',
                      }}
                    >
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>DRIVER & VEHICLE</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>STATUS</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>DEPARTURE & ARRIVAL</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>START & END ADDRESS</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>DURATION & DETENTION</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>PROOF PHOTOS</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: 12 }}>
                    {paginatedRecords.map((rec, idx) => {
                      const isEven = idx % 2 === 0;
                      const isLongTrip = (rec.tripDurationMinutes ?? 0) > 240;
                      const isHighUnloading = (rec.unloadingDurationMinutes ?? 0) > 120;
                      const mapsStartUrl = rec.tripStartLatitude
                        ? `https://www.google.com/maps?q=${rec.tripStartLatitude},${rec.tripStartLongitude}`
                        : null;
                      const mapsCompletedUrl = rec.tripCompletedLatitude
                        ? `https://www.google.com/maps?q=${rec.tripCompletedLatitude},${rec.tripCompletedLongitude}`
                        : null;

                      return (
                        <tr
                          key={rec.id}
                          style={{
                            backgroundColor: isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)',
                            borderBottom: '1px solid rgba(66, 71, 84, 0.2)',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--fo-surface)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isEven ? 'var(--fo-surface-low)' : 'var(--fo-canvas)')}
                        >
                          {/* Driver & Vehicle */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--fo-text)', fontSize: 13 }}>
                              {rec.driverName || 'Driver'}
                            </div>
                            {rec.vehiclePlate ? (
                              <span className="fo-vehicle-plate-badge" style={{ marginTop: 3 }}>
                                {rec.vehiclePlate}
                              </span>
                            ) : null}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {rec.status === 'TRIP_COMPLETED' ? (
                              <span className="fo-pod-badge">
                                <CheckCircle2 size={12} /> TRIP COMPLETED
                              </span>
                            ) : rec.status === 'UNLOADING' ? (
                              <span className="fo-duration-tag warn">
                                <span className="fo-ping-dot" style={{ width: 6, height: 6 }} /> UNLOADING
                              </span>
                            ) : rec.status === 'TRIP_STARTED' ? (
                              <span className="fo-duration-tag" style={{ color: 'var(--fo-tertiary)' }}>
                                <span className="fo-ping-dot" style={{ width: 6, height: 6 }} /> TRIP STARTED
                              </span>
                            ) : rec.status === 'COMPLETED' ? (
                              <span className="fo-duration-tag" style={{ color: 'var(--fo-primary)' }}>
                                LOADING DONE
                              </span>
                            ) : (
                              <span className="fo-duration-tag warn">REACHED</span>
                            )}
                          </td>

                          {/* Departure & Arrival */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div className="font-mono" style={{ fontSize: 11 }}>
                              {rec.tripStartedAt && (
                                <div>
                                  <span style={{ color: 'var(--fo-text-muted)' }}>Started: </span>
                                  <span style={{ color: 'var(--fo-text)' }}>{formatDateTime(rec.tripStartedAt)}</span>
                                </div>
                              )}
                              {rec.tripCompletedAt ? (
                                <div style={{ marginTop: 2 }}>
                                  <span style={{ color: 'var(--fo-text-muted)' }}>End: </span>
                                  <span style={{ color: 'var(--fo-text)' }}>{formatDateTime(rec.tripCompletedAt)}</span>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ color: 'var(--fo-text-muted)' }}>Arrived: </span>
                                  <span style={{ color: 'var(--fo-text)' }}>{formatDateTime(rec.reachedAt)}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Start & End Address */}
                          <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                            {rec.tripStartAddress ? (
                              <div style={{ marginBottom: 4, fontSize: 11 }}>
                                <strong style={{ color: 'var(--fo-text)' }}>Start: </strong>
                                <span style={{ color: 'var(--fo-text-muted)' }}>{rec.tripStartAddress}</span>
                                {mapsStartUrl && (
                                  <a href={mapsStartUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: 'var(--fo-primary)' }}>
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            ) : null}

                            {rec.tripCompletedAddress ? (
                              <div style={{ fontSize: 11 }}>
                                <strong style={{ color: 'var(--fo-text)' }}>End: </strong>
                                <span style={{ color: 'var(--fo-text-muted)' }}>{rec.tripCompletedAddress}</span>
                                {mapsCompletedUrl && (
                                  <a href={mapsCompletedUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: 'var(--fo-primary)' }}>
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--fo-text-muted)', fontSize: 11 }}>{rec.reachedAddress || rec.locationName || '—'}</span>
                            )}
                          </td>

                          {/* Duration & Detention */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {formatHms(rec.tripStartedAt, rec.tripCompletedAt, rec.formattedTripDuration) && (
                                <span className={`fo-duration-tag ${isLongTrip ? 'alert' : ''}`}>
                                  <Clock size={11} />
                                  Trip: {formatHms(rec.tripStartedAt, rec.tripCompletedAt, rec.formattedTripDuration)}
                                </span>
                              )}

                              {formatHms(rec.tripCompletedAt, rec.unloadingCompletedAt, rec.formattedUnloadingDuration) && (
                                <span className={`fo-duration-tag ${isHighUnloading ? 'warn' : ''}`}>
                                  Unload: {formatHms(rec.tripCompletedAt, rec.unloadingCompletedAt, rec.formattedUnloadingDuration)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Proof Photos */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {rec.tripCompletedPhotoUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: rec.tripCompletedPhotoUrl!,
                                      title: `Trip Completion Proof — ${rec.driverName || 'Driver'}`,
                                      address: rec.tripCompletedAddress,
                                    })
                                  }
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    background: 'var(--fo-surface)',
                                    border: '1px solid var(--fo-border-subtle)',
                                    color: 'var(--fo-text)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <ImageIcon size={11} /> Trip End
                                </button>
                              )}

                              {rec.unloadingPhotoUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedPhoto({
                                      url: rec.unloadingPhotoUrl!,
                                      title: `Unloading Proof — ${rec.driverName || 'Driver'}`,
                                      address: rec.unloadingAddress,
                                    })
                                  }
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    background: 'var(--fo-surface)',
                                    border: '1px solid var(--fo-border-subtle)',
                                    color: 'var(--fo-text)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <ImageIcon size={11} /> Unloading
                                </button>
                              )}

                              {!rec.tripCompletedPhotoUrl && !rec.unloadingPhotoUrl && (
                                <span style={{ color: 'var(--fo-text-muted)' }}>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {records.length > 0 ? (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--fo-border-subtle)' }}>
                <Pagination
                  meta={{ page: logsPage, pageSize: logsPageSize, total: totalLogsItems, totalPages: totalLogsPages }}
                  onPageChange={setLogsPage}
                  onPageSizeChange={(sz) => {
                    setLogsPageSize(sz);
                    setLogsPage(1);
                  }}
                  itemLabel="trip record"
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Proof Photo Lightbox Modal - Centered Popup Modal via Portal */}
        {selectedPhoto &&
          createPortal(
            <div
              className="fo-proof-modal-backdrop"
              onClick={() => setSelectedPhoto(null)}
            >
              <div
                className="fo-proof-modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'relative',
                  margin: 'auto',
                }}
              >
                {/* Modal Header */}
                <div
                  style={{
                    padding: '16px 22px',
                    borderBottom: '1px solid var(--fo-border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--fo-surface-low)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: 'rgba(173, 198, 255, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ImageIcon size={18} color="var(--fo-primary)" />
                    </div>
                    <div>
                      <h3 className="font-head" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fo-text)' }}>
                        {selectedPhoto.title}
                      </h3>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--fo-tertiary)' }}>
                        Official Field Photographic Dossier
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    style={{
                      background: 'var(--fo-surface-highest)',
                      border: '1px solid var(--fo-border-subtle)',
                      borderRadius: 6,
                      color: 'var(--fo-text)',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}
                    title="Close (Esc)"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Modal Body with Centered Photo */}
                <div style={{ padding: '24px', textAlign: 'center', background: 'var(--fo-canvas)' }}>
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      maxWidth: '100%',
                      background: 'var(--fo-surface-low)',
                      borderRadius: 10,
                      border: '1px solid var(--fo-border-subtle)',
                      padding: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    <img
                      src={selectedPhoto.url}
                      alt="Proof preview"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '60vh',
                        borderRadius: 6,
                        display: 'block',
                        objectFit: 'contain',
                        margin: '0 auto',
                      }}
                    />
                  </div>

                  {selectedPhoto.address && (
                    <div
                      className="font-mono"
                      style={{
                        marginTop: 16,
                        padding: '10px 16px',
                        borderRadius: 8,
                        background: 'var(--fo-surface-low)',
                        border: '1px solid var(--fo-border-subtle)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: 'var(--fo-text)',
                        maxWidth: '90%',
                      }}
                    >
                      <MapPin size={16} color="var(--fo-primary)" style={{ flexShrink: 0 }} />
                      <span style={{ textAlign: 'left' }}>{selectedPhoto.address}</span>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(selectedPhoto.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--fo-primary)', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, textDecoration: 'none', fontWeight: 600 }}
                      >
                        <span>Open Maps</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--fo-border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 10,
                    background: 'var(--fo-surface-low)',
                  }}
                >
                  <a
                    href={selectedPhoto.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 6,
                      background: 'var(--fo-surface)',
                      border: '1px solid var(--fo-border-subtle)',
                      color: 'var(--fo-primary)',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>Open Full Image</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 6,
                      background: 'var(--fo-primary)',
                      color: '#001a42',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
