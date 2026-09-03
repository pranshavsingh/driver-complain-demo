import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { LoadingRecord } from '@driver-complaint/shared-types';
import { Clock, MapPin, CheckCircle2, AlertTriangle, RotateCw, ExternalLink, ImageIcon } from '../components/Icons';
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

export function LoadingTrackerPage(): ReactElement {
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  const records: LoadingRecord[] = loadingResource.data?.data ?? [];

  // A waiting session has no completion timestamp yet. Keep its displayed duration live
  // rather than waiting for the driver to complete loading before showing a value.
  useEffect(() => {
    if (!records.some((record) => record.status === 'REACHED')) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [records]);

  const activeWaitingCount = useMemo(() => records.filter((r) => r.status === 'REACHED').length, [records]);
  const completedCount = useMemo(() => records.filter((r) => r.status === 'COMPLETED').length, [records]);
  const highDetentionCount = useMemo(
    () => records.filter((record) => (waitingMinutes(record, now) ?? 0) > 120).length,
    [records, now],
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fleet Loading & Detention Analytics 🚛</h1>
          <p className="page-subtitle">
            Live GPS arrival verification, photo evidence & automated driver waiting time tracking
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => loadingResource.reload()}
          disabled={loadingResource.loading}
        >
          <RotateCw size={14} style={{ marginRight: 6 }} className={loadingResource.loading ? 'spin' : ''} />
          {loadingResource.loading ? 'Refreshing…' : 'Refresh Data'}
        </button>
      </div>

      <ErrorBanner error={loadingResource.error} />

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Loading Logs</span>
            <Clock size={22} color="#1d4ed8" />
          </div>
          <div className="stat-card-value">{records.length}</div>
          <div className="stat-card-footer">All logged loading sessions</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-card-title">Currently Waiting</span>
            <MapPin size={22} color="#d97706" />
          </div>
          <div className="stat-card-value">{activeWaitingCount}</div>
          <div className="stat-card-footer">Drivers at loading point</div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-card-header">
            <span className="stat-card-title">Completed Loading</span>
            <CheckCircle2 size={22} color="#16a34a" />
          </div>
          <div className="stat-card-value">{completedCount}</div>
          <div className="stat-card-footer">Loading finished</div>
        </div>

        <div className="stat-card stat-danger">
          <div className="stat-card-header">
            <span className="stat-card-title">High Detention (&gt; 2 hrs)</span>
            <AlertTriangle size={22} color="#dc2626" />
          </div>
          <div className="stat-card-value">{highDetentionCount}</div>
          <div className="stat-card-footer">Excessive waiting alerts</div>
        </div>
      </div>

      {/* Data Table */}
      <div className="table-card">
        <div className="table-card-header">
          <h2 className="table-card-title">
            Loading & Detention Records
            <span className="badge-pill">{records.length}</span>
          </h2>
        </div>

        {loadingResource.loading && records.length === 0 ? (
          <div className="loading-state">Loading records…</div>
        ) : records.length === 0 ? (
          <div className="empty-table-state">
            <p>No loading milestones recorded yet. Drivers can record arrival from the mobile app.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Driver & Vehicle</th>
                  <th>Status</th>
                  <th>Arrival Time & Location</th>
                  <th>Arrival Proof</th>
                  <th>Completion Time & Location</th>
                  <th>Completion Proof</th>
                  <th>Total Waiting Duration</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => {
                  const totalWaitingMinutes = waitingMinutes(rec, now);
                  const isHighDetention = (totalWaitingMinutes ?? 0) > 120;
                  const mapsUrl = `https://www.google.com/maps?q=${rec.reachedLatitude},${rec.reachedLongitude}`;

                  return (
                    <tr key={rec.id}>
                      <td>
                        <div style={{ fontWeight: '600', color: '#0f172a' }}>
                          {rec.driverName || 'Driver'}
                        </div>
                        {rec.vehiclePlate ? (
                          <span className="vehicle-badge">{rec.vehiclePlate}</span>
                        ) : null}
                      </td>

                      <td>
                        {rec.status === 'REACHED' ? (
                          <span className="status-badge badge-warning">
                            <span className="pulsing-dot" /> LOADING IN PROGRESS
                          </span>
                        ) : (
                          <span className="status-badge badge-success">COMPLETED</span>
                        )}
                      </td>

                      <td>
                        <div style={{ fontSize: '13px', fontWeight: '500' }}>
                          {formatDateTime(rec.reachedAt)}
                        </div>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '12px',
                            color: '#2563eb',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            marginTop: 2,
                          }}
                        >
                          <MapPin size={12} /> GPS Location <ExternalLink size={10} />
                        </a>
                      </td>

                      <td>
                        {rec.reachedPhotoUrl ? (
                          <button
                            type="button"
                            className="photo-thumb-btn"
                            onClick={() =>
                              setSelectedPhoto({
                                url: rec.reachedPhotoUrl,
                                title: `Arrival Proof — ${rec.driverName || 'Driver'}`,
                              })
                            }
                          >
                            <img src={rec.reachedPhotoUrl} alt="Arrival proof" className="thumb-img" />
                            <span className="thumb-label">
                              <ImageIcon size={11} /> View Proof
                            </span>
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      <td>
                        {rec.completedAt ? (
                          <>
                            <div style={{ fontSize: '13px', fontWeight: '500' }}>
                              {formatDateTime(rec.completedAt)}
                            </div>
                            {rec.completedLatitude ? (
                              <a
                                href={`https://www.google.com/maps?q=${rec.completedLatitude},${rec.completedLongitude}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: '12px',
                                  color: '#2563eb',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  marginTop: 2,
                                }}
                              >
                                <MapPin size={12} /> GPS Location <ExternalLink size={10} />
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">Pending</span>
                        )}
                      </td>

                      <td>
                        {rec.completedPhotoUrl ? (
                          <button
                            type="button"
                            className="photo-thumb-btn"
                            onClick={() =>
                              setSelectedPhoto({
                                url: rec.completedPhotoUrl!,
                                title: `Completion Proof — ${rec.driverName || 'Driver'}`,
                              })
                            }
                          >
                            <img src={rec.completedPhotoUrl} alt="Completion proof" className="thumb-img" />
                            <span className="thumb-label">
                              <ImageIcon size={11} /> View Proof
                            </span>
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      <td>
                        {rec.status === 'REACHED' ? (
                          <span className="waiting-timer-pill">
                            <Clock size={12} /> {formatWaitingDuration(totalWaitingMinutes)} · Live
                          </span>
                        ) : (
                          <span
                            className={`duration-pill ${isHighDetention ? 'high-detention' : ''}`}
                          >
                            {formatWaitingDuration(totalWaitingMinutes)}
                            {isHighDetention ? ' (High Delay)' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhoto ? (
        <div className="modal-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedPhoto.title}</h3>
              <button type="button" className="close-btn" onClick={() => setSelectedPhoto(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <img src={selectedPhoto.url} alt="Proof preview" className="full-proof-img" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
