/** Display helpers. Kept dumb and dependency-free — no date library for four call sites. */

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** ISO timestamp → "22 Aug 2026, 13:05" in the admin's locale. Nullable → em dash. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
}

/** SCREAMING_SNAKE enum → "Screaming snake", for labels and table cells. */
export function formatEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Dana Driver" from any object carrying first and last names. */
export function fullName(party: { firstName: string; lastName: string }): string {
  return `${party.firstName} ${party.lastName}`.trim();
}

/** Bytes → "1.4 MB", for attachment sizes. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Seconds → "0:07" / "1:45", for voice-note and video runtimes. Nullable → empty. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '';
  const whole = Math.max(0, Math.round(totalSeconds));
  const seconds = whole % 60;
  return `${String(Math.floor(whole / 60))}:${seconds < 10 ? '0' : ''}${String(seconds)}`;
}

export function describeVehicle(vehicle: { plateNumber: string; make?: string | null; model?: string | null }): string {
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
  return name ? `${vehicle.plateNumber} (${name})` : vehicle.plateNumber;
}

export interface SlaInfo {
  elapsedText: string;
  slaText: string;
  isOverdue: boolean;
  status: 'RESOLVED' | 'ON_TRACK' | 'WARNING' | 'OVERDUE' | 'NO_SLA';
  isNoSla?: boolean;
  targetHours?: number;
}

export const EXCLUDED_SLA_CATEGORIES = new Set<string>(['SUPPORT', 'COMPLAINT_STATUS']);

export const DEFAULT_CATEGORY_SLA_HOURS: Record<string, number> = {
  BREAKDOWN: 2,
  MEDICAL_EMERGENCY: 2,
  TYRE_ISSUE: 4,
  FUEL_DEF: 4,
  LOADING: 12,
  UNLOADING: 12,
  VEHICLE_MAINTENANCE: 24,
  ACCOUNTS: 24,
};

/**
 * Computes elapsed aging and operational SLA target dynamically based on category SLA configurations.
 * Categories SUPPORT and COMPLAINT_STATUS are excluded from SLA requirements.
 */
export function computeSlaInfo(
  createdAt: string,
  categoryOrPriority?: string | null,
  resolvedAt?: string | null,
  categorySlaMap?: Record<string, number> | Map<string, number> | null,
  priorityFallback?: string | null,
): SlaInfo {
  const created = new Date(createdAt).getTime();
  const now = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, now - created);

  const formatHrsMins = (ms: number) => {
    const totalMins = Math.floor(Math.abs(ms) / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const elapsedText = resolvedAt ? `Resolved in ${formatHrsMins(elapsedMs)}` : `${formatHrsMins(elapsedMs)} ago`;

  // Check if category is excluded (SUPPORT or COMPLAINT_STATUS)
  if (categoryOrPriority && EXCLUDED_SLA_CATEGORIES.has(categoryOrPriority)) {
    return {
      elapsedText,
      slaText: 'N/A (No SLA Target)',
      isOverdue: false,
      status: 'NO_SLA',
      isNoSla: true,
    };
  }

  let slaHours = 12;

  if (categoryOrPriority) {
    let mapVal: number | undefined;
    if (categorySlaMap) {
      mapVal = categorySlaMap instanceof Map ? categorySlaMap.get(categoryOrPriority) : categorySlaMap[categoryOrPriority];
    }

    if (mapVal !== undefined && mapVal > 0) {
      slaHours = mapVal;
    } else if (DEFAULT_CATEGORY_SLA_HOURS[categoryOrPriority] !== undefined) {
      slaHours = DEFAULT_CATEGORY_SLA_HOURS[categoryOrPriority];
    } else if (categoryOrPriority === 'URGENT') slaHours = 2;
    else if (categoryOrPriority === 'HIGH') slaHours = 4;
    else if (categoryOrPriority === 'LOW') slaHours = 24;
    else if (priorityFallback === 'URGENT') slaHours = 2;
    else if (priorityFallback === 'HIGH') slaHours = 4;
    else if (priorityFallback === 'LOW') slaHours = 24;
  }

  const slaMs = slaHours * 60 * 60 * 1000;
  const remainingMs = slaMs - elapsedMs;

  if (resolvedAt) {
    const withinSla = elapsedMs <= slaMs;
    return {
      elapsedText,
      slaText: withinSla ? `SLA Met (${formatHrsMins(elapsedMs)})` : `SLA Breached (${formatHrsMins(elapsedMs)})`,
      isOverdue: !withinSla,
      status: 'RESOLVED',
      targetHours: slaHours,
    };
  }

  if (remainingMs <= 0) {
    return {
      elapsedText,
      slaText: `Overdue by ${formatHrsMins(remainingMs)}`,
      isOverdue: true,
      status: 'OVERDUE',
      targetHours: slaHours,
    };
  }

  const isWarning = remainingMs < slaMs * 0.35;
  return {
    elapsedText,
    slaText: `SLA: ${formatHrsMins(remainingMs)} left (${slaHours}h target)`,
    isOverdue: false,
    status: isWarning ? 'WARNING' : 'ON_TRACK',
    targetHours: slaHours,
  };
}


