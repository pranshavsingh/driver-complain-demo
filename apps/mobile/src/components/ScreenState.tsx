import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

/** Full-screen spinner with a label, for a screen that has nothing to show yet. */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }): ReactElement {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

/** "Nothing here" state. Says what to do next, not just that the list is empty. */
export function EmptyState({ title, hint }: { title: string; hint?: string }): ReactElement {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  label: { marginTop: spacing.md, fontSize: fontSize.body, color: colors.textMuted },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  emptyHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
