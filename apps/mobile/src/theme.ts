import type { ComplaintStatus, Priority } from '@driver-complaint/shared-types';

/**
 * One place for colours, spacing and type sizes.
 *
 * Sized for the actual user: a driver, outdoors, in gloves, on a phone that may be dusty and
 * cracked. Body text starts at 16 and never goes below 13; every tappable thing is at least
 * 48dp tall (Android's accessibility minimum) and most are 56. Contrast is kept high enough to
 * read in sunlight rather than looking elegant in a design tool.
 */
export const colors = {
  background: '#f4f5f7',
  surface: '#ffffff',
  border: '#d7dae0',
  text: '#14181f',
  textMuted: '#5c6473',
  primary: '#12508f',
  primaryText: '#ffffff',
  primaryDisabled: '#9fb4cc',
  danger: '#a4201f',
  dangerSurface: '#fdecec',
  successSurface: '#e6f4ea',
  success: '#1c6b33',
  warningSurface: '#fff4e0',
  warning: '#8a5300',
  infoSurface: '#e7effa',
  info: '#12508f',
  neutralSurface: '#eceef1',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  pill: 999,
} as const;

export const fontSize = {
  small: 13,
  body: 16,
  large: 18,
  title: 22,
  hero: 26,
} as const;

/** Minimum tap target. Android's accessibility guidance is 48dp; controls that matter get more. */
export const TAP_TARGET = 48;

interface Tone {
  surface: string;
  text: string;
}

/** Status colours match the dashboard's intent: blue = open, green = done, grey = closed. */
export const STATUS_TONES: Record<ComplaintStatus, Tone> = {
  NEW: { surface: colors.infoSurface, text: colors.info },
  IN_PROGRESS: { surface: colors.warningSurface, text: colors.warning },
  RESOLVED: { surface: colors.successSurface, text: colors.success },
  CLOSED: { surface: colors.neutralSurface, text: colors.textMuted },
};

export const PRIORITY_TONES: Record<Priority, Tone> = {
  LOW: { surface: colors.neutralSurface, text: colors.textMuted },
  MEDIUM: { surface: colors.infoSurface, text: colors.info },
  HIGH: { surface: colors.warningSurface, text: colors.warning },
  URGENT: { surface: colors.dangerSurface, text: colors.danger },
};
