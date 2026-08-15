import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';

import { supabase } from '../config/supabase';
import { stopBackgroundLocationTracking } from '../services/backgroundLocation';
import { disablePushTokensForCurrentUser } from '../services/notifications';
import {
  handleSupabaseAuthCallback, loadProfile, requestPasswordReset, sendEmailOtp,
  signInWithPassword, signOut, signUpWithPassword, updatePassword, verifyEmailOtp,
} from '../services/supabase/auth';
import { AuthContextType, UserProfile } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    let lastHandledAuthUrl: string | null = null;
    let sessionRevision = 0;

    const applySession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      const revision = ++sessionRevision;
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        setPasswordRecovery(false);
        setLoading(false);
        return;
      }

      try {
        const profile = await loadProfile(session.user.id, session.user.email);
        if (active && revision === sessionRevision) setUser(profile);
      } catch (error) {
        console.error('[Auth] Unable to load the authenticated profile.', error);
        if (active && revision === sessionRevision) setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('[Auth] Session restoration failed.', error);
        setLoading(false);
        return;
      }
      void applySession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    const handleAuthUrl = async (url: string | null) => {
      if (!url || url === lastHandledAuthUrl) return;
      lastHandledAuthUrl = url;
      try {
        const callbackType = await handleSupabaseAuthCallback(url);
        if (callbackType === 'recovery' && active) setPasswordRecovery(true);
      } catch (error) {
        console.error('[Auth] Unable to complete the authentication callback.', error);
        if (active) setLoading(false);
      }
    };

    void Linking.getInitialURL().then(handleAuthUrl);
    const linkSubscription = Linking.addEventListener('url', (event) => {
      void handleAuthUrl(event.url);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const sendMagicLink = async (email: string): Promise<boolean> => {
    await sendEmailOtp(email.trim());
    return true;
  };

  const signInWithEmailPassword = (email: string, password: string) =>
    signInWithPassword(email.trim(), password);

  const createAccount = (email: string, password: string, displayName: string) =>
    signUpWithPassword(email.trim(), password, displayName.trim());

  const sendPasswordReset = (email: string) => requestPasswordReset(email.trim());

  const completePasswordReset = async (password: string) => {
    await updatePassword(password);
    setPasswordRecovery(false);
  };

  const verifyOtpCode = async (email: string, code: string): Promise<boolean> => {
    if (!email || !code) throw new Error('Email and verification code are required.');
    await verifyEmailOtp(email.trim(), code.trim());
    return true;
  };

  const unsupportedPhoneOtp = async (): Promise<string> => {
    throw new Error('Phone OTP is unavailable in the zero-billing beta. Use email verification.');
  };

  const unsupportedDemoLogin = async (): Promise<void> => {
    throw new Error('Hosted demo login is unavailable. Use email verification.');
  };

  const signOutUser = async (): Promise<void> => {
    setLoading(true);
    try {
      await stopBackgroundLocationTracking();
      if (user) await disablePushTokensForCurrentUser(user.uid);
      await signOut();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!user) throw new Error('Authentication required.');
    setLoading(true);
    try {
      await stopBackgroundLocationTracking();
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw new Error(`Account deletion failed: ${error.message}`);
      if (data?.success !== true) throw new Error('Account deletion failed: server did not confirm deletion.');
      await signOut();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isMockMode: false,
      passwordRecovery,
      signInWithEmailPassword,
      createAccount,
      sendPasswordReset,
      completePasswordReset,
      sendMagicLink,
      sendPhoneOtp: unsupportedPhoneOtp,
      verifyOtpCode,
      signInAsDemoUser: unsupportedDemoLogin,
      signOutUser,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
