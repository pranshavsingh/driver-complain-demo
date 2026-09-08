import { useState, useMemo, type ReactElement } from 'react';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { formatDateTime } from '../lib/format';
import {
  Wrench,
  Download,
  RotateCw,
  Search,
  X,
  ExternalLink,
  ImageIcon,
  Disc,
  Battery,
} from '../components/Icons';

export function MaintenancePage(): ReactElement {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    title: string;
    itemNumber: string;
    vehicle: string;
    driver: string;
    type: string;
    date: string;
  } | null>(null);

  const vehiclesRes = useApiResource('admin:vehicles', () => api.vehicles.list());
  const statsRes = useApiResource(
    `admin:maintenance:stats:${startDate}:${endDate}:${vehicleId}`,
    () =>
      api.maintenance.stats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        vehicleId: vehicleId || undefined,
      }),
  );
  const logsRes = useApiResource(
    `admin:maintenance:list:${typeFilter}:${vehicleId}:${startDate}:${endDate}:${page}:${pageSize}`,
    () =>
      api.maintenance.list({
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
    totalTyreCount: 0,
    totalBatteryCount: 0,
    totalEntriesCount: 0,
    recentThisMonthCount: 0,
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
      const itemNo = (item.itemNumber ?? '').toLowerCase();
      const brand = (item.brand ?? '').toLowerCase();
      const notes = (item.notes ?? '').toLowerCase();
      return (
        driverName.includes(term) ||
        empId.includes(term) ||
        plate.includes(term) ||
        itemNo.includes(term) ||
        brand.includes(term) ||
        notes.includes(term)
      );
    });
  }, [rawLogs, search]);

  const handleExportCsv = () => {
    void api.maintenance.exportCsv({
      type: typeFilter || undefined,
      vehicleId: vehicleId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined,
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
            <Wrench size={24} color="#0284c7" /> Vehicle Maintenance & Replacements
          </h1>
          <p className="page-subtitle">
            Real-time logs of tyre and battery replacements, serial verification, and proof photo
            auditing.
          </p>
        </div>

        <div className="header-action-group">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={logsRes.loading || statsRes.loading}
          >
            <RotateCw
              size={14}
              style={{ marginRight: 6 }}
              className={logsRes.loading || statsRes.loading ? 'spin' : ''}
            />
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
        <div className="stat-card stat-info">
          <div className="stat-card-header">
            <span className="stat-card-title">Tyre Replacements</span>
            <Disc size={20} color="#0284c7" />
          </div>
          <div className="stat-card-value">{stats.totalTyreCount}</div>
          <div className="stat-card-footer">Total verified tyre entries</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-card-title">Battery Replacements</span>
            <Battery size={20} color="#d97706" />
          </div>
          <div className="stat-card-value">{stats.totalBatteryCount}</div>
          <div className="stat-card-footer">Total battery entries</div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Maintenance Logs</span>
            <Wrench size={20} color="#16a34a" />
          </div>
          <div className="stat-card-value">{stats.totalEntriesCount}</div>
          <div className="stat-card-footer">All logged fleet maintenance</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">This Month</span>
            <span style={{ fontSize: 18 }}>📅</span>
          </div>
          <div className="stat-card-value">{stats.recentThisMonthCount}</div>
          <div className="stat-card-footer">Replacements logged this month</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card filters-card" style={{ marginBottom: 20 }}>
        <div className="filters-grid">
          {/* Search Box */}
          <div className="filter-group" style={{ flex: 2, minWidth: 220 }}>
            <label className="filter-label">Search</label>
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="input-field"
                placeholder="Search serial no, driver, vehicle, brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Type Filter */}
          <div className="filter-group">
            <label className="filter-label">Maintenance Type</label>
            <select
              className="select-field"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Types (Tyre & Battery)</option>
              <option value="TYRE">🛞 Tyre Replacement</option>
              <option value="BATTERY">🔋 Battery Replacement</option>
            </select>
          </div>

          {/* Vehicle Filter */}
          <div className="filter-group">
            <label className="filter-label">Vehicle</label>
            <select
              className="select-field"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="filter-group">
            <label className="filter-label">From Date</label>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">To Date</label>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {isFiltered ? (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn-link"
              onClick={handleClearFilters}
              style={{ fontSize: 13, color: '#dc2626' }}
            >
              Clear all filters
            </button>
          </div>
        ) : null}
      </div>

      {/* Table & Content */}
      <div className="card table-card">
        {logsRes.loading && rawLogs.length === 0 ? (
          <div className="loading-state">
            <RotateCw size={24} className="spin" />
            <p>Loading maintenance records…</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <Wrench size={40} color="#94a3b8" />
            <h3>No maintenance logs found</h3>
            <p>
              {isFiltered
                ? 'Try adjusting your filters or search terms.'
                : 'No tyre or battery replacement entries have been recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Type</th>
                  <th>Serial / Number</th>
                  <th>Quantity & Specs</th>
                  <th>Proof Photo</th>
                  <th>Odometer / Cost</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((item: any) => {
                  const driverName = item.driver?.user
                    ? `${item.driver.user.firstName} ${item.driver.user.lastName}`
                    : 'Unassigned';
                  const empId = item.driver?.user?.employeeId ?? '—';
                  const vehiclePlate = item.vehicle?.plateNumber ?? '—';
                  const vehicleInfo = item.vehicle?.make
                    ? `${item.vehicle.make} ${item.vehicle.model ?? ''}`
                    : '';

                  return (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {formatDateTime(item.createdAt)}
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{vehiclePlate}</div>
                        {vehicleInfo ? (
                          <div style={{ fontSize: 11, color: '#64748b' }}>{vehicleInfo}</div>
                        ) : null}
                      </td>

                      <td>
                        <div style={{ fontWeight: 500 }}>{driverName}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>ID: {empId}</div>
                      </td>

                      <td>
                        {item.type === 'TYRE' ? (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: '#e0f2fe',
                              color: '#0369a1',
                              border: '1px solid #bae6fd',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Disc size={13} /> Tyre
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: '#fef3c7',
                              color: '#b45309',
                              border: '1px solid #fde68a',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Battery size={13} /> Battery
                          </span>
                        )}
                      </td>

                      <td>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: 14,
                            color: '#1e293b',
                            backgroundColor: '#f1f5f9',
                            padding: '3px 8px',
                            borderRadius: 4,
                            display: 'inline-block',
                          }}
                        >
                          {item.itemNumber}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          Qty: <strong>{item.quantity}</strong>
                          {item.brand ? ` • ${item.brand}` : ''}
                        </div>
                        {item.position ? (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Pos: {item.position}
                          </div>
                        ) : null}
                      </td>

                      <td>
                        {item.photoUrl ? (
                          <button
                            type="button"
                            className="thumbnail-preview-btn"
                            onClick={() =>
                              setSelectedPhoto({
                                url: item.photoUrl,
                                title: `Proof Photo: ${item.type === 'TYRE' ? 'New Tyre' : 'New Battery'} (${item.itemNumber})`,
                                itemNumber: item.itemNumber,
                                vehicle: vehiclePlate,
                                driver: driverName,
                                type: item.type,
                                date: formatDateTime(item.createdAt),
                              })
                            }
                            style={{
                              position: 'relative',
                              display: 'inline-block',
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: '1px solid #cbd5e1',
                              cursor: 'pointer',
                              padding: 0,
                              background: 'none',
                            }}
                            title="Click to view full image"
                          >
                            <img
                              src={item.photoUrl}
                              alt="Proof"
                              style={{
                                width: 44,
                                height: 44,
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                color: '#fff',
                                padding: 2,
                                borderTopLeftRadius: 4,
                              }}
                            >
                              <ImageIcon size={10} />
                            </div>
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>No Photo</span>
                        )}
                      </td>

                      <td>
                        {item.odometerKm ? (
                          <div style={{ fontSize: 12, color: '#0f172a' }}>
                            {item.odometerKm.toLocaleString()} KM
                          </div>
                        ) : null}
                        {item.cost ? (
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>
                            ₹{item.cost.toLocaleString('en-IN')}
                          </div>
                        ) : null}
                        {!item.odometerKm && !item.cost ? (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                        ) : null}
                      </td>

                      <td>
                        {item.notes ? (
                          <span style={{ fontSize: 12, color: '#334155' }}>{item.notes}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="table-footer" style={{ padding: '12px 16px' }}>
          <Pagination
            meta={{
              page,
              pageSize,
              total: totalItems,
              totalPages,
            }}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            itemLabel="record"
          />
        </div>
      </div>

      {/* Lightbox / Proof Photo Modal */}
      {selectedPhoto ? (
        <div
          className="modal-overlay"
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              maxWidth: 700,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              className="modal-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  {selectedPhoto.title}
                </h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Vehicle: <strong>{selectedPhoto.vehicle}</strong> • Driver:{' '}
                  <strong>{selectedPhoto.driver}</strong> • {selectedPhoto.date}
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                padding: 20,
                textAlign: 'center',
                backgroundColor: '#0f172a',
                maxHeight: '70vh',
                overflowY: 'auto',
              }}
            >
              <img
                src={selectedPhoto.url}
                alt="Proof Photo"
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div
              className="modal-footer"
              style={{
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={14} /> Open Full Size
              </a>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setSelectedPhoto(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
