import React from 'react';
import { ActivityIndicator, StyleSheet, Text, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  primary: { backgroundColor: colors.primaryAction },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  danger: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.critical },
  label: { fontSize: 15, fontWeight: '800' },
});

const labelColor = (variant: ButtonVariant) =>
  variant === 'primary'
    ? colors.onPrimary
    : variant === 'danger'
      ? colors.critical
      : colors.textPrimary;

const iconColor = (variant: ButtonVariant) =>
  variant === 'primary' ? colors.onPrimary : labelColor(variant);

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
  testID?: string;
}

/** Unified CTA used across screens. Keeps the old label + spinner behavior. */
export const AppButton = ({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  icon,
  style,
  testID,
}: AppButtonProps) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
    disabled={disabled || loading}
    onPress={onPress}
    testID={testID}
    style={[styles.base, styles[variant], (disabled || loading) && { opacity: 0.55 }, style]}
  >
    {loading ? (
      <ActivityIndicator color={iconColor(variant)} />
    ) : (
      <>
        {icon ? <Ionicons name={icon} size={18} color={iconColor(variant)} /> : null}
        <Text style={[styles.label, { color: labelColor(variant) }]}>{label}</Text>
      </>
    )}
  </PressableScale>
);
