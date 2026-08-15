import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal } from 'react-native';
import { colors } from '../../theme/colors';

interface BackgroundPermissionModalProps {
  visible: boolean;
  onConfirmAlways: () => void;
  onFallbackForeground: () => void;
}

export const BackgroundPermissionModal: React.FC<BackgroundPermissionModalProps> = ({
  visible,
  onConfirmAlways,
  onFallbackForeground,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>🛰️</Text>
          </View>

          <Text style={styles.title}>Enable Background Location Sharing?</Text>

          <Text style={styles.description}>
            TripTrack needs <Text style={styles.highlight}>"Always Allow"</Text> location access so
            your trip group can see your live position even when your phone is locked or the app is
            in the background.
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>🔒 Privacy & Safety Defaults:</Text>
            <Text style={styles.infoBoxText}>
              • Location sharing is strictly trip-scoped.{'\n'}• Auto-disables when you turn off
              sharing or leave the trip.{'\n'}• Battery-conscious 30s / 50m update interval.
            </Text>
          </View>

          <View style={styles.buttonStack}>
            <TouchableOpacity style={styles.alwaysBtn} onPress={onConfirmAlways}>
              <Text style={styles.alwaysBtnText}>Enable "Always" Access →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.foregroundBtn} onPress={onFallbackForeground}>
              <Text style={styles.foregroundBtnText}>Share Only While App is Open</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderColor: colors.borderActive,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  highlight: {
    color: colors.primaryLight,
    fontWeight: '700',
  },
  infoBox: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 14,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
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
    gap: 10,
  },
  alwaysBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  alwaysBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  foregroundBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
  },
  foregroundBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
