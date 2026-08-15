import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const tripDetailMemberStyles = StyleSheet.create({
  membersSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  realtimeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  memberFilters: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 3,
    marginBottom: 14,
  },
  tripActionsSection: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tripActionsTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  memberFilter: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  memberFilterSelected: { backgroundColor: colors.primary },
  memberFilterText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  memberFilterTextSelected: { color: '#FFF' },
  membersList: {
    gap: 10,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 12,
    borderColor: colors.border,
    borderWidth: 1,
  },
  memberAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  memberMeta: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  youBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  hostRoleBadge: {
    fontSize: 12,
    color: colors.secondaryLight,
  },
  memberJoinedDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sharingStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sharingStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sharingOn: {
    color: colors.success,
  },
  sharingOff: {
    color: colors.textMuted,
  },
});
