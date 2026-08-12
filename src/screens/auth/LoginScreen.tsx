import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { AuthMode } from '../../types/auth';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { isMockMode, sendMagicLink, sendPhoneOtp, signInAsDemoUser } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [demoName, setDemoName] = useState('Alex River');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSendEmailLink = async () => {
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await sendMagicLink(email.trim());
      setInfoMsg(`Magic sign-in link sent to ${email}!`);
      setTimeout(() => {
        navigation.navigate('VerifyCode', { email: email.trim(), mode: 'email' });
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send magic link.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    if (!phone || phone.length < 7) {
      setErrorMsg('Please enter a valid phone number with country code.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const verId = await sendPhoneOtp(phone.trim());
      setInfoMsg(`OTP verification code sent to ${phone}!`);
      setTimeout(() => {
        navigation.navigate('VerifyCode', { 
          verificationId: typeof verId === 'string' ? verId : 'verification-id', 
          phone: phone.trim(),
          mode: 'phone' 
        });
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send OTP code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await signInAsDemoUser(demoName || 'Traveler');
    } catch (err: any) {
      setErrorMsg(err.message || 'Demo sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header Branding */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>📍</Text>
            </View>
            <Text style={styles.title}>TripTrack</Text>
            <Text style={styles.subtitle}>Group trip location-sharing with friends</Text>
          </View>

          {/* Firebase Environment Status Banner */}
          {isMockMode ? (
            <View style={styles.mockBanner}>
              <Text style={styles.mockBannerIcon}>⚠️</Text>
              <View style={styles.mockBannerTextContainer}>
                <Text style={styles.mockBannerTitle}>Mock / Demo Firebase Mode</Text>
                <Text style={styles.mockBannerText}>
                  Running with placeholder config. Update .env with real credentials to connect to live Firebase.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.liveBanner}>
              <Text style={styles.liveBannerIcon}>🔥</Text>
              <Text style={styles.liveBannerText}>Connected to Live Firebase Auth & Firestore</Text>
            </View>
          )}

          {/* Authentication Mode Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, mode === 'email' && styles.activeTab]}
              onPress={() => { setMode('email'); setErrorMsg(null); setInfoMsg(null); }}
            >
              <Text style={[styles.tabText, mode === 'email' && styles.activeTabText]}>Magic Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, mode === 'phone' && styles.activeTab]}
              onPress={() => { setMode('phone'); setErrorMsg(null); setInfoMsg(null); }}
            >
              <Text style={[styles.tabText, mode === 'phone' && styles.activeTabText]}>Phone OTP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, mode === 'demo' && styles.activeTab]}
              onPress={() => { setMode('demo'); setErrorMsg(null); setInfoMsg(null); }}
            >
              <Text style={[styles.tabText, mode === 'demo' && styles.activeTabText]}>Quick Demo</Text>
            </TouchableOpacity>
          </View>

          {/* Dynamic Form Area */}
          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {infoMsg ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{infoMsg}</Text>
              </View>
            ) : null}

            {mode === 'email' && (
              <View>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="alex@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.helperText}>
                  We'll send a magic sign-in link to your email inbox without needing a password.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.disabledButton]}
                  onPress={handleSendEmailLink}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Magic Link ✨</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {mode === 'phone' && (
              <View>
                <Text style={styles.inputLabel}>Mobile Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+1 555 019 2834"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                <Text style={styles.helperText}>
                  Receive a 6-digit OTP code to verify your phone number.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.disabledButton]}
                  onPress={handleSendPhoneOtp}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send OTP Code 📱</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {mode === 'demo' && (
              <View>
                <Text style={styles.inputLabel}>Display Name for Demo Session</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Alex River"
                  placeholderTextColor={colors.textMuted}
                  value={demoName}
                  onChangeText={setDemoName}
                />
                <Text style={styles.helperText}>
                  Sign in instantly as a guest to test and review app features without waiting for email/SMS.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, submitting && styles.disabledButton]}
                  onPress={handleDemoSignIn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Enter App (Demo Mode) 🚀</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Footer note */}
          <Text style={styles.footerNote}>
            TripTrack • Trip-scoped location sharing for groups
          </Text>

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
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderColor: colors.borderActive,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  logoIcon: {
    fontSize: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  mockBanner: {
    flexDirection: 'row',
    backgroundColor: colors.badgeDemo,
    borderRadius: 12,
    padding: 12,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  mockBannerIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  mockBannerTextContainer: {
    flex: 1,
  },
  mockBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.badgeDemoText,
  },
  mockBannerText: {
    fontSize: 12,
    color: '#FCD34D',
    marginTop: 2,
    lineHeight: 16,
  },
  liveBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 10,
    padding: 10,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBannerIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  liveBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: '#FFFFFF',
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
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 20,
    lineHeight: 17,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
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
  infoBox: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    borderColor: 'rgba(20, 184, 166, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  infoText: {
    color: colors.primaryLight,
    fontSize: 13,
  },
  footerNote: {
    marginTop: 30,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
});
