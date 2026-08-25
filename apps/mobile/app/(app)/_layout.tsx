import { useEffect, useRef, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { PushBanner } from '../../src/components/PushBanner';
import { LoadingScreen } from '../../src/components/ScreenState';
import type { PushMessage } from '../../src/push/messaging';
import {
  getLaunchNotification,
  onForegroundMessage,
  onNotificationTap,
} from '../../src/push/messaging';
import { registerThisDevice, watchTokenRefresh } from '../../src/push/registration';
import { colors } from '../../src/theme';

/** How long a foreground banner stays before it gets out of the way. */
const BANNER_MS = 8000;

/**
 * The signed-in half of the app.
 *
 * This layout is the gate: nothing under `(app)/` renders until we know there is a live driver
 * session. Everything inside can therefore assume `user` is a driver and that requests carry a
 * token, instead of each screen re-checking.
 */
export default function AppLayout(): ReactElement {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen label="Signing you in…" />;
  if (status === 'anonymous') return <Redirect href="/login" />;

  // Mounted only while authenticated, so push registration and its listeners live exactly as
  // long as the session does.
  return <AppShell />;
}

function AppShell(): ReactElement {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<PushMessage | null>(null);
  const handledLaunch = useRef(false);

  useEffect(() => {
    const openComplaint = (message: PushMessage): void => {
      if (!message.complaintId) return;
      router.push(`/complaint/${message.complaintId}`);
    };

    void registerThisDevice();
    const stopTokenWatch = watchTokenRefresh();
    const stopForeground = onForegroundMessage(setBanner);
    const stopTap = onNotificationTap(openComplaint);

    // A notification the driver tapped while the app was not running: the OS launched us, and
    // this is the only place that fact is still available. Guarded by a ref because the value
    // stays readable after the first read and we must not re-navigate on a re-mount.
    if (!handledLaunch.current) {
      handledLaunch.current = true;
      void getLaunchNotification().then(
        (message) => {
          if (message) openComplaint(message);
        },
        () => {
          // No launch notification is the normal case; a failure here is not worth a warning.
        },
      );
    }

    return () => {
      stopTokenWatch();
      stopForeground();
      stopTap();
    };
  }, []);

  // Auto-hide, so a banner the driver ignored does not sit on the screen for the rest of the
  // shift. Re-arms whenever a newer push replaces the current one.
  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => {
      setBanner(null);
    }, BANNER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [banner]);

  return (
    <View style={styles.shell}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
      {banner ? (
        <View style={[styles.bannerSlot, { paddingBottom: insets.bottom }]}>
          <PushBanner
            message={banner}
            onPress={() => {
              const { complaintId } = banner;
              setBanner(null);
              if (complaintId) router.push(`/complaint/${complaintId}`);
            }}
            onDismiss={() => {
              setBanner(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  bannerSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.infoSurface,
  },
});
