import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthContext';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing } from '../src/theme';

/**
 * Root layout: the providers every screen needs, and nothing else.
 *
 * Headers are off for the whole app — each screen draws its own (src/components/Header.tsx) so
 * the back button is a full-size tap target rather than a 24dp platform glyph.
 */
export default function RootLayout(): ReactElement {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Last-resort screen for a render crash anywhere in the app.
 *
 * expo-router picks this up by name from the root layout. Without it a JS exception in
 * production shows the driver a blank white screen with no way out — with it they get a
 * readable message and a retry, and the error text is on screen to read down the phone.
 *
 * This renders outside SafeAreaProvider (it replaces the layout, providers included), so the
 * top inset is padded by hand rather than measured.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactElement {
  return (
    <View style={styles.crashScreen}>
      <ScrollView contentContainerStyle={styles.crashContent}>
        <Text style={styles.crashTitle}>The app hit a problem</Text>
        <Text style={styles.crashBody}>
          Nothing you typed was sent. Tap Try again — if it keeps happening, read the text below to
          your supervisor.
        </Text>
        <Text style={styles.crashDetail} selectable>
          {error.message}
        </Text>
        <Button
          label="Try again"
          onPress={() => {
            void retry();
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  crashScreen: { flex: 1, backgroundColor: colors.background },
  crashContent: { padding: spacing.xl, paddingTop: spacing.xxl * 2 },
  crashTitle: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  crashBody: { fontSize: fontSize.body, color: colors.text, marginBottom: spacing.lg },
  crashDetail: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    backgroundColor: colors.neutralSurface,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
});
