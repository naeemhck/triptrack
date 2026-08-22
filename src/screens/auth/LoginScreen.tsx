import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { letterSpacing, radius, spacing } from '../../theme';
import { AuthMode } from '../../types/auth';
import { AppButton } from '../../components/ui/Buttons';
import { LabeledInput } from '../../components/ui/Inputs';
import { FadeInView } from '../../components/ui/FadeInView';
import {
  authCredentialsSchema,
  emailSchema,
  newAccountSchema,
  validationMessage,
} from '../../validation/schemas';

interface LoginScreenProps {
  navigation: any;
}

const authErrorMessage = (cause: any) => {
  const code = String(cause?.code || '').toLowerCase();
  const message = String(cause?.message || '').toLowerCase();
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Confirm your email before signing in.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Unable to reach TripTrack. Check your connection and try again.';
  }
  return cause?.message || 'Authentication could not be completed. Try again.';
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { createAccount, sendMagicLink, sendPasswordReset, signInWithEmailPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await action();
    } catch (cause: any) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const signIn = () => {
    const result = authCredentialsSchema.safeParse({ email, password });
    if (!result.success) return setError(validationMessage(result));
    void run(() => signInWithEmailPassword(result.data.email, result.data.password));
  };

  const signUp = () => {
    const result = newAccountSchema.safeParse({ email, password, displayName });
    if (!result.success) return setError(validationMessage(result));
    void run(async () => {
      const confirmationRequired = await createAccount(
        result.data.email,
        result.data.password,
        result.data.displayName,
      );
      setInfo(
        confirmationRequired
          ? 'Check your email to confirm the account, then return to TripTrack.'
          : 'Account created.',
      );
    });
  };

  const magicLink = () => {
    const result = emailSchema.safeParse(email);
    if (!result.success) return setError(validationMessage(result));
    void run(async () => {
      await sendMagicLink(result.data);
      setInfo('Check your email for the TripTrack sign-in link or verification code.');
      navigation.navigate('VerifyCode', { email: result.data, mode: 'email' });
    });
  };

  const forgotPassword = () => {
    const result = emailSchema.safeParse(email);
    if (!result.success) return setError(validationMessage(result));
    void run(async () => {
      await sendPasswordReset(result.data);
      setInfo('If the account can be reset, a password email will arrive shortly.');
    });
  };

  const selectMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FadeInView style={styles.brandLockup}>
            <View style={styles.brandTile}>
              <Ionicons name="navigate" size={26} color={colors.primaryLight} />
            </View>
            <Text style={styles.title}>TripTrack</Text>
            <Text style={styles.subtitle}>Sign in to your trip groups</Text>
          </FadeInView>

          <FadeInView delay={80} style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'password' && styles.activeTab]}
              onPress={() => selectMode('password')}
            >
              <Text style={[styles.tabText, mode === 'password' && styles.activeTabText]}>
                Password
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'magic_link' && styles.activeTab]}
              onPress={() => selectMode('magic_link')}
            >
              <Text style={[styles.tabText, mode === 'magic_link' && styles.activeTabText]}>
                Magic Link
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'sign_up' && styles.activeTab]}
              onPress={() => selectMode('sign_up')}
            >
              <Text style={[styles.tabText, mode === 'sign_up' && styles.activeTabText]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </FadeInView>

          <FadeInView delay={160} style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            {info ? (
              <View style={styles.infoBox}>
                <Ionicons name="mail-outline" size={15} color={colors.primaryLight} />
                <Text style={styles.info}>{info}</Text>
              </View>
            ) : null}
            <View style={styles.form}>
              {mode === 'sign_up' ? (
                <LabeledInput
                  label="Display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Alex River"
                  maxLength={100}
                />
              ) : null}
              <LabeledInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="alex@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {mode !== 'magic_link' ? (
                <>
                  <LabeledInput
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  {mode === 'sign_up' ? (
                    <Text style={styles.helper}>Use a long, unique password or passphrase.</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.helper}>
                  Receive a one-time sign-in link and verification code by email.
                </Text>
              )}
            </View>

            <AppButton
              label={
                mode === 'password'
                  ? 'Sign In'
                  : mode === 'magic_link'
                    ? 'Send Magic Link'
                    : 'Create Account'
              }
              onPress={mode === 'password' ? signIn : mode === 'magic_link' ? magicLink : signUp}
              loading={submitting}
            />
            {mode === 'password' ? (
              <TouchableOpacity
                style={styles.linkButton}
                disabled={submitting}
                onPress={forgotPassword}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl + 4, paddingTop: 56, paddingBottom: 40 },
  brandLockup: { alignItems: 'center', marginBottom: spacing.xxl + 4 },
  brandTile: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.tintPrimary,
    borderWidth: 1.5,
    borderColor: colors.borderActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: radius.sm + 1,
  },
  activeTab: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  activeTabText: { color: colors.onPrimary },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg + 4,
  },
  form: { gap: spacing.md, marginBottom: spacing.lg },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: -2 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorBox,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  error: { color: colors.danger, lineHeight: 19, flex: 1, fontSize: 13 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.tintPrimary,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  info: { color: colors.primaryLight, lineHeight: 19, flex: 1, fontSize: 13 },
  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  linkText: { color: colors.primaryLight, fontWeight: '700' },
});
