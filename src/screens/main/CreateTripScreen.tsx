import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { Trip } from '../../types/trip';

interface CreateTripScreenProps {
  navigation: any;
}

export const CreateTripScreen: React.FC<CreateTripScreenProps> = ({ navigation }) => {
  const { createTrip } = useTrips();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('2026-08-15');
  const [endDate, setEndDate] = useState('2026-08-22');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter a trip title (e.g. Alpine Highway Roadtrip).');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const trip = await createTrip(name.trim(), startDate, endDate);
      setCreatedTrip(trip);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create trip.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareInvite = async () => {
    if (!createdTrip) return;
    const deepLink = `triptrack://join/${createdTrip.inviteCode}`;
    const webFallback = `https://triptrack.app/join/${createdTrip.inviteCode}`;

    try {
      await Share.share({
        title: `Join my trip: ${createdTrip.name}!`,
        message: `Hey! Join our trip "${createdTrip.name}" on TripTrack using code: ${createdTrip.inviteCode}\n\nTap to join: ${deepLink}\nOr web fallback: ${webFallback}`,
      });
    } catch (err) {
      console.error('Error sharing trip invite:', err);
    }
  };

  const handleContinueToTrip = () => {
    if (!createdTrip) return;
    navigation.replace('TripDetail', { tripId: createdTrip.id, tripName: createdTrip.name });
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

          {!createdTrip ? (
            <View>
              <View style={styles.header}>
                <Text style={styles.headerIcon}>🗺️</Text>
                <Text style={styles.title}>Create a New Trip</Text>
                <Text style={styles.subtitle}>Set up location sharing for your group trip</Text>
              </View>

              <View style={styles.card}>
                {errorMsg ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>Trip Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Summer Beach House '26"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Start Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textMuted}
                      value={startDate}
                      onChangeText={setStartDate}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>End Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textMuted}
                      value={endDate}
                      onChangeText={setEndDate}
                    />
                  </View>
                </View>

                <Text style={styles.helperText}>
                  Location sharing will automatically activate for your group during these trip dates.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.disabledButton]}
                  onPress={handleCreate}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create Trip & Get Code 🚀</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Post Creation Confirmation & Share Screen */
            <View style={styles.successContainer}>
              <View style={styles.successIconBox}>
                <Text style={styles.successIcon}>🎉</Text>
              </View>
              <Text style={styles.successTitle}>Trip Created Successfully!</Text>
              <Text style={styles.successSub}>{createdTrip.name}</Text>

              {/* Invite Code Box */}
              <View style={styles.inviteBox}>
                <Text style={styles.inviteLabel}>INVITE CODE FOR FRIENDS</Text>
                <Text style={styles.inviteCodeText}>{createdTrip.inviteCode}</Text>
                <Text style={styles.inviteDeepLinkText}>
                  triptrack://join/{createdTrip.inviteCode}
                </Text>
              </View>

              <View style={styles.successActions}>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite}>
                  <Text style={styles.shareBtnText}>📤 Share Invite Link & Code</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.continueBtn} onPress={handleContinueToTrip}>
                  <Text style={styles.continueBtnText}>Go to Trip Details →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </ScrollView>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 20,
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
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
  successContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  successIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 36,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  successSub: {
    fontSize: 16,
    color: colors.primaryLight,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 24,
  },
  inviteBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  inviteLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inviteCodeText: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primaryLight,
    letterSpacing: 4,
    marginBottom: 8,
  },
  inviteDeepLinkText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  successActions: {
    width: '100%',
    gap: 12,
  },
  shareBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  continueBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  continueBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
