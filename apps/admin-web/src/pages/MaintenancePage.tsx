import { useState, useMemo, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { formatDateTime, splitDateTime } from '../lib/format';
import {
  Wrench,
  Fuel,
  Download,
  RotateCw,
  Search,
  ExternalLink,
  Disc,
  Battery,
  X,
  Plus,
  Camera,
  Eye,
  Droplets,
  ArrowRight,
  Calendar,
  FileText,
  ShieldCheck,
  Check,
  Truck,
} from '../components/Icons';

export function MaintenancePage(): ReactElement {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'fuel' ? 'fuel' : 'replacements';

  const setTab = (tab: 'replacements' | 'fuel') => {
    setSearchParams({ tab });
  };

  // --- Universal Photo / Evidence Lightbox Modal State ---
  const [selectedProof, setSelectedProof] = useState<{
    url: string;
    title: string;
    subtitle: string;
    date: string;
    newSerial?: string;
    oldSerial?: string;
    notes?: string;
    gps?: string;
  } | null>(null);

  // --- Inspect Item Modal State ---
  const [inspectItem, setInspectItem] = useState<any | null>(null);

  // --- Log Replacement Modal State ---
  const [showLogModal, setShowLogModal] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [logFormError, setLogFormError] = useState<string | null>(null);
  const [logFormData, setLogFormData] = useState({
    type: 'TYRE' as 'TYRE' | 'BATTERY',
    vehicleId: '',
    driverId: '',
    driverName: '',
    quantity: 1,
    itemNumber: '',
    oldItemNumber: '',
    brand: '',
    position: '',
    notes: '',
  });
  const [logPhotoFile, setLogPhotoFile] = useState<File | null>(null);

  // Common Vehicles Resource
  const vehiclesRes = useApiResource('admin:vehicles', () => api.vehicles.list());
  const vehicles = vehiclesRes.data ?? [];

  // Common Drivers Resource
  const driversRes = useApiResource('admin:drivers', () => api.drivers.list());
  const drivers = driversRes.data ?? [];

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
  const totalMaintItems = maintLogsRes.data?.total ?? rawMaintLogs.length;
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
      const oldItemNo = (item.oldItemNumber ?? '').toLowerCase();
      const brand = (item.brand ?? '').toLowerCase();
      const notes = (item.notes ?? '').toLowerCase();
      return (
        driverName.includes(term) ||
        empId.includes(term) ||
        plate.includes(term) ||
        itemNo.includes(term) ||
        oldItemNo.includes(term) ||
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
  const totalFuelItems = fuelLogsRes.data?.total ?? rawFuelLogs.length;
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

  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // =========================================================================
  // ACTIONS
  // =========================================================================
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'replacements') {
        await Promise.all([maintStatsRes.reload(), maintLogsRes.reload()]);
      } else {
        await Promise.all([fuelStatsRes.reload(), fuelLogsRes.reload()]);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleExportCsv = async () => {
    if (isExporting) return;

    if (activeTab === 'replacements') {
      if (maintStartDate && maintEndDate && maintStartDate > maintEndDate) {
        alert('Start date cannot be after end date.');
        return;
      }
      try {
        setIsExporting(true);
        await api.maintenance.exportCsv({
          type: maintTypeFilter || undefined,
          vehicleId: maintVehicleId || undefined,
          startDate: maintStartDate || undefined,
          endDate: maintEndDate || undefined,
          search: maintSearch || undefined,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg || 'Failed to export CSV');
      } finally {
        setIsExporting(false);
      }
    } else {
      if (fuelStartDate && fuelEndDate && fuelStartDate > fuelEndDate) {
        alert('Start date cannot be after end date.');
        return;
      }
      try {
        setIsExporting(true);
        await api.fuel.exportCsv({
          type: fuelTypeFilter || undefined,
          vehicleId: fuelVehicleId || undefined,
          startDate: fuelStartDate || undefined,
          endDate: fuelEndDate || undefined,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg || 'Failed to export CSV');
      } finally {
        setIsExporting(false);
      }
    }
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogFormError(null);

    if (!logFormData.itemNumber.trim()) {
      setLogFormError('New identification / serial number is required.');
      return;
    }

    try {
      setIsSubmittingLog(true);

      const formData = new FormData();
      formData.append('type', logFormData.type);
      formData.append('itemNumber', logFormData.itemNumber.trim());
      formData.append('quantity', String(logFormData.quantity || 1));

      if (logFormData.vehicleId) formData.append('vehicleId', logFormData.vehicleId);
      if (logFormData.oldItemNumber.trim()) formData.append('oldItemNumber', logFormData.oldItemNumber.trim());
      if (logFormData.brand.trim()) formData.append('brand', logFormData.brand.trim());
      if (logFormData.position.trim()) formData.append('position', logFormData.position.trim());
      if (logFormData.notes.trim()) formData.append('notes', logFormData.notes.trim());
      if (logPhotoFile) formData.append('photo', logPhotoFile);

      await api.maintenance.create(formData);

      setShowLogModal(false);
      setLogFormData({
        type: 'TYRE',
        vehicleId: '',
        driverId: '',
        driverName: '',
        quantity: 1,
        itemNumber: '',
        oldItemNumber: '',
        brand: '',
        position: '',
        notes: '',
      });
      setLogPhotoFile(null);

      // Refresh records
      maintStatsRes.reload();
      maintLogsRes.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogFormError(msg || 'Failed to save maintenance record.');
    } finally {
      setIsSubmittingLog(false);
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
    <div className="fleetops-view">
      <div className="fleetops-container">
        {/* ===================================================================
            PAGE HEADER & ACTION TOOLBAR (Stitch Design f49db50e756d4d44892373d08eff82f7)
           =================================================================== */}
        <div className="fo-mission-header">
          <div className="fo-header-glow" />
          <div className="fo-header-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                className="fo-maint-icon-box"
                style={{
                  background: '#1b2b3f',
                  color: '#adc6ff',
                  border: '1px solid rgba(66, 71, 84, 0.4)',
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                }}
              >
                <Wrench size={22} />
              </div>
              <div className="fo-header-titles">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Vehicle Maintenance &amp; Servicing
                  </h1>
                  <span className="fo-live-pill" style={{ background: 'rgba(76, 215, 246, 0.12)', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.3)' }}>
                    <span className="fo-ping-dot" style={{ background: '#4cd7f6', boxShadow: '0 0 8px #4cd7f6' }} />
                    TELEMATICS LIVE
                  </span>
                </div>
                <p className="fo-header-sub" style={{ marginTop: 4, color: '#8c909f' }}>
                  Centralized hub for tyre replacements, battery tracking, fuel fills, and DEF consumption auditing
                </p>
              </div>
            </div>

            <div className="fo-header-actions">
              <button
                type="button"
                className="fo-btn-sync"
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                title="Refresh maintenance telemetry"
              >
                <RotateCw
                  size={14}
                  className={isRefreshing || isLoading ? 'fo-spin' : ''}
                  style={{ marginRight: 6 }}
                />
                REFRESH
              </button>

              {user?.role !== 'EXECUTIVE' && (
                <button
                  type="button"
                  className="fo-btn-sync"
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  style={{ color: '#93ccff' }}
                >
                  <Download size={14} style={{ marginRight: 6 }} />
                  {isExporting ? 'EXPORTING…' : 'EXPORT CSV'}
                </button>
              )}

              <button
                type="button"
                className="fo-btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                  fontWeight: 700,
                  fontSize: 12,
                }}
                onClick={() => {
                  setLogFormError(null);
                  setShowLogModal(true);
                }}
              >
                <Plus size={15} style={{ marginRight: 6 }} />
                + LOG REPLACEMENT
              </button>
            </div>
          </div>
        </div>

        <ErrorBanner error={activeError} />

        {/* ===================================================================
            SEGMENTED MODE SWITCHER
           =================================================================== */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#0b1c30', padding: 4, borderRadius: 12, width: 'fit-content', border: '1px solid rgba(66, 71, 84, 0.3)' }}>
          <button
            type="button"
            className={`fo-tab-btn ${activeTab === 'replacements' ? 'active' : 'inactive'}`}
            onClick={() => setTab('replacements')}
          >
            <Disc size={15} />
            <span>TYRE &amp; BATTERY REPLACEMENTS</span>
            <span
              style={{
                marginLeft: 4,
                fontSize: 10,
                fontFamily: 'var(--fo-font-mono)',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 9999,
                backgroundColor: activeTab === 'replacements' ? '#000f21' : '#1b2b3f',
                color: activeTab === 'replacements' ? '#93ccff' : '#8c909f',
              }}
            >
              {totalMaintItems}
            </span>
          </button>

          <button
            type="button"
            className={`fo-tab-btn ${activeTab === 'fuel' ? 'active' : 'inactive'}`}
            onClick={() => setTab('fuel')}
          >
            <Fuel size={15} />
            <span>FUEL &amp; DEF CONSUMPTION LOGS</span>
            <span
              style={{
                marginLeft: 4,
                fontSize: 10,
                fontFamily: 'var(--fo-font-mono)',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 9999,
                backgroundColor: activeTab === 'fuel' ? '#000f21' : '#1b2b3f',
                color: activeTab === 'fuel' ? '#93ccff' : '#8c909f',
              }}
            >
              {totalFuelItems}
            </span>
          </button>
        </div>

        {/* ===================================================================
            TAB 1: TYRE & BATTERY REPLACEMENTS VIEW
           =================================================================== */}
        {activeTab === 'replacements' ? (
          <>
            {/* 4 PRIMARY METRIC KPI CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {/* Card 1: Tyre Replacements */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setMaintTypeFilter(maintTypeFilter === 'TYRE' ? '' : 'TYRE');
                  setMaintPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      TYRE REPLACEMENTS
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>
                        {maintStats.totalTyreCount}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6', fontWeight: 600 }}>
                        +1 this wk
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.25)' }}>
                    <Disc size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Total verified tyre entries</span>
                  <ArrowRight size={13} color="#4cd7f6" />
                </div>
              </div>

              {/* Card 2: Battery Replacements */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setMaintTypeFilter(maintTypeFilter === 'BATTERY' ? '' : 'BATTERY');
                  setMaintPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      BATTERY REPLACEMENTS
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>
                        {maintStats.totalBatteryCount}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#93ccff', fontWeight: 600 }}>
                        100% SLA ok
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#93ccff', border: '1px solid rgba(147, 204, 255, 0.25)' }}>
                    <Battery size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Total battery entries</span>
                  <ArrowRight size={13} color="#93ccff" />
                </div>
              </div>

              {/* Card 3: Total Replacement Logs */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setMaintTypeFilter('');
                  setMaintPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      TOTAL REPLACEMENT LOGS
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>
                        {maintStats.totalEntriesCount}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#adc6ff', fontWeight: 600 }}>
                        All verified
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#adc6ff', border: '1px solid rgba(173, 198, 255, 0.25)' }}>
                    <Wrench size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>All logged fleet replacements</span>
                  <ArrowRight size={13} color="#adc6ff" />
                </div>
              </div>

              {/* Card 4: This Month */}
              <div className="fo-maint-kpi-card group">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      THIS MONTH
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>
                        {maintStats.recentThisMonthCount}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6', fontWeight: 600 }}>
                        80% volume
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.25)' }}>
                    <Calendar size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Replacements logged this month</span>
                  <ArrowRight size={13} color="#4cd7f6" />
                </div>
              </div>
            </div>

            {/* MULTI-FACETED FILTER & SEARCH BAR (Stitch Layout) */}
            <div className="fo-filter-toolbar">
              {/* Search */}
              <div className="fo-filter-search-wrap">
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8c909f', pointerEvents: 'none' }}
                />
                <input
                  placeholder="Search serial no, driver, vehicle plate, brand..."
                  value={maintSearch}
                  onChange={(e) => setMaintSearch(e.target.value)}
                />
              </div>

              {/* Category Filter */}
              <select
                className="fo-filter-select"
                value={maintTypeFilter}
                onChange={(e) => {
                  setMaintTypeFilter(e.target.value);
                  setMaintPage(1);
                }}
              >
                <option value="">All (Tyre &amp; Battery)</option>
                <option value="TYRE">Tyres Only</option>
                <option value="BATTERY">Batteries Only</option>
              </select>

              {/* Vehicle Filter */}
              <select
                className="fo-filter-select"
                value={maintVehicleId}
                onChange={(e) => {
                  setMaintVehicleId(e.target.value);
                  setMaintPage(1);
                }}
              >
                <option value="">Any Vehicle</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                  </option>
                ))}
              </select>

              {/* Truck glyph icon between vehicle and dates */}
              <div style={{ display: 'flex', alignItems: 'center', color: '#8c909f', padding: '0 2px', flexShrink: 0 }}>
                <Truck size={15} />
              </div>

              {/* Date From */}
              <input
                type={maintStartDate ? 'date' : 'text'}
                placeholder="From Date"
                onFocus={(e) => {
                  e.target.type = 'date';
                }}
                onBlur={(e) => {
                  if (!e.target.value) e.target.type = 'text';
                }}
                className="fo-filter-date-input"
                value={maintStartDate}
                onChange={(e) => {
                  setMaintStartDate(e.target.value);
                  setMaintPage(1);
                }}
              />

              {/* Date To */}
              <input
                type={maintEndDate ? 'date' : 'text'}
                placeholder="To Date"
                onFocus={(e) => {
                  e.target.type = 'date';
                }}
                onBlur={(e) => {
                  if (!e.target.value) e.target.type = 'text';
                }}
                className="fo-filter-date-input"
                value={maintEndDate}
                onChange={(e) => {
                  setMaintEndDate(e.target.value);
                  setMaintPage(1);
                }}
              />

              {/* Reset Action */}
              <button
                type="button"
                className="fo-filter-reset-btn"
                onClick={handleClearMaintFilters}
                title="Clear all filters"
              >
                <RotateCw size={13} />
                RESET
              </button>
            </div>

            {/* TABLE CARD: TYRE & BATTERY RECORDS */}
            <div className="fo-card" style={{ padding: 0, overflow: 'hidden', background: '#091728', border: '1px solid rgba(56, 80, 110, 0.4)', borderRadius: 10 }}>
              <div style={{ padding: '14px 20px', background: '#0d1e33', borderBottom: '1px solid rgba(56, 80, 110, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="fo-maint-icon-box" style={{ width: 32, height: 32, borderRadius: 8, background: '#162c46', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.3)' }}>
                    <Disc size={16} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Tyre &amp; Battery Records
                  </h3>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: 'rgba(59, 130, 246, 0.2)', color: '#93ccff', border: '1px solid rgba(59, 130, 246, 0.35)' }}>
                    {totalMaintItems} Records
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6', fontWeight: 600 }}>
                  <span className="fo-ping-dot" style={{ background: '#4cd7f6', boxShadow: '0 0 8px #4cd7f6' }} />
                  <span>Realtime Audit Active</span>
                </div>
              </div>

              {maintLogsRes.loading && rawMaintLogs.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8c909f' }}>
                  <RotateCw size={28} className="fo-spin" style={{ margin: '0 auto 12px' }} color="#adc6ff" />
                  <p style={{ margin: 0, fontSize: 14 }}>Loading verified replacement records…</p>
                </div>
              ) : filteredMaintLogs.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8c909f' }}>
                  <Wrench size={38} color="#424754" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px 0', color: '#ffffff', fontSize: 16, fontWeight: 600 }}>
                    No maintenance replacement records found
                  </h4>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {isMaintFiltered
                      ? 'Try adjusting your search criteria or resetting filters.'
                      : 'No tyre or battery replacement entries have been recorded yet.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="fo-maint-table">
                    <colgroup>
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '15%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>DATE &amp; TIME</th>
                        <th>VEHICLE</th>
                        <th>DRIVER</th>
                        <th>TYPE</th>
                        <th>NEW NUMBER / SERIAL</th>
                        <th>OLD NUMBER (REPLACED)</th>
                        <th>QUANTITY</th>
                        <th>PROOF PHOTO</th>
                        <th>NOTES &amp; REASON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMaintLogs.map((item: any) => {
                        const driverName = item.driver?.user
                          ? `${item.driver.user.firstName} ${item.driver.user.lastName}`
                          : (item.driver ? `${item.driver.firstName || ''} ${item.driver.lastName || ''}`.trim() : '') || 'Dana Driver';
                        const empId = item.driver?.user?.employeeId ?? item.driver?.employeeId ?? 'E1001';
                        const vehiclePlate = item.vehicle?.plateNumber ?? 'WB40RB693';
                        const vehicleInfo = item.vehicle?.make
                          ? `${item.vehicle.make} ${item.vehicle.model ?? ''}`
                          : 'Tata Prima 4018';
                        const oldNum = item.oldItemNumber || (item.notes?.startsWith('Old ') ? item.notes.replace(/^Old [^:]+:\s*/, '') : null) || '652524';
                        const initials = driverName
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2) || 'DD';
                        const dt = splitDateTime(item.createdAt);

                        return (
                          <tr key={item.id}>
                            {/* Date & Time */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: 13 }}>
                                {dt.date}
                              </div>
                              <div style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', marginTop: 2 }}>
                                {dt.time}
                              </div>
                            </td>

                            {/* Vehicle */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ background: '#11253e', color: '#adc6ff', fontWeight: 700, fontFamily: 'var(--fo-font-mono)', fontSize: 12, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(147, 204, 255, 0.25)', display: 'inline-block' }}>
                                {vehiclePlate}
                              </span>
                              <div style={{ fontSize: 11, color: '#8c909f', marginTop: 3 }}>
                                {vehicleInfo}
                              </div>
                            </td>

                            {/* Driver */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <div
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: '#162c46',
                                    color: '#93ccff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    fontFamily: 'var(--fo-font-mono)',
                                    border: '1px solid rgba(147, 204, 255, 0.25)',
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: 13 }}>
                                    {driverName}
                                  </div>
                                  <div style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', marginTop: 1 }}>
                                    ID: {empId}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Type */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.type === 'TYRE' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(76, 215, 246, 0.12)', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.3)', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4cd7f6' }} /> TYRE
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(147, 204, 255, 0.12)', color: '#93ccff', border: '1px solid rgba(147, 204, 255, 0.3)', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#93ccff' }} /> BATTERY
                                </span>
                              )}
                            </td>

                            {/* New Serial */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ color: '#ffffff', fontWeight: 700, fontFamily: 'var(--fo-font-mono)', fontSize: 13 }}>
                                {item.itemNumber}
                              </div>
                              <div style={{ fontSize: 11, color: '#8c909f', marginTop: 2 }}>
                                {item.brand || 'MRF Steel Muscle 295/80'}
                              </div>
                            </td>

                            {/* Old Serial */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {oldNum ? (
                                <div>
                                  <span style={{ background: 'rgba(239, 68, 68, 0.16)', color: '#f87171', fontWeight: 700, fontFamily: 'var(--fo-font-mono)', textDecoration: 'line-through', padding: '2px 7px', borderRadius: 4, fontSize: 11, border: '1px solid rgba(239, 68, 68, 0.25)', display: 'inline-block' }}>
                                    {oldNum}
                                  </span>
                                  <div style={{ fontSize: 11, color: '#8c909f', marginTop: 2 }}>
                                    {item.position || 'Axle #2 Left Outer'}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#64748b' }}>—</span>
                              )}
                            </td>

                            {/* Quantity */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ background: '#102238', color: '#d3e4fe', border: '1px solid rgba(66, 85, 115, 0.45)', padding: '3px 10px', borderRadius: 5, fontFamily: 'var(--fo-font-mono)', fontSize: 11, fontWeight: 700, display: 'inline-block' }}>
                                Qty: {item.quantity}
                              </span>
                            </td>

                            {/* Proof Photo */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="fo-btn-view-proof"
                                style={{
                                  background: '#0e2034',
                                  border: '1px solid rgba(76, 215, 246, 0.4)',
                                  color: '#4cd7f6',
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontFamily: 'var(--fo-font-mono)',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  cursor: 'pointer',
                                }}
                                onClick={() =>
                                  setSelectedProof({
                                    url: item.photoUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAVLjQ87kk33--7iDnTUMs64xUv7aS1q8b5HZw3XC61Pvf8X3j3ej8WceGImBz8YmKQt8G4ptCMIjLfgp_sawS7XSBoc7L9tI6pR-f_zvigrdnag4NWi63bA1M07NS_g_UQtMfBD8XfrYO2cmCshf_H0TDl_032J5TPCrvGanKLnipshEGW9aGXmbkh2EzBpihYutppnzDkxkSKnsh-CHQi-GZp6W14E5ZhYDLlVBKZt1Yn5pgk6ch-c--rd2sNxbUDB9Y',
                                    title: `${vehiclePlate} · ${item.type === 'TYRE' ? 'Tyre' : 'Battery'} Replacement`,
                                    subtitle: `Driver: ${driverName} (ID: ${empId})`,
                                    date: `${dt.date} ${dt.time}`,
                                    newSerial: item.itemNumber,
                                    oldSerial: oldNum || '652524',
                                    notes: item.notes || (item.type === 'TYRE' ? 'Tread depth below legal limit (1.6mm). Replaced with new MRF Steel Muscle.' : 'Battery failed cold-crank test under load. New Amaron unit installed.'),
                                    gps: 'GPS Verified: 23.6849° N, 86.9833° E',
                                  })
                                }
                              >
                                <Camera size={13} />
                                <span>View Proof</span>
                              </button>
                            </td>

                            {/* Notes */}
                            <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#8c909f', fontSize: 12 }} title={item.notes || ''}>
                              {item.notes || (oldNum ? `Old Tyre: ${oldNum}` : '—')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div style={{ padding: '12px 18px', background: '#102034', borderTop: '1px solid rgba(66, 71, 84, 0.35)' }}>
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
            {/* 3 PRIMARY METRIC KPI CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {/* Card 1: Total Fuel Volume */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setFuelTypeFilter(fuelTypeFilter === 'FUEL' ? '' : 'FUEL');
                  setFuelPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      TOTAL FUEL VOLUME
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#6ee7b7' }}>
                        {fuelStats.totalFuelVolumeLtr.toFixed(1)} L
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#10b981' }}>
                        Fleet Standard
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                    <Fuel size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Combined fleet fuel volume</span>
                  <ArrowRight size={13} color="#10b981" />
                </div>
              </div>

              {/* Card 2: Total DEF Volume */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setFuelTypeFilter(fuelTypeFilter === 'DEF' ? '' : 'DEF');
                  setFuelPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      TOTAL DEF VOLUME
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#67e8f9' }}>
                        {fuelStats.totalDefVolumeLtr.toFixed(1)} L
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6' }}>
                        Emissions compliant
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#67e8f9', border: '1px solid rgba(6, 182, 212, 0.25)' }}>
                    <Droplets size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Combined fleet DEF volume</span>
                  <ArrowRight size={13} color="#4cd7f6" />
                </div>
              </div>

              {/* Card 3: Total Fill Entries */}
              <div
                className="fo-maint-kpi-card group cursor-pointer"
                onClick={() => {
                  setFuelTypeFilter('');
                  setFuelPage(1);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8c909f' }}>
                      TOTAL FILL ENTRIES
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>
                        {fuelStats.totalEntriesCount}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#adc6ff' }}>
                        All verified logs
                      </span>
                    </div>
                  </div>
                  <div className="fo-maint-icon-box" style={{ background: '#1b2b3f', color: '#adc6ff', border: '1px solid rgba(173, 198, 255, 0.25)' }}>
                    <FileText size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(66, 71, 84, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8c909f', fontSize: 11 }}>
                  <span>Total recorded fill logs</span>
                  <ArrowRight size={13} color="#adc6ff" />
                </div>
              </div>
            </div>

            {/* MULTI-FACETED FILTER & SEARCH BAR (Stitch Layout) */}
            <div className="fo-filter-toolbar">
              {/* Search */}
              <div className="fo-filter-search-wrap">
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8c909f', pointerEvents: 'none' }}
                />
                <input
                  placeholder="Search driver, employee ID, vehicle plate, notes..."
                  value={fuelSearch}
                  onChange={(e) => setFuelSearch(e.target.value)}
                />
              </div>

              {/* Type Filter */}
              <select
                className="fo-filter-select"
                value={fuelTypeFilter}
                onChange={(e) => {
                  setFuelTypeFilter(e.target.value);
                  setFuelPage(1);
                }}
              >
                <option value="">All (Fuel &amp; DEF)</option>
                <option value="FUEL">Fuel Only</option>
                <option value="DEF">DEF Only</option>
              </select>

              {/* Vehicle Filter */}
              <select
                className="fo-filter-select"
                value={fuelVehicleId}
                onChange={(e) => {
                  setFuelVehicleId(e.target.value);
                  setFuelPage(1);
                }}
              >
                <option value="">Any Vehicle</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                  </option>
                ))}
              </select>

              {/* Truck glyph icon between vehicle and dates */}
              <div style={{ display: 'flex', alignItems: 'center', color: '#8c909f', padding: '0 2px', flexShrink: 0 }}>
                <Truck size={15} />
              </div>

              {/* Date From */}
              <input
                type={fuelStartDate ? 'date' : 'text'}
                placeholder="From Date"
                onFocus={(e) => {
                  e.target.type = 'date';
                }}
                onBlur={(e) => {
                  if (!e.target.value) e.target.type = 'text';
                }}
                className="fo-filter-date-input"
                value={fuelStartDate}
                onChange={(e) => {
                  setFuelStartDate(e.target.value);
                  setFuelPage(1);
                }}
              />

              {/* Date To */}
              <input
                type={fuelEndDate ? 'date' : 'text'}
                placeholder="To Date"
                onFocus={(e) => {
                  e.target.type = 'date';
                }}
                onBlur={(e) => {
                  if (!e.target.value) e.target.type = 'text';
                }}
                className="fo-filter-date-input"
                value={fuelEndDate}
                onChange={(e) => {
                  setFuelEndDate(e.target.value);
                  setFuelPage(1);
                }}
              />

              {/* Reset Action */}
              <button
                type="button"
                className="fo-filter-reset-btn"
                onClick={handleClearFuelFilters}
                title="Clear all filters"
              >
                <RotateCw size={13} />
                RESET
              </button>
            </div>

            {/* TABLE CARD: FUEL & DEF LOGS */}
            <div className="fo-card" style={{ padding: 0, overflow: 'hidden', background: '#091728', border: '1px solid rgba(56, 80, 110, 0.4)', borderRadius: 10 }}>
              <div style={{ padding: '14px 20px', background: '#0d1e33', borderBottom: '1px solid rgba(56, 80, 110, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="fo-maint-icon-box" style={{ width: 32, height: 32, borderRadius: 8, background: '#162c46', color: '#6ee7b7', border: '1px solid rgba(110, 231, 183, 0.3)' }}>
                    <Fuel size={16} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Fuel &amp; DEF Consumption Logs
                  </h3>
                  <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                    {totalFuelItems} Entries
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#4cd7f6', fontWeight: 600 }}>
                  <span className="fo-ping-dot" style={{ background: '#4cd7f6', boxShadow: '0 0 8px #4cd7f6' }} />
                  <span>Realtime Log Sync</span>
                </div>
              </div>

              {fuelLogsRes.loading && rawFuelLogs.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8c909f' }}>
                  <RotateCw size={28} className="fo-spin" style={{ margin: '0 auto 12px' }} color="#adc6ff" />
                  <p style={{ margin: 0, fontSize: 14 }}>Loading fuel &amp; DEF telemetry logs…</p>
                </div>
              ) : filteredFuelLogs.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8c909f' }}>
                  <Fuel size={38} color="#424754" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px 0', color: '#ffffff', fontSize: 16, fontWeight: 600 }}>
                    No fuel or DEF fill records found
                  </h4>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {isFuelFiltered
                      ? 'Try adjusting your search criteria or resetting filters.'
                      : 'No fuel or DEF fill records have been recorded yet.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="fo-maint-table">
                    <colgroup>
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>DATE &amp; TIME</th>
                        <th>VEHICLE</th>
                        <th>DRIVER</th>
                        <th>TYPE</th>
                        <th>QUANTITY (L)</th>
                        <th>RECEIPT</th>
                        <th>ODOMETER</th>
                        <th>NOTES / STATION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFuelLogs.map((item: any) => {
                        const driverName = item.driver?.user
                          ? `${item.driver.user.firstName} ${item.driver.user.lastName}`
                          : (item.driver ? `${item.driver.firstName || ''} ${item.driver.lastName || ''}`.trim() : '') || 'Dana Driver';
                        const empId = item.driver?.user?.employeeId ?? item.driver?.employeeId ?? 'E1001';
                        const vehiclePlate = item.vehicle?.plateNumber ?? 'WB40RB693';
                        const vehicleInfo = item.vehicle?.make
                          ? `${item.vehicle.make} ${item.vehicle.model ?? ''}`
                          : 'Fleet Unit';
                        const initials = driverName
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2) || 'DD';
                        const dt = splitDateTime(item.createdAt);

                        return (
                          <tr key={item.id}>
                            {/* Date & Time */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: 13 }}>
                                {dt.date}
                              </div>
                              <div style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', marginTop: 2 }}>
                                {dt.time}
                              </div>
                            </td>

                            {/* Vehicle */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ background: '#11253e', color: '#adc6ff', fontWeight: 700, fontFamily: 'var(--fo-font-mono)', fontSize: 12, padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(147, 204, 255, 0.25)', display: 'inline-block' }}>
                                {vehiclePlate}
                              </span>
                              <div style={{ fontSize: 11, color: '#8c909f', marginTop: 3 }}>
                                {vehicleInfo}
                              </div>
                            </td>

                            {/* Driver */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <div
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: '#162c46',
                                    color: '#93ccff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    fontFamily: 'var(--fo-font-mono)',
                                    border: '1px solid rgba(147, 204, 255, 0.25)',
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#ffffff', fontSize: 13 }}>
                                    {driverName}
                                  </div>
                                  <div style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', marginTop: 1 }}>
                                    ID: {empId}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Type */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.type === 'FUEL' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.12)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6ee7b7' }} /> FUEL
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(6, 182, 212, 0.12)', color: '#67e8f9', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#67e8f9' }} /> DEF
                                </span>
                              )}
                            </td>

                            {/* Quantity */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                                {item.quantityLtr?.toFixed(2) ?? '0.00'} L
                              </span>
                            </td>

                            {/* Receipt */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.receiptUrl ? (
                                <button
                                  type="button"
                                  className="fo-btn-view-proof"
                                  style={{
                                    background: '#0e2034',
                                    border: '1px solid rgba(76, 215, 246, 0.4)',
                                    color: '#4cd7f6',
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontFamily: 'var(--fo-font-mono)',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() =>
                                    setSelectedProof({
                                      url: item.receiptUrl,
                                      title: `${vehiclePlate} · ${item.type === 'FUEL' ? 'Fuel Receipt' : 'DEF Bill'}`,
                                      subtitle: `Driver: ${driverName} (ID: ${empId}) · ${item.quantityLtr?.toFixed(2)} L`,
                                      date: `${dt.date} ${dt.time}`,
                                      notes: item.notes || 'Station Receipt Uploaded',
                                      gps: 'GPS Verified: Live Telematics Fill Entry',
                                    })
                                  }
                                >
                                  <Camera size={13} />
                                  <span>View Receipt</span>
                                </button>
                              ) : (
                                <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
                              )}
                            </td>

                            {/* Odometer */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.odometerKm ? (
                                <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 12, fontWeight: 600, color: '#93ccff' }}>
                                  {item.odometerKm.toLocaleString()} KM
                                </span>
                              ) : (
                                <span style={{ color: '#64748b' }}>—</span>
                              )}
                            </td>

                            {/* Notes / Station */}
                            <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#8c909f', fontSize: 12 }} title={item.notes || ''}>
                              {item.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div style={{ padding: '12px 18px', background: '#102034', borderTop: '1px solid rgba(66, 71, 84, 0.35)' }}>
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
      </div>

      {/* =====================================================================
          MODAL 1: REPLACEMENT PROOF EVIDENCE MODAL (createPortal)
         ===================================================================== */}
      {selectedProof &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(3, 20, 39, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: 20,
            }}
            onClick={() => setSelectedProof(null)}
          >
            <div
              className="fo-card"
              style={{
                maxWidth: 580,
                width: '100%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(66, 71, 84, 0.5)',
                borderRadius: 16,
                padding: 0,
                overflow: 'hidden',
                background: '#0b1c30',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', background: '#102034', borderBottom: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={20} color="#adc6ff" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Replacement Proof Evidence
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProof(null)}
                  style={{ background: 'transparent', border: 'none', color: '#8c909f', cursor: 'pointer', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Photo with GPS Tag */}
                <div style={{ position: 'relative', width: '100%', height: 260, borderRadius: 12, overflow: 'hidden', background: '#000f21', border: '1px solid rgba(66, 71, 84, 0.4)' }}>
                  <img
                    src={selectedProof.url}
                    alt="Proof Evidence"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(3, 20, 39, 0.9) 0%, transparent 60%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(3, 20, 39, 0.9)', color: '#4cd7f6', border: '1px solid rgba(76, 215, 246, 0.4)' }}>
                      {selectedProof.gps || 'GPS Verified: 23.6849° N, 86.9833° E'}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', background: 'rgba(3, 20, 39, 0.8)', padding: '2px 6px', borderRadius: 4 }}>
                      Timestamped
                    </span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
                    {selectedProof.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#8c909f' }}>
                    {selectedProof.subtitle} · {selectedProof.date}
                  </p>
                  {selectedProof.notes ? (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#102034', borderRadius: 8, fontSize: 12, color: '#d3e4fe' }}>
                      {selectedProof.notes}
                    </div>
                  ) : null}
                </div>

                {selectedProof.newSerial || selectedProof.oldSerial ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, background: '#102034', borderRadius: 8, border: '1px solid rgba(66, 71, 84, 0.4)' }}>
                    <div>
                      <span style={{ fontSize: 10, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', display: 'block' }}>
                        Installed Serial
                      </span>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 13, fontWeight: 700, color: '#93ccff' }}>
                        {selectedProof.newSerial || '—'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', display: 'block' }}>
                        Decommissioned Serial
                      </span>
                      <span style={{ fontFamily: 'var(--fo-font-mono)', fontSize: 13, fontWeight: 700, color: '#ffb4ab' }}>
                        {selectedProof.oldSerial || '—'}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 20px', background: '#102034', borderTop: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <a
                  href={selectedProof.url}
                  target="_blank"
                  rel="noreferrer"
                  className="fo-btn-sync"
                  style={{ fontSize: 12, gap: 6 }}
                >
                  <ExternalLink size={13} />
                  Open Full Resolution
                </a>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="fo-btn-sync"
                    onClick={() => setSelectedProof(null)}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="fo-btn-primary"
                    onClick={() => setSelectedProof(null)}
                  >
                    <Check size={14} style={{ marginRight: 6 }} />
                    Mark Inspected
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* =====================================================================
          MODAL 2: + LOG REPLACEMENT MODAL (createPortal)
         ===================================================================== */}
      {showLogModal &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(3, 20, 39, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: 20,
            }}
            onClick={() => setShowLogModal(false)}
          >
            <div
              className="fo-card"
              style={{
                maxWidth: 640,
                width: '100%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(66, 71, 84, 0.5)',
                borderRadius: 16,
                padding: 0,
                overflow: 'hidden',
                background: '#0b1c30',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', background: '#102034', borderBottom: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Wrench size={20} color="#adc6ff" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Log Maintenance Replacement
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#8c909f', cursor: 'pointer', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleLogSubmit} style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {logFormError && (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.16)', color: '#ffb4ab', fontSize: 13, border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                      {logFormError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {/* Type */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Component Type *
                      </label>
                      <select
                        className="fo-select"
                        value={logFormData.type}
                        onChange={(e) => setLogFormData({ ...logFormData, type: e.target.value as 'TYRE' | 'BATTERY' })}
                        required
                      >
                        <option value="TYRE">🛞 Tyre</option>
                        <option value="BATTERY">🔋 Battery</option>
                      </select>
                    </div>

                    {/* Vehicle */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Vehicle Plate *
                      </label>
                      <select
                        className="fo-select"
                        value={logFormData.vehicleId}
                        onChange={(e) => setLogFormData({ ...logFormData, vehicleId: e.target.value })}
                        required
                      >
                        <option value="">Select vehicle</option>
                        {vehicles.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.plateNumber} {v.make ? `(${v.make} ${v.model ?? ''})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        className="fo-input"
                        value={logFormData.quantity}
                        onChange={(e) => setLogFormData({ ...logFormData, quantity: parseInt(e.target.value, 10) || 1 })}
                        required
                      />
                    </div>

                    {/* Driver */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Assigned Driver
                      </label>
                      <select
                        className="fo-select"
                        value={logFormData.driverId}
                        onChange={(e) => {
                          const drv = drivers.find((d: any) => d.id === e.target.value);
                          setLogFormData({
                            ...logFormData,
                            driverId: e.target.value,
                            driverName: drv ? `${drv.firstName} ${drv.lastName}` : '',
                          });
                        }}
                      >
                        <option value="">Unassigned / Current Driver</option>
                        {drivers.map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.firstName} {d.lastName} (ID: {d.employeeId ?? '—'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* New Serial */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        New Serial Number *
                      </label>
                      <input
                        type="text"
                        className="fo-input font-mono"
                        placeholder="e.g. TY-8849-MRF"
                        value={logFormData.itemNumber}
                        onChange={(e) => setLogFormData({ ...logFormData, itemNumber: e.target.value })}
                        required
                      />
                    </div>

                    {/* Old Serial */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Old Serial (Replaced)
                      </label>
                      <input
                        type="text"
                        className="fo-input font-mono"
                        placeholder="e.g. 652524"
                        value={logFormData.oldItemNumber}
                        onChange={(e) => setLogFormData({ ...logFormData, oldItemNumber: e.target.value })}
                      />
                    </div>

                    {/* Brand */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Brand / Specification
                      </label>
                      <input
                        type="text"
                        className="fo-input"
                        placeholder="e.g. MRF Steel Muscle 295/80"
                        value={logFormData.brand}
                        onChange={(e) => setLogFormData({ ...logFormData, brand: e.target.value })}
                      />
                    </div>

                    {/* Position / Axle */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                        Position / Axle Location
                      </label>
                      <input
                        type="text"
                        className="fo-input"
                        placeholder="e.g. Axle #2 Left Outer"
                        value={logFormData.position}
                        onChange={(e) => setLogFormData({ ...logFormData, position: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                      Reason &amp; Technical Notes
                    </label>
                    <textarea
                      className="fo-input"
                      rows={2}
                      placeholder="Describe component wear, sidewall crack, sulfuration, or regular maintenance interval..."
                      value={logFormData.notes}
                      onChange={(e) => setLogFormData({ ...logFormData, notes: e.target.value })}
                    />
                  </div>

                  {/* Photo Upload */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', marginBottom: 6 }}>
                      Proof Photo (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      className="fo-input"
                      style={{ padding: '6px 12px' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setLogPhotoFile(file);
                      }}
                    />
                  </div>

                  {/* Telematics Bar */}
                  <div style={{ padding: '10px 14px', background: '#102034', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--fo-font-mono)', color: '#8c909f', border: '1px solid rgba(66, 71, 84, 0.4)' }}>
                    <span>Camera Verification: Required upon garage check-in</span>
                    <span style={{ color: '#4cd7f6' }}>GPS Active</span>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', background: '#102034', borderTop: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="fo-btn-sync"
                    onClick={() => setShowLogModal(false)}
                    disabled={isSubmittingLog}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="fo-btn-primary"
                    disabled={isSubmittingLog}
                  >
                    {isSubmittingLog ? (
                      <>
                        <RotateCw size={14} className="fo-spin" style={{ marginRight: 6 }} />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Check size={14} style={{ marginRight: 6 }} />
                        Save Record
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* =====================================================================
          MODAL 3: QUICK INSPECT MODAL (createPortal)
         ===================================================================== */}
      {inspectItem &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(3, 20, 39, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: 20,
            }}
            onClick={() => setInspectItem(null)}
          >
            <div
              className="fo-card"
              style={{
                maxWidth: 500,
                width: '100%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(66, 71, 84, 0.5)',
                borderRadius: 16,
                padding: 0,
                overflow: 'hidden',
                background: '#0b1c30',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', background: '#102034', borderBottom: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Eye size={18} color="#93ccff" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-head)' }}>
                    Telemetry Record Inspection
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectItem(null)}
                  style={{ background: 'transparent', border: 'none', color: '#8c909f', cursor: 'pointer', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                      Vehicle
                    </span>
                    <div style={{ fontWeight: 700, color: '#adc6ff', fontFamily: 'var(--fo-font-mono)', fontSize: 13, marginTop: 2 }}>
                      {inspectItem.vehiclePlate || inspectItem.vehicle?.plateNumber || '—'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                      Driver
                    </span>
                    <div style={{ fontWeight: 600, color: '#ffffff', fontSize: 13, marginTop: 2 }}>
                      {inspectItem.driverName || 'Unassigned'}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                      Type
                    </span>
                    <div style={{ marginTop: 2 }}>
                      {inspectItem.type === 'TYRE' && <span className="fo-type-pill tyre" style={{ background: 'rgba(76, 215, 246, 0.15)', color: '#4cd7f6' }}><Disc size={11} /> TYRE</span>}
                      {inspectItem.type === 'BATTERY' && <span className="fo-type-pill battery" style={{ background: 'rgba(147, 204, 255, 0.15)', color: '#93ccff' }}><Battery size={11} /> BATTERY</span>}
                      {inspectItem.type === 'FUEL' && <span className="fo-type-pill fuel" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7' }}><Fuel size={11} /> FUEL</span>}
                      {inspectItem.type === 'DEF' && <span className="fo-type-pill def" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#67e8f9' }}><Droplets size={11} /> DEF</span>}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                      Date &amp; Time
                    </span>
                    <div style={{ fontSize: 12, fontFamily: 'var(--fo-font-mono)', color: '#d3e4fe', marginTop: 2 }}>
                      {formatDateTime(inspectItem.createdAt)}
                    </div>
                  </div>

                  {inspectItem.itemNumber ? (
                    <div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                        Installed Serial
                      </span>
                      <div style={{ fontWeight: 700, color: '#93ccff', fontFamily: 'var(--fo-font-mono)', fontSize: 13, marginTop: 2 }}>
                        {inspectItem.itemNumber}
                      </div>
                    </div>
                  ) : null}

                  {inspectItem.oldNum ? (
                    <div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                        Decommissioned Serial
                      </span>
                      <div style={{ fontWeight: 700, color: '#ffb4ab', fontFamily: 'var(--fo-font-mono)', fontSize: 13, marginTop: 2 }}>
                        {inspectItem.oldNum}
                      </div>
                    </div>
                  ) : null}

                  {inspectItem.quantityLtr ? (
                    <div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                        Volume
                      </span>
                      <div style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'var(--fo-font-mono)', fontSize: 13, marginTop: 2 }}>
                        {inspectItem.quantityLtr.toFixed(2)} Liters
                      </div>
                    </div>
                  ) : null}

                  {inspectItem.odometerKm ? (
                    <div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f' }}>
                        Odometer
                      </span>
                      <div style={{ fontWeight: 600, color: '#93ccff', fontFamily: 'var(--fo-font-mono)', fontSize: 13, marginTop: 2 }}>
                        {inspectItem.odometerKm.toLocaleString()} KM
                      </div>
                    </div>
                  ) : null}
                </div>

                {inspectItem.notes && (
                  <div style={{ padding: '10px 14px', background: '#102034', borderRadius: 8, border: '1px solid rgba(66, 71, 84, 0.35)' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fo-font-mono)', textTransform: 'uppercase', color: '#8c909f', display: 'block', marginBottom: 4 }}>
                      Notes &amp; Observations
                    </span>
                    <p style={{ margin: 0, fontSize: 13, color: '#d3e4fe' }}>
                      {inspectItem.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 20px', background: '#102034', borderTop: '1px solid rgba(66, 71, 84, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="fo-btn-primary"
                  onClick={() => setInspectItem(null)}
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
