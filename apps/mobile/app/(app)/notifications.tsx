import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NotificationPublic } from '@driver-complaint/shared-types';
import * as api from '../../src/api/endpoints';
import { useAuth } from '../../src/auth/AuthContext';
import { useApiResource } from '../../src/hooks/useApiResource';
import { formatDateTime } from '../../src/lib/format';
import { SkeletonList } from '../../src/components/LoadingSystem';
import { radius, spacing } from '../../src/theme';

export default function NotificationsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationPublic[]>([]);
  const [clearing, setClearing] = useState(false);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const notifsResource = useApiResource('mobile:notifications', () =>
    api.notifications.list({ pageSize: 50 }),
  );

  // Sync resource data to local state
  useEffect(() => {
    if (notifsResource.data?.data) {
      setItems(notifsResource.data.data);
    }
  }, [notifsResource.data]);

  // Refetch on focus when navigating back to this screen
  useFocusEffect(
    useCallback(() => {
      void notifsResource.reload();
    }, [notifsResource.reload]),
  );

  const handleClearAll = (): void => {
    if (clearing || items.length === 0) return;

    Alert.alert(
      'Clear All Notifications',
      'This will remove all current alerts for your account permanently. Do you wish to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              const res = await api.notifications.clearAll();
              if (res.success) {
                setItems([]);
                void notifsResource.reload();
              }
            } catch {
              Alert.alert('Error', 'Failed to clear notifications. Please check your connection.');
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  const handleDismiss = async (id: string): Promise<void> => {
    if (dismissingIds.has(id)) return;
    setDismissingIds((prev) => new Set(prev).add(id));

    try {
      const res = await api.notifications.clearOne(id);
      if (res.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      Alert.alert('Error', 'Could not dismiss notification.');
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handlePressItem = (item: NotificationPublic): void => {
    if (!item.isRead) {
      void api.notifications.markRead(item.id).catch(() => {});
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)),
      );
    }

    if (item.complaintId) {
      const isAdminUser =
        user?.role === 'SUPER_ADMIN' ||
        user?.role === 'ADMIN' ||
        user?.role === 'EXECUTIVE';

      if (isAdminUser) {
        router.push(`/(app)/admin/complaint/${item.complaintId}` as any);
      } else {
        router.push(`/(app)/complaint/${item.complaintId}` as any);
      }
    }
  };

  const renderItem = ({ item }: { item: NotificationPublic }): ReactElement => {
    const isDismissing = dismissingIds.has(item.id);
    const isComplaint = item.type?.toLowerCase().includes('complaint');

    return (
      <Pressable
        style={({ pressed }) => [
          styles.itemCard,
          !item.isRead && styles.itemCardUnread,
          pressed && styles.itemCardPressed,
        ]}
        onPress={() => handlePressItem(item)}
      >
        <View style={styles.itemHeader}>
          <View style={styles.typeBadgeRow}>
            <View
              style={[
                styles.iconCircle,
                isComplaint ? styles.iconComplaint : styles.iconSystem,
              ]}
            >
              <Ionicons
                name={isComplaint ? 'clipboard' : 'notifications'}
                size={16}
                color={isComplaint ? '#075E54' : '#0284C7'}
              />
            </View>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title}
            </Text>
          </View>

          <Pressable
            style={styles.dismissBtn}
            hitSlop={10}
            onPress={() => void handleDismiss(item.id)}
            disabled={isDismissing}
            accessibilityLabel="Dismiss notification"
          >
            {isDismissing ? (
              <ActivityIndicator size="small" color="#94A3B8" />
            ) : (
              <Ionicons name="close" size={16} color="#94A3B8" />
            )}
          </Pressable>
        </View>

        <Text style={styles.itemBody} numberOfLines={3}>
          {item.body}
        </Text>

        <View style={styles.itemFooter}>
          <Text style={styles.itemTime}>{formatDateTime(item.createdAt)}</Text>
          {!item.isRead ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>NEW</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        {items.length > 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.clearAllBtn,
              pressed && styles.clearAllBtnPressed,
              clearing && styles.clearAllBtnDisabled,
            ]}
            onPress={handleClearAll}
            disabled={clearing}
            accessibilityLabel="Clear all notifications"
          >
            {clearing ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={15} color="#EF4444" />
                <Text style={styles.clearAllText}>Clear All</Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.headerPlaceholder} />
        )}
      </View>

      {/* Main Body */}
      {notifsResource.loading && notifsResource.data === null ? (
        <View style={styles.loadingContainer}>
          <SkeletonList count={6} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={notifsResource.loading && notifsResource.data !== null}
              onRefresh={() => notifsResource.reload()}
              tintColor="#075E54"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="checkmark-done" size={32} color="#16A34A" />
              </View>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No active notifications. You have cleared all alerts and updates.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    minHeight: 56,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginLeft: spacing.sm,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  clearAllBtnPressed: {
    opacity: 0.7,
  },
  clearAllBtnDisabled: {
    opacity: 0.5,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  headerPlaceholder: {
    width: 32,
  },
  loadingContainer: {
    padding: spacing.md,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#075E54',
    backgroundColor: '#FAFCFB',
  },
  itemCardPressed: {
    backgroundColor: '#F1F5F9',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    paddingRight: spacing.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconComplaint: {
    backgroundColor: '#DCFCE7',
  },
  iconSystem: {
    backgroundColor: '#E0F2FE',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  dismissBtn: {
    padding: 4,
  },
  itemBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  itemTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  unreadBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
