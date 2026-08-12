import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

interface VerifyCodeScreenProps {
  route: any;
  navigation: any;
}

export const VerifyCodeScreen: React.FC<VerifyCodeScreenProps> = ({ route, navigation }) => {
  const { verificationId, phone, email, mode } = route.params || {};
  const { verifyOtpCode } = useAuth();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = async () => {
    if (mode === 'phone' && (!code || code.length < 4)) {
      setErrorMsg('Please enter the verification code sent to your phone.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await verifyOtpCode(verificationId || 'mock-id', code || '123456');
      // Auth state listener in AuthContext will update and automatically switch stack to HomeScreen
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>

          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back to Login</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.icon}>{mode === 'email' ? '✉️' : '📲'}</Text>
            <Text style={styles.title}>
              {mode === 'email' ? 'Check Your Email' : 'Enter Verification Code'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'email'
                ? `We sent a magic sign-in link to ${email || 'your email'}. Click the link or confirm below.`
                : `Enter the code sent to ${phone || 'your phone number'}.`}
            </Text>
          </View>

          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {mode === 'phone' ? (
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
                <Text style={styles.emailNoticeText}>
                  Checking for magic link sign-in token...
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.disabledButton]}
              onPress={handleVerify}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'email' ? 'Complete Magic Sign-In' : 'Verify & Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginBottom: 20,
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
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
  codeInput: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.borderActive,
    marginBottom: 20,
  },
  emailNoticeBox: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  emailNoticeText: {
    color: colors.textSecondary,
    fontSize: 13,
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
    color: '#FFFFFF',
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
});
