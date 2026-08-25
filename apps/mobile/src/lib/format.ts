/**
 * Display helpers.
 *
 * Dates are formatted by hand rather than with Intl.DateTimeFormat. Intl support on Android
 * depends on how the JS engine was built, and a driver's cheap phone is exactly where it can
 * be missing or produce a different string. Manual formatting is dull, dependency-free, and
 * identical on every device — which matters when a screenshot from a driver has to match what
 * an admin sees.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

/** ISO timestamp → "22 Aug 2026, 13:05" in the phone's local time. Nullable → em dash. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const month = MONTHS[date.getMonth()] ?? '';
  return `${String(date.getDate())} ${month} ${String(date.getFullYear())}, ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

/** ISO timestamp → "22 Aug 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const month = MONTHS[date.getMonth()] ?? '';
  return `${String(date.getDate())} ${month} ${String(date.getFullYear())}`;
}

/** Seconds → "0:07" / "1:45", for voice notes and video clips. */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  return `${String(Math.floor(whole / 60))}:${pad2(whole % 60)}`;
}

/** SCREAMING_SNAKE enum → "Screaming snake", for labels. */
export function formatEnum(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Dana Driver" from any object carrying first and last names. */
export function fullName(party: { firstName: string; lastName: string }): string {
  return `${party.firstName} ${party.lastName}`.trim();
}

/** Describe a vehicle in one line: "ABC-1234 · Toyota Hilux". */
export function describeVehicle(vehicle: {
  plateNumber: string;
  make?: string | null;
  model?: string | null;
}): string {
  const parts = [vehicle.make, vehicle.model].filter((p): p is string => Boolean(p));
  return parts.length === 0 ? vehicle.plateNumber : `${vehicle.plateNumber} · ${parts.join(' ')}`;
}
