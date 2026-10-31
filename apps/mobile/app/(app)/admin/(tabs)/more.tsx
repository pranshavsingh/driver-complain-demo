import type { ReactElement } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '../../../../src/auth/AuthContext';
import { AdminHeader } from '../../../../src/components/admin/AdminHeader';
import { canAccessPath } from '../../../../src/auth/permissions';
import { radius, spacing } from '../../../../src/theme';

interface MenuEntry {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  pathCheck: string;
  badge?: string;
}

export default function MoreMenuScreen(): ReactElement {
  const { user, logout } = useAuth();

  const menuEntries: MenuEntry[] = [
    {
      title: 'Vehicle Maintenance',
      subtitle: 'Tyres, batteries, and workshop work orders',
      icon: 'construct',
      color: '#D97706',
      route: '/(app)/admin/maintenance',
      pathCheck: '/maintenance',
    },
    {
      title: 'Fuel & DEF Logs',
      subtitle: 'Consumption records, slips, and odometer telemetry',
      icon: 'water',
      color: '#0284C7',
      route: '/(app)/admin/fuel-logs',
      pathCheck: '/fuel-logs',
    },
    {
      title: 'Spare Parts Requisition',
      subtitle: 'Warehouse inventory, approvals, and parts issues',
      icon: 'cog',
      color: '#7C3AED',
      route: '/(app)/admin/spare-parts',
      pathCheck: '/spare-parts',
    },
    {
      title: 'Trip & Loading Tracker',
      subtitle: 'Loading, transit, and unloading turn-around-time',
      icon: 'navigate',
      color: '#15803D',
      route: '/(app)/admin/loading-tracker',
      pathCheck: '/loading',
    },
    {
      title: 'Reports & Analytics',
      subtitle: 'Fleet performance, operational costs, export data',
      icon: 'bar-chart',
      color: '#0D9488',
      route: '/(app)/admin/reports',
      pathCheck: '/reports',
    },
    {
      title: 'Helpline & Driver Support',
      subtitle: 'Real-time two-way messaging with field drivers',
      icon: 'chatbubbles',
      color: '#2563EB',
      route: '/(app)/admin/support-chat',
      pathCheck: '/support',
      badge: 'Live',
    },
    {
      title: 'Notifications & Alerts',
      subtitle: 'View inbox, dismiss alerts, or clear all notifications',
      icon: 'notifications',
      color: '#EA580C',
      route: '/(app)/notifications',
      pathCheck: '/notifications',
    },
    {
      title: 'System Settings',
      subtitle: 'Application configuration, categories, and SLA thresholds',
      icon: 'settings',
      color: '#475569',
      route: '/(app)/admin/settings',
      pathCheck: '/settings',
    },
  ];

  const handleLogout = (): void => {
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

  return (
    <View style={styles.screen}>
      <AdminHeader title="Ops Modules & Tools" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Operational Modules</Text>

        <View style={styles.menuContainer}>
          {menuEntries.map((item, idx) => {
            const allowed = canAccessPath(user, item.pathCheck);

            if (!allowed) return null;

            return (
              <Pressable
                key={idx}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                ]}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}15` }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>

                <View style={styles.textWrap}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Account & Session</Text>
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={22} color="#DC2626" />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.itemTitle, { color: '#DC2626' }]}>Sign Out</Text>
              <Text style={styles.itemSubtitle}>End active session on this device</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.appInfo}>
          <Text style={styles.infoText}>Driver Complaint FleetOps Mobile</Text>
          <Text style={styles.infoSubText}>
            Version {Constants.expoConfig?.version ?? '1.0.0'} • Role: {user?.role}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: '#F8FAFC',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  infoSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
});
