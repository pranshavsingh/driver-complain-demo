import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius } from '../../theme';

interface StatusBadgeProps {
  status: string;
  type?: 'status' | 'priority' | 'role' | 'category';
}

export function StatusBadge({ status, type = 'status' }: StatusBadgeProps): ReactElement {
  const getBadgeStyle = (): { bg: string; color: string; label: string } => {
    const s = (status || '').toUpperCase();

    if (type === 'priority') {
      switch (s) {
        case 'CRITICAL':
          return { bg: '#FEE2E2', color: '#991B1B', label: 'CRITICAL' };
        case 'HIGH':
          return { bg: '#FFEDD5', color: '#C2410C', label: 'HIGH' };
        case 'MEDIUM':
          return { bg: '#FEF3C7', color: '#B45309', label: 'MEDIUM' };
        case 'LOW':
        default:
          return { bg: '#F1F5F9', color: '#475569', label: 'LOW' };
      }
    }

    if (type === 'role') {
      switch (s) {
        case 'SUPER_ADMIN':
          return { bg: '#F3E8FF', color: '#7E22CE', label: 'SUPER ADMIN' };
        case 'ADMIN':
          return { bg: '#E0F2FE', color: '#0369A1', label: 'ADMIN' };
        case 'EXECUTIVE':
          return { bg: '#DCFCE7', color: '#15803D', label: 'EXECUTIVE' };
        case 'DRIVER':
        default:
          return { bg: '#FEF3C7', color: '#B45309', label: 'DRIVER' };
      }
    }

    // Default: status
    switch (s) {
      case 'NEW':
      case 'SUBMITTED':
        return { bg: '#FEF3C7', color: '#B45309', label: s === 'NEW' ? 'New' : 'Submitted' };
      case 'ACKNOWLEDGED':
      case 'IN_REVIEW':
      case 'IN_PROGRESS':
        return { bg: '#E0F2FE', color: '#0369A1', label: s.replace('_', ' ') };
      case 'RESOLVED':
      case 'APPROVED':
      case 'ACTIVE':
        return { bg: '#DCFCE7', color: '#15803D', label: s };
      case 'REJECTED':
      case 'DECOMMISSIONED':
      case 'CLOSED':
        return { bg: '#FEE2E2', color: '#B91C1C', label: s };
      default:
        return { bg: '#F1F5F9', color: '#475569', label: s };
    }
  };

  const badge = getBadgeStyle();

  return (
    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
