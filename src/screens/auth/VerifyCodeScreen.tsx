import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { AppButton } from '../../components/ui/Buttons';
import { FadeInView } from '../../components/ui/FadeInView';

interface VerifyCodeScreenProps {
  route: any;
  navigation: any;
}

export const VerifyCodeScreen: React.FC<VerifyCodeScreenProps> = ({ route, navigation }) => {
  const { phone, email, mode } = route.params || {};
  const { verifyOtpCode } = useAuth();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      setErrorMsg('Please enter the 6-digit verification code from your email.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await verifyOtpCode(email || '', code);
      // Auth state listener in AuthContext will update and automatically switch stack to HomeScreen
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backButtonText}>Back to Login</Text>
          </TouchableOpacity>

          <FadeInView style={styles.header}>
            <View style={styles.iconTile}>
              <Ionicons
                name={mode === 'email' ? 'mail-outline' : 'phone-portrait-outline'}
                size={26}
                color={colors.primaryLight}
              />
            </View>
            <Text style={styles.title}>
              {mode === 'email' ? 'Check Your Email' : 'Enter Verification Code'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'email'
                ? `We sent a magic sign-in link to ${email || 'your email'}. Click the link or confirm below.`
                : `Enter the code sent to ${phone || 'your phone number'}.`}
            </Text>
          </FadeInView>

          <FadeInView delay={100} style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {mode === 'email' ? (
              <View>
                <Text style={styles.inputLabel}>6-Digit Code</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="1 2 3 4 5 6"
                  placeholderTextColor={colors.textMuted}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
            ) : (
              <View style={styles.emailNoticeBox}>
                <Text style={styles.emailNoticeText}>Checking for magic link sign-in token...</Text>
              </View>
            )}

            <AppButton label="Verify & Continue" onPress={handleVerify} loading={submitting} />
          </FadeInView>
        </View>
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
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  iconTile: {
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
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  codeInput: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderActive,
    marginBottom: spacing.xl,
  },
  emailNoticeBox: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  emailNoticeText: {
    color: colors.textSecondary,
    fontSize: 13,
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
});
