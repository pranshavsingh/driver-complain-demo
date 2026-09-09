import { useState, useMemo, type ReactElement } from 'react';
import type {
  VehicleFullReportResponse,
  FleetVehicleSummaryItem,
  VehicleReportTripItem,
  VehicleReportComplaintItem,
  VehicleReportFuelItem,
} from '@driver-complaint/shared-types';
import {
  Truck,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  Wrench,
  FileSpreadsheet,
  ImageIcon,
  X,
  ShieldAlert,
  Fuel,
  Volume2,
  Search,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PackageOpen,
} from '../components/Icons';
import * as api from '../api/endpoints';
import { useApiResource } from '../hooks/useApiResource';
import { formatDateTime } from '../lib/format';
import { ErrorBanner } from '../components/ErrorBanner';

function formatMins(mins?: number | null): string {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Recorded Date';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function FleetTableSkeletonRows(): ReactElement {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <tr key={i} className="skeleton-table-row">
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="skeleton-box skeleton-circle" style={{ width: 32, height: 32 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton-box" style={{ width: 110, height: 16 }} />
                <div className="skeleton-box" style={{ width: 80, height: 12 }} />
              </div>
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton-box" style={{ width: 130, height: 15 }} />
              <div className="skeleton-box" style={{ width: 50, height: 12 }} />
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton-box" style={{ width: 120, height: 15 }} />
              <div className="skeleton-box" style={{ width: 70, height: 12 }} />
            </div>
          </td>
          <td>
            <div className="skeleton-box" style={{ width: 80, height: 18, borderRadius: 6 }} />
          </td>
          <td>
            <div className="skeleton-box" style={{ width: 90, height: 22, borderRadius: 12 }} />
          </td>
          <td>
            <div className="skeleton-box" style={{ width: 110, height: 22, borderRadius: 12 }} />
          </td>
          <td>
            <div className="skeleton-box" style={{ width: 80, height: 16 }} />
          </td>
          <td className="text-right">
            <div className="skeleton-box" style={{ width: 95, height: 30, borderRadius: 6 }} />
          </td>
        </tr>
      ))}
    </>
  );
}

