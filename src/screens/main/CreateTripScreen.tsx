import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { Trip } from '../../types/trip';
import { tripCreateSchema, validationMessage } from '../../validation/schemas';
import { AppButton } from '../../components/ui/Buttons';
import { LabeledInput } from '../../components/ui/Inputs';
import { CodeDisplay } from '../../components/ui/Feedback';
import { FadeInView } from '../../components/ui/FadeInView';

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
    const result = tripCreateSchema.safeParse({ name, startDate, endDate });
    if (!result.success) return setErrorMsg(validationMessage(result));
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const trip = await createTrip(result.data.name, result.data.startDate!, result.data.endDate!);
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
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Back to Trips</Text>
          </TouchableOpacity>

          {!createdTrip ? (
            <View>
              <FadeInView style={styles.header}>
                <View style={styles.headerIconTile}>
                  <Ionicons name="map-outline" size={26} color={colors.primaryLight} />
                </View>
                <Text style={styles.title}>Create a New Trip</Text>
                <Text style={styles.subtitle}>Set up location sharing for your group trip</Text>
              </FadeInView>

              <FadeInView delay={100} style={styles.card}>
                {errorMsg ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <LabeledInput
                  label="Trip Name"
                  placeholder="e.g. Summer Beach House '26"
                  value={name}
                  onChangeText={setName}
                />

                <View style={styles.row}>
                  <LabeledInput
                    label="Start Date"
                    placeholder="YYYY-MM-DD"
                    value={startDate}
                    onChangeText={setStartDate}
                    style={{ flex: 1 }}
                  />
                  <LabeledInput
                    label="End Date"
                    placeholder="YYYY-MM-DD"
                    value={endDate}
                    onChangeText={setEndDate}
                    style={{ flex: 1 }}
                  />
                </View>

                <Text style={styles.helperText}>
                  Location sharing will automatically activate for your group during these trip
                  dates.
                </Text>

                <AppButton
                  label="Create Trip & Get Code 🚀"
                  onPress={handleCreate}
                  loading={submitting}
                />
              </FadeInView>
            </View>
          ) : (
            /* Post Creation Confirmation & Share Screen */
            <FadeInView style={styles.successContainer}>
              <View style={styles.successIconBox}>
                <Ionicons name="checkmark-circle" size={38} color={colors.primaryLight} />
              </View>
              <Text style={styles.successTitle}>Trip Created Successfully!</Text>
              <Text style={styles.successSub}>{createdTrip.name}</Text>

              {/* Invite Code Box */}
              <CodeDisplay code={createdTrip.inviteCode} caption="Invite code for friends" />
              <Text style={styles.inviteDeepLinkText}>
                triptrack://join/{createdTrip.inviteCode}
              </Text>

              <View style={styles.successActions}>
                <AppButton
                  label="📤 Share Invite Link & Code"
                  onPress={handleShareInvite}
                  icon="share-social-outline"
                />

                <AppButton
                  label="Go to Trip Details →"
                  onPress={handleContinueToTrip}
                  variant="secondary"
                />
              </View>
            </FadeInView>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: -spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorBox,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm + 2,
  },
  successIconBox: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1,
    borderColor: colors.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: letterSpacing.tight,
  },
  successSub: {
    fontSize: 16,
    color: colors.primaryLight,
    fontWeight: '700',
    marginTop: spacing.xs + 2,
    marginBottom: spacing.xl,
  },
  inviteDeepLinkText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  successActions: {
    width: '100%',
    gap: spacing.md,
  },
});
