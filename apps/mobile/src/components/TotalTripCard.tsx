import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { radius, spacing } from '../theme';

interface TotalTripCardProps {
  monthlyTripsCount: number;
  completedTripsCount: number;
}

export function TotalTripCard({
  monthlyTripsCount,
  completedTripsCount,
}: TotalTripCardProps): ReactElement {
  const currentMonthName = new Date().toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Card title="Total Trip Summary 📊">
      <View style={styles.container}>
        {/* Month Header Banner */}
        <View style={styles.monthHeaderRow}>
          <View style={styles.monthTag}>
            <Ionicons name="calendar" size={16} color="#047857" />
            <Text style={styles.monthTagText}>{currentMonthName}</Text>
          </View>
          <View style={styles.statusPill}>
            <Ionicons name="checkmark-done-circle" size={14} color="#065F46" />
            <Text style={styles.statusPillText}>Active Driver</Text>
          </View>
        </View>

        {/* 2 Main Metric Boxes */}
        <View style={styles.statsGrid}>
          {/* Box 1: Monthly Trip Count */}
          <View style={[styles.statBox, styles.monthlyBox]}>
            <View style={styles.statHeader}>
              <View style={[styles.iconCircle, styles.monthlyIconCircle]}>
                <Ionicons name="bus" size={20} color="#047857" />
              </View>
              <Text style={styles.statLabel}>Monthly Trips</Text>
            </View>
            <Text style={styles.monthlyValueText}>{monthlyTripsCount}</Text>
            <Text style={styles.statSubtext}>Completed in {new Date().toLocaleString('en-US', { month: 'short' })}</Text>
          </View>

          {/* Box 2: Total Completed Trips (Lifetime) */}
          <View style={[styles.statBox, styles.totalBox]}>
            <View style={styles.statHeader}>
              <View style={[styles.iconCircle, styles.totalIconCircle]}>
                <Ionicons name="trophy" size={20} color="#D97706" />
              </View>
              <Text style={styles.statLabel}>Total Trips</Text>
            </View>
            <Text style={styles.totalValueText}>{completedTripsCount}</Text>
            <Text style={styles.statSubtext}>Lifetime Completed</Text>
          </View>
        </View>

        {/* Footer Summary Note */}
        <View style={styles.summaryBar}>
          <Ionicons name="information-circle" size={18} color="#0369A1" />
          <Text style={styles.summaryText}>
            You have logged <Text style={styles.highlightText}>{monthlyTripsCount} trips</Text> this month. Keep up the great work! 🚛
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  monthTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  monthlyBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  totalBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthlyIconCircle: {
    backgroundColor: '#DCFCE7',
  },
  totalIconCircle: {
    backgroundColor: '#FEF3C7',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    flexShrink: 1,
  },
  monthlyValueText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  totalValueText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  statSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E0F2FE',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  summaryText: {
    fontSize: 13,
    color: '#0C4A6E',
    flex: 1,
    lineHeight: 18,
  },
  highlightText: {
    fontWeight: '800',
    color: '#0369A1',
  },
});
