import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ComplaintStatus, Priority } from '@driver-complaint/shared-types';
import { PRIORITY_TONES, STATUS_TONES, fontSize, radius, spacing } from '../theme';
import { formatEnum } from '../lib/format';

/**
 * Status and priority chips. Colour carries the same meaning as on the dashboard, but the word
 * is always present too — a chip that only differs by colour is unreadable to a colour-blind
 * driver and invisible in bright sun.
 */
export function StatusBadge({ status }: { status: ComplaintStatus }): ReactElement {
  const tone = STATUS_TONES[status];
  return (
    <Text style={[styles.badge, { backgroundColor: tone.surface, color: tone.text }]}>
      {formatEnum(status)}
    </Text>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }): ReactElement {
  const tone = PRIORITY_TONES[priority];
  return (
    <Text style={[styles.badge, { backgroundColor: tone.surface, color: tone.text }]}>
      {formatEnum(priority)}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    fontSize: fontSize.small,
    fontWeight: '700',
  },
});
