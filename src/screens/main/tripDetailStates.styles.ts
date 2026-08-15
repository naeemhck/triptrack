import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export const tripDetailStateStyles = StyleSheet.create({
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  notFoundText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  pendingSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  pendingSyncBannerTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  pendingSyncBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FBBF24',
  },
  pendingSyncBannerSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncRetryBtn: {
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncRetryBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  startTripBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startTripBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  endTripBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  endTripBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  plannedNoticeCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  plannedNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FBBF24',
    marginBottom: 4,
  },
  plannedNoticeSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  completedNoticeCard: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  completedNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  completedNoticeSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  memberActionsColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  removeMemberBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  routeLeaderBtn: {
    backgroundColor: 'rgba(20, 184, 166, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  routeLeaderBtnText: { fontSize: 10, fontWeight: '700', color: colors.primaryLight },
  removeMemberBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.danger,
  },
});
