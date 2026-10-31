import { useMemo, useState, type ReactElement } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LoadingRecord } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../src/components/admin/FilterBar';
import { EmptyState } from '../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../src/components/LoadingSystem';
import { radius, spacing } from '../../../src/theme';

const TRIP_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All Trips' },
  { id: 'REACHED_LOADING', label: 'At Loading Point' },
  { id: 'LOADING_COMPLETED', label: 'Loaded' },
  { id: 'IN_TRANSIT', label: 'In Transit' },
  { id: 'COMPLETED', label: 'Delivered' },
];

export default function LoadingTrackerAdminScreen(): ReactElement {
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadingResource = useApiResource('admin:loading:list', () =>
    api.loading.list()
  );

  const trips: LoadingRecord[] = useMemo(() => {
    return loadingResource.data?.data ?? [];
  }, [loadingResource.data]);

  const filtered = useMemo(() => {
    let list = trips;

    if (selectedFilter !== 'ALL') {
      list = list.filter((t) => t.status === selectedFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.vehiclePlate?.toLowerCase().includes(q) ||
          t.driverId?.toLowerCase().includes(q) ||
          t.reachedAddress?.toLowerCase().includes(q) ||
          t.locationName?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [trips, selectedFilter, searchQuery]);

  const getStageBadge = (status: string) => {
    switch (status) {
      case 'REACHED_LOADING':
        return { bg: '#FEF3C7', color: '#B45309', label: 'At Loading' };
      case 'LOADING_COMPLETED':
        return { bg: '#E0F2FE', color: '#0369A1', label: 'Loading Done' };
      case 'IN_TRANSIT':
        return { bg: '#F3E8FF', color: '#7E22CE', label: 'In Transit' };
      case 'REACHED_UNLOADING':
        return { bg: '#FED7AA', color: '#C2410C', label: 'At Unloading' };
      case 'COMPLETED':
        return { bg: '#DCFCE7', color: '#15803D', label: 'Delivered' };
      default:
        return { bg: '#F1F5F9', color: '#475569', label: status };
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Loading & Trip Tracker"
        subtitle={`${filtered.length} active fleet dispatches`}
        showBack
      />

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by vehicle, driver, or location..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* Filter Bar */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={TRIP_FILTERS}
          selectedId={selectedFilter}
          onSelect={setSelectedFilter}
        />
      </View>

      {/* Trips List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingResource.loading && loadingResource.data !== null}
            onRefresh={() => loadingResource.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          loadingResource.loading && loadingResource.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="navigate-outline"
              title="No active trip dispatches"
              message="No vehicles currently in transit or loading stages."
              actionLabel="Refresh Dispatches"
              onAction={() => loadingResource.reload()}
            />
          )
        }
        renderItem={({ item }) => {
          const badge = getStageBadge(item.status);

          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.plateTag}>
                  <Ionicons name="bus" size={16} color="#0F172A" />
                  <Text style={styles.plateText}>{item.vehiclePlate || 'Assigned Fleet'}</Text>
                </View>
                <View style={[styles.badgePill, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.driverText}>
                  Driver: <Text style={{ fontWeight: '700' }}>{item.driverName || item.driverId}</Text>
                </Text>
              </View>

              {(item.reachedAddress || item.locationName) && (
                <View style={styles.locationRow}>
                  <Ionicons name="location" size={14} color="#64748B" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {item.reachedAddress || item.locationName}
                  </Text>
                </View>
              )}

              {/* Progress Milestones */}
              <View style={styles.milestonesRow}>
                <View style={styles.milestone}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: item.reachedAt ? '#10B981' : '#CBD5E1' },
                    ]}
                  />
                  <Text style={styles.milestoneLabel}>Reached</Text>
                </View>

                <View style={styles.line} />

                <View style={styles.milestone}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: item.completedAt ? '#10B981' : '#CBD5E1' },
                    ]}
                  />
                  <Text style={styles.milestoneLabel}>Loaded</Text>
                </View>

                <View style={styles.line} />

                <View style={styles.milestone}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: item.tripStartedAt ? '#10B981' : '#CBD5E1' },
                    ]}
                  />
                  <Text style={styles.milestoneLabel}>Transit</Text>
                </View>

                <View style={styles.line} />

                <View style={styles.milestone}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: item.unloadingCompletedAt ? '#10B981' : '#CBD5E1' },
                    ]}
                  />
                  <Text style={styles.milestoneLabel}>Delivered</Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                  Started: {new Date(item.createdAt).toLocaleDateString()} at{' '}
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A' },
  filterWrap: { backgroundColor: '#F8FAFC' },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  plateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  infoRow: {
    marginTop: spacing.xs + 2,
  },
  driverText: {
    fontSize: 12,
    color: '#475569',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },
  milestonesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  milestone: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  milestoneLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 14,
  },
  cardFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  centerLoading: { padding: spacing.xl, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#64748B' },
});
