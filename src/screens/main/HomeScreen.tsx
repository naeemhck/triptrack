import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export const HomeScreen: React.FC = () => {
  const { user, isMockMode, signOutUser } = useAuth();
  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch {
      Alert.alert(
        'Sign Out Failed',
        'TripTrack could not securely sign out. Check your connection and try again.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header Section */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>📍</Text>
            </View>
            <View>
              <Text style={styles.appName}>TripTrack</Text>
              <Text style={styles.appTagline}>Location Sharing for Group Trips</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={() => void handleSignOut()}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Backend status */}
        <View
          style={[styles.statusBadge, isMockMode ? styles.statusBadgeDemo : styles.statusBadgeLive]}
        >
          <Text style={styles.statusBadgeText}>
            {isMockMode ? 'Demo Auth Active' : 'Supabase Connected'}
          </Text>
        </View>

        {/* User Profile Card (users/{uid} document preview) */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.userName}>{user?.name || 'Traveler User'}</Text>
              <Text style={styles.userUid} numberOfLines={1}>
                UID: {user?.uid}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoValue}>{user?.phoneNumber || 'N/A'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Profile ID:</Text>
            <Text style={styles.infoValueHighlight}>users/{user?.uid}</Text>
          </View>
        </View>

        {/* Ready for Step 3 Notice */}
        <View style={styles.nextStepCard}>
          <Text style={styles.nextStepBadge}>STEP 1 & 2 COMPLETED ✅</Text>
          <Text style={styles.nextStepTitle}>Auth Flow & Project Ready</Text>
          <Text style={styles.nextStepText}>
            Your authenticated TripTrack profile is connected to Supabase.
          </Text>

          <View style={styles.actionPreviewRow}>
            <View style={[styles.actionPreviewBtn, styles.disabledBtn]}>
              <Text style={styles.actionBtnText}>+ Create Trip (Step 3)</Text>
            </View>
            <View style={[styles.actionPreviewBtn, styles.disabledBtn]}>
              <Text style={styles.actionBtnText}>🔑 Join via Code</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoIcon: {
    fontSize: 22,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  appTagline: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusBadgeDemo: {
    backgroundColor: colors.badgeDemo,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.badgeDemoText,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
  },
  profileMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userUid: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  infoValueHighlight: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  nextStepCard: {
    backgroundColor: 'rgba(20, 184, 166, 0.08)',
    borderRadius: 16,
    padding: 18,
    borderColor: 'rgba(20, 184, 166, 0.25)',
    borderWidth: 1,
  },
  nextStepBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nextStepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  nextStepText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },
  actionPreviewRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionPreviewBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
