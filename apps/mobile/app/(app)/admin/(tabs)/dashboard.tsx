import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComplaintPublic, VehiclePublic } from '@driver-complaint/shared-types';
import * as api from '../../../../src/api/endpoints';
import { useAuth } from '../../../../src/auth/AuthContext';
import { useApiResource } from '../../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { KPICard } from '../../../../src/components/admin/KPICard';
import { StatusBadge } from '../../../../src/components/admin/StatusBadge';
import { getUserCategories } from '../../../../src/auth/permissions';
import { radius, spacing } from '../../../../src/theme';
import { AdminKPIGridSkeleton } from '../../../../src/components/LoadingSystem';

export default function AdminDashboardScreen(): ReactElement {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const complaintsResource = useApiResource('admin:complaints', () =>
    api.complaints.list({ pageSize: 50 })
  );

  const vehiclesResource = useApiResource('admin:vehicles', () =>
    api.vehicles.list()
  );

  const pendingResource = useApiResource('admin:pending-users', () =>
    api.users.pendingCount().catch(() => ({ pendingCount: 0 }))
  );

  const reloadAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      complaintsResource.reload(),
      vehiclesResource.reload(),
      pendingResource.reload(),
    ]);
    setRefreshing(false);
  }, [complaintsResource, vehiclesResource, pendingResource]);

  const userCats = useMemo(() => getUserCategories(user), [user]);

  const allComplaints: ComplaintPublic[] = useMemo(() => {
    const list = complaintsResource.data?.data ?? [];
    if (!userCats || userCats.length === 0 || user?.role === 'SUPER_ADMIN') {
      return list;
    }
    return list.filter((c) => c.category && userCats.includes(c.category));
  }, [complaintsResource.data, userCats, user?.role]);

  const allVehicles: VehiclePublic[] = useMemo(
    () => vehiclesResource.data ?? [],
    [vehiclesResource.data]
  );

  const stats = useMemo(() => {
    const open = allComplaints.filter((c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length;
    const submitted = allComplaints.filter((c) => c.status === 'NEW').length;
    const resolved = allComplaints.filter((c) => c.status === 'RESOLVED').length;
    const totalVehicles = allVehicles.length;
    const activeVehicles = allVehicles.filter((v) => (v.agreementStatus === 'ACTIVE' || !v.agreementStatus)).length;
    const pendingUsers = pendingResource.data?.pendingCount ?? 0;

    return { open, submitted, resolved, totalVehicles, activeVehicles, pendingUsers };
  }, [allComplaints, allVehicles, pendingResource.data]);

  const recentComplaints = useMemo(
    () => allComplaints.slice(0, 5),
    [allComplaints]
  );

  return (
    <View style={styles.screen}>
      <AdminHeader title="Ops Command Center" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reloadAll}
            tintColor="#0284C7"
          />
        }
      >
        {/* Welcome Section */}
        <View style={styles.welcomeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>
              Welcome, {user?.firstName ?? 'Admin'}
            </Text>
            <Text style={styles.welcomeSub}>
              {user?.role === 'SUPER_ADMIN'
                ? 'Full System Administration & Supervision'
                : user?.role === 'ADMIN'
                  ? 'Operations & Fleet Management'
                  : 'Site In-charge & Field Operations'}
            </Text>
          </View>
          <View style={styles.pulseDot} />
        </View>

        {/* KPI Grid */}
        <Text style={styles.sectionTitle}>Key Performance Indicators</Text>
        {complaintsResource.loading && complaintsResource.data === null ? (
          <AdminKPIGridSkeleton />
        ) : (
          <View style={styles.kpiGrid}>
            <View style={styles.kpiRow}>
              <KPICard
                title="Open Complaints"
                value={stats.open}
                icon="alert-circle"
                color="#EF4444"
                subtitle={`${stats.submitted} needing action`}
                onPress={() => router.push('/(app)/admin/(tabs)/complaints')}
              />
              <KPICard
                title="Resolved"
                value={stats.resolved}
                icon="checkmark-circle"
                color="#10B981"
                subtitle="Closed cases"
                onPress={() => router.push('/(app)/admin/(tabs)/complaints')}
              />
            </View>

            <View style={styles.kpiRow}>
              <KPICard
                title="Active Fleet"
                value={`${stats.activeVehicles}/${stats.totalVehicles}`}
                icon="bus"
                color="#0284C7"
                subtitle="Units on duty"
                onPress={() => router.push('/(app)/admin/(tabs)/vehicles')}
              />
              {user?.role === 'SUPER_ADMIN' ? (
                <KPICard
                  title="Pending Approvals"
                  value={stats.pendingUsers}
                  icon="person-add"
                  color="#F59E0B"
                  subtitle="Users awaiting PIN"
                  onPress={() => router.push('/(app)/admin/(tabs)/users')}
                />
              ) : (
                <KPICard
                  title="Service Portal"
                  value="Online"
                  icon="shield-checkmark"
                  color="#8B5CF6"
                  subtitle="Real-time link"
                  onPress={() => router.push('/(app)/admin/(tabs)/more')}
                />
              )}
            </View>
          </View>
        )}

        {/* Quick Actions Shortcuts */}
        <Text style={styles.sectionTitle}>Quick Operations</Text>
        <View style={styles.actionsGrid}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push('/(app)/admin/(tabs)/complaints')}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="clipboard" size={20} color="#DC2626" />
            </View>
            <Text style={styles.actionBtnText}>Complaints</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push('/(app)/admin/(tabs)/vehicles')}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="bus" size={20} color="#0284C7" />
            </View>
            <Text style={styles.actionBtnText}>Vehicles</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push('/(app)/admin/maintenance')}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="construct" size={20} color="#D97706" />
            </View>
            <Text style={styles.actionBtnText}>Maintenance</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push('/(app)/admin/loading-tracker')}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="navigate" size={20} color="#15803D" />
            </View>
            <Text style={styles.actionBtnText}>Trip Tracker</Text>
          </Pressable>
        </View>

        {/* Recent Complaints Feed */}
        <View style={styles.feedHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Incident Tickets</Text>
          <Pressable onPress={() => router.push('/(app)/admin/(tabs)/complaints')}>
            <Text style={styles.seeAllText}>View All →</Text>
          </Pressable>
        </View>

        {recentComplaints.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Ionicons name="checkmark-done-circle" size={32} color="#10B981" />
            <Text style={styles.emptyFeedText}>No open incident tickets in queue.</Text>
          </View>
        ) : (
          recentComplaints.map((item) => (
            <Pressable
              key={item.id}
              style={styles.complaintCard}
              onPress={() => router.push(`/(app)/admin/complaint/${item.id}`)}
            >
              <View style={styles.complaintTopRow}>
                <View style={styles.titleWrap}>
                  <Text style={styles.complaintTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.complaintSub}>
                    {item.vehiclePlateNumber ? `🚛 ${item.vehiclePlateNumber}` : 'General Issue'} •{' '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </View>

              <View style={styles.complaintBottomRow}>
                <StatusBadge status={item.priority} type="priority" />
                {item.category && (
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryPillText}>{item.category}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 'auto' }} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  welcomeBanner: {
    backgroundColor: '#0F172A',
    borderRadius: radius.md,
    padding: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  welcomeSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginLeft: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  kpiGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  emptyFeed: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: spacing.xs,
  },
  emptyFeedText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  complaintCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  complaintTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleWrap: {
    flex: 1,
  },
  complaintTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  complaintSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  complaintBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  categoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
});
