import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { AuthMode } from '../../types/auth';
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
          <Text style={styles.title}>TripTrack</Text>
          <Text style={styles.subtitle}>Sign in to your trip groups</Text>

          <View style={styles.tabs}>
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
          </View>

          <View style={styles.card}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}
            {mode === 'sign_up' ? (
              <>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Alex River"
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />
              </>
            ) : null}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="alex@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {mode !== 'magic_link' ? (
              <>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textMuted}
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

            <TouchableOpacity
              style={[styles.primary, submitting && styles.disabled]}
              disabled={submitting}
              onPress={mode === 'password' ? signIn : mode === 'magic_link' ? magicLink : signUp}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryText}>
                  {mode === 'password'
                    ? 'Sign In'
                    : mode === 'magic_link'
                      ? 'Send Magic Link'
                      : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>
            {mode === 'password' ? (
              <TouchableOpacity
                style={styles.linkButton}
                disabled={submitting}
                onPress={forgotPassword}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40 },
  title: { color: colors.textPrimary, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  activeTab: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  activeTabText: { color: '#FFF' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
  },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  error: { color: colors.danger, marginBottom: 14, lineHeight: 19 },
  info: { color: colors.primaryLight, marginBottom: 14, lineHeight: 19 },
  primary: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#FFF', fontWeight: '800' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  linkText: { color: colors.primaryLight, fontWeight: '700' },
});
