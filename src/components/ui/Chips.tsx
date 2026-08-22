import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';

export type ChipTone = 'primary' | 'warning' | 'critical' | 'link' | 'violet' | 'neutral';

const tones: Record<ChipTone, { bg: string; fg: string }> = {
  primary: { bg: colors.tintPrimary, fg: colors.primaryLight },
  warning: { bg: colors.tintWarning, fg: colors.warning },
  critical: { bg: colors.tintCritical, fg: colors.critical },
  link: { bg: colors.tintLink, fg: colors.link },
  violet: { bg: colors.tintViolet, fg: colors.roleLeader },
  neutral: { bg: colors.surfaceLight, fg: colors.textMuted },
};

/** Small uppercase pill used for statuses and meta. */
export const Chip = ({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: ChipTone;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}) => (
  <View style={[chipStyles.base, { backgroundColor: tones[tone].bg }, style]}>
    {icon ? <Ionicons name={icon} size={11} color={tones[tone].fg} /> : null}
    <Text style={[chipStyles.text, { color: tones[tone].fg }]}>{label}</Text>
  </View>
);

const chipStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: letterSpacing.chip,
    textTransform: 'uppercase',
  },
});

/** Maps a trip status to its Chip tone. */
export const statusTone = (status?: string): ChipTone =>
  status === 'active' ? 'primary' : status === 'planned' ? 'warning' : 'neutral';