function VehicleReportSkeleton(): ReactElement {
  return (
    <div className="vehicle-report-skeleton-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Profile Banner Skeleton */}
      <div className="skeleton-profile-banner">
        <div className="skeleton-box skeleton-circle" style={{ width: 44, height: 44 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="skeleton-box" style={{ width: 140, height: 20 }} />
            <div className="skeleton-box" style={{ width: 180, height: 16 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton-box" style={{ width: 220, height: 14 }} />
          </div>
        </div>
      </div>

      {/* 2. KPI Cards Skeleton */}
      <div className="skeleton-kpi-grid">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="skeleton-kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton-box" style={{ width: 90, height: 13 }} />
              <div className="skeleton-box skeleton-circle" style={{ width: 20, height: 20 }} />
            </div>
            <div className="skeleton-box" style={{ width: 80, height: 24 }} />
            <div className="skeleton-box" style={{ width: 120, height: 12 }} />
          </div>
        ))}
      </div>

      {/* 3. Tabs Bar Skeleton */}
      <div className="skeleton-tabs-bar">
        <div className="skeleton-box" style={{ width: 220, height: 36, borderRadius: 8 }} />
        <div className="skeleton-box" style={{ width: 180, height: 36, borderRadius: 8 }} />
        <div className="skeleton-box" style={{ width: 160, height: 36, borderRadius: 8 }} />
        <div className="skeleton-box" style={{ width: 180, height: 36, borderRadius: 8 }} />
      </div>

      {/* 4. Trip Journeys Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {[1, 2].map((j) => (
          <div key={j} className="skeleton-trip-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="skeleton-box" style={{ width: 70, height: 22, borderRadius: 6 }} />
                <div className="skeleton-box" style={{ width: 110, height: 22, borderRadius: 12 }} />
                <div className="skeleton-box" style={{ width: 180, height: 16 }} />
              </div>
              <div className="skeleton-box" style={{ width: 240, height: 26, borderRadius: 8 }} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="skeleton-box" style={{ flex: 1, minWidth: 200, height: 60, borderRadius: 10 }} />
              <div className="skeleton-box" style={{ flex: 1, minWidth: 200, height: 60, borderRadius: 10 }} />
              <div className="skeleton-box" style={{ flex: 1, minWidth: 200, height: 60, borderRadius: 10 }} />
            </div>

            <div className="skeleton-box" style={{ width: '100%', height: 44, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = 'TIMELINE' | 'TRIPS' | 'COMPLAINTS' | 'MAINTENANCE';
type TimelineMode = 'TRIPS' | 'DATE';

export interface EnrichedTripEvent {
  id: string;
  type: 'MILESTONE' | 'COMPLAINT' | 'FUEL';
  phase: 'DOCK_LOADING' | 'TRANSIT' | 'DESTINATION_UNLOAD';
  phaseName: string;
  timestamp: string;
  title: string;
  subtitle?: string;
  stepNumber?: number; // 1 to 5 for milestone steps
  milestoneKey?: 'REACHED_LOADING' | 'LOADING_DONE' | 'TRIP_STARTED' | 'DEST_REACHED' | 'UNLOAD_DONE';
  durationTag?: { label: string; variant: 'orange' | 'blue' | 'purple' | 'green' };
  photoUrl?: string;
  photoTitle?: string;
  location?: string;
  complaint?: VehicleReportComplaintItem;
  fuel?: VehicleReportFuelItem;
  relativeContext?: string;
}

export interface JourneyPhaseSummary {
  dockIncidents: number;
  dockBreakdowns: number;
  transitIncidents: number;
  transitBreakdowns: number;
  destIncidents: number;
  destBreakdowns: number;
  fuelStops: number;
}

export interface EnrichedTripJourney {
  trip: VehicleReportTripItem;
  complaints: VehicleReportComplaintItem[];
  fuelRecords: VehicleReportFuelItem[];
  totalCycleMinutes: number;
  phaseSummary: JourneyPhaseSummary;
  orderedEvents: EnrichedTripEvent[];
}

export function ReportsPage(): ReactElement {
  // Master-Detail State
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detail View State
  const [datePreset, setDatePreset] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('TIMELINE');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('TRIPS');
  const [exporting, setExporting] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  // Default to collapsed at primary state
  const [expandedTripIds, setExpandedTripIds] = useState<Set<string>>(new Set());

  const toggleTripCollapse = (tripId: string) => {
    setExpandedTripIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
      } else {
        next.add(tripId);
      }
      return next;
    });
  };

  const expandAllTrips = (tripsList: EnrichedTripJourney[]) => {
    setExpandedTripIds(new Set(tripsList.map((et) => et.trip.id)));
  };

  const collapseAllTrips = () => {
    setExpandedTripIds(new Set());
  };

  // 1. Fetch Fleet Vehicles List for Master Table View
  const fleetResource = useApiResource('reports:fleet', () => api.reports.listFleet());
  const fleetList: FleetVehicleSummaryItem[] = useMemo(() => fleetResource.data ?? [], [fleetResource.data]);

  // Filter fleet vehicles by search query
  const filteredFleet = useMemo(() => {
    if (!searchQuery.trim()) return fleetList;
    const q = searchQuery.toLowerCase().trim();
    return fleetList.filter((v) => {
      const plateMatch = v.plateNumber.toLowerCase().includes(q);
      const modelMatch = `${v.make ?? ''} ${v.model ?? ''}`.toLowerCase().includes(q);
      const driverMatch = (v.driverName ?? '').toLowerCase().includes(q);
      const empMatch = (v.driverEmployeeId ?? '').toLowerCase().includes(q);
      return plateMatch || modelMatch || driverMatch || empMatch;
    });
  }, [fleetList, searchQuery]);

  // Handle Preset Date changes in Detail view
  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === '7DAYS') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setDateFrom(past.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(firstDay.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  // 2. Fetch full vehicle report when a vehicle is selected
  const reportQuery: api.VehicleReportParams = useMemo(() => {
    return {
      vehicleId: selectedVehicleId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
  }, [selectedVehicleId, dateFrom, dateTo]);

  const reportResource = useApiResource(
    `reports:vehicle:${selectedVehicleId}:${dateFrom}:${dateTo}`,
    () => api.reports.getVehicleReport(reportQuery),
  );

  const reportData: VehicleFullReportResponse | null = reportResource.data ?? null;
  const summary = reportData?.summary;
  const vehicle = reportData?.vehicle;
  const driver = reportData?.driver;

  // Build Enriched Trip Journeys with attached complaints, fuel logs, and ordered timeline stream
  const enrichedTrips: EnrichedTripJourney[] = useMemo(() => {
    if (!reportData) return [];
    const trips = reportData.trips;
    const complaints = reportData.complaints;
    const fuel = reportData.fuelRecords;

    return trips.map((t) => {
      const reachTime = new Date(t.reachedAt).getTime();
      const startTime = t.tripStartedAt ? new Date(t.tripStartedAt).getTime() : null;
      const endTime = t.tripCompletedAt ? new Date(t.tripCompletedAt).getTime() : null;
      const unloadTime = t.unloadingCompletedAt ? new Date(t.unloadingCompletedAt).getTime() : null;

      const tripStartMs = reachTime;
      const tripEndMs = unloadTime ?? (endTime ? endTime + 1000 * 60 * 60 * 2 : Date.now());

      // Find complaints during this trip window (with 30 min buffer around dock arrival/departure)
      const matchedComplaints = complaints.filter((c) => {
        const cTime = new Date(c.createdAt).getTime();
        return cTime >= tripStartMs - 1000 * 60 * 30 && cTime <= tripEndMs + 1000 * 60 * 30;
      });

      // Find fuel records during this trip window
      const matchedFuel = fuel.filter((f) => {
        const fTime = new Date(f.createdAt).getTime();
        return fTime >= tripStartMs - 1000 * 60 * 30 && fTime <= tripEndMs + 1000 * 60 * 30;
      });

      const totalCycleMinutes =
        (t.waitingTimeMinutes ?? 0) +
        (t.tripDurationMinutes ?? 0) +
        (t.unloadingDurationMinutes ?? 0);

      // Phase calculation helper
      const determinePhase = (itemMs: number): { phase: 'DOCK_LOADING' | 'TRANSIT' | 'DESTINATION_UNLOAD'; relativeContext: string } => {
        if (startTime && itemMs >= startTime && (!endTime || itemMs <= endTime)) {
          const minsAfter = Math.round((itemMs - startTime) / 60000);
          return {
            phase: 'TRANSIT',
            relativeContext: minsAfter <= 0 ? 'Occurred right as trip departed' : `Occurred in Transit (${formatMins(minsAfter)} after Highway Departure)`,
          };
        }
        if (endTime && itemMs > endTime) {
          const minsAfter = Math.round((itemMs - endTime) / 60000);
          return {
            phase: 'DESTINATION_UNLOAD',
            relativeContext: minsAfter <= 0 ? 'Occurred upon arrival at destination' : `Occurred at Destination (${formatMins(minsAfter)} after Arrival)`,
          };
        }
        if (itemMs >= reachTime) {
          const minsAfter = Math.round((itemMs - reachTime) / 60000);
          return {
            phase: 'DOCK_LOADING',
            relativeContext: `Occurred at Loading Dock (${formatMins(minsAfter)} after Arrival)`,
          };
        }
        const minsBefore = Math.round((reachTime - itemMs) / 60000);
        return {
          phase: 'DOCK_LOADING',
          relativeContext: `Reported before dock check-in (${formatMins(minsBefore)} prior)`,
        };
      };

      // 1. Collect Milestones
      const events: EnrichedTripEvent[] = [];

      // Step 1: Reached Loading
      events.push({
        id: `milestone-reached-${t.id}`,
        type: 'MILESTONE',
        phase: 'DOCK_LOADING',
        phaseName: 'Phase 1: Loading Dock',
        timestamp: t.reachedAt,
        title: 'Step 1: Reached Loading Point',
        subtitle: 'Vehicle arrived at loading warehouse / dock',
        stepNumber: 1,
        milestoneKey: 'REACHED_LOADING',
        location: t.reachedAddress || 'Loading Dock',
        photoUrl: t.reachedPhotoUrl || undefined,
        photoTitle: 'Loading Dock Arrival Proof',
      });

      // Step 2: Loading Completed
      if (t.completedAt) {
        events.push({
          id: `milestone-loaded-${t.id}`,
          type: 'MILESTONE',
          phase: 'DOCK_LOADING',
          phaseName: 'Phase 1: Loading Dock',
          timestamp: t.completedAt,
          title: 'Step 2: Cargo Loading Completed',
          subtitle: 'Loading finished, cargo secured',
          stepNumber: 2,
          milestoneKey: 'LOADING_DONE',
          location: t.completedAddress || t.reachedAddress || undefined,
          durationTag: t.waitingTimeMinutes ? { label: `Dock Wait: ${formatMins(t.waitingTimeMinutes)}`, variant: 'orange' } : undefined,
          photoUrl: t.completedPhotoUrl || undefined,
          photoTitle: 'Loaded Cargo Proof',
        });
      }

      // Step 3: Trip Started (Departure)
      if (t.tripStartedAt) {
        events.push({
          id: `milestone-started-${t.id}`,
          type: 'MILESTONE',
          phase: 'TRANSIT',
          phaseName: 'Phase 2: Highway Transit',
          timestamp: t.tripStartedAt,
          title: 'Step 3: Trip Started & Departed Dock',
          subtitle: 'Vehicle left loading facility and began highway transit',
          stepNumber: 3,
          milestoneKey: 'TRIP_STARTED',
          location: t.tripStartAddress || 'En-route Departure Point',
        });
      }

      // Step 4: Destination Reached
      if (t.tripCompletedAt) {
        events.push({
          id: `milestone-completed-${t.id}`,
          type: 'MILESTONE',
          phase: 'DESTINATION_UNLOAD',
          phaseName: 'Phase 3: Destination & Unloading',
          timestamp: t.tripCompletedAt,
          title: 'Step 4: Destination Reached',
          subtitle: 'Vehicle arrived at receiver / unloading facility',
          stepNumber: 4,
          milestoneKey: 'DEST_REACHED',
          location: t.tripCompletedAddress || t.unloadingAddress || 'Delivery Destination',
          durationTag: t.tripDurationMinutes ? { label: `Transit Time: ${formatMins(t.tripDurationMinutes)}`, variant: 'blue' } : undefined,
          photoUrl: t.tripCompletedPhotoUrl || undefined,
          photoTitle: 'Destination Arrival Proof',
        });
      }

      // Step 5: Unloading Completed
      if (t.unloadingCompletedAt) {
        events.push({
          id: `milestone-unloaded-${t.id}`,
          type: 'MILESTONE',
          phase: 'DESTINATION_UNLOAD',
          phaseName: 'Phase 3: Destination & Unloading',
          timestamp: t.unloadingCompletedAt,
          title: 'Step 5: Unloading Completed (Trip Cycle Closed)',
          subtitle: 'Cargo unloaded and verified, vehicle released',
          stepNumber: 5,
          milestoneKey: 'UNLOAD_DONE',
          location: t.unloadingAddress || t.tripCompletedAddress || undefined,
          durationTag: t.unloadingDurationMinutes ? { label: `Unload Wait: ${formatMins(t.unloadingDurationMinutes)}`, variant: 'purple' } : undefined,
          photoUrl: t.unloadingPhotoUrl || undefined,
          photoTitle: 'Unloaded Cargo Proof',
        });
      }

      // 2. Add Complaints/Incidents
      for (const c of matchedComplaints) {
        const cMs = new Date(c.createdAt).getTime();
        const { phase, relativeContext } = determinePhase(cMs);
        events.push({
          id: `complaint-${c.id}`,
          type: 'COMPLAINT',
          phase,
          phaseName: phase === 'TRANSIT' ? 'Phase 2: Highway Transit' : phase === 'DOCK_LOADING' ? 'Phase 1: Loading Dock' : 'Phase 3: Destination & Unloading',
          timestamp: c.createdAt,
          title: c.title || `${c.category} Reported`,
          subtitle: c.description,
          complaint: c,
          relativeContext,
        });
      }

      // 3. Add Fuel Records
      for (const f of matchedFuel) {
        const fMs = new Date(f.createdAt).getTime();
        const { phase, relativeContext } = determinePhase(fMs);
        events.push({
          id: `fuel-${f.id}`,
          type: 'FUEL',
          phase,
          phaseName: phase === 'TRANSIT' ? 'Phase 2: Highway Transit' : phase === 'DOCK_LOADING' ? 'Phase 1: Loading Dock' : 'Phase 3: Destination & Unloading',
          timestamp: f.createdAt,
          title: `Refueled ${f.quantityLtr}L ${f.type}`,
          subtitle: `Expense: ₹${f.totalPrice.toLocaleString()}${f.notes ? ` · Note: ${f.notes}` : ''}`,
          fuel: f,
          relativeContext: relativeContext.replace('Occurred', 'Refueled'),
        });
      }

      // Sort chronological sequence
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Calculate phase summary stats
      const phaseSummary: JourneyPhaseSummary = {
        dockIncidents: matchedComplaints.filter((c) => determinePhase(new Date(c.createdAt).getTime()).phase === 'DOCK_LOADING').length,
        dockBreakdowns: matchedComplaints.filter((c) => c.category === 'BREAKDOWN' && determinePhase(new Date(c.createdAt).getTime()).phase === 'DOCK_LOADING').length,
        transitIncidents: matchedComplaints.filter((c) => determinePhase(new Date(c.createdAt).getTime()).phase === 'TRANSIT').length,
        transitBreakdowns: matchedComplaints.filter((c) => c.category === 'BREAKDOWN' && determinePhase(new Date(c.createdAt).getTime()).phase === 'TRANSIT').length,
        destIncidents: matchedComplaints.filter((c) => determinePhase(new Date(c.createdAt).getTime()).phase === 'DESTINATION_UNLOAD').length,
        destBreakdowns: matchedComplaints.filter((c) => c.category === 'BREAKDOWN' && determinePhase(new Date(c.createdAt).getTime()).phase === 'DESTINATION_UNLOAD').length,
        fuelStops: matchedFuel.length,
      };

      return {
        trip: t,
        complaints: matchedComplaints,
        fuelRecords: matchedFuel,
        totalCycleMinutes,
        phaseSummary,
        orderedEvents: events,
      };
    });
  }, [reportData]);

  // Group Chronological Timeline by Date
  const timelineByDate = useMemo(() => {
    if (!reportData) return [];
    const groups: { dateKey: string; dateLabel: string; items: typeof reportData.timeline }[] = [];
    const dateMap = new Map<string, typeof reportData.timeline>();

    for (const item of reportData.timeline) {
      const key = item.timestamp.slice(0, 10);
      if (!dateMap.has(key)) {
        dateMap.set(key, []);
      }
      dateMap.get(key)!.push(item);
    }

    for (const [key, items] of dateMap.entries()) {
      groups.push({
        dateKey: key,
        dateLabel: formatDateHeader(key),
        items,
      });
    }

    return groups;
  }, [reportData]);

  const handleExportXlsx = async (): Promise<void> => {
    if (!reportData) return;
    try {
      setExporting(true);
      const plate = vehicle?.plateNumber ?? 'vehicle';
      await api.reports.exportVehicleReportXlsx(
        reportQuery,
        `vehicle-report-${plate}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error('Failed to export vehicle report:', err);
    } finally {
      setExporting(false);
    }
  };

  // =========================================================================
  // VIEW 1: FLEET MASTER VEHICLES TABLE VIEW (Default)
  // =========================================================================
  if (!selectedVehicleId) {
    return (
      <div className="reports-page-container">
        {/* Header Row */}
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Fleet Vehicles & Operational Reports</h1>
            <p className="page-subtitle">
              Select any vehicle from the fleet table below to inspect its separated trip journeys, live activity timeline, breakdown tickets, and maintenance costs.
            </p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void fleetResource.reload()}
              disabled={fleetResource.loading}
            >
              <RotateCw size={15} className={fleetResource.loading ? 'spin-icon' : ''} />
              <span>Refresh Fleet</span>
            </button>
          </div>
        </div>

        {fleetResource.error ? <ErrorBanner error={fleetResource.error} /> : null}

        {/* Master Table Card */}
        <div className="fleet-table-card">
          <div className="fleet-table-toolbar">
            <div className="table-search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search vehicle by plate, model, driver name, or Employee ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="fleet-count-badge">
              Total Fleet: <strong>{filteredFleet.length}</strong> vehicles
            </div>
          </div>

          {filteredFleet.length === 0 && !fleetResource.loading ? (
            <div className="empty-state-box">
              <Truck size={40} color="#94A3B8" />
              <h3>No Vehicles Found</h3>
              <p>{searchQuery ? 'No vehicles match your search filter.' : 'No vehicles registered in the system yet.'}</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="fleet-data-table">
                <thead>
                  <tr>
                    <th>Vehicle Plate</th>
                    <th>Make & Model</th>
                    <th>Assigned Driver</th>
                    <th>Trips</th>
                    <th>Current Status</th>
                    <th>Complaints & Breakdowns</th>
                    <th>Total Spend</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetResource.loading && fleetList.length === 0 ? (
                    <FleetTableSkeletonRows />
                  ) : (
                    filteredFleet.map((v) => {
                    const hasBreakdowns = v.breakdownCount > 0;
                    return (
                      <tr
                        key={v.id}
                        className="clickable-fleet-row"
                        onClick={() => setSelectedVehicleId(v.id)}
                      >
                        <td>
                          <div className="vehicle-plate-cell">
                            <div className="plate-icon-box">
                              <Truck size={18} color="#0D5C3A" />
                            </div>
                            <div>
                              <span className="plate-number-text">{v.plateNumber}</span>
                              {v.vin ? <span className="vin-sub-text">VIN: {v.vin}</span> : null}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="vehicle-model-text">
                            {v.make || v.model ? `${v.make ?? ''} ${v.model ?? ''}`.trim() : 'Standard Vehicle'}
                          </div>
                          {v.year ? <span className="year-pill">{v.year}</span> : null}
                        </td>

                        <td>
                          <div className="driver-name-text">{v.driverName}</div>
                          <div className="driver-sub-id">ID: {v.driverEmployeeId}</div>
                        </td>

                        <td>
                          <div className="trips-count-badge">
                            <strong>{v.completedTrips}</strong> / {v.totalTrips} Completed
                          </div>
                        </td>

                        <td>
                          {v.activeTripStatus ? (
                            <span className="badge badge-warning">
                              {v.activeTripStatus}
                            </span>
                          ) : (
                            <span className="badge badge-success">
                              IDLE / READY
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="complaint-count-cell">
                            <span>{v.totalComplaints} Logged</span>
                            {hasBreakdowns ? (
                              <span className="badge badge-danger">
                                {v.breakdownCount} Breakdowns
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          <div className="expense-text">
                            ₹{(v.totalFuelCost + v.totalMaintenanceCost).toLocaleString()}
                          </div>
                        </td>

                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-view-timeline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVehicleId(v.id);
                            }}
                          >
                            <span>View Timeline</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: VEHICLE ACTIVITY TIMELINE & FULL REPORT DETAIL VIEW
  // =========================================================================
  return (
    <div className="reports-page-container">
      {/* Top Back Navigation Bar */}
      <div className="back-nav-bar">
        <button
          type="button"
          className="btn-back-link"
          onClick={() => setSelectedVehicleId(null)}
        >
          <ArrowLeft size={16} />
          <span>Back to All Fleet Vehicles</span>
        </button>
      </div>

      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">
            Vehicle Activity & Trip Breakdown Reports
          </h1>
          <p className="page-subtitle">
            Showing separated full-cycle trips, journey milestones, in-transit breakdown incidents, and maintenance expenses.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary export-btn"
            onClick={() => void handleExportXlsx()}
            disabled={exporting || !reportData}
          >
            {exporting ? (
              <RotateCw size={16} className="spin-icon" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            <span>{exporting ? 'Generating Excel...' : 'Export Full Report (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Filter Control Card */}
      <div className="report-filter-card">
        <div className="filter-group-vehicle">
          <label className="filter-label">Selected Vehicle:</label>
          <div className="select-wrapper">
            <Truck size={16} className="select-icon" />
            <select
              className="form-select vehicle-select"
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {fleetList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} {v.model ? `(${v.make ?? ''} ${v.model})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group-presets">
          <label className="filter-label">Time Range:</label>
          <div className="preset-pill-group">
            {[
              { id: 'ALL', label: 'All History' },
              { id: 'TODAY', label: 'Today' },
              { id: '7DAYS', label: 'Past 7 Days' },
              { id: 'MONTH', label: 'This Month' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-pill ${datePreset === p.id ? 'active' : ''}`}
                onClick={() => handlePresetChange(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group-dates">
          <div className="date-input-wrap">
            <span className="date-tag">From</span>
            <input
              type="date"
              className="form-input date-input"
              value={dateFrom}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setDateFrom(e.target.value);
              }}
            />
          </div>
          <div className="date-input-wrap">
            <span className="date-tag">To</span>
            <input
              type="date"
              className="form-input date-input"
              value={dateTo}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setDateTo(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary icon-btn-refresh"
            onClick={() => void reportResource.reload()}
            title="Refresh Report"
          >
            <RotateCw size={16} className={reportResource.loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </div>

      {reportResource.error ? (
        <ErrorBanner error={reportResource.error} />
      ) : null}

      {reportResource.loading && !reportData ? (
        <VehicleReportSkeleton />
      ) : (
        <>
          {/* Vehicle Profile Summary Bar */}
          {vehicle ? (
        <div className="vehicle-profile-banner">
          <div className="profile-badge-icon">
            <Truck size={28} color="#0D5C3A" />
          </div>
          <div className="profile-details">
            <div className="profile-plate-row">
              <span className="profile-plate">{vehicle.plateNumber}</span>
              {vehicle.make ? (
                <span className="profile-model">
                  {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
                </span>
              ) : null}
              {vehicle.vin ? <span className="profile-vin">VIN: {vehicle.vin}</span> : null}
            </div>
            <div className="profile-driver-row">
              <span className="driver-label">Assigned Driver:</span>
              <span className="driver-val">
                {driver ? `${driver.firstName} ${driver.lastName} (ID: ${driver.employeeId})` : 'Unassigned'}
              </span>
              {driver?.licenseNumber ? (
                <span className="driver-lic">DL: {driver.licenseNumber}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI Stats Overview Cards */}
      {summary ? (
        <div className="report-kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Trips Completed</span>
              <Truck size={18} className="kpi-icon blue" />
            </div>
            <div className="kpi-value-row">
              <span className="kpi-val">{summary.completedTrips}</span>
              <span className="kpi-sub">/ {summary.totalTrips} Total</span>
            </div>
            <div className="kpi-bar-track">
              <div
                className="kpi-bar-fill blue"
                style={{
                  width: `${summary.totalTrips ? (summary.completedTrips / summary.totalTrips) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Loading Detention</span>
              <Clock size={18} className="kpi-icon orange" />
            </div>
            <div className="kpi-value-row">
              <span className="kpi-val">{formatMins(summary.totalLoadingWaitMinutes)}</span>
            </div>
            <span className="kpi-sub">Wait at loading docks</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Unloading Detention</span>
              <Clock size={18} className="kpi-icon purple" />
            </div>
            <div className="kpi-value-row">
              <span className="kpi-val">{formatMins(summary.totalUnloadingWaitMinutes)}</span>
            </div>
            <span className="kpi-sub">Wait at destination</span>
          </div>

          <div className={`kpi-card ${summary.breakdownCount > 0 ? 'alert-card' : ''}`}>
            <div className="kpi-header">
              <span className="kpi-label">Issues & Breakdowns</span>
              <AlertTriangle size={18} className="kpi-icon red" />
            </div>
            <div className="kpi-value-row">
              <span className="kpi-val">{summary.totalComplaints}</span>
              {summary.breakdownCount > 0 ? (
                <span className="badge badge-danger">{summary.breakdownCount} Breakdowns</span>
              ) : null}
            </div>
            <span className="kpi-sub">
              {summary.tyreIssueCount} Tyre, {summary.fuelIssueCount} Fuel
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Total Expense</span>
              <Wrench size={18} className="kpi-icon green" />
            </div>
            <div className="kpi-value-row">
              <span className="kpi-val">
                ₹{(summary.totalFuelCost + summary.totalMaintenanceCost).toLocaleString()}
              </span>
            </div>
            <span className="kpi-sub">
              ₹{summary.totalFuelCost.toLocaleString()} Fuel + ₹{summary.totalMaintenanceCost.toLocaleString()} Maint.
            </span>
          </div>
        </div>
      ) : null}

      {/* Tabs Header */}
      <div className="report-tabs-bar">
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'TIMELINE' ? 'active' : ''}`}
          onClick={() => setActiveTab('TIMELINE')}
        >
          <Clock size={16} />
          <span>Separated Trip & Incident Timeline</span>
          {reportData?.trips.length ? (
            <span className="tab-count">{reportData.trips.length} Trips</span>
          ) : null}
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'TRIPS' ? 'active' : ''}`}
          onClick={() => setActiveTab('TRIPS')}
        >
          <Truck size={16} />
          <span>Trip & Loading Milestones</span>
          {reportData?.trips.length ? (
            <span className="tab-count">{reportData.trips.length}</span>
          ) : null}
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'COMPLAINTS' ? 'active' : ''}`}
          onClick={() => setActiveTab('COMPLAINTS')}
        >
          <ShieldAlert size={16} />
          <span>Issues & Breakdowns</span>
          {reportData?.complaints.length ? (
            <span className="tab-count">{reportData.complaints.length}</span>
          ) : null}
        </button>

        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'MAINTENANCE' ? 'active' : ''}`}
          onClick={() => setActiveTab('MAINTENANCE')}
        >
          <Wrench size={16} />
          <span>Fuel & Maintenance Logs</span>
          {((reportData?.fuelRecords.length ?? 0) + (reportData?.maintenanceRecords.length ?? 0)) ? (
            <span className="tab-count">
              {(reportData?.fuelRecords.length ?? 0) + (reportData?.maintenanceRecords.length ?? 0)}
            </span>
          ) : null}
        </button>
      </div>

      {/* =========================================================================
          Tab Content 1: SEPARATED BY FULL TRIP JOURNEYS OR DATE
          ========================================================================= */}
      {activeTab === 'TIMELINE' && (
        <div className="report-tab-content">
          {/* Sub-view switcher: By Complete Trips vs By Date */}
          <div className="timeline-sub-toolbar">
            <div className="timeline-view-toggles">
              <button
                type="button"
                className={`sub-toggle-btn ${timelineMode === 'TRIPS' ? 'active' : ''}`}
                onClick={() => setTimelineMode('TRIPS')}
              >
                <Truck size={14} />
                <span>Group by Complete Trip Cycles</span>
              </button>
              <button
                type="button"
                className={`sub-toggle-btn ${timelineMode === 'DATE' ? 'active' : ''}`}
                onClick={() => setTimelineMode('DATE')}
              >
                <Clock size={14} />
                <span>Group by Date Timeline</span>
              </button>
            </div>

            {timelineMode === 'TRIPS' && enrichedTrips.length > 0 ? (
              <div className="timeline-collapse-actions">
                <button
                  type="button"
                  className="collapse-action-btn"
                  onClick={() => expandAllTrips(enrichedTrips)}
                  title="Expand all trip pipelines"
                >
                  <ChevronDown size={13} />
                  <span>Expand All</span>
                </button>
                <button
                  type="button"
                  className="collapse-action-btn"
                  onClick={collapseAllTrips}
                  title="Collapse all trip pipelines"
                >
                  <ChevronUp size={13} />
                  <span>Collapse All</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* MODE A: GROUP BY COMPLETE TRIP CYCLES */}
          {timelineMode === 'TRIPS' && (
            <div className="trip-journeys-container">
              {enrichedTrips.length === 0 ? (
                <div className="empty-state-box">
                  <PackageOpen size={40} color="#94A3B8" />
                  <h3>No Trip Cycles Found</h3>
                  <p>No active or completed loading and trip journeys recorded for this period.</p>
                </div>
              ) : (
                enrichedTrips.map((item, idx) => {
                  const t = item.trip;
                  const isCompleted = t.status === 'TRIP_COMPLETED';
                  const hasBreakdown = item.complaints.some((c) => c.category === 'BREAKDOWN');
                  const hasTyreIssue = item.complaints.some((c) => c.category === 'TYRE_ISSUE');
                  const hasFuelIssue = item.complaints.some((c) => c.category === 'FUEL_DEF');
                  const isPipelineCollapsed = !expandedTripIds.has(t.id);

                  return (
                    <div
                      key={t.id}
                      className={`trip-journey-card ${hasBreakdown ? 'journey-has-breakdown' : ''}`}
                    >
                      {/* 1. Trip Journey Header */}
                      <div className="journey-header">
                        <div className="journey-title-block">
                          <div className="journey-badge-row">
                            <span className="journey-counter-tag">
                              Trip #{enrichedTrips.length - idx}
                            </span>
                            <span
                              className={`badge ${
                                isCompleted
                                  ? 'badge-success'
                                  : t.status === 'UNLOADING'
                                  ? 'badge-warning'
                                  : 'badge-info'
                              }`}
                            >
                              {t.status}
                            </span>
                            {hasBreakdown ? (
                              <span className="badge badge-danger">
                                🚨 Breakdown During Journey
                              </span>
                            ) : null}
                            {hasTyreIssue ? (
                              <span className="badge badge-amber">
                                🛞 Tyre Issue
                              </span>
                            ) : null}
                            {hasFuelIssue ? (
                              <span className="badge badge-warning">
                                ⛽ Fuel / DEF Alert
                              </span>
                            ) : null}
                          </div>

                          <div className="journey-date-subtitle">
                            📅 {formatDateHeader(t.reachedAt)} · Duration:{' '}
                            <strong>{formatMins(item.totalCycleMinutes)} Total Cycle</strong>
                          </div>
                        </div>

                        {/* Route Summary */}
                        <div className="journey-route-summary">
                          <div className="route-stop">
                            <MapPin size={13} color="#0D5C3A" />
                            <span className="route-text">
                              {t.tripStartAddress || t.reachedAddress || 'Loading Dock'}
                            </span>
                          </div>
                          <div className="route-arrow">➔</div>
                          <div className="route-stop">
                            <CheckCircle2 size={13} color="#2563EB" />
                            <span className="route-text">
                              {t.unloadingAddress || t.tripCompletedAddress || 'Delivery Point'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Three-Phase Journey Progress Overview Bar */}
                      <div className="journey-phase-overview-bar">
                        {/* Phase 1 Pill */}
                        <div className="phase-overview-segment">
                          <div className="phase-seg-header">
                            <span className="phase-num-dot">1</span>
                            <span className="phase-seg-title">Loading Dock Phase</span>
                          </div>
                          <div className="phase-seg-metrics">
                            <span className="phase-time-tag">
                              {t.waitingTimeMinutes ? `Wait: ${formatMins(t.waitingTimeMinutes)}` : 'Checked In'}
                            </span>
                            {item.phaseSummary.dockIncidents > 0 ? (
                              <span className="phase-incident-pill danger">
                                ⚠️ {item.phaseSummary.dockIncidents} Issue{item.phaseSummary.dockIncidents > 1 ? 's' : ''} at Dock
                              </span>
                            ) : (
                              <span className="phase-incident-pill clean">✓ 0 Dock Issues</span>
                            )}
                          </div>
                        </div>

                        <div className="phase-seg-arrow">➔</div>

                        {/* Phase 2 Pill */}
                        <div className={`phase-overview-segment ${item.phaseSummary.transitBreakdowns > 0 ? 'segment-alert' : ''}`}>
                          <div className="phase-seg-header">
                            <span className="phase-num-dot">2</span>
                            <span className="phase-seg-title">Highway Transit Phase</span>
                          </div>
                          <div className="phase-seg-metrics">
                            <span className="phase-time-tag">
                              {t.tripDurationMinutes ? `Transit: ${formatMins(t.tripDurationMinutes)}` : 'In Transit'}
                            </span>
                            {item.phaseSummary.transitBreakdowns > 0 ? (
                              <span className="phase-incident-pill danger">
                                🚨 {item.phaseSummary.transitBreakdowns} Breakdown{item.phaseSummary.transitBreakdowns > 1 ? 's' : ''} En-route
                              </span>
                            ) : item.phaseSummary.transitIncidents > 0 ? (
                              <span className="phase-incident-pill warning">
                                ⚠️ {item.phaseSummary.transitIncidents} Incident{item.phaseSummary.transitIncidents > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="phase-incident-pill clean">✓ Smooth Transit</span>
                            )}
                          </div>
                        </div>

                        <div className="phase-seg-arrow">➔</div>

                        {/* Phase 3 Pill */}
                        <div className="phase-overview-segment">
                          <div className="phase-seg-header">
                            <span className="phase-num-dot">3</span>
                            <span className="phase-seg-title">Destination & Unload</span>
                          </div>
                          <div className="phase-seg-metrics">
                            <span className="phase-time-tag">
                              {t.unloadingDurationMinutes ? `Unload: ${formatMins(t.unloadingDurationMinutes)}` : isCompleted ? 'Completed' : 'Pending'}
                            </span>
                            {item.phaseSummary.fuelStops > 0 ? (
                              <span className="phase-incident-pill fuel">
                                ⛽ {item.phaseSummary.fuelStops} Fuel Refill
                              </span>
                            ) : item.phaseSummary.destIncidents > 0 ? (
                              <span className="phase-incident-pill warning">
                                ⚠️ {item.phaseSummary.destIncidents} Issues
                              </span>
                            ) : (
                              <span className="phase-incident-pill clean">✓ Finished Clean</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3. Unified Chronological Process Pipeline (Collapsible) */}
                      <div className="process-pipeline-section">
                        <div
                          className="pipeline-section-title clickable-collapse-header"
                          onClick={() => toggleTripCollapse(t.id)}
                          title="Click to collapse / expand chronological process pipeline"
                        >
                          <div className="pipeline-title-left">
                            <span className="collapse-chevron-icon">
                              {isPipelineCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            </span>
                            <span>Chronological Process Pipeline & Incident Log</span>
                          </div>
                          <div className="pipeline-title-right">
                            <span className="pipeline-items-count">{item.orderedEvents.length} Sequential Events</span>
                            <button
                              type="button"
                              className="btn-collapse-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTripCollapse(t.id);
                              }}
                            >
                              {isPipelineCollapsed ? (
                                <>
                                  <ChevronDown size={13} />
                                  <span>Expand Details</span>
                                </>
                              ) : (
                                <>
                                  <ChevronUp size={13} />
                                  <span>Collapse Details</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {isPipelineCollapsed ? (
                          <div
                            className="collapsed-pipeline-teaser"
                            onClick={() => toggleTripCollapse(t.id)}
                          >
                            <div className="teaser-info">
                              <span className="teaser-icon">📋</span>
                              <span>
                                Pipeline collapsed (<strong>{item.orderedEvents.length} events</strong>:{' '}
                                {item.orderedEvents.filter((e) => e.type === 'MILESTONE').length} milestones
                                {item.complaints.length > 0 ? `, ${item.complaints.length} issue(s)` : ''}
                                {item.fuelRecords.length > 0 ? `, ${item.fuelRecords.length} fuel stop(s)` : ''})
                              </span>
                            </div>
                            <span className="teaser-click-prompt">Click to expand step-by-step stream ▾</span>
                          </div>
                        ) : (
                          <div className="process-pipeline-stream">
                            {item.orderedEvents.map((evt, eIdx) => {
                            // Event 1: Milestone Steps
                            if (evt.type === 'MILESTONE') {
                              return (
                                <div key={evt.id} className="pipeline-node milestone-node">
                                  <div className="pipeline-spine">
                                    <div className="milestone-badge-circle">
                                      {evt.stepNumber === 1 && '📍'}
                                      {evt.stepNumber === 2 && '📦'}
                                      {evt.stepNumber === 3 && '🚛'}
                                      {evt.stepNumber === 4 && '🏁'}
                                      {evt.stepNumber === 5 && '✅'}
                                    </div>
                                    {eIdx < item.orderedEvents.length - 1 ? (
                                      <div className="spine-connector" />
                                    ) : null}
                                  </div>

                                  <div className="pipeline-content-box milestone-card-box">
                                    <div className="pipeline-header-row">
                                      <div className="milestone-title-wrap">
                                        <span className="milestone-step-tag">Step {evt.stepNumber} of 5</span>
                                        <h4 className="milestone-name">{evt.title}</h4>
                                        <span className="phase-indicator-badge">{evt.phaseName}</span>
                                      </div>
                                      <div className="pipeline-time-badge">
                                        <Clock size={12} />
                                        <span>{formatDateTime(evt.timestamp)}</span>
                                      </div>
                                    </div>

                                    {evt.subtitle ? (
                                      <p className="milestone-desc">{evt.subtitle}</p>
                                    ) : null}

                                    <div className="milestone-footer-row">
                                      {evt.location ? (
                                        <div className="milestone-loc-text">
                                          <MapPin size={12} />
                                          <span>{evt.location}</span>
                                        </div>
                                      ) : null}

                                      {evt.durationTag ? (
                                        <span className={`duration-pill ${evt.durationTag.variant}`}>
                                          ⏱️ {evt.durationTag.label}
                                        </span>
                                      ) : null}

                                      {evt.photoUrl ? (
                                        <button
                                          type="button"
                                          className="pipeline-proof-btn"
                                          onClick={() =>
                                            setPreviewPhoto({
                                              url: evt.photoUrl!,
                                              title: evt.photoTitle || evt.title,
                                            })
                                          }
                                        >
                                          <ImageIcon size={12} /> View Captured Photo
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // Event 2: Complaints & Breakdowns (Interleaved in Exact Chronological Order)
                            if (evt.type === 'COMPLAINT' && evt.complaint) {
                              const c = evt.complaint;
                              const isBreakdown = c.category === 'BREAKDOWN';
                              const isTyre = c.category === 'TYRE_ISSUE';
                              const isFuelIssue = c.category === 'FUEL_DEF';
                              const isSupport = c.category === 'SUPPORT';

                              return (
                                <div
                                  key={evt.id}
                                  className={`pipeline-node incident-node ${
                                    isBreakdown ? 'node-breakdown' : isTyre ? 'node-tyre' : isFuelIssue ? 'node-fuel' : 'node-support'
                                  }`}
                                >
                                  <div className="pipeline-spine">
                                    <div className="incident-alert-circle">
                                      {isBreakdown && '🚨'}
                                      {isTyre && '🛞'}
                                      {isFuelIssue && '⛽'}
                                      {isSupport && '📞'}
                                      {!isBreakdown && !isTyre && !isFuelIssue && !isSupport && '⚠️'}
                                    </div>
                                    {eIdx < item.orderedEvents.length - 1 ? (
                                      <div className="spine-connector alert-spine" />
                                    ) : null}
                                  </div>

                                  <div className="pipeline-content-box incident-card-box">
                                    {/* Incident Top Bar with Contextual Timing Callout */}
                                    <div className="incident-box-header">
                                      <div className="incident-badges-group">
                                        <span
                                          className={`badge ${
                                            isBreakdown
                                              ? 'badge-danger'
                                              : isTyre
                                              ? 'badge-amber'
                                              : isFuelIssue
                                              ? 'badge-warning'
                                              : 'badge-info'
                                          }`}
                                        >
                                          {isBreakdown && '🚨 '}
                                          {isTyre && '🛞 '}
                                          {isFuelIssue && '⛽ '}
                                          {c.category}
                                        </span>

                                        <span className="incident-ticket-code">{c.complaintNo}</span>

                                        <span className={`badge priority-${c.priority.toLowerCase()}`}>
                                          {c.priority} PRIORITY
                                        </span>

                                        <span className={`badge status-${c.status.toLowerCase()}`}>
                                          {c.status}
                                        </span>
                                      </div>

                                      <div className="pipeline-time-badge">
                                        <Clock size={12} />
                                        <span>{formatDateTime(evt.timestamp)}</span>
                                      </div>
                                    </div>

                                    {/* The critical "After Which Process" Callout Badge */}
                                    {evt.relativeContext ? (
                                      <div className="incident-relative-context-banner">
                                        <AlertTriangle size={13} />
                                        <strong>{evt.relativeContext}</strong>
                                        <span className="context-phase-tag">({evt.phaseName})</span>
                                      </div>
                                    ) : null}

                                    {/* Details */}
                                    <div className="incident-body">
                                      <h5 className="incident-title">{c.title}</h5>
                                      {c.description ? (
                                        <p className="incident-description">{c.description}</p>
                                      ) : null}
                                    </div>

                                    {/* Media Proof Actions */}
                                    <div className="incident-media-row">
                                      {c.voiceUrl ? (
                                        <a
                                          href={c.voiceUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="pipeline-audio-btn"
                                        >
                                          <Volume2 size={13} />
                                          <span>Listen to Driver Voice Note</span>
                                        </a>
                                      ) : null}

                                      {(c.photoUrls ?? []).map((pUrl, pIdx) => (
                                        <button
                                          key={pIdx}
                                          type="button"
                                          className="pipeline-proof-btn"
                                          onClick={() =>
                                            setPreviewPhoto({
                                              url: pUrl,
                                              title: `${c.complaintNo} Incident Proof #${pIdx + 1}`,
                                            })
                                          }
                                        >
                                          <ImageIcon size={12} /> Damage Proof #{pIdx + 1}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // Event 3: Fuel Refills
                            if (evt.type === 'FUEL' && evt.fuel) {
                              const f = evt.fuel;
                              return (
                                <div key={evt.id} className="pipeline-node fuel-node">
                                  <div className="pipeline-spine">
                                    <div className="fuel-refill-circle">⛽</div>
                                    {eIdx < item.orderedEvents.length - 1 ? (
                                      <div className="spine-connector" />
                                    ) : null}
                                  </div>

                                  <div className="pipeline-content-box fuel-card-box">
                                    <div className="pipeline-header-row">
                                      <div className="milestone-title-wrap">
                                        <span className="badge badge-success">⛽ {f.type} Refill</span>
                                        <h4 className="fuel-summary-title">
                                          {f.quantityLtr} Litres · <strong>₹{f.totalPrice.toLocaleString()}</strong>
                                        </h4>
                                      </div>
                                      <div className="pipeline-time-badge">
                                        <Clock size={12} />
                                        <span>{formatDateTime(evt.timestamp)}</span>
                                      </div>
                                    </div>

                                    {evt.relativeContext ? (
                                      <div className="fuel-relative-context-banner">
                                        <span>📍 {evt.relativeContext} ({evt.phaseName})</span>
                                      </div>
                                    ) : null}

                                    {f.notes ? (
                                      <div className="milestone-loc-text">
                                        <span>📝 Note: {f.notes}</span>
                                      </div>
                                    ) : null}

                                    {f.odometerKm ? (
                                      <div className="milestone-loc-text">
                                        <span>🚗 Odometer: {f.odometerKm.toLocaleString()} km</span>
                                      </div>
                                    ) : null}

                                    {f.receiptUrl ? (
                                      <div className="fuel-proof-row">
                                        <button
                                          type="button"
                                          className="pipeline-proof-btn"
                                          onClick={() =>
                                            setPreviewPhoto({
                                              url: f.receiptUrl!,
                                              title: `${f.type} Receipt Bill`,
                                            })
                                          }
                                        >
                                          <ImageIcon size={12} /> View Fuel Receipt Bill
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            }

                            return null;
                          })}
                        </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* MODE B: GROUP BY DATE (DAY-BY-DAY) */}
          {timelineMode === 'DATE' && (
            <div className="date-grouped-timeline">
              {timelineByDate.length === 0 ? (
                <div className="empty-state-box">
                  <Clock size={40} color="#94A3B8" />
                  <h3>No Activity Recorded</h3>
                  <p>No events found for this period.</p>
                </div>
              ) : (
                timelineByDate.map((group) => (
                  <div key={group.dateKey} className="date-section-block">
                    {/* Date Separator Header */}
                    <div className="date-separator-header">
                      <div className="date-header-badge">
                        <span>📅 {group.dateLabel}</span>
                        <span className="date-items-count">{group.items.length} Events</span>
                      </div>
                      <div className="date-divider-line" />
                    </div>

                    {/* Timeline list for this date */}
                    <div className="unified-timeline">
                      {group.items.map((item) => {
                        const isBreakdown =
                          item.eventType === 'COMPLAINT_REPORTED' && item.badgeVariant === 'danger';
                        return (
                          <div
                            key={item.id}
                            className={`timeline-item ${isBreakdown ? 'timeline-item-alert' : ''}`}
                          >
                            <div className="timeline-node">
                              {item.eventType.includes('LOADING') ? (
                                <Truck size={14} color="#FFFFFF" />
                              ) : null}
                              {item.eventType === 'TRIP_STARTED' ? (
                                <MapPin size={14} color="#FFFFFF" />
                              ) : null}
                              {item.eventType.includes('UNLOADING') ? (
                                <CheckCircle2 size={14} color="#FFFFFF" />
                              ) : null}
                              {item.eventType.includes('COMPLAINT') ? (
                                <AlertTriangle size={14} color="#FFFFFF" />
                              ) : null}
                              {item.eventType === 'FUEL_LOGGED' ? (
                                <Fuel size={14} color="#FFFFFF" />
                              ) : null}
                              {item.eventType === 'MAINTENANCE_LOGGED' ? (
                                <Wrench size={14} color="#FFFFFF" />
                              ) : null}
                            </div>

                            <div className="timeline-card">
                              <div className="timeline-header">
                                <div className="timeline-title-row">
                                  <span className="timeline-title">{item.title}</span>
                                  {item.badgeText ? (
                                    <span className={`badge badge-${item.badgeVariant ?? 'default'}`}>
                                      {item.badgeText}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="timeline-time">
                                  {formatDateTime(item.timestamp)}
                                </span>
                              </div>

                              {item.description ? (
                                <p className="timeline-desc">{item.description}</p>
                              ) : null}

                              {item.location ? (
                                <div className="timeline-loc">
                                  <MapPin size={13} />
                                  <span>{item.location}</span>
                                </div>
                              ) : null}

                              {item.photoUrl ? (
                                <div className="timeline-photo-row">
                                  <button
                                    type="button"
                                    className="proof-thumb-btn"
                                    onClick={() =>
                                      setPreviewPhoto({ url: item.photoUrl!, title: item.title })
                                    }
                                  >
                                    <ImageIcon size={14} />
                                    <span>View Captured Proof</span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Trip & Loading Milestones Table */}
      {activeTab === 'TRIPS' && (
        <div className="report-tab-content">
          <div className="table-responsive">
            <table className="report-data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Reached Loading</th>
                  <th>Loading Done</th>
                  <th>Loading Wait</th>
                  <th>Trip Start</th>
                  <th>Destination Reached</th>
                  <th>Transit Time</th>
                  <th>Unloading Done</th>
                  <th>Unloading Wait</th>
                  <th>Proof Photos</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.trips.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-6 text-muted">
                      No trip records found for this vehicle.
                    </td>
                  </tr>
                ) : (
                  reportData?.trips.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span
                          className={`badge ${
                            t.status === 'TRIP_COMPLETED' ? 'badge-success' : 'badge-info'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div className="time-cell">{formatDateTime(t.reachedAt)}</div>
                        {t.reachedAddress ? <div className="addr-cell">{t.reachedAddress}</div> : null}
                      </td>
                      <td>
                        {t.completedAt ? (
                          <>
                            <div className="time-cell">{formatDateTime(t.completedAt)}</div>
                            {t.completedAddress ? (
                              <div className="addr-cell">{t.completedAddress}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="wait-badge">{formatMins(t.waitingTimeMinutes)}</span>
                      </td>
                      <td>
                        {t.tripStartedAt ? (
                          <>
                            <div className="time-cell">{formatDateTime(t.tripStartedAt)}</div>
                            {t.tripStartAddress ? (
                              <div className="addr-cell">{t.tripStartAddress}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {t.tripCompletedAt ? (
                          <>
                            <div className="time-cell">{formatDateTime(t.tripCompletedAt)}</div>
                            {t.tripCompletedAddress ? (
                              <div className="addr-cell">{t.tripCompletedAddress}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="transit-badge">{formatMins(t.tripDurationMinutes)}</span>
                      </td>
                      <td>
                        {t.unloadingCompletedAt ? (
                          <>
                            <div className="time-cell">
                              {formatDateTime(t.unloadingCompletedAt)}
                            </div>
                            {t.unloadingAddress ? (
                              <div className="addr-cell">{t.unloadingAddress}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="wait-badge purple">
                          {formatMins(t.unloadingDurationMinutes)}
                        </span>
                      </td>
                      <td>
                        <div className="proof-action-group">
                          {t.reachedPhotoUrl ? (
                            <button
                              type="button"
                              className="thumb-btn"
                              title="Loading Dock Photo"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: t.reachedPhotoUrl!,
                                  title: 'Loading Dock Proof',
                                })
                              }
                            >
                              <ImageIcon size={14} /> Dock
                            </button>
                          ) : null}
                          {t.completedPhotoUrl ? (
                            <button
                              type="button"
                              className="thumb-btn"
                              title="Loaded Cargo Photo"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: t.completedPhotoUrl!,
                                  title: 'Cargo Loaded Proof',
                                })
                              }
                            >
                              <ImageIcon size={14} /> Cargo
                            </button>
                          ) : null}
                          {t.tripCompletedPhotoUrl ? (
                            <button
                              type="button"
                              className="thumb-btn"
                              title="Destination Arrival Photo"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: t.tripCompletedPhotoUrl!,
                                  title: 'Destination Proof',
                                })
                              }
                            >
                              <ImageIcon size={14} /> Dest.
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 3: Issues & Breakdowns Table */}
      {activeTab === 'COMPLAINTS' && (
        <div className="report-tab-content">
          <div className="table-responsive">
            <table className="report-data-table">
              <thead>
                <tr>
                  <th>Ticket No</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Issue Details</th>
                  <th>Reported At</th>
                  <th>Resolved At</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.complaints.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-muted">
                      No complaints or breakdowns recorded for this vehicle.
                    </td>
                  </tr>
                ) : (
                  reportData?.complaints.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="ticket-no">{c.complaintNo}</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            c.category === 'BREAKDOWN' ? 'badge-danger' : 'badge-default'
                          }`}
                        >
                          {c.category}
                        </span>
                      </td>
                      <td>
                        <span className={`badge priority-${c.priority.toLowerCase()}`}>
                          {c.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge status-${c.status.toLowerCase()}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className="issue-title">{c.title}</div>
                        <div className="issue-desc">{c.description}</div>
                      </td>
                      <td>{formatDateTime(c.createdAt)}</td>
                      <td>
                        {c.resolvedAt ? (
                          formatDateTime(c.resolvedAt)
                        ) : (
                          <span className="text-muted">Unresolved</span>
                        )}
                      </td>
                      <td>
                        <div className="proof-action-group">
                          {c.voiceUrl ? (
                            <a
                              href={c.voiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="thumb-btn audio-btn"
                              title="Listen to Driver Voice Note"
                            >
                              <Volume2 size={14} /> Voice
                            </a>
                          ) : null}
                          {(c.photoUrls ?? []).map((url, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="thumb-btn"
                              onClick={() =>
                                setPreviewPhoto({ url, title: `Complaint Evidence #${idx + 1}` })
                              }
                            >
                              <ImageIcon size={14} /> Photo {idx + 1}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 4: Fuel & Maintenance Ledger */}
      {activeTab === 'MAINTENANCE' && (
        <div className="report-tab-content">
          <div className="maintenance-sections-grid">
            {/* Fuel & DEF Section */}
            <div className="sub-section-card">
              <div className="sub-section-header">
                <Fuel size={18} color="#0D5C3A" />
                <h3>Fuel & DEF Refills</h3>
              </div>
              <div className="table-responsive">
                <table className="report-data-table compact">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Total Cost</th>
                      <th>Odometer</th>
                      <th>Date</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData?.fuelRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted">
                          No fuel logs recorded.
                        </td>
                      </tr>
                    ) : (
                      reportData?.fuelRecords.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <span className="badge badge-info">{f.type}</span>
                          </td>
                          <td>
                            <strong>{f.quantityLtr} L</strong>
                          </td>
                          <td>₹{f.totalPrice.toLocaleString()}</td>
                          <td>{f.odometerKm ? `${f.odometerKm} km` : '—'}</td>
                          <td>{formatDateTime(f.createdAt)}</td>
                          <td>
                            {f.receiptUrl ? (
                              <button
                                type="button"
                                className="thumb-btn"
                                onClick={() =>
                                  setPreviewPhoto({ url: f.receiptUrl!, title: `${f.type} Receipt` })
                                }
                              >
                                <ImageIcon size={14} /> Bill
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tyre & Battery Maintenance Section */}
            <div className="sub-section-card">
              <div className="sub-section-header">
                <Wrench size={18} color="#0D5C3A" />
                <h3>Tyre & Battery Services</h3>
              </div>
              <div className="table-responsive">
                <table className="report-data-table compact">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Item / Brand</th>
                      <th>Position</th>
                      <th>Cost</th>
                      <th>Date</th>
                      <th>Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData?.maintenanceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted">
                          No tyre/battery maintenance logs.
                        </td>
                      </tr>
                    ) : (
                      reportData?.maintenanceRecords.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <span className="badge badge-default">{m.type}</span>
                          </td>
                          <td>
                            <strong>{m.brand || m.itemNumber}</strong>
                          </td>
                          <td>{m.position || '—'}</td>
                          <td>{m.cost ? `₹${m.cost.toLocaleString()}` : '—'}</td>
                          <td>{formatDateTime(m.createdAt)}</td>
                          <td>
                            {m.photoUrl ? (
                              <button
                                type="button"
                                className="thumb-btn"
                                onClick={() =>
                                  setPreviewPhoto({
                                    url: m.photoUrl!,
                                    title: `${m.type} Service Proof`,
                                  })
                                }
                              >
                                <ImageIcon size={14} /> Photo
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Modal Lightbox for Proof Photos */}
      {previewPhoto ? (
        <div className="modal-backdrop" onClick={() => setPreviewPhoto(null)}>
          <div className="modal-dialog-photo" onClick={(e) => e.stopPropagation()}>
            <div className="modal-photo-header">
              <h3>{previewPhoto.title}</h3>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setPreviewPhoto(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-photo-body">
              <img src={previewPhoto.url} alt={previewPhoto.title} className="modal-photo-img" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
