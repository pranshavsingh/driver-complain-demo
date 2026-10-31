import type { ReactElement } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { apiUrl } from '../../../src/config/env';
import { useAuth } from '../../../src/auth/AuthContext';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { radius, spacing } from '../../../src/theme';

export default function SettingsAdminScreen(): ReactElement {
  const { user } = useAuth();

  return (
    <View style={styles.screen}>
      <AdminHeader
        title="System Settings"
        subtitle="Configuration & Operations Controls"
        showBack
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Environment & Diagnostics</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.itemTitle}>API Endpoint URL</Text>
              <Text style={styles.itemSubtitle}>{apiUrl}</Text>
            </View>
            <View style={styles.statusDot} />
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <View>
              <Text style={styles.itemTitle}>App Build Version</Text>
              <Text style={styles.itemSubtitle}>
                {Constants.expoConfig?.version ?? '1.0.0'} (Expo SDK 52)
              </Text>
            </View>
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <View>
              <Text style={styles.itemTitle}>Active Session ID</Text>
              <Text style={styles.itemSubtitle}>{user?.id?.slice(-8)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SLA & Incident Automation</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Critical Breakdown Escalation</Text>
              <Text style={styles.itemSubtitle}>
                Auto-assign high priority breakdown tickets to duty supervisor after 15 mins.
              </Text>
            </View>
            <Switch value={true} trackColor={{ false: '#CBD5E1', true: '#10B981' }} />
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Push Notifications</Text>
              <Text style={styles.itemSubtitle}>
                Notify on new tickets, assignment handoffs, and resolved status.
              </Text>
            </View>
            <Switch value={true} trackColor={{ false: '#CBD5E1', true: '#10B981' }} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Department Scope</Text>
        <View style={styles.card}>
          <View style={styles.badgeWrap}>
            {[
              'LOADING',
              'UNLOADING',
              'FUEL_DEF',
              'BREAKDOWN',
              'TYRE_ISSUE',
              'VEHICLE_MAINTENANCE',
              'ACCOUNTS',
            ].map((cat) => (
              <View key={cat} style={styles.badge}>
                <Text style={styles.badgeText}>{cat}</Text>
              </View>
            ))}
          </View>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.md,
  },
  badge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
});
