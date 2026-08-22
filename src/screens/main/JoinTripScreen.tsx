import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { TripPreview } from '../../types/trip';
import { inviteCodeSchema, validationMessage } from '../../validation/schemas';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../components/ui/Buttons';
import { FadeInView } from '../../components/ui/FadeInView';

interface JoinTripScreenProps {
  route: any;
  navigation: any;
}

export const JoinTripScreen: React.FC<JoinTripScreenProps> = ({ route, navigation }) => {
  const initialCode = route.params?.inviteCode || '';
  const { getTripPreviewByCode, joinTripByCode, pendingInviteCode, setPendingInviteCode } =
    useTrips();

  const [code, setCode] = useState(initialCode || pendingInviteCode || '');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<TripPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Auto-resolve if code is provided via route params or pending invite link
  useEffect(() => {
    const targetCode = initialCode || pendingInviteCode;
    if (targetCode) {
      setCode(targetCode);
      handleResolveCode(targetCode);
    }
  }, [initialCode, pendingInviteCode]);

  const handleResolveCode = async (codeToResolve?: string) => {
    const result = inviteCodeSchema.safeParse(codeToResolve || code);
    if (!result.success) return setErrorMsg(validationMessage(result));
    const codeVal = result.data;
    setErrorMsg(null);
    setLoadingPreview(true);
    try {
      const res = await getTripPreviewByCode(codeVal);
      setPreview(res);
    } catch (err: any) {
      setPreview(null);
      setErrorMsg(err.message || `Could not find trip with code "${codeVal}".`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!preview) return;
    setJoining(true);
    setErrorMsg(null);
    try {
      const joinedTrip = await joinTripByCode(preview.trip.inviteCode);
      if (pendingInviteCode) {
        setPendingInviteCode(null);
      }
      navigation.replace('TripDetail', { tripId: joinedTrip.id, tripName: joinedTrip.name });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join trip.');
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Top Back Navigation */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Back to Trips</Text>
          </TouchableOpacity>

          <FadeInView style={styles.header}>
            <View style={styles.headerIconTile}>
              <Ionicons name="key-outline" size={26} color={colors.primaryLight} />
            </View>
            <Text style={styles.title}>Join a Trip</Text>
            <Text style={styles.subtitle}>Enter an invite code or tap a shared link</Text>
          </FadeInView>

          {/* Code Search Bar */}
          <FadeInView delay={100} style={styles.searchCard}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Invite Code</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.codeInput}
                placeholder="TRIP-4F2A"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={(val: string) => {
                  setCode(val);
                  setPreview(null);
                  setErrorMsg(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.resolveBtn, loadingPreview && styles.disabledBtn]}
                onPress={() => handleResolveCode()}
                disabled={loadingPreview}
              >
                {loadingPreview ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.resolveBtnText}>Find</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={async () => {
                const permission = cameraPermission?.granted
                  ? cameraPermission
                  : await requestCameraPermission();
                if (permission.granted) setScannerOpen(true);
                else setErrorMsg('Camera permission is required to scan an invite QR code.');
              }}
            >
              <Ionicons name="qr-code-outline" size={19} color={colors.primaryLight} />
              <Text style={styles.scanText}>Scan QR code</Text>
            </TouchableOpacity>
          </FadeInView>

          {/* Trip Preview Card */}
          {preview ? (
            <FadeInView delay={60} style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.previewBadge}>
                  <Ionicons name="sparkles" size={11} color={colors.primaryLight} />
                  <Text style={styles.previewBadgeText}>TRIP FOUND ✨</Text>
                </View>
                <Text style={styles.previewTitle}>{preview.trip.name}</Text>
                <Text style={styles.previewDates}>
                  📅 {preview.trip.startDate} → {preview.trip.endDate}
                </Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.membersLabel}>CURRENT MEMBERS ({preview.memberCount})</Text>

              <View style={styles.membersList}>
                {preview.members.map((m, idx) => (
                  <View key={m.uid || idx} style={styles.memberChip}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberInitial}>
                        {m.displayName ? m.displayName.charAt(0).toUpperCase() : 'M'}
                      </Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                  </View>
                ))}
              </View>

              <AppButton
                label="Confirm & Join Trip 🚀"
                onPress={handleConfirmJoin}
                loading={joining}
              />
            </FadeInView>
          ) : null}
        </ScrollView>
        <Modal
          visible={scannerOpen}
          animationType="slide"
          onRequestClose={() => setScannerOpen(false)}
        >
          <View style={styles.scanner}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                const match = data.match(/(?:triptrack:\/\/join\/)?(TRIP-[A-Z0-9]{4,12})/i);
                if (!match) return;
                const nextCode = match[1].toUpperCase();
                setScannerOpen(false);
                setCode(nextCode);
                void handleResolveCode(nextCode);
              }}
            />
            <View style={styles.scanFrame} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <TouchableOpacity
              style={styles.closeScanner}
              onPress={() => setScannerOpen(false)}
              accessibilityLabel="Close QR scanner"
            >
              <Ionicons name="close" size={26} color={colors.onPrimary} />
            </TouchableOpacity>
            <Text style={styles.scannerHint}>Place the TripTrack QR code inside the frame</Text>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 40,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  headerIconTile: {
    width: 62,
    height: 62,
    borderRadius: radius.xl,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1.5,
    borderColor: colors.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs + 2,
    textAlign: 'center',
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  scanButton: {
    minHeight: 44,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: radius.md,
    backgroundColor: colors.tintPrimary,
  },
  scanText: { color: colors.primaryLight, fontWeight: '700' },
  scanner: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 240,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.borderActive,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  closeScanner: {
    position: 'absolute',
    right: spacing.xl,
    top: 50,
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 90,
    color: colors.onPrimary,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    fontWeight: '700',
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resolveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  resolveBtnText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorBox,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  previewHeader: {
    alignItems: 'flex-start',
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tintPrimary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm + 2,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: letterSpacing.chip,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  previewDates: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs + 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  membersLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: letterSpacing.chip,
    marginBottom: spacing.md,
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
    marginBottom: spacing.xl,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  memberInitial: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
  },
  memberName: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
