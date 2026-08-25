import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

/** A titled white panel. The only container in the app, so every screen reads the same. */
export function Card({ title, children }: { title?: string; children: ReactNode }): ReactElement {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** A label/value row for the detail screens. */
export function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: { marginBottom: spacing.md },
  rowLabel: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: 2 },
  rowValue: { fontSize: fontSize.body, color: colors.text },
});
