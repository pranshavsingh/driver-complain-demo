import { useState, useMemo, type ReactElement } from 'react';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { formatDateTime } from '../lib/format';
import { Fuel, Download, RotateCw, Search, X, ExternalLink, ImageIcon, ClipboardList } from '../components/Icons';

export function FuelLogsPage(): ReactElement {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);

  const vehiclesRes = useApiResource('admin:vehicles', () => api.vehicles.list());
  const statsRes = useApiResource(
    `admin:fuel:stats:${startDate}:${endDate}:${vehicleId}`,
    () => api.fuel.stats({ startDate: startDate || undefined, endDate: endDate || undefined, vehicleId: vehicleId || undefined }),
  );
  const logsRes = useApiResource(
    `admin:fuel:list:${typeFilter}:${vehicleId}:${startDate}:${endDate}:${page}:${pageSize}`,
    () =>
      api.fuel.list({
        type: typeFilter || undefined,
        vehicleId: vehicleId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: pageSize,
      }),
  );

  const vehicles = vehiclesRes.data ?? [];
  const stats = statsRes.data ?? {
    totalFuelCost: 0,
    totalDefCost: 0,
    totalFuelVolumeLtr: 0,
    totalDefVolumeLtr: 0,
    totalEntriesCount: 0,
  };

  const rawLogs = logsRes.data?.data ?? [];
  const totalItems = logsRes.data?.total ?? 0;
  const totalPages = logsRes.data?.totalPages ?? 1;

  // Filter search locally if search text entered
  const filteredLogs = useMemo(() => {
    if (!search.trim()) return rawLogs;
    const term = search.toLowerCase();
    return rawLogs.filter((item: any) => {
      const driverName = item.driver?.user
        ? `${item.driver.user.firstName} ${item.driver.user.lastName}`.toLowerCase()
        : '';
      const empId = item.driver?.user?.employeeId?.toLowerCase() ?? '';
      const plate = item.vehicle?.plateNumber?.toLowerCase() ?? '';
      return driverName.includes(term) || empId.includes(term) || plate.includes(term);
    });
  }, [rawLogs, search]);

  const handleExportCsv = () => {
    void api.fuel.exportCsv({
      type: typeFilter || undefined,
      vehicleId: vehicleId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleRefresh = () => {
    statsRes.reload();
    logsRes.reload();
  };

  const handleClearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setVehicleId('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const isFiltered = Boolean(search || typeFilter || vehicleId || startDate || endDate);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Fuel size={24} color="#15803d" /> Fuel & DEF Management & Logs
          </h1>
          <p className="page-subtitle">
            Real-time fleet fuel fill logs, DEF consumption, expense metrics, and receipt auditing.
          </p>
        </div>

        <div className="header-action-group">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={logsRes.loading || statsRes.loading}
          >
            <RotateCw size={14} style={{ marginRight: 6 }} className={logsRes.loading || statsRes.loading ? 'spin' : ''} />
            {logsRes.loading || statsRes.loading ? 'Refreshing…' : 'Refresh Data'}
          </button>

          <button type="button" className="btn-primary" onClick={handleExportCsv}>
            <Download size={15} style={{ marginRight: 6 }} />
            Export CSV
          </button>
        </div>
      </div>

      <ErrorBanner error={logsRes.error || statsRes.error} />

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card stat-success">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Fuel Expense</span>
            <Fuel size={20} color="#15803d" />
          </div>
          <div className="stat-card-value">
            ₹{stats.totalFuelCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            {stats.totalFuelVolumeLtr.toFixed(1)} Litres filled
          </div>
        </div>

        <div className="stat-card stat-info">
          <div className="stat-card-header">
            <span className="stat-card-title">Total DEF Expense</span>
            <span style={{ fontSize: 18 }}>💧</span>
          </div>
          <div className="stat-card-value">
            ₹{stats.totalDefCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="stat-card-footer">
            {stats.totalDefVolumeLtr.toFixed(1)} Litres DEF
          </div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Fuel Volume</span>
            <Fuel size={20} color="#b45309" />
          </div>
          <div className="stat-card-value">{stats.totalFuelVolumeLtr.toFixed(1)} L</div>
          <div className="stat-card-footer">Combined fleet volume</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Log Entries</span>
            <ClipboardList size={20} color="#64748b" />
          </div>
          <div className="stat-card-value">{stats.totalEntriesCount}</div>
          <div className="stat-card-footer">Logged by drivers</div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="filter-card">
        <div className="filter-grid">
          {/* Search Box */}
          <div className="filter-group filter-wide">
            <label className="filter-label">Search</label>
            <div className="filter-input-box">
              <Search className="filter-icon" size={16} />
              <input
                type="text"
                className="filter-input"
                placeholder="Search driver name, emp ID, or vehicle number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button type="button" className="clear-search" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Type Filter */}
          <div className="filter-group">
            <label className="filter-label">Type</label>
            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Types (Fuel & DEF)</option>
              <option value="FUEL">Fuel ⛽</option>
              <option value="DEF">DEF 💧</option>
            </select>
          </div>

          {/* Vehicle Filter */}
          <div className="filter-group">
            <label className="filter-label">Vehicle</label>
            <select
              className="filter-select"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} ({v.make || ''} {v.model || ''})
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="filter-group">
            <label className="filter-label">Start Date</label>
            <input
              type="date"
              className="filter-input-date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* End Date */}
          <div className="filter-group">
            <label className="filter-label">End Date</label>
            <input
              type="date"
              className="filter-input-date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Clear Filters */}
          {isFiltered ? (
            <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-clear-filters" onClick={handleClearFilters}>
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        <div className="table-card-header">
          <h2 className="table-card-title">
            <Fuel size={20} color="#15803d" /> Fuel & DEF Fill Records
            <span className="badge-pill">{totalItems} logs</span>
          </h2>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Driver Details</th>
                <th>Vehicle</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Total Price</th>
                <th>Rate / Litre</th>
                <th>Odometer</th>
                <th>Receipt Bill</th>
              </tr>
            </thead>
            <tbody>
              {logsRes.loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
                    Loading fuel fill entries...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
                    No fuel / DEF entries found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log: any) => {
                  const driverUser = log.driver?.user;
                  const driverName = driverUser ? `${driverUser.firstName} ${driverUser.lastName}` : 'Driver';
                  const empId = driverUser?.employeeId ?? 'N/A';
                  const isFuel = log.type === 'FUEL';
                  const calculatedRate = log.ratePerLtr ?? (log.quantityLtr > 0 ? (log.totalPrice / log.quantityLtr).toFixed(2) : 0);

                  return (
                    <tr key={log.id}>
                      <td className="created-date-text" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td>
                        <div className="driver-name-text">{driverName}</div>
                        <div className="assignee-text" style={{ fontSize: 11 }}>ID: {empId}</div>
                      </td>
                      <td>
                        <span className="vehicle-badge">{log.vehicle?.plateNumber ?? 'N/A'}</span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            background: isFuel ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: isFuel ? 'var(--success-text)' : '#0284c7',
                            border: `1px solid ${isFuel ? 'var(--success-border)' : '#38bdf8'}`,
                          }}
                        >
                          {isFuel ? '⛽ Fuel' : '💧 DEF'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {log.quantityLtr} L
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--success-text)' }}>
                        ₹{log.totalPrice.toLocaleString('en-IN')}
                      </td>
                      <td className="created-date-text">
                        ₹{calculatedRate} / L
                      </td>
                      <td className="created-date-text">
                        {log.odometerKm ? `${log.odometerKm.toLocaleString()} KM` : '—'}
                      </td>
                      <td>
                        {log.receiptUrl ? (
                          <button
                            type="button"
                            className="btn-view"
                            onClick={() =>
                              setSelectedPhoto({
                                url: log.receiptUrl,
                                title: `${log.type} Receipt — ${log.vehicle?.plateNumber ?? ''} (${formatDateTime(log.createdAt)})`,
                              })
                            }
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', border: 'none' }}
                          >
                            <ImageIcon size={14} />
                            View Bill
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>No Photo</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              meta={{ page, pageSize, total: totalItems, totalPages }}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              itemLabel="entry"
            />
          </div>
        )}
      </div>

      {/* Receipt Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            padding: 16,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: 700,
              width: '100%',
              background: 'var(--surface)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
                <ImageIcon color="#15803d" size={18} />
                {selectedPhoto.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 16, background: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '70vh' }}>
              <img
                src={selectedPhoto.url}
                alt="Fuel receipt"
                style={{ maxHeight: '65vh', maxWidth: '100%', objectFit: 'contain', borderRadius: 8 }}
              />
            </div>
            <div style={{ padding: '12px 20px', background: 'var(--bg)', display: 'flex', justifyContent: 'flex-end' }}>
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <ExternalLink size={14} />
                Open Original Image
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
