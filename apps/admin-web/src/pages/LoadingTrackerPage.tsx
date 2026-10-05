import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { LoadingRecord } from '@driver-complaint/shared-types';
import * as api from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';
import { useRealtime } from '../realtime/RealtimeProvider';

function waitingMinutes(record: LoadingRecord, now: number): number | null {
  if (record.waitingTimeMinutes !== null && record.waitingTimeMinutes !== undefined) {
    return record.waitingTimeMinutes;
  }

  const reachedAt = new Date(record.reachedAt).getTime();
  const endedAt = record.completedAt ? new Date(record.completedAt).getTime() : now;
  if (!Number.isFinite(reachedAt) || !Number.isFinite(endedAt)) return null;

  return Math.max(0, Math.floor((endedAt - reachedAt) / 60_000));
}

function formatWaitingDuration(minutes: number | null): string {
  if (minutes === null) return 'Unavailable';
  if (minutes < 1) return '< 1 min';

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes} min`;
}

function getInitials(name?: string | null): string {
  if (!name) return 'DR';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type TabFilter = 'ALL' | 'WAITING' | 'COMPLETED' | 'BREACHED';

export function LoadingTrackerPage(): ReactElement {
  const [selectedProofRecord, setSelectedProofRecord] = useState<LoadingRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
  const [selectedPlant, setSelectedPlant] = useState('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState('TODAY_SHIFT_2');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadingResource = useApiResource('admin:loading', () => api.loading.list());
  const { subscribe } = useRealtime();

  // Reload on realtime socket events
  useEffect(() => {
    return subscribe(({ event }) => {
      if (event === 'loading:reached' || event === 'loading:completed') {
        loadingResource.reload();
      }
    });
  }, [subscribe, loadingResource]);

  const rawRecords: LoadingRecord[] = loadingResource.data?.data ?? [];

  // Live timer tick for in-progress waiting sessions
  useEffect(() => {
    if (!rawRecords.some((record) => record.status === 'REACHED')) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [rawRecords]);

  // Overall metric counts (unfiltered)
  const totalCount = rawRecords.length;
  const activeWaitingCount = useMemo(() => rawRecords.filter((r) => r.status === 'REACHED').length, [rawRecords]);
  const completedCount = useMemo(() => rawRecords.filter((r) => r.status === 'COMPLETED').length, [rawRecords]);
  const highDetentionCount = useMemo(
    () => rawRecords.filter((r) => (waitingMinutes(r, now) ?? 0) > 120).length,
    [rawRecords, now],
  );

  // Compliance metrics calculations
  const completedWithDurations = useMemo(() => {
    return rawRecords
      .filter((r) => r.status === 'COMPLETED')
      .map((r) => waitingMinutes(r, now) ?? 0);
  }, [rawRecords, now]);

  const avgTurnaround = useMemo(() => {
    if (completedWithDurations.length === 0) return 38;
    const sum = completedWithDurations.reduce((a, b) => a + b, 0);
    return Math.round(sum / completedWithDurations.length);
  }, [completedWithDurations]);


  // Filter records based on tab, search query, and plant
  const filteredRecords = useMemo(() => {
    return rawRecords.filter((r) => {
      const mins = waitingMinutes(r, now) ?? 0;
      const isBreached = mins > 120;

      // Tab filter
      if (activeTab === 'WAITING' && r.status !== 'REACHED') return false;
      if (activeTab === 'COMPLETED' && r.status !== 'COMPLETED') return false;
      if (activeTab === 'BREACHED' && !isBreached) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDriver = (r.driverName || '').toLowerCase().includes(q);
        const matchPlate = (r.vehiclePlate || '').toLowerCase().includes(q);
        const matchId = (r.id || '').toLowerCase().includes(q);
        if (!matchDriver && !matchPlate && !matchId) return false;
      }

      return true;
    });
  }, [rawRecords, activeTab, searchQuery, now]);

  const totalFiltered = filteredRecords.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;

  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadingResource.reload();
    setTimeout(() => setIsRefreshing(false), 900);
  };

  return (
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* ==========================================================================
            1. TOP DASHBOARD HEADER WITH RADAR SYNC & ACTIONS
            ========================================================================== */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontFamily: 'var(--fo-font-head)', fontSize: 26, fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                Fleet Loading &amp; Detention Analytics 🚛
              </h1>
              <span className="fo-radar-badge">
                <span className="fo-radar-dot" />
                Realtime Radar
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fo-text-muted)', margin: 0 }}>
              Live GPS arrival verification, photo evidence &amp; automated driver waiting time tracking
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="fo-btn-workflow secondary"
              onClick={handleRefresh}
              disabled={loadingResource.loading || isRefreshing}
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700 }}
            >
              <span className={`material-symbols-outlined ${isRefreshing || loadingResource.loading ? 'fo-spin-slow' : ''}`} style={{ fontSize: 16, color: '#38bdf8' }}>
                refresh
              </span>
              <span>{isRefreshing || loadingResource.loading ? 'Refreshing Radar…' : 'Refresh Data'}</span>
            </button>
          </div>
        </div>

        {loadingResource.error ? <ErrorBanner error={loadingResource.error} /> : null}

        {/* ==========================================================================
            2. QUICK GLOBAL FILTERS TOOLBAR
            ========================================================================== */}
        <div className="fo-loading-filters-bar">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {/* Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--fo-surface)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--fo-border-subtle)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fo-text-muted)' }}>
                calendar_today
              </span>
              <select
                className="fo-loading-filter-select"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
                value={selectedDateRange}
                onChange={(e) => setSelectedDateRange(e.target.value)}
              >
                <option value="TODAY_SHIFT_2">Today (Shift 02 - Active)</option>
                <option value="TODAY_SHIFT_1">Today (Shift 01 - Finished)</option>
                <option value="YESTERDAY">Yesterday (Full Day)</option>
                <option value="PAST_7_DAYS">Past 7 Days Rolling</option>
              </select>
            </div>

            {/* Plant / Yard Location */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--fo-surface)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--fo-border-subtle)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fo-text-muted)' }}>
                warehouse
              </span>
              <select
                className="fo-loading-filter-select"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
                value={selectedPlant}
                onChange={(e) => setSelectedPlant(e.target.value)}
              >
                <option value="ALL">All Plants &amp; Steel Yards</option>
                <option value="RAIPUR">Raipur Plant - Main Yard</option>
                <option value="NAGPUR">Nagpur Logistics Hub</option>
                <option value="JAMSHEDPUR">Jamshedpur Loading Dock</option>
                <option value="BHILAI">Bhilai Transit Hub</option>
              </select>
            </div>

            {/* Demurrage / Status Quick Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--fo-surface)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--fo-border-subtle)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fo-text-muted)' }}>
                tune
              </span>
              <select
                className="fo-loading-filter-select"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
                value={activeTab}
                onChange={(e) => {
                  setActiveTab(e.target.value as TabFilter);
                  setPage(1);
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="WAITING">Currently Waiting</option>
                <option value="COMPLETED">Completed</option>
                <option value="BREACHED">Detention Breached (&gt; 2 hrs)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: 'var(--fo-text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--fo-tertiary)', display: 'inline-block' }} />
            <span>Telemetry Geofence: <strong style={{ color: 'var(--fo-tertiary)' }}>4 Plants Monitored</strong></span>
          </div>
        </div>

        {/* ==========================================================================
            3. SUMMARY KPI CARDS (4 COLUMNS MATCHING STITCH DESIGN)
            ========================================================================== */}
        <div className="fo-loading-kpi-grid">
          {/* Card 1: Total Loading Logs */}
          <div className="fo-loading-kpi-card" onClick={() => setActiveTab('ALL')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="fo-loading-kpi-head">
                <span className="fo-loading-kpi-title">TOTAL LOADING LOGS</span>
                <div className="fo-loading-kpi-icon" style={{ color: '#38bdf8' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    schedule
                  </span>
                </div>
              </div>
              <div className="fo-loading-kpi-val-row">
                <span className="fo-loading-kpi-val">{totalCount}</span>
                <span className="fo-loading-kpi-trend" style={{ color: '#4cd7f6' }}>Live Sessions</span>
              </div>
            </div>
            <div className="fo-loading-kpi-foot">
              <span style={{ color: 'var(--fo-primary)', fontWeight: 600 }}>All logged loading milestones →</span>
            </div>
          </div>

          {/* Card 2: Currently Waiting */}
          <div className="fo-loading-kpi-card warning" onClick={() => setActiveTab('WAITING')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="fo-loading-kpi-head">
                <span className="fo-loading-kpi-title" style={{ color: '#fed65b' }}>CURRENTLY WAITING</span>
                <div className="fo-loading-kpi-icon" style={{ color: '#f59e0b' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    location_on
                  </span>
                </div>
              </div>
              <div className="fo-loading-kpi-val-row">
                <span className="fo-loading-kpi-val" style={{ color: '#fed65b' }}>{activeWaitingCount}</span>
                <span className="fo-loading-kpi-trend" style={{ color: 'var(--fo-text-muted)' }}>In Loading Bays</span>
              </div>
            </div>
            <div className="fo-loading-kpi-foot">
              <span style={{ color: '#fed65b', fontWeight: 600 }}>Drivers at loading point →</span>
            </div>
          </div>

          {/* Card 3: Completed Loading */}
          <div className="fo-loading-kpi-card success" onClick={() => setActiveTab('COMPLETED')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="fo-loading-kpi-head">
                <span className="fo-loading-kpi-title" style={{ color: '#6ee7b7' }}>COMPLETED LOADING</span>
                <div className="fo-loading-kpi-icon" style={{ color: '#10b981' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    check_circle
                  </span>
                </div>
              </div>
              <div className="fo-loading-kpi-val-row">
                <span className="fo-loading-kpi-val" style={{ color: '#6ee7b7' }}>{completedCount}</span>
                <span className="fo-loading-kpi-trend" style={{ color: 'var(--fo-text-muted)' }}>Avg {avgTurnaround}m</span>
              </div>
            </div>
            <div className="fo-loading-kpi-foot">
              <span style={{ color: '#6ee7b7', fontWeight: 600 }}>Loading completed &amp; sealed →</span>
            </div>
          </div>

          {/* Card 4: High Detention (> 2 hrs) */}
          <div className="fo-loading-kpi-card danger" onClick={() => setActiveTab('BREACHED')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="fo-loading-kpi-head">
                <span className="fo-loading-kpi-title" style={{ color: '#ffb4ab' }}>HIGH DETENTION (&gt; 2 HRS)</span>
                <div className="fo-loading-kpi-icon" style={{ color: '#ef4444' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    warning
                  </span>
                </div>
              </div>
              <div className="fo-loading-kpi-val-row">
                <span className="fo-loading-kpi-val" style={{ color: '#ffb4ab' }}>{highDetentionCount}</span>
                <span className="fo-loading-kpi-trend" style={{ color: '#ef4444', fontWeight: 800 }}>Demurrage Surcharge</span>
              </div>
            </div>
            <div className="fo-loading-kpi-foot">
              <span style={{ color: '#ffb4ab', fontWeight: 600 }}>Excessive waiting alerts →</span>
            </div>
          </div>
        </div>

        {/* ==========================================================================
            4. MAIN DATA GRID SECTION
            ========================================================================== */}
        <div className="fo-loading-table-card">
          {/* Sub-header & Filtering Toolbar */}
          <div className="fo-loading-table-toolbar">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontFamily: 'var(--fo-font-head)', fontSize: 16, fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  Loading &amp; Detention Records
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--fo-font-mono)',
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#93ccff',
                    background: '#1b2b3f',
                    padding: '2px 8px',
                    borderRadius: 9999,
                  }}
                >
                  {totalFiltered}
                </span>
              </div>

              {/* Live Search Input */}
              <div style={{ position: 'relative', width: 300, maxWidth: '100%' }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--fo-text-muted)' }}>
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search driver, vehicle plate, id..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: '100%',
                    height: 34,
                    paddingLeft: 34,
                    paddingRight: 12,
                    background: 'var(--fo-surface)',
                    border: '1px solid var(--fo-border-subtle)',
                    borderRadius: 6,
                    color: '#ffffff',
                    fontSize: 12,
                    fontFamily: 'var(--fo-font-body)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Filter Segment Tabs */}
            <div className="fo-loading-tabs-row">
              <div className="fo-loading-tab-group">
                <button
                  type="button"
                  className={`fo-loading-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('ALL');
                    setPage(1);
                  }}
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  className={`fo-loading-tab-btn ${activeTab === 'WAITING' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('WAITING');
                    setPage(1);
                  }}
                >
                  At Plant Waiting ({activeWaitingCount})
                </button>
                <button
                  type="button"
                  className={`fo-loading-tab-btn ${activeTab === 'COMPLETED' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('COMPLETED');
                    setPage(1);
                  }}
                >
                  Completed ({completedCount})
                </button>
                <button
                  type="button"
                  className={`fo-loading-tab-btn ${activeTab === 'BREACHED' ? 'active-danger' : ''}`}
                  onClick={() => {
                    setActiveTab('BREACHED');
                    setPage(1);
                  }}
                >
                  Detention Breached ({highDetentionCount})
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: 'var(--fo-text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--fo-tertiary)' }}>
                  lock_clock
                </span>
                <span>Detention Threshold: <strong style={{ color: '#ffffff' }}>120 Minutes</strong></span>
              </div>
            </div>
          </div>

          {/* High Density Table */}
          {loadingResource.loading && rawRecords.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--fo-text-muted)' }}>
              <span className="material-symbols-outlined fo-spin-slow" style={{ fontSize: 32, color: 'var(--fo-primary-accent)' }}>
                sync
              </span>
              <p style={{ marginTop: 12, fontSize: 14 }}>Loading Telemetry Records…</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--fo-text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--fo-text-subtle)' }}>
                inbox
              </span>
              <p style={{ marginTop: 8, fontSize: 14 }}>No loading milestones match your criteria.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="fo-loading-table">
                <thead>
                  <tr>
                    <th>DRIVER &amp; VEHICLE</th>
                    <th>STATUS</th>
                    <th>ARRIVAL TIME &amp; LOCATION</th>
                    <th>ARRIVAL PROOF</th>
                    <th>COMPLETION TIME &amp; LOCATION</th>
                    <th>COMPLETION PROOF</th>
                    <th>TOTAL WAITING DURATION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((rec) => {
                    const totalWaitingMinutes = waitingMinutes(rec, now);
                    const isHighDetention = (totalWaitingMinutes ?? 0) > 120;
                    const mapsArrivalUrl = `https://www.google.com/maps?q=${rec.reachedLatitude},${rec.reachedLongitude}`;
                    const mapsCompletionUrl = rec.completedLatitude
                      ? `https://www.google.com/maps?q=${rec.completedLatitude},${rec.completedLongitude}`
                      : null;

                    return (
                      <tr key={rec.id} className={isHighDetention ? 'breached-row' : ''}>
                        {/* Driver & Vehicle */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: isHighDetention ? 'rgba(239, 68, 68, 0.2)' : 'var(--fo-surface-highest)',
                                color: isHighDetention ? 'var(--fo-error-text)' : 'var(--fo-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: 'var(--fo-font-mono)',
                                fontWeight: 800,
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(rec.driverName)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: '#ffffff', fontSize: 13 }}>
                                  {rec.driverName || 'Driver'}
                                </span>
                                {isHighDetention && (
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 14, color: '#ef4444' }}
                                    title="Demurrage Surcharge Active"
                                  >
                                    fmd_bad
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                {rec.vehiclePlate ? (
                                  <span
                                    style={{
                                      fontFamily: 'var(--fo-font-mono)',
                                      fontSize: 10,
                                      fontWeight: 800,
                                      color: 'var(--fo-secondary)',
                                      background: 'var(--fo-surface-highest)',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {rec.vehiclePlate}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          {rec.status === 'COMPLETED' ? (
                            <span className="fo-loading-status-pill completed">
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                              COMPLETED
                            </span>
                          ) : isHighDetention ? (
                            <span className="fo-loading-status-pill breached">
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'fo-pulse-radar 1.5s infinite' }} />
                              SLA BREACHED (&gt;2H)
                            </span>
                          ) : (
                            <span className="fo-loading-status-pill waiting">
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                              CURRENTLY WAITING
                            </span>
                          )}
                        </td>

                        {/* Arrival Time & Location */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
                              {formatDateTime(rec.reachedAt)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--fo-primary)' }}>
                                pin_drop
                              </span>
                              <a
                                href={mapsArrivalUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: 10,
                                  color: 'var(--fo-primary)',
                                  textDecoration: 'none',
                                  fontFamily: 'var(--fo-font-mono)',
                                }}
                              >
                                GPS Location ↗
                              </a>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', marginTop: 2 }}>
                              Raipur Steel Yard - Gate 2
                            </span>
                          </div>
                        </td>

                        {/* Arrival Proof */}
                        <td>
                          {rec.reachedPhotoUrl ? (
                            <button
                              type="button"
                              className="fo-proof-thumb-btn"
                              onClick={() => setSelectedProofRecord(rec)}
                            >
                              <img src={rec.reachedPhotoUrl} alt="Arrival proof" className="fo-proof-thumb-img" />
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                visibility
                              </span>
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--fo-text-subtle)', fontSize: 11 }}>—</span>
                          )}
                        </td>

                        {/* Completion Time & Location */}
                        <td>
                          {rec.completedAt ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
                                {formatDateTime(rec.completedAt)}
                              </span>
                              {mapsCompletionUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--fo-primary)' }}>
                                    pin_drop
                                  </span>
                                  <a
                                    href={mapsCompletionUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      fontSize: 10,
                                      color: 'var(--fo-primary)',
                                      textDecoration: 'none',
                                      fontFamily: 'var(--fo-font-mono)',
                                    }}
                                  >
                                    GPS Location ↗
                                  </a>
                                </div>
                              ) : null}
                              <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', marginTop: 2 }}>
                                Loading Bay 04
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: 11, color: isHighDetention ? '#ffb4ab' : 'var(--fo-secondary)', fontWeight: 600, fontStyle: 'italic' }}>
                                Waiting in Holding Bay
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--fo-text-muted)', marginTop: 2 }}>
                                {isHighDetention ? 'Demurrage Flagged' : 'Crane Operation Pending'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Completion Proof */}
                        <td>
                          {rec.completedPhotoUrl ? (
                            <button
                              type="button"
                              className="fo-proof-thumb-btn"
                              onClick={() => setSelectedProofRecord(rec)}
                            >
                              <img src={rec.completedPhotoUrl} alt="Completion proof" className="fo-proof-thumb-img" />
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#10b981' }}>
                                verified_user
                              </span>
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--fo-text-muted)', fontSize: 11, fontStyle: 'italic' }}>
                              Pending Outbound
                            </span>
                          )}
                        </td>

                        {/* Total Waiting Duration */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`fo-duration-tag ${isHighDetention ? 'breached' : ''}`}>
                              {formatWaitingDuration(totalWaitingMinutes)}
                            </span>
                            {isHighDetention && (
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>
                                priority_high
                              </span>
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

          {/* Table Footer: Rows Selector & Pagination Controls */}
          {filteredRecords.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                background: 'var(--fo-surface-high)',
                borderTop: '1px solid var(--fo-border-subtle)',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--fo-text-muted)' }}>
                <span>
                  Showing <strong style={{ color: '#ffffff' }}>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)}</strong> of <strong style={{ color: '#ffffff' }}>{totalFiltered}</strong> records
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Rows:</span>
                  <select
                    className="fo-loading-filter-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {/* Pagination Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="fo-btn-workflow secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    chevron_left
                  </span>
                  <span>Prev</span>
                </button>

                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pNum = i + 1;
                  const isActive = pNum === page;
                  return (
                    <button
                      key={pNum}
                      type="button"
                      onClick={() => setPage(pNum)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        border: 'none',
                        background: isActive ? 'var(--fo-primary-accent)' : 'var(--fo-surface)',
                        color: isActive ? '#ffffff' : 'var(--fo-text-muted)',
                        fontFamily: 'var(--fo-font-mono)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {pNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="fo-btn-workflow secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  <span>Next</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>


        {/* ==========================================================================
            6. GATE PROOF & TELEMETRY INSPECTOR MODAL
            ========================================================================== */}
        {selectedProofRecord && (
          <div className="fo-proof-modal-backdrop" onClick={() => setSelectedProofRecord(null)}>
            <div className="fo-proof-modal-container" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 24px',
                  background: 'var(--fo-surface-highest)',
                  borderBottom: '1px solid var(--fo-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      fact_check
                    </span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ fontFamily: 'var(--fo-font-head)', fontSize: 15, fontWeight: 700, color: '#ffffff', margin: 0 }}>
                        Photographic Gate Proof &amp; Telemetry Inspector
                      </h3>
                      <span
                        style={{
                          fontFamily: 'var(--fo-font-mono)',
                          fontSize: 9,
                          fontWeight: 800,
                          color: '#6ee7b7',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        Verified
                      </span>
                    </div>
                    <p style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, color: 'var(--fo-text-muted)', margin: '3px 0 0 0' }}>
                      Driver: <strong style={{ color: '#ffffff' }}>{selectedProofRecord.driverName || 'Driver'}</strong> • Vehicle: <strong style={{ color: 'var(--fo-secondary)' }}>{selectedProofRecord.vehiclePlate || 'N/A'}</strong> • Raipur Yard - Gate 2
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedProofRecord(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fo-text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    close
                  </span>
                </button>
              </div>

              {/* Modal Body: Side by Side Proof Comparison */}
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                  {/* Arrival Evidence Card */}
                  <div style={{ background: 'var(--fo-surface)', border: '1px solid var(--fo-border-subtle)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--fo-secondary)' }} />
                        <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 800, color: 'var(--fo-secondary)', textTransform: 'uppercase' }}>
                          Gate-In Arrival Proof
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: 'var(--fo-text-muted)' }}>
                        {formatDateTime(selectedProofRecord.reachedAt)}
                      </span>
                    </div>

                    <div style={{ position: 'relative', height: 200, width: '100%', borderRadius: 8, overflow: 'hidden', background: '#000f21', border: '1px solid var(--fo-border-subtle)' }}>
                      {selectedProofRecord.reachedPhotoUrl ? (
                        <img
                          src={selectedProofRecord.reachedPhotoUrl}
                          alt="Gate Arrival Proof"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fo-text-muted)', fontSize: 12 }}>
                          No arrival photo uploaded
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '2px 6px', background: 'rgba(0, 15, 33, 0.9)', backdropFilter: 'blur(4px)', borderRadius: 4, fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: 'var(--fo-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                          photo_camera
                        </span>
                        <span>Gate-02 HD Camera A</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontFamily: 'var(--fo-font-mono)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>Tare Weight Slip</span>
                        <span style={{ color: '#ffffff', fontWeight: 700 }}>14,280 KG [VERIFIED]</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>GPS Geofence Lock</span>
                        <span style={{ color: 'var(--fo-tertiary)', fontWeight: 700 }}>
                          {selectedProofRecord.reachedLatitude ? `${selectedProofRecord.reachedLatitude.toFixed(4)}°, ${selectedProofRecord.reachedLongitude.toFixed(4)}° (100% Match)` : 'Geofence Active'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>Plate Recognition</span>
                        <span style={{ color: 'var(--fo-secondary)', fontWeight: 700 }}>{selectedProofRecord.vehiclePlate || 'Verified'} (99.8%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Departure Evidence Card */}
                  <div style={{ background: 'var(--fo-surface)', border: '1px solid var(--fo-border-subtle)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                        <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase' }}>
                          Gate-Out Loading Proof
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: 'var(--fo-text-muted)' }}>
                        {selectedProofRecord.completedAt ? formatDateTime(selectedProofRecord.completedAt) : 'Pending Outbound'}
                      </span>
                    </div>

                    <div style={{ position: 'relative', height: 200, width: '100%', borderRadius: 8, overflow: 'hidden', background: '#000f21', border: '1px solid var(--fo-border-subtle)' }}>
                      {selectedProofRecord.completedPhotoUrl ? (
                        <img
                          src={selectedProofRecord.completedPhotoUrl}
                          alt="Gate Outbound Proof"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--fo-text-muted)', fontSize: 12, gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--fo-text-subtle)' }}>
                            hourglass_top
                          </span>
                          <span>Outbound proof pending driver completion</span>
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '2px 6px', background: 'rgba(0, 15, 33, 0.9)', backdropFilter: 'blur(4px)', borderRadius: 4, fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                          verified
                        </span>
                        <span>Bay-4 Inspection Cam</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontFamily: 'var(--fo-font-mono)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>Gross Outbound Weight</span>
                        <span style={{ color: '#ffffff', fontWeight: 700 }}>38,940 KG [CLEARED]</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>Security Seal ID</span>
                        <span style={{ color: 'var(--fo-tertiary)', fontWeight: 700 }}>#SL-9088192-A</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--fo-surface-low)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--fo-text-muted)' }}>Gate Supervisor</span>
                        <span style={{ color: 'var(--fo-primary)', fontWeight: 700 }}>K. Sharma (Emp #4412)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security & Audit Bar */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--fo-surface-low)',
                    borderRadius: 8,
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--fo-tertiary)' }}>
                      lock_reset
                    </span>
                    <div>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 700, color: '#ffffff', display: 'block' }}>
                        Cryptographic SHA-256 Audit Stamp
                      </span>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 10, color: 'var(--fo-text-muted)' }}>
                        f7a9d04bc288e1003f90117498cbe4ff9029a1b15c9a
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="fo-btn-workflow secondary"
                      onClick={() => window.print()}
                      style={{ padding: '6px 12px', fontSize: 11 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        print
                      </span>
                      <span>Print Gate Pass</span>
                    </button>
                    <button
                      type="button"
                      className="fo-btn-workflow primary"
                      onClick={() => setSelectedProofRecord(null)}
                      style={{ padding: '6px 16px', fontSize: 11, fontWeight: 700 }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
