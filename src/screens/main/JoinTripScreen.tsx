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
import { TripPreview } from '../../types/trip';
import { inviteCodeSchema, validationMessage } from '../../validation/schemas';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

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
            <Text style={styles.backBtnText}>← Back to Trips</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.headerIcon}>🔑</Text>
            <Text style={styles.title}>Join a Trip</Text>
            <Text style={styles.subtitle}>Enter an invite code or tap a shared link</Text>
          </View>

          {/* Code Search Bar */}
          <View style={styles.searchCard}>
            {errorMsg ? (
              <View style={styles.errorBox}>
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
                  <ActivityIndicator color="#FFF" />
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
          </View>

          {/* Trip Preview Card */}
          {preview ? (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewBadge}>TRIP FOUND ✨</Text>
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

              <TouchableOpacity
                style={[styles.joinConfirmBtn, joining && styles.disabledBtn]}
                onPress={handleConfirmJoin}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.joinConfirmBtnText}>Confirm & Join Trip 🚀</Text>
                )}
              </TouchableOpacity>
            </View>
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
            <TouchableOpacity
              style={styles.closeScanner}
              onPress={() => setScannerOpen(false)}
              accessibilityLabel="Close QR scanner"
            >
              <Ionicons name="close" size={26} color="#FFF" />
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginBottom: 20,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  scanButton: {
    minHeight: 44,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: 8,
  },
  scanText: { color: colors.primaryLight, fontWeight: '700' },
  scanner: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 50,
  },
  closeScanner: {
    position: 'absolute',
    right: 20,
    top: 50,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHint: {
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 8,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryLight,
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resolveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  resolveBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  previewHeader: {
    alignItems: 'flex-start',
  },
  previewBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: 1,
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  previewDates: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  membersLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 12,
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  memberInitial: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  joinConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinConfirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
