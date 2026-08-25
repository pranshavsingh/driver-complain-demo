import type { ReactElement, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, spacing } from '../theme';

interface Props {
  title: string;
  /** Show a back arrow. Only pass this on screens that were pushed onto the stack. */
  back?: boolean;
  /** Optional control on the right — sign out, retry, and nothing else so far. */
  right?: ReactNode;
}

/**
 * The app's own header bar.
 *
 * The native stack header is turned off (see app/_layout.tsx) and this is used instead, for one
 * reason: the back arrow here is a 48dp target with a visible word next to it. The platform
 * header draws a ~24dp glyph, which is a miss-and-lose-your-form-data risk for someone tapping
 * with a thumb through a work glove.
 */
export function Header({ title, back = false, right }: Props): ReactElement {
  return (
    <View style={styles.bar}>
      {back ? (
        <Pressable
          onPress={() => {
            // canGoBack() is false when the app was opened straight onto this screen from a push
            // notification — there is no history to pop, so send them home instead of nowhere.
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  back: {
    minHeight: 48,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backText: { fontSize: fontSize.body, fontWeight: '600', color: colors.primary },
  pressed: { opacity: 0.6 },
  title: { flex: 1, fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  right: { marginLeft: spacing.md },
});
