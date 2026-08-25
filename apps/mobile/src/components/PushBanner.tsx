import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PushMessage } from '../push/messaging';
import { colors, fontSize, radius, spacing } from '../theme';

/**
 * In-app banner for a push that arrived while the app was open.
 *
 * Neither Android nor iOS draws a system notification for a foreground push, so without this
 * the driver watching the app is the one person who does not learn that their complaint moved.
 * Tapping it opens the complaint; the × dismisses it.
 *
 * It is anchored to the bottom of the screen by its parent, not the top: the top is where each
 * screen's own header lives, and covering the Back button with a transient banner is how you
 * make someone tap the wrong thing.
 */
export function PushBanner({
  message,
  onPress,
  onDismiss,
}: {
  message: PushMessage;
  onPress: () => void;
  onDismiss: () => void;
}): ReactElement {
  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.body}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${message.title ?? 'Update'}. ${message.body ?? ''}`}
      >
        <Text style={styles.title}>{message.title ?? 'Update'}</Text>
        {message.body ? (
          <Text style={styles.text} numberOfLines={2}>
            {message.body}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        // The tap target is bigger than the glyph, because a 16px × next to a moving thumb is
        // a coin toss.
        hitSlop={12}
      >
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoSurface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    // Android draws no shadow without elevation, and the banner has to read as floating above
    // the list rather than as the last row of it.
    elevation: 8,
  },
  body: { flex: 1, paddingRight: spacing.md },
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.info },
  text: { fontSize: fontSize.small, color: colors.text, marginTop: 2 },
  dismiss: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  dismissText: { fontSize: fontSize.body, color: colors.textMuted },
});
