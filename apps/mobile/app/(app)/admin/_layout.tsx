import type { ReactElement } from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth, isAdmin } from '../../../src/auth/AuthContext';
import { LoadingScreen } from '../../../src/components/ScreenState';
import { colors } from '../../../src/theme';

export default function AdminLayout(): ReactElement {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen label="Checking admin session…" />;
  }

  if (status === 'anonymous' || !isAdmin(user)) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="complaint/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="vehicle/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="user/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="maintenance" options={{ presentation: 'card' }} />
      <Stack.Screen name="fuel-logs" options={{ presentation: 'card' }} />
      <Stack.Screen name="spare-parts" options={{ presentation: 'card' }} />
      <Stack.Screen name="loading-tracker" options={{ presentation: 'card' }} />
      <Stack.Screen name="reports" options={{ presentation: 'card' }} />
      <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      <Stack.Screen name="support-chat" options={{ presentation: 'card' }} />
    </Stack>
  );
}
