import type { ReactElement } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Shown under the field in grey — say what you want, not what went wrong. */
  hint?: string;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
}

/**
 * Labelled text input.
 *
 * The label is a real <Text> above the field, not a placeholder: a placeholder disappears the
 * moment typing starts, and "what was this box for again" is a genuine failure mode for
 * someone filling a form in a hurry.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline = false,
  numberOfLines,
  maxLength,
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry = false,
  editable = true,
  autoFocus = false,
}: Props): ReactElement {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        editable={editable}
        autoFocus={autoFocus}
        // Android's default underline plus a border reads as two boxes; this keeps one.
        underlineColorAndroid="transparent"
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          !editable && styles.inputDisabled,
        ]}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  inputDisabled: { backgroundColor: colors.neutralSurface, color: colors.textMuted },
  hint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
});
