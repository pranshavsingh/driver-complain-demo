import { useCallback, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComplaintPublic, ComplaintStatus } from '@driver-complaint/shared-types';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { PriorityBadge, StatusBadge } from '../../../src/components/Badges';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { ErrorNotice } from '../../../src/components/ErrorNotice';
import { EmptyState } from '../../../src/components/ScreenState';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { formatDateTime } from '../../../src/lib/format';
import { SkeletonCardList } from '../../../src/components/SkeletonLoader';
import { fontSize, radius, spacing } from '../../../src/theme';
import { Ionicons } from '@expo/vector-icons';

const PAGE_STEP = 15;
const MAX_PAGE_SIZE = 100;

const STATUS_FILTERS: { label: string; value: ComplaintStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'New', value: 'NEW' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Closed', value: 'CLOSED' },
];

export default function ComplaintHistoryScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const complaints = useApiResource(`complaints:mine:${String(pageSize)}`, () =>
    api.complaints.mine(1, pageSize),
  );

  const reloadComplaints = complaints.reload;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reloadComplaints();
    }, [reloadComplaints]),
  );

  const confirmSignOut = (): void => {
    Alert.alert('Sign out?', 'You will need your employee ID and PIN to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const rawRows = complaints.data?.data ?? [];
  const total = complaints.data?.meta.total ?? 0;

  const filteredRows = rawRows.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(q);
      const descMatch = item.description.toLowerCase().includes(q);
      return titleMatch || descMatch;
    }
    return true;
  });

  const canLoadMore = rawRows.length < total && pageSize < MAX_PAGE_SIZE;
  const cappedOut = rawRows.length < total && pageSize >= MAX_PAGE_SIZE;

  return (
    <View style={styles.screen}>
      {/* Top Header Bar with Status Bar Notch Padding */}
      <View style={[styles.headerBar, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.pageTitle}>Complaint History</Text>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{total}</Text>
          </View>
        </View>

        <Pressable onPress={confirmSignOut} style={styles.logoutButton} accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Exit</Text>
        </Pressable>
      </View>

      {/* Filter and Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search complaints..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filterTabs}
          renderItem={({ item }) => {
            const isSelected = statusFilter === item.value;
            return (
              <Pressable
                onPress={() => setStatusFilter(item.value)}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {complaints.error ? (
        <ErrorNotice error={complaints.error} onRetry={complaints.reload} />
      ) : null}

      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={complaints.loading && complaints.data !== null}
            onRefresh={() => complaints.reload()}
            tintColor="#1D4ED8"
          />
        }
        ListEmptyComponent={
          complaints.loading && complaints.data === null ? (
            <SkeletonCardList count={4} />
          ) : (
            <EmptyState
              title={searchQuery || statusFilter !== 'ALL' ? 'No matching complaints' : 'No complaints filed yet'}
              hint={
                searchQuery || statusFilter !== 'ALL'
                  ? 'Try clearing filters or search terms'
                  : 'Use the Register tab to submit your first vehicle complaint.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <ComplaintCard item={item} />
        )}
        ListFooterComponent={
          canLoadMore ? (
            <View style={styles.footer}>
              <Button
                label="Show older complaints"
                variant="secondary"
                loading={complaints.loading}
                onPress={() => setPageSize((current) => current + PAGE_STEP)}
              />
            </View>
          ) : cappedOut ? (
            <Text style={styles.caption}>
              Showing the most recent {MAX_PAGE_SIZE} complaints. Contact your supervisor for older records.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function ComplaintCard({ item }: { item: ComplaintPublic }): ReactElement {
  return (
    <Pressable
      onPress={() => router.push(`/complaint/${item.id}`)}
      style={({ pressed }) => [styles.cardWrapper, pressed && styles.cardPressed]}
    >
      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <StatusBadge status={item.status} />
        </View>

        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.cardMeta}>
            <PriorityBadge priority={item.priority} />
          </View>
          <Text style={styles.cardDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  badgeCount: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    color: '#0F172A',
  },
  filterTabs: {
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#1D4ED8',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  cardWrapper: {
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardDescription: {
    fontSize: 14,
    color: '#475569',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: spacing.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  cardDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  loadingContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: fontSize.body,
    color: '#64748B',
  },
  footer: {
    paddingVertical: spacing.md,
  },
  caption: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginVertical: spacing.md,
  },
});
