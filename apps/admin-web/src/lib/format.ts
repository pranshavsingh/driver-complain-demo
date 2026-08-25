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

