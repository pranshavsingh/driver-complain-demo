import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Blocks presses AND shows a spinner. Every submit path uses it — see the note below. */
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one button in the app.
 *
 * `loading` disables the press as well as showing the spinner. That is not cosmetic: the
 * complaint endpoint has no idempotency key, so two taps on a slow connection create two
 * complaints. Blocking the second tap is the app's half of that problem (the other half is a
 * server-side idempotency key, which does not exist yet — see the README).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: Props): ReactElement {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'secondary' ? colors.primary : colors.primaryText}
            style={styles.spinner}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            variant === 'secondary' ? styles.labelSecondary : styles.labelOnColor,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // 56, not the 48 minimum: this is the button a driver hits standing next to a truck.
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  spinner: { marginRight: spacing.sm },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  disabled: { backgroundColor: colors.primaryDisabled, borderColor: colors.primaryDisabled },
  pressed: { opacity: 0.85 },
  label: { fontSize: fontSize.large, fontWeight: '600', textAlign: 'center' },
  labelOnColor: { color: colors.primaryText },
  labelSecondary: { color: colors.primary },
});
