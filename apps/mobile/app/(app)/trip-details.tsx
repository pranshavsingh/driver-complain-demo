import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LoadingRecord } from '@driver-complaint/shared-types';
import * as api from '../../src/api/endpoints';
import { useApiResource } from '../../src/hooks/useApiResource';
import { radius, spacing } from '../../src/theme';

function displayDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function locationText(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function TripCard({ trip }: { trip: LoadingRecord }): ReactElement {
  const completed = trip.status === 'TRIP_COMPLETED';

  return (
    <View style={styles.tripCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.tripIcon}>
          <Ionicons name="navigate" size={20} color="#075985" />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.tripTitle}>{trip.locationName || 'Driver trip'}</Text>
          <Text style={styles.tripDate}>{displayDate(trip.tripStartedAt || trip.reachedAt)}</Text>
        </View>
        <View style={[styles.statusPill, completed ? styles.completePill : styles.activePill]}>
          <Text style={[styles.statusText, completed ? styles.completeText : styles.activeText]}>
            {completed ? 'Completed' : trip.status === 'TRIP_STARTED' ? 'In progress' : 'Loading'}
          </Text>
        </View>
      </View>

      <View style={styles.route}>
        <View style={styles.routeRail}>
          <View style={[styles.routeDot, styles.startDot]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, styles.endDot]} />
        </View>
        <View style={styles.routeDetails}>
          <View>
            <Text style={styles.routeLabel}>START</Text>
            <Text style={styles.routeAddress}>
              {locationText(trip.tripStartAddress || trip.reachedAddress, 'Start location recorded by GPS')}
            </Text>
          </View>
          <View>
            <Text style={styles.routeLabel}>DESTINATION</Text>
            <Text style={styles.routeAddress}>
              {locationText(trip.tripCompletedAddress, completed ? 'Destination recorded by GPS' : 'Trip not completed yet')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Ionicons name="time-outline" size={18} color="#475569" />
          <View>
            <Text style={styles.metricLabel}>Trip time</Text>
            <Text style={styles.metricValue}>{trip.formattedTripDuration || (completed ? '< 1 min' : 'Running')}</Text>
          </View>
        </View>
        <View style={styles.metric}>
          <Ionicons name="hourglass-outline" size={18} color="#475569" />
          <View>
            <Text style={styles.metricLabel}>Loading wait</Text>
            <Text style={styles.metricValue}>{trip.formattedWaitingTime || 'Not completed'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TripDetailsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const trips = useApiResource('loading:mine', () => api.loading.mine());
  const records = trips.data ?? [];
  const completed = records.filter((record) => record.status === 'TRIP_COMPLETED');
  const monthlyCount = completed.filter((record) => {
    const date = new Date(record.tripCompletedAt || record.updatedAt);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Trip Details</Text>
          <Text style={styles.headerSubtitle}>Your loading and delivery history</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={trips.loading && records.length > 0} onRefresh={trips.reload} />}
      >
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, styles.monthBox]}>
            <Text style={styles.summaryLabel}>THIS MONTH</Text>
            <Text style={styles.monthValue}>{monthlyCount}</Text>
            <Text style={styles.summaryCaption}>Completed trips</Text>
          </View>
          <View style={[styles.summaryBox, styles.totalBox]}>
            <Text style={styles.summaryLabel}>ALL TIME</Text>
            <Text style={styles.totalValue}>{completed.length}</Text>
            <Text style={styles.summaryCaption}>Completed trips</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent trips</Text>

        {trips.loading && records.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#075E54" />
            <Text style={styles.stateText}>Loading trip details...</Text>
          </View>
        ) : trips.error ? (
          <View style={styles.centerState}>
            <Ionicons name="cloud-offline-outline" size={30} color="#B91C1C" />
            <Text style={styles.errorText}>Trip details could not be loaded.</Text>
            <Pressable style={styles.retryButton} onPress={trips.reload}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="map-outline" size={34} color="#64748B" />
            <Text style={styles.emptyTitle}>No trips recorded yet</Text>
            <Text style={styles.stateText}>Completed loading and delivery trips will appear here.</Text>
          </View>
        ) : (
          records.map((trip) => <TripCard key={trip.id} trip={trip} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.md, backgroundColor: '#075E54' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#CCFBF1', fontSize: 11, marginTop: 2 },
  headerSpacer: { width: 40 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryBox: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  monthBox: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  totalBox: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  monthValue: { fontSize: 30, fontWeight: '800', color: '#047857' },
  totalValue: { fontSize: 30, fontWeight: '800', color: '#B45309' },
  summaryCaption: { fontSize: 11, color: '#64748B' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginTop: spacing.xs },
  tripCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1 },
  tripTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  tripDate: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill },
  completePill: { backgroundColor: '#DCFCE7' },
  activePill: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 10, fontWeight: '800' },
  completeText: { color: '#166534' },
  activeText: { color: '#92400E' },
  route: { flexDirection: 'row', gap: spacing.sm },
  routeRail: { width: 18, alignItems: 'center', paddingVertical: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  startDot: { backgroundColor: '#0284C7' },
  endDot: { backgroundColor: '#16A34A' },
  routeLine: { width: 2, flex: 1, minHeight: 38, backgroundColor: '#CBD5E1' },
  routeDetails: { flex: 1, gap: spacing.md },
  routeLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },
  routeAddress: { fontSize: 12, fontWeight: '600', color: '#334155', marginTop: 2, lineHeight: 17 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: spacing.md, gap: spacing.md },
  metric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metricLabel: { fontSize: 10, color: '#64748B' },
  metricValue: { fontSize: 12, fontWeight: '800', color: '#1E293B', marginTop: 1 },
  centerState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  stateText: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  errorText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#334155' },
  retryButton: { backgroundColor: '#075E54', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.sm },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
