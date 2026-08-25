import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { colors, fontSize, spacing } from '../src/theme';

/**
 * Reached only by a bad deep link — for example a push that arrived with a complaint id this
 * driver may not open. Better a way out than a blank screen.
 */
export default function NotFoundScreen(): ReactElement {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>That page could not be opened</Text>
      <Text style={styles.body}>
        The link may be old, or the report may belong to another driver.
      </Text>
      <Button
        label="Go to my complaints"
        onPress={() => {
          router.replace('/');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
});
