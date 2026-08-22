import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { FadeInView } from './FadeInView';
import { PressableScale } from './PressableScale';
import { AppButton } from './Buttons';

/** Invite-code panel: big monospace code on a dashed card with copy-friendly size. */
export const CodeDisplay = ({ code, caption }: { code: string; caption?: string }) => (
  <View style={codeStyles.box}>
    <Text style={codeStyles.caption}>{caption ?? 'Invite code'}</Text>
    <Text style={codeStyles.code}>{code}</Text>
  </View>
);

const codeStyles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderColor: colors.borderActive,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.tintPrimary,
  },
  caption: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: letterSpacing.label,
    textTransform: 'uppercase',
  },
  code: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2 },
});

/** Centered empty state with icon tile, title, subtitle, and optional CTAs. */
export const EmptyState = ({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  actions?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' }[];
}) => (
  <FadeInView style={emptyStyles.container}>
    <View style={emptyStyles.iconTile}>
      <Ionicons name={icon} size={30} color={colors.primaryLight} />
    </View>
    <Text style={emptyStyles.title}>{title}</Text>
    {subtitle ? <Text style={emptyStyles.subtitle}>{subtitle}</Text> : null}
    {actions?.length ? (
      <View style={emptyStyles.actions}>
        {actions.map((action) => (
          <AppButton
            key={action.label}
            label={action.label}
            onPress={action.onPress}
            variant={action.variant ?? 'primary'}
          />
        ))}
      </View>
    ) : null}
  </FadeInView>
);

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
  iconTile: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.textPrimary },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  actions: { marginTop: spacing.lg, gap: spacing.sm, alignSelf: 'stretch' },
});

/** Screen header lockup: back button, title, subtitle slot. */
export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) => (
  <View style={headerStyles.row}>
    {onBack ? (
      <PressableScale accessibilityLabel="Back" onPress={onBack} style={headerStyles.back}>
        <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
      </PressableScale>
    ) : null}
    <View style={headerStyles.text}>
      <Text style={headerStyles.title}>{title}</Text>
      {subtitle ? (
        <Text style={headerStyles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    {right}
  </View>
);

const headerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
