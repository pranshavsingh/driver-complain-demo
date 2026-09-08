import { useState, useMemo, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { formatDateTime } from '../lib/format';
import {
  Wrench,
  Fuel,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'fuel' ? 'fuel' : 'replacements';

  const setTab = (tab: 'replacements' | 'fuel') => {
    setSearchParams({ tab });
  };

  // --- Photo / Lightbox State ---
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
    date: string;
  } | null>(null);

  // Common Vehicles Resource
  const vehiclesRes = useApiResource('admin:vehicles', () => api.vehicles.list());
  const vehicles = vehiclesRes.data ?? [];

  // =========================================================================
  // 1. TYRE & BATTERY REPLACEMENTS TAB STATE & DATA
  // =========================================================================
  const [maintTypeFilter, setMaintTypeFilter] = useState<string>('');
  const [maintSearch, setMaintSearch] = useState<string>('');
  const [maintVehicleId, setMaintVehicleId] = useState<string>('');
  const [maintStartDate, setMaintStartDate] = useState<string>('');
  const [maintEndDate, setMaintEndDate] = useState<string>('');
  const [maintPage, setMaintPage] = useState(1);
  const [maintPageSize, setMaintPageSize] = useState(15);

  const maintStatsRes = useApiResource(
    `admin:maintenance:stats:${maintStartDate}:${maintEndDate}:${maintVehicleId}`,
    () =>
      api.maintenance.stats({
        startDate: maintStartDate || undefined,
        endDate: maintEndDate || undefined,
        vehicleId: maintVehicleId || undefined,
      }),
  );

  const maintLogsRes = useApiResource(
    `admin:maintenance:list:${maintTypeFilter}:${maintVehicleId}:${maintStartDate}:${maintEndDate}:${maintPage}:${maintPageSize}`,
    () =>
      api.maintenance.list({
        type: maintTypeFilter || undefined,
        vehicleId: maintVehicleId || undefined,
        startDate: maintStartDate || undefined,
        endDate: maintEndDate || undefined,
        page: maintPage,
        limit: maintPageSize,
      }),
  );

  const maintStats = maintStatsRes.data ?? {
    totalTyreCount: 0,
    totalBatteryCount: 0,
    totalEntriesCount: 0,
    recentThisMonthCount: 0,
  };

  const rawMaintLogs = maintLogsRes.data?.data ?? [];
  const totalMaintItems = maintLogsRes.data?.total ?? 0;
  const totalMaintPages = maintLogsRes.data?.totalPages ?? 1;

  const filteredMaintLogs = useMemo(() => {
    if (!maintSearch.trim()) return rawMaintLogs;
    const term = maintSearch.toLowerCase();
    return rawMaintLogs.filter((item: any) => {
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
  }, [rawMaintLogs, maintSearch]);

  const isMaintFiltered = Boolean(
    maintSearch || maintTypeFilter || maintVehicleId || maintStartDate || maintEndDate,
  );

  const handleClearMaintFilters = () => {
    setMaintSearch('');
    setMaintTypeFilter('');
    setMaintVehicleId('');
    setMaintStartDate('');
    setMaintEndDate('');
    setMaintPage(1);
  };

  // =========================================================================
  // 2. FUEL & DEF LOGS TAB STATE & DATA
  // =========================================================================
  const [fuelTypeFilter, setFuelTypeFilter] = useState<string>('');
  const [fuelSearch, setFuelSearch] = useState<string>('');
  const [fuelVehicleId, setFuelVehicleId] = useState<string>('');
  const [fuelStartDate, setFuelStartDate] = useState<string>('');
  const [fuelEndDate, setFuelEndDate] = useState<string>('');
  const [fuelPage, setFuelPage] = useState(1);
  const [fuelPageSize, setFuelPageSize] = useState(15);

  const fuelStatsRes = useApiResource(
    `admin:fuel:stats:${fuelStartDate}:${fuelEndDate}:${fuelVehicleId}`,
    () =>
      api.fuel.stats({
        startDate: fuelStartDate || undefined,
        endDate: fuelEndDate || undefined,
        vehicleId: fuelVehicleId || undefined,
      }),
  );

  const fuelLogsRes = useApiResource(
    `admin:fuel:list:${fuelTypeFilter}:${fuelVehicleId}:${fuelStartDate}:${fuelEndDate}:${fuelPage}:${fuelPageSize}`,
    () =>
      api.fuel.list({
        type: fuelTypeFilter || undefined,
        vehicleId: fuelVehicleId || undefined,
        startDate: fuelStartDate || undefined,
        endDate: fuelEndDate || undefined,
        page: fuelPage,
        limit: fuelPageSize,
      }),
  );

  const fuelStats = fuelStatsRes.data ?? {
    totalFuelCost: 0,
    totalDefCost: 0,
    totalFuelVolumeLtr: 0,
    totalDefVolumeLtr: 0,
    totalEntriesCount: 0,
  };

  const rawFuelLogs = fuelLogsRes.data?.data ?? [];
  const totalFuelItems = fuelLogsRes.data?.total ?? 0;
  const totalFuelPages = fuelLogsRes.data?.totalPages ?? 1;

  const filteredFuelLogs = useMemo(() => {
    if (!fuelSearch.trim()) return rawFuelLogs;
    const term = fuelSearch.toLowerCase();
    return rawFuelLogs.filter((item: any) => {
      const driverName = item.driver?.user
        ? `${item.driver.user.firstName} ${item.driver.user.lastName}`.toLowerCase()
        : '';
      const empId = item.driver?.user?.employeeId?.toLowerCase() ?? '';
      const plate = item.vehicle?.plateNumber?.toLowerCase() ?? '';
      const notes = (item.notes ?? '').toLowerCase();
      return (
        driverName.includes(term) ||
        empId.includes(term) ||
        plate.includes(term) ||
        notes.includes(term)
      );
    });
  }, [rawFuelLogs, fuelSearch]);

  const isFuelFiltered = Boolean(
    fuelSearch || fuelTypeFilter || fuelVehicleId || fuelStartDate || fuelEndDate,
  );

  const handleClearFuelFilters = () => {
    setFuelSearch('');
    setFuelTypeFilter('');
    setFuelVehicleId('');
    setFuelStartDate('');
    setFuelEndDate('');
    setFuelPage(1);
  };

  // =========================================================================
  // ACTIONS
  // =========================================================================
  const handleRefresh = () => {
    if (activeTab === 'replacements') {
      maintStatsRes.reload();
      maintLogsRes.reload();
    } else {
      fuelStatsRes.reload();
      fuelLogsRes.reload();
    }
  };

  const handleExportCsv = () => {
    if (activeTab === 'replacements') {
      void api.maintenance.exportCsv({
        type: maintTypeFilter || undefined,
        vehicleId: maintVehicleId || undefined,
        startDate: maintStartDate || undefined,
        endDate: maintEndDate || undefined,
        search: maintSearch || undefined,
      });
    } else {
      void api.fuel.exportCsv({
        type: fuelTypeFilter || undefined,
        vehicleId: fuelVehicleId || undefined,
        startDate: fuelStartDate || undefined,
        endDate: fuelEndDate || undefined,
      });
    }
  };

  const isLoading =
    activeTab === 'replacements'
      ? maintLogsRes.loading || maintStatsRes.loading
      : fuelLogsRes.loading || fuelStatsRes.loading;

  const activeError =
    activeTab === 'replacements'
      ? maintLogsRes.error || maintStatsRes.error
      : fuelLogsRes.error || fuelStatsRes.error;

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={24} color="#0284c7" /> Vehicle Maintenance & Servicing
          </h1>
          <p className="page-subtitle">
            Centralized hub for tyre replacements, battery tracking, fuel fills, and DEF consumption
            auditing.
          </p>
        </div>

        <div className="header-action-group">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RotateCw
              size={14}
              style={{ marginRight: 6 }}
              className={isLoading ? 'spin' : ''}
            />
            {isLoading ? 'Refreshing…' : 'Refresh Data'}
          </button>

          <button type="button" className="btn-primary" onClick={handleExportCsv}>
            <Download size={15} style={{ marginRight: 6 }} />
            Export CSV
          </button>
        </div>
      </div>

      <ErrorBanner error={activeError} />

      {/* Main Tab Navigation Bar */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setTab('replacements')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'replacements'
                ? '1.5px solid #0284c7'
                : '1px solid var(--border)',
            backgroundColor:
              activeTab === 'replacements' ? '#0284c7' : 'var(--surface)',
            color: activeTab === 'replacements' ? '#ffffff' : 'var(--text)',
            boxShadow:
              activeTab === 'replacements'
                ? '0 4px 6px -1px rgba(2, 132, 199, 0.25)'
                : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Disc size={18} color={activeTab === 'replacements' ? '#ffffff' : '#0284c7'} />
          <span>🛞 Tyre & 🔋 Battery Replacements</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'replacements'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--surface-muted)',
              color: activeTab === 'replacements' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {totalMaintItems}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('fuel')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'fuel' ? '1.5px solid #15803d' : '1px solid var(--border)',
            backgroundColor: activeTab === 'fuel' ? '#15803d' : 'var(--surface)',
            color: activeTab === 'fuel' ? '#ffffff' : 'var(--text)',
            boxShadow:
              activeTab === 'fuel'
                ? '0 4px 6px -1px rgba(21, 128, 61, 0.25)'
                : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Fuel size={18} color={activeTab === 'fuel' ? '#ffffff' : '#15803d'} />
          <span>⛽ Fuel & DEF Consumption Logs</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'fuel'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--surface-muted)',
              color: activeTab === 'fuel' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {totalFuelItems}
          </span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: TYRE & BATTERY REPLACEMENTS VIEW
         ===================================================================== */}
      {activeTab === 'replacements' ? (
        <>
          {/* 4 Stat Cards */}
          <div className="stat-cards-grid">
            <div className="stat-card stat-info">
              <div className="stat-card-header">
                <span className="stat-card-title">Tyre Replacements</span>
                <Disc size={20} color="#0284c7" />
              </div>
              <div className="stat-card-value">{maintStats.totalTyreCount}</div>
              <div className="stat-card-footer">Total verified tyre entries</div>
            </div>

            <div className="stat-card stat-warning">
              <div className="stat-card-header">
                <span className="stat-card-title">Battery Replacements</span>
                <Battery size={20} color="#d97706" />
              </div>
              <div className="stat-card-value">{maintStats.totalBatteryCount}</div>
              <div className="stat-card-footer">Total battery entries</div>
            </div>

            <div className="stat-card stat-success">
              <div className="stat-card-header">
                <span className="stat-card-title">Total Replacement Logs</span>
                <Wrench size={20} color="#16a34a" />
              </div>
              <div className="stat-card-value">{maintStats.totalEntriesCount}</div>
              <div className="stat-card-footer">All logged fleet replacements</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">This Month</span>
                <span style={{ fontSize: 18 }}>📅</span>
              </div>
              <div className="stat-card-value">{maintStats.recentThisMonthCount}</div>
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
                    value={maintSearch}
                    onChange={(e) => setMaintSearch(e.target.value)}
                  />
                  {maintSearch ? (
                    <button
                      type="button"
                      className="btn-clear-search"
                      onClick={() => setMaintSearch('')}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Type Filter */}
              <div className="filter-group">
                <label className="filter-label">Category</label>
                <select
                  className="select-field"
                  value={maintTypeFilter}
                  onChange={(e) => {
                    setMaintTypeFilter(e.target.value);
                    setMaintPage(1);
                  }}
                >
                  <option value="">All (Tyre & Battery)</option>
                  <option value="TYRE">🛞 Tyre Replacement</option>
                  <option value="BATTERY">🔋 Battery Replacement</option>
                </select>
              </div>

              {/* Vehicle Filter */}
              <div className="filter-group">
                <label className="filter-label">Vehicle</label>
                <select
                  className="select-field"
                  value={maintVehicleId}
                  onChange={(e) => {
                    setMaintVehicleId(e.target.value);
                    setMaintPage(1);
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
                  value={maintStartDate}
                  onChange={(e) => {
                    setMaintStartDate(e.target.value);
                    setMaintPage(1);
                  }}
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">To Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={maintEndDate}
                  onChange={(e) => {
                    setMaintEndDate(e.target.value);
                    setMaintPage(1);
                  }}
                />
              </div>
            </div>

            {isMaintFiltered ? (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleClearMaintFilters}
                  style={{ fontSize: 13, color: '#dc2626' }}
                >
                  Clear all filters
                </button>
              </div>
            ) : null}
          </div>

          {/* Table */}
          <div className="card table-card">
            {maintLogsRes.loading && rawMaintLogs.length === 0 ? (
              <div className="loading-state">
                <RotateCw size={24} className="spin" />
                <p>Loading replacement records…</p>
              </div>
            ) : filteredMaintLogs.length === 0 ? (
              <div className="empty-state">
                <Wrench size={40} color="#94a3b8" />
                <h3>No maintenance logs found</h3>
                <p>
                  {isMaintFiltered
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
                    {filteredMaintLogs.map((item: any) => {
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
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {vehiclePlate}
                            </div>
                            {vehicleInfo ? (
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {vehicleInfo}
                              </div>
                            ) : null}
                          </td>

                          <td>
                            <div style={{ fontWeight: 500 }}>{driverName}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: {empId}
                            </div>
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
                                color: 'var(--text)',
                                backgroundColor: 'var(--surface-muted)',
                                border: '1px solid var(--border)',
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
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
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
                                    subtitle: `Vehicle: ${vehiclePlate} • Driver: ${driverName}`,
                                    date: formatDateTime(item.createdAt),
                                  })
                                }
                                style={{
                                  position: 'relative',
                                  display: 'inline-block',
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  border: '1px solid var(--border)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  background: 'none',
                                }}
                                title="Click to view proof photo"
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
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                No Photo
                              </span>
                            )}
                          </td>

                          <td>
                            {item.odometerKm ? (
                              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                                {item.odometerKm.toLocaleString()} KM
                              </div>
                            ) : null}
                            {item.cost ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#15803d',
                                }}
                              >
                                ₹{item.cost.toLocaleString('en-IN')}
                              </div>
                            ) : null}
                            {!item.odometerKm && !item.cost ? (
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                            ) : null}
                          </td>

                          <td>
                            {item.notes ? (
                              <span style={{ fontSize: 12, color: 'var(--text)' }}>
                                {item.notes}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
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
                  page: maintPage,
                  pageSize: maintPageSize,
                  total: totalMaintItems,
                  totalPages: totalMaintPages,
                }}
                onPageChange={setMaintPage}
                onPageSizeChange={(newSize) => {
                  setMaintPageSize(newSize);
                  setMaintPage(1);
                }}
                itemLabel="record"
              />
            </div>
          </div>
        </>
      ) : (
        /* ===================================================================
           TAB 2: FUEL & DEF CONSUMPTION LOGS VIEW
           =================================================================== */
        <>
          {/* 4 Stat Cards */}
          <div className="stat-cards-grid">
            <div className="stat-card stat-success">
              <div className="stat-card-header">
                <span className="stat-card-title">Total Fuel Expense</span>
                <Fuel size={20} color="#15803d" />
              </div>
              <div className="stat-card-value">
                ₹{fuelStats.totalFuelCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-footer">
                {fuelStats.totalFuelVolumeLtr.toFixed(1)} Litres filled
              </div>
            </div>

            <div className="stat-card stat-info">
              <div className="stat-card-header">
                <span className="stat-card-title">Total DEF Expense</span>
                <span style={{ fontSize: 18 }}>💧</span>
              </div>
              <div className="stat-card-value">
                ₹{fuelStats.totalDefCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-footer">
                {fuelStats.totalDefVolumeLtr.toFixed(1)} Litres DEF
              </div>
            </div>

            <div className="stat-card stat-warning">
              <div className="stat-card-header">
                <span className="stat-card-title">Total Fuel Volume</span>
                <Fuel size={20} color="#b45309" />
              </div>
              <div className="stat-card-value">
                {fuelStats.totalFuelVolumeLtr.toFixed(1)} L
              </div>
              <div className="stat-card-footer">Combined fleet volume</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-title">Total Fill Entries</span>
                <span style={{ fontSize: 18 }}>📋</span>
              </div>
              <div className="stat-card-value">{fuelStats.totalEntriesCount}</div>
              <div className="stat-card-footer">Total recorded fill logs</div>
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
                    placeholder="Search driver, employee ID, vehicle..."
                    value={fuelSearch}
                    onChange={(e) => setFuelSearch(e.target.value)}
                  />
                  {fuelSearch ? (
                    <button
                      type="button"
                      className="btn-clear-search"
                      onClick={() => setFuelSearch('')}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Type Filter */}
              <div className="filter-group">
                <label className="filter-label">Type</label>
                <select
                  className="select-field"
                  value={fuelTypeFilter}
                  onChange={(e) => {
                    setFuelTypeFilter(e.target.value);
                    setFuelPage(1);
                  }}
                >
                  <option value="">All (Fuel & DEF)</option>
                  <option value="FUEL">⛽ Fuel Only</option>
                  <option value="DEF">💧 DEF Only</option>
                </select>
              </div>

              {/* Vehicle Filter */}
              <div className="filter-group">
                <label className="filter-label">Vehicle</label>
                <select
                  className="select-field"
                  value={fuelVehicleId}
                  onChange={(e) => {
                    setFuelVehicleId(e.target.value);
                    setFuelPage(1);
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
                  value={fuelStartDate}
                  onChange={(e) => {
                    setFuelStartDate(e.target.value);
                    setFuelPage(1);
                  }}
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">To Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={fuelEndDate}
                  onChange={(e) => {
                    setFuelEndDate(e.target.value);
                    setFuelPage(1);
                  }}
                />
              </div>
            </div>

            {isFuelFiltered ? (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleClearFuelFilters}
                  style={{ fontSize: 13, color: '#dc2626' }}
                >
                  Clear all filters
                </button>
              </div>
            ) : null}
          </div>

          {/* Table */}
          <div className="card table-card">
            {fuelLogsRes.loading && rawFuelLogs.length === 0 ? (
              <div className="loading-state">
                <RotateCw size={24} className="spin" />
                <p>Loading fuel records…</p>
              </div>
            ) : filteredFuelLogs.length === 0 ? (
              <div className="empty-state">
                <Fuel size={40} color="#94a3b8" />
                <h3>No fuel logs found</h3>
                <p>
                  {isFuelFiltered
                    ? 'Try adjusting your filters or search terms.'
                    : 'No fuel or DEF fill records recorded yet.'}
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
                      <th>Quantity (L)</th>
                      <th>Total Price</th>
                      <th>Rate / Ltr</th>
                      <th>Receipt</th>
                      <th>Odometer</th>
                      <th>Notes / Station</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFuelLogs.map((item: any) => {
                      const driverName = item.driver?.user
                        ? `${item.driver.user.firstName} ${item.driver.user.lastName}`
                        : 'Unassigned';
                      const empId = item.driver?.user?.employeeId ?? '—';
                      const vehiclePlate = item.vehicle?.plateNumber ?? '—';
                      const vehicleInfo = item.vehicle?.make
                        ? `${item.vehicle.make} ${item.vehicle.model ?? ''}`
                        : '';
                      const rate =
                        item.ratePerLtr ??
                        (item.quantityLtr > 0
                          ? Number((item.totalPrice / item.quantityLtr).toFixed(2))
                          : 0);

                      return (
                        <tr key={item.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                            {formatDateTime(item.createdAt)}
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {vehiclePlate}
                            </div>
                            {vehicleInfo ? (
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {vehicleInfo}
                              </div>
                            ) : null}
                          </td>

                          <td>
                            <div style={{ fontWeight: 500 }}>{driverName}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: {empId}
                            </div>
                          </td>

                          <td>
                            {item.type === 'FUEL' ? (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Fuel size={13} /> Fuel
                              </span>
                            ) : (
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
                                💧 DEF
                              </span>
                            )}
                          </td>

                          <td style={{ fontWeight: 600 }}>
                            {item.quantityLtr.toFixed(2)} L
                          </td>

                          <td style={{ fontWeight: 700, color: '#15803d' }}>
                            ₹{item.totalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>

                          <td>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>
                              ₹{rate.toFixed(2)}
                            </div>
                          </td>

                          <td>
                            {item.receiptUrl ? (
                              <button
                                type="button"
                                className="thumbnail-preview-btn"
                                onClick={() =>
                                  setSelectedPhoto({
                                    url: item.receiptUrl,
                                    title: `${item.type === 'FUEL' ? 'Fuel Receipt' : 'DEF Bill'} (₹${item.totalPrice})`,
                                    subtitle: `Vehicle: ${vehiclePlate} • Driver: ${driverName}`,
                                    date: formatDateTime(item.createdAt),
                                  })
                                }
                                style={{
                                  position: 'relative',
                                  display: 'inline-block',
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  border: '1px solid var(--border)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  background: 'none',
                                }}
                                title="Click to view receipt image"
                              >
                                <img
                                  src={item.receiptUrl}
                                  alt="Receipt"
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
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                No Bill
                              </span>
                            )}
                          </td>

                          <td>
                            {item.odometerKm ? (
                              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                                {item.odometerKm.toLocaleString()} KM
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                            )}
                          </td>

                          <td>
                            {item.notes ? (
                              <span style={{ fontSize: 12, color: 'var(--text)' }}>
                                {item.notes}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
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
                  page: fuelPage,
                  pageSize: fuelPageSize,
                  total: totalFuelItems,
                  totalPages: totalFuelPages,
                }}
                onPageChange={setFuelPage}
                onPageSizeChange={(newSize) => {
                  setFuelPageSize(newSize);
                  setFuelPage(1);
                }}
                itemLabel="log"
              />
            </div>
          </div>
        </>
      )}

      {/* Lightbox / Proof Photo & Receipt Modal */}
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
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
              backgroundColor: 'var(--surface)',
              borderRadius: 12,
              maxWidth: 720,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="modal-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {selectedPhoto.title}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {selectedPhoto.subtitle} • {selectedPhoto.date}
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
                  color: 'var(--muted)',
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
                backgroundColor: '#090d16',
                maxHeight: '70vh',
                overflowY: 'auto',
              }}
            >
              <img
                src={selectedPhoto.url}
                alt="Document Preview"
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
                borderTop: '1px solid var(--border)',
                backgroundColor: 'var(--surface-muted)',
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
