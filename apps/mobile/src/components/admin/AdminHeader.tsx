import type { ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { radius, spacing } from '../../theme';
import * as api from '../../api/endpoints';
import { useApiResource } from '../../hooks/useApiResource';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactElement;
}

export function AdminHeader({
  title,
  subtitle,
  showBack,
  onBack,
  rightAction,
}: AdminHeaderProps): ReactElement {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const notifsResource = useApiResource('admin:header:notifs', () =>
    api.notifications.list({ pageSize: 1, unreadOnly: true }).catch(() => null),
  );
  const unreadCount = notifsResource.data?.meta.unreadCount ?? 0;

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

  const getRoleBadge = (): { label: string; bg: string; color: string } => {
    switch (user?.role) {
      case 'SUPER_ADMIN':
        return { label: 'SUPER ADMIN', bg: '#F3E8FF', color: '#7E22CE' };
      case 'ADMIN':
        return { label: 'ADMIN', bg: '#E0F2FE', color: '#0369A1' };
      case 'EXECUTIVE':
        return { label: 'EXECUTIVE', bg: '#DCFCE7', color: '#15803D' };
      default:
        return { label: user?.role || 'STAFF', bg: '#F1F5F9', color: '#475569' };
    }
  };

  const badge = getRoleBadge();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <View style={styles.leftRow}>
          {showBack ? (
            <Pressable
              onPress={() => (onBack ? onBack() : router.back())}
              style={styles.iconBtn}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color="#0F172A" />
            </Pressable>
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="shield-checkmark" size={18} color="#0284C7" />
            </View>
          )}

          <View style={styles.titleWrap}>
            <View style={styles.titleBadgeRow}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!showBack && (
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              )}
            </View>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : !showBack && user?.firstName ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {user.firstName} {user.lastName || ''} ({user.employeeId})
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rightRow}>
          {rightAction}
          {!showBack && (
            <>
              <Pressable
                onPress={() => router.push('/(app)/notifications' as any)}
                style={styles.notifBtn}
                accessibilityLabel="Notifications"
                hitSlop={8}
              >
                <Ionicons name="notifications-outline" size={22} color="#0F172A" />
                {unreadCount > 0 ? (
                  <View style={styles.badgeCount}>
                    <Text style={styles.badgeCountText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                onPress={handleLogout}
                style={styles.logoutBtn}
                accessibilityLabel="Sign out"
                hitSlop={8}
              >
                <Ionicons name="log-out-outline" size={22} color="#64748B" />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notifBtn: {
    padding: spacing.xs,
    position: 'relative',
  },
  badgeCount: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: radius.pill,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  logoutBtn: {
    padding: spacing.xs,
  },
});
