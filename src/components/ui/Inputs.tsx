import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme';

/**
 * Labeled input with a focus border. Presentation only: value/onChangeText
 * wiring stays with the caller.
 */
export const LabeledInput = ({
  label,
  hint,
  style,
  ...inputProps
}: TextInputProps & { label: string; hint?: string; style?: ViewStyle }) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[inputStyles.wrapper, style]}>
      <Text style={inputStyles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...inputProps}
        style={[
          inputStyles.input,
          focused && { borderColor: colors.borderActive, borderWidth: 1.5 },
        ]}
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
      />
      {hint ? <Text style={inputStyles.hint}>{hint}</Text> : null}
    </View>
  );
};

const inputStyles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    color: colors.textPrimary,
    fontSize: 15,
  },
  hint: { fontSize: 12, color: colors.textMuted },
});
