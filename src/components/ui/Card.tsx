import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';

export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[cardStyles.card, style]}>{children}</View>
);

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});

export const SectionHeader = ({ title, caption }: { title: string; caption?: string }) => (
  <View style={{ marginBottom: spacing.md, gap: 2 }}>
    <Text style={sectionStyles.title}>{title}</Text>
    {caption ? <Text style={sectionStyles.caption}>{caption}</Text> : null}
  </View>
);

const sectionStyles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  caption: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});

export const StatTile = ({
  label,
  value,
  icon,
  tint = colors.tintPrimary,
  iconColor = colors.primaryLight,
  style,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint?: string;
  iconColor?: string;
  style?: ViewStyle;
}) => (
  <View style={[statStyles.tile, style]}>
    <View style={[statStyles.iconTile, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={16} color={iconColor} />
    </View>
    <Text style={statStyles.value} numberOfLines={1}>
      {value}
    </Text>
    <Text style={statStyles.label} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const statStyles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    minWidth: 0,
  },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: letterSpacing.chip,
    textTransform: 'uppercase',
  },
});
