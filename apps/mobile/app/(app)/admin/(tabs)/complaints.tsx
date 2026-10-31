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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComplaintPublic } from '@driver-complaint/shared-types';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { FilterBar, type FilterOption } from '../../../../src/components/admin/FilterBar';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { EmptyState } from '../../../../src/components/admin/EmptyState';
import { SkeletonList } from '../../../../src/components/LoadingSystem';
import { getUserCategories } from '../../../../src/auth/permissions';
import { radius, spacing } from '../../../../src/theme';

const STATUS_FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'All' },
  { id: 'NEW', label: 'New' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'CLOSED', label: 'Closed' },
];

export default function ComplaintsListScreen(): ReactElement {
  const { user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const complaints = useApiResource('admin:complaints:list', () =>
    api.complaints.list({ pageSize: 100 })
  );

  const userCats = useMemo(() => getUserCategories(user), [user]);

  const filteredItems = useMemo(() => {
    let list: ComplaintPublic[] = complaints.data?.data ?? [];

    // Filter by assigned categories for Executive / Admin
    if (userCats.length > 0 && user?.role !== 'SUPER_ADMIN') {
      list = list.filter((c) => c.category && userCats.includes(c.category));
    }

    // Filter by status
    if (selectedStatus !== 'ALL') {
      list = list.filter((c) => c.status === selectedStatus);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.vehiclePlateNumber?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [complaints.data, userCats, user?.role, selectedStatus, searchQuery]);

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="Incident Complaints"
        subtitle={`${filteredItems.length} records found`}
      />

      {/* Search Input Box */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title, vehicle, or description..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterWrap}>
        <FilterBar
          options={STATUS_FILTERS}
          selectedId={selectedStatus}
          onSelect={setSelectedStatus}
        />
      </View>

      {/* List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={complaints.loading && complaints.data !== null}
            onRefresh={() => complaints.reload()}
            tintColor="#0284C7"
          />
        }
        ListEmptyComponent={
          complaints.loading && complaints.data === null ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="alert-circle-outline"
              title="No complaints found"
              message="No incident tickets match the selected filters or search terms."
              actionLabel="Refresh List"
              onAction={() => complaints.reload()}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/admin/complaint/${item.id}`)}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {item.vehiclePlateNumber ? `🚛 ${item.vehiclePlateNumber} • ` : ''}
                  {new Date(item.createdAt).toLocaleDateString()} at{' '}
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <StatusBadge status={item.status} />
            </View>

            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.description}
            </Text>

            <View style={styles.cardFooter}>
              <StatusBadge status={item.priority} type="priority" />
              {item.category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{item.category}</Text>
                </View>
              )}
              {item.tripPhase && (
                <View style={styles.phaseBadge}>
                  <Text style={styles.phaseBadgeText}>{item.tripPhase}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 'auto' }} />
            </View>
          </Pressable>
        )}
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  filterWrap: {
    backgroundColor: '#F8FAFC',
  },
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
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#475569',
    marginTop: spacing.xs + 2,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  phaseBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  phaseBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  centerLoading: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
});
