import { supabase } from '../../config/supabase';
import { UserProfile } from '../../types/auth';
import { toMillis } from './mappers';

export async function loadProfile(userId: string, email?: string | null): Promise<UserProfile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return {
    uid: data.id,
    name: data.display_name,
    avatar: data.avatar_url || undefined,
    email: email || null,
    createdAt: toMillis(data.created_at) || Date.now(),
  };
}

export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'triptrack://auth/callback',
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName: string
): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: 'triptrack://auth/callback',
    },
  });
  if (error) throw error;
  return data.session === null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'triptrack://auth/reset-password',
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function handleSupabaseAuthCallback(url: string): Promise<'signin' | 'recovery' | null> {
  const parsed = new URL(url);
  const isSignIn = parsed.protocol === 'triptrack:' && parsed.hostname === 'auth' && parsed.pathname === '/callback';
  const isRecovery = parsed.protocol === 'triptrack:' && parsed.hostname === 'auth' && parsed.pathname === '/reset-password';
  if (!isSignIn && !isRecovery) {
    return null;
  }

  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  fragment.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });

  const authError = params.get('error_description') || params.get('error');
  if (authError) throw new Error('The authentication link is invalid or has expired.');

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return isRecovery ? 'recovery' : 'signin';
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return isRecovery || params.get('type') === 'recovery' ? 'recovery' : 'signin';
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
