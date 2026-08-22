import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme';
import { AppButton } from '../ui/Buttons';

interface BackgroundPermissionModalProps {
  visible: boolean;
  onConfirmAlways: () => void;
  onFallbackForeground: () => void;
}

const DialogEntrance = ({ children }: { children: React.ReactNode }) => {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, speed: 30, bounciness: 6, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity, width: '100%', alignItems: 'center' }}>
      {children}
    </Animated.View>
  );
};

export const BackgroundPermissionModal: React.FC<BackgroundPermissionModalProps> = ({
  visible,
  onConfirmAlways,
  onFallbackForeground,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <DialogEntrance>
          <View style={styles.dialog}>
            <View style={styles.iconCircle}>
              <Ionicons name="locate" size={30} color={colors.primaryLight} />
            </View>

            <Text style={styles.title}>Enable Background Location Sharing?</Text>

            <Text style={styles.description}>
              TripTrack needs <Text style={styles.highlight}>"Always Allow"</Text> location access
              so your trip group can see your live position even when your phone is locked or the
              app is in the background.
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxTitle}>🔒 Privacy & Safety Defaults:</Text>
              <Text style={styles.infoBoxText}>
                • Location sharing is strictly trip-scoped.{'\n'}• Auto-disables when you turn off
                sharing or leave the trip.{'\n'}• Battery-conscious 30s / 50m update interval.
              </Text>
            </View>

            <View style={styles.buttonStack}>
              <AppButton label='Enable "Always" Access →' onPress={onConfirmAlways} />

              <AppButton
                label="Share Only While App is Open"
                onPress={onFallbackForeground}
                variant="secondary"
              />
            </View>
          </View>
        </DialogEntrance>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  dialog: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1,
    borderColor: colors.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  highlight: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  infoBox: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  infoBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryLight,
    marginBottom: 6,
  },
  infoBoxText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  buttonStack: {
    width: '100%',
    gap: spacing.sm + 2,
  },
});
