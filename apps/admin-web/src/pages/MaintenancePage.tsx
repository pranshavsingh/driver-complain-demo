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
  ExternalLink,
  ImageIcon,
  Disc,
  Battery,
  X,
} from '../components/Icons';

export function MaintenancePage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'fuel' ? 'fuel' : 'replacements';

  const setTab = (tab: 'replacements' | 'fuel') => {
    setSearchParams({ tab });
  };

  // --- Universal Photo / Lightbox State ---
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
      {/* Top Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wrench size={24} color="#0284c7" /> Vehicle Maintenance & Servicing
          </h1>
          <p className="page-subtitle">
            Centralized hub for tyre replacements, battery tracking, fuel fills, and DEF consumption auditing
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
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>

          <button type="button" className="btn-primary" onClick={handleExportCsv}>
            <Download size={15} style={{ marginRight: 6 }} />
            Export CSV
          </button>
        </div>
      </div>

      <ErrorBanner error={activeError} />

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn-${activeTab === 'replacements' ? 'primary' : 'secondary'}`}
          onClick={() => setTab('replacements')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Disc size={16} />
          <span>Tyre & Battery Replacements</span>
          <span
            style={{
              marginLeft: 4,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'replacements'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--bg)',
              color: activeTab === 'replacements' ? '#ffffff' : 'var(--muted)',
            }}
          >
            {totalMaintItems}
          </span>
        </button>

        <button
          type="button"
          className={`btn-${activeTab === 'fuel' ? 'primary' : 'secondary'}`}
          onClick={() => setTab('fuel')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Fuel size={16} />
          <span>Fuel & DEF Consumption Logs</span>
          <span
            style={{
              marginLeft: 4,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor:
                activeTab === 'fuel'
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'var(--bg)',
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
            <div className="stat-card stat-info selected">
              <div className="stat-card-header">
                <span className="stat-card-title">Tyre Replacements</span>
                <Disc size={20} color="#0284c7" />
              </div>
              <div className="stat-card-value">{maintStats.totalTyreCount}</div>
              <div className="stat-card-footer">Total verified tyre entries</div>
            </div>

            <div className="stat-card stat-warning selected">
              <div className="stat-card-header">
                <span className="stat-card-title">Battery Replacements</span>
                <Battery size={20} color="#d97706" />
              </div>
              <div className="stat-card-value">{maintStats.totalBatteryCount}</div>
              <div className="stat-card-footer">Total battery entries</div>
            </div>

            <div className="stat-card stat-success selected">
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

          {/* Structured Filter Card Panel (Matching ComplaintsListPage) */}
          <div className="filter-card">
            <div className="filter-grid">
              {/* Row 1 - Search */}
              <div className="filter-group filter-wide">
                <label htmlFor="maint-search" className="filter-label">
                  Search
                </label>
                <div className="filter-input-box">
                  <Search size={15} className="filter-icon" />
                  <input
                    id="maint-search"
                    className="filter-input"
                    placeholder="Search serial no, driver, vehicle plate, brand..."
                    value={maintSearch}
                    onChange={(e) => setMaintSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="filter-group">
                <label htmlFor="maint-type" className="filter-label">
                  Category
                </label>
                <select
                  id="maint-type"
                  className="filter-select"
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
                <label htmlFor="maint-vehicle" className="filter-label">
                  Vehicle
                </label>
                <select
                  id="maint-vehicle"
                  className="filter-select"
                  value={maintVehicleId}
                  onChange={(e) => {
                    setMaintVehicleId(e.target.value);
                    setMaintPage(1);
                  }}
                >
                  <option value="">Any vehicle</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 2 - Date Range & Actions */}
              <div className="filter-group">
                <label htmlFor="maint-start-date" className="filter-label">
                  From Date
                </label>
                <input
                  id="maint-start-date"
                  type="date"
                  className="filter-input-date"
                  value={maintStartDate}
                  onChange={(e) => {
                    setMaintStartDate(e.target.value);
                    setMaintPage(1);
                  }}
                />
              </div>

              <div className="filter-group">
                <label htmlFor="maint-end-date" className="filter-label">
                  To Date
                </label>
                <input
                  id="maint-end-date"
                  type="date"
                  className="filter-input-date"
                  value={maintEndDate}
                  onChange={(e) => {
                    setMaintEndDate(e.target.value);
                    setMaintPage(1);
                  }}
                />
              </div>

              {isMaintFiltered ? (
                <div className="filter-group filter-action-btn-group" style={{ gridColumn: 'span 2' }}>
                  <button
                    type="button"
                    className="btn-clear-filters"
                    onClick={handleClearMaintFilters}
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Table Card Panel */}
          <div className="table-card">
            <div className="table-card-header">
              <h3 className="table-card-title">
                <Disc size={18} color="#0284c7" /> Tyre & Battery Records
                <span className="badge-pill">{totalMaintItems} Records</span>
              </h3>
            </div>

            {maintLogsRes.loading && rawMaintLogs.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <RotateCw size={28} className="spin" color="var(--accent)" />
                <p style={{ marginTop: 8 }}>Loading replacement records…</p>
              </div>
            ) : filteredMaintLogs.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <Wrench size={36} color="var(--muted)" />
                <h3 style={{ margin: '8px 0 4px', color: 'var(--text)' }}>No maintenance logs found</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                  {isMaintFiltered
                    ? 'Try adjusting your filters or search terms.'
                    : 'No tyre or battery replacement entries have been recorded yet.'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="admin-table">
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
                          <td className="created-date-text">
                            {formatDateTime(item.createdAt)}
                          </td>

                          <td>
                            <span className="vehicle-badge">{vehiclePlate}</span>
                            {vehicleInfo ? (
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                {vehicleInfo}
                              </div>
                            ) : null}
                          </td>

                          <td>
                            <span className="driver-name-text">{driverName}</span>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: {empId}
                            </div>
                          </td>

                          <td>
                            {item.type === 'TYRE' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(2, 132, 199, 0.15)',
                                  color: '#0284c7',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                <Disc size={13} /> Tyre
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(217, 119, 6, 0.15)',
                                  color: '#d97706',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                <Battery size={13} /> Battery
                              </span>
                            )}
                          </td>

                          <td>
                            <span className="complaint-no">
                              {item.itemNumber}
                            </span>
                          </td>

                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              Qty: {item.quantity}
                              {item.brand ? ` · ${item.brand}` : ''}
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
                                onClick={() =>
                                  setSelectedPhoto({
                                    url: item.photoUrl,
                                    title: `Proof Photo: ${item.type === 'TYRE' ? 'New Tyre' : 'New Battery'} (${item.itemNumber})`,
                                    subtitle: `Vehicle: ${vehiclePlate} · Driver: ${driverName}`,
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
                                    backgroundColor: 'rgba(0,0,0,0.65)',
                                    color: '#fff',
                                    padding: 2,
                                    borderTopLeftRadius: 4,
                                  }}
                                >
                                  <ImageIcon size={10} />
                                </div>
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>

                          <td>
                            {item.odometerKm ? (
                              <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {item.odometerKm.toLocaleString()} KM
                              </div>
                            ) : null}
                            {item.cost ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#16a34a',
                                }}
                              >
                                ₹{item.cost.toLocaleString('en-IN')}
                              </div>
                            ) : null}
                            {!item.odometerKm && !item.cost ? (
                              <span className="muted">—</span>
                            ) : null}
                          </td>

                          <td>
                            {item.notes ? (
                              <span style={{ fontSize: 13, color: 'var(--text)' }}>
                                {item.notes}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            <div className="table-footer-pagination">
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
            <div className="stat-card stat-success selected">
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

            <div className="stat-card stat-info selected">
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

            <div className="stat-card stat-warning selected">
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

          {/* Structured Filter Card Panel */}
          <div className="filter-card">
            <div className="filter-grid">
              {/* Row 1 - Search */}
              <div className="filter-group filter-wide">
                <label htmlFor="fuel-search" className="filter-label">
                  Search
                </label>
                <div className="filter-input-box">
                  <Search size={15} className="filter-icon" />
                  <input
                    id="fuel-search"
                    className="filter-input"
                    placeholder="Search driver, employee ID, vehicle plate..."
                    value={fuelSearch}
                    onChange={(e) => setFuelSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Type Filter */}
              <div className="filter-group">
                <label htmlFor="fuel-type" className="filter-label">
                  Type
                </label>
                <select
                  id="fuel-type"
                  className="filter-select"
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
                <label htmlFor="fuel-vehicle" className="filter-label">
                  Vehicle
                </label>
                <select
                  id="fuel-vehicle"
                  className="filter-select"
                  value={fuelVehicleId}
                  onChange={(e) => {
                    setFuelVehicleId(e.target.value);
                    setFuelPage(1);
                  }}
                >
                  <option value="">Any vehicle</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 2 - Date Range & Actions */}
              <div className="filter-group">
                <label htmlFor="fuel-start-date" className="filter-label">
                  From Date
                </label>
                <input
                  id="fuel-start-date"
                  type="date"
                  className="filter-input-date"
                  value={fuelStartDate}
                  onChange={(e) => {
                    setFuelStartDate(e.target.value);
                    setFuelPage(1);
                  }}
                />
              </div>

              <div className="filter-group">
                <label htmlFor="fuel-end-date" className="filter-label">
                  To Date
                </label>
                <input
                  id="fuel-end-date"
                  type="date"
                  className="filter-input-date"
                  value={fuelEndDate}
                  onChange={(e) => {
                    setFuelEndDate(e.target.value);
                    setFuelPage(1);
                  }}
                />
              </div>

              {isFuelFiltered ? (
                <div className="filter-group filter-action-btn-group" style={{ gridColumn: 'span 2' }}>
                  <button
                    type="button"
                    className="btn-clear-filters"
                    onClick={handleClearFuelFilters}
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Table Card Panel */}
          <div className="table-card">
            <div className="table-card-header">
              <h3 className="table-card-title">
                <Fuel size={18} color="#15803d" /> Fuel & DEF Consumption Logs
                <span className="badge-pill">{totalFuelItems} Entries</span>
              </h3>
            </div>

            {fuelLogsRes.loading && rawFuelLogs.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <RotateCw size={28} className="spin" color="var(--accent)" />
                <p style={{ marginTop: 8 }}>Loading fuel records…</p>
              </div>
            ) : filteredFuelLogs.length === 0 ? (
              <div className="notif-empty-state" style={{ padding: 48 }}>
                <Fuel size={36} color="var(--muted)" />
                <h3 style={{ margin: '8px 0 4px', color: 'var(--text)' }}>No fuel logs found</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                  {isFuelFiltered
                    ? 'Try adjusting your filters or search terms.'
                    : 'No fuel or DEF fill records recorded yet.'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="admin-table">
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
                          <td className="created-date-text">
                            {formatDateTime(item.createdAt)}
                          </td>

                          <td>
                            <span className="vehicle-badge">{vehiclePlate}</span>
                            {vehicleInfo ? (
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                {vehicleInfo}
                              </div>
                            ) : null}
                          </td>

                          <td>
                            <span className="driver-name-text">{driverName}</span>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ID: {empId}
                            </div>
                          </td>

                          <td>
                            {item.type === 'FUEL' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                  color: '#15803d',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                <Fuel size={13} /> Fuel
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(2, 132, 199, 0.15)',
                                  color: '#0284c7',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                💧 DEF
                              </span>
                            )}
                          </td>

                          <td style={{ fontWeight: 700 }}>
                            {item.quantityLtr.toFixed(2)} L
                          </td>

                          <td style={{ fontWeight: 700, color: '#16a34a' }}>
                            ₹{item.totalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>

                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              ₹{rate.toFixed(2)}
                            </div>
                          </td>

                          <td>
                            {item.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPhoto({
                                    url: item.receiptUrl,
                                    title: `${item.type === 'FUEL' ? 'Fuel Receipt' : 'DEF Bill'} (₹${item.totalPrice})`,
                                    subtitle: `Vehicle: ${vehiclePlate} · Driver: ${driverName}`,
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
                                    backgroundColor: 'rgba(0,0,0,0.65)',
                                    color: '#fff',
                                    padding: 2,
                                    borderTopLeftRadius: 4,
                                  }}
                                >
                                  <ImageIcon size={10} />
                                </div>
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>

                          <td>
                            {item.odometerKm ? (
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {item.odometerKm.toLocaleString()} KM
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>

                          <td>
                            {item.notes ? (
                              <span style={{ fontSize: 13, color: 'var(--text)' }}>
                                {item.notes}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            <div className="table-footer-pagination">
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

      {/* Universal Photo / Receipt Lightbox Modal */}
      {selectedPhoto ? (
        <div
          className="sidebar-backdrop"
          style={{
            display: 'flex',
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 1000,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="filter-card"
            style={{
              maxWidth: 720,
              width: '100%',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {selectedPhoto.title}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {selectedPhoto.subtitle} · {selectedPhoto.date}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                padding: 20,
                textAlign: 'center',
                backgroundColor: '#090d16',
                maxHeight: '65vh',
                overflowY: 'auto',
              }}
            >
              <img
                src={selectedPhoto.url}
                alt="Document Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '55vh',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div
              style={{
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
              }}
            >
              <a
                href={selectedPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={14} /> Open Full Resolution
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
