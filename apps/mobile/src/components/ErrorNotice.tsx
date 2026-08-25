import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiClientError } from '../api/client';
import { Button } from './Button';
import { colors, fontSize, radius, spacing } from '../theme';

/**
 * Render whatever an API call threw, in words a driver can act on, with a retry.
 *
 * The requestId is shown in small print when the server sent one. A driver will not know what
 * it means, but they can read it down the phone — and it is the only thing that ties "the app
 * said it failed" to the matching line in the API logs.
 */
export function ErrorNotice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): ReactElement | null {
  if (!error) return null;

  const isApiError = error instanceof ApiClientError;
  const message = isApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';

  return (
    <View style={styles.wrapper} accessibilityRole="alert">
      <Text style={styles.message}>{message}</Text>
      {isApiError && error.requestId ? (
        <Text style={styles.meta}>
          {error.code} · reference {error.requestId}
        </Text>
      ) : null}
      {onRetry ? (
        <Button label="Try again" variant="secondary" onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  message: { fontSize: fontSize.body, fontWeight: '600', color: colors.danger },
  meta: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
  retry: { marginTop: spacing.md },
});
