import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginRequestSchema } from '@driver-complaint/shared-types';
import { useAuth } from '../src/auth/AuthContext';
import { Button } from '../src/components/Button';
import { ErrorNotice } from '../src/components/ErrorNotice';
import { LoadingScreen } from '../src/components/ScreenState';
import { TextField } from '../src/components/TextField';
import { apiUrl } from '../src/config/env';
import { colors, fontSize, spacing } from '../src/theme';

export default function LoginScreen(): ReactElement {
  const { status, login } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') return <LoadingScreen label="Checking your session…" />;
  if (status === 'authenticated') return <Redirect href="/" />;

  const submit = (): void => {
    // Validate with the same schema the API uses, so a typo costs no round trip on 3G and the
    // driver gets the "4 to 8 digits" message immediately instead of after a 10-second wait.
    const parsed = LoginRequestSchema.safeParse({ employeeId: employeeId.trim(), pin });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((i) => i.message).join('\n')));
      return;
    }

    setError(null);
    setSubmitting(true);
    login(parsed.data.employeeId, parsed.data.pin)
      .catch((err: unknown) => {
        setError(err);
        setPin('');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        // The PIN field sits low on the screen; without this the Android keyboard covers it.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Driver Complaint</Text>
          <Text style={styles.subtitle}>
            Sign in with the employee ID and PIN your supervisor gave you.
          </Text>

          <ErrorNotice error={error} />

          <TextField
            label="Employee ID"
            value={employeeId}
            onChangeText={setEmployeeId}
            placeholder="E1001"
            autoCapitalize="characters"
            editable={!submitting}
            autoFocus
          />
          <TextField
            label="PIN"
            value={pin}
            onChangeText={setPin}
            placeholder="••••"
            hint="4 to 8 digits"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            autoCapitalize="none"
            editable={!submitting}
          />

          <Button label="Sign in" onPress={submit} loading={submitting} />

          {/* Which server this build talks to, and which build it is. When a driver says "it
              doesn't work", these two lines answer the first two questions without a call. */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Server: {apiUrl}</Text>
            <Text style={styles.footerText}>Version {Constants.expoConfig?.version ?? 'dev'}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, flexGrow: 1 },
  title: { fontSize: fontSize.hero, fontWeight: '700', color: colors.text },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  footer: { marginTop: 'auto', paddingTop: spacing.xl },
  footerText: { fontSize: fontSize.small, color: colors.textMuted, textAlign: 'center' },
});
