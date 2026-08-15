import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export const ResetPasswordScreen: React.FC = () => {
  const { completePasswordReset } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setError(null);
    setSubmitting(true);
    try {
      await completePasswordReset(password);
    } catch (cause: any) {
      setError(cause?.message || 'Password could not be updated.');
      setSubmitting(false);
    }
  };

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}><View style={styles.container}>
    <Text style={styles.title}>Set a new password</Text>
    <Text style={styles.helper}>Use at least 8 characters. A longer, unique passphrase is recommended.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <TextInput style={styles.input} placeholder="New password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" />
    <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor={colors.textMuted} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} autoCapitalize="none" />
    <TouchableOpacity style={[styles.button, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
      {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Update password</Text>}
    </TouchableOpacity>
  </View></SafeAreaView>;
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 10 },
  helper: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  error: { color: colors.danger, marginBottom: 14 },
  input: { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: 8, color: colors.textPrimary, padding: 14, marginBottom: 12 },
  button: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
