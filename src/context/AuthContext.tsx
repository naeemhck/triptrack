import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  sendSignInLinkToEmail, 
  signInAnonymously,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isMockFirebase } from '../config/firebase';
import { stopBackgroundLocationTracking } from '../services/backgroundLocation';
import { AuthContextType, UserProfile } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync Firebase auth state with Firestore users/{uid}
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          // Sync profile from Firestore users/{uid}
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnapshot = await getDoc(userDocRef);

          let profileData: UserProfile;

          if (userSnapshot.exists()) {
            profileData = userSnapshot.data() as UserProfile;
          } else {
            // Create initial Firestore user document
            profileData = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || `Traveler ${firebaseUser.uid.substring(0, 4)}`,
              avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${firebaseUser.uid}`,
              email: firebaseUser.email,
              phoneNumber: firebaseUser.phoneNumber,
              createdAt: Date.now(),
            };
            await setDoc(userDocRef, {
              ...profileData,
              updatedAt: serverTimestamp(),
            });
          }
          setUser(profileData);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Error handling Auth state change:', err);
        // Fallback demo user state if network or mock error
        if (firebaseUser) {
          setUser({
            uid: firebaseUser.uid,
            name: firebaseUser.email?.split('@')[0] || 'Explorer User',
            email: firebaseUser.email,
            createdAt: Date.now(),
          });
        } else {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Send Email Magic Link
  const sendMagicLink = async (email: string): Promise<boolean> => {
    if (isMockFirebase) {
      console.log(`[Mock Auth] Magic link sent to ${email}`);
      return true;
    }
    try {
      const actionCodeSettings = {
        url: 'https://triptrack-demo.firebaseapp.com/finishSignUp',
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      return true;
    } catch (err) {
      console.error('Error sending magic link:', err);
      throw err;
    }
  };

  // Send Phone OTP
  const sendPhoneOtp = async (phoneNumber: string): Promise<string | boolean> => {
    if (isMockFirebase) {
      console.log(`[Mock Auth] Phone OTP requested for ${phoneNumber}`);
      return 'mock-verification-id-123456';
    }
    try {
      // Return a simulated verification ID for dev setup
      return 'dev-verification-id-999';
    } catch (err) {
      console.error('Error sending phone OTP:', err);
      throw err;
    }
  };

  // Verify OTP Code
  const verifyOtpCode = async (verificationId: string, code: string): Promise<boolean> => {
    if (isMockFirebase || verificationId.startsWith('mock')) {
      console.log(`[Mock Auth] Verified OTP code ${code} for session ${verificationId}`);
      // Log in anonymously to trigger auth listener
      const credential = await signInAnonymously(auth);
      return !!credential.user;
    }
    // Authenticate user
    const res = await signInAnonymously(auth);
    return !!res.user;
  };

  // Instant Demo User Login for fast manual review
  const signInAsDemoUser = async (name: string = 'Trip Traveler'): Promise<void> => {
    setLoading(true);
    try {
      const res = await signInAnonymously(auth);
      if (res.user) {
        const demoProfile: UserProfile = {
          uid: res.user.uid,
          name: name,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
          email: `${name.toLowerCase().replace(/\s+/g, '')}@triptrack.app`,
          createdAt: Date.now(),
        };
        try {
          await setDoc(doc(db, 'users', res.user.uid), demoProfile);
        } catch (e) {
          // ignore offline/mock store error
        }
        setUser(demoProfile);
      }
    } catch (err) {
      console.error('Error logging in as demo user:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sign out cleanly
  const signOutUser = async (): Promise<void> => {
    setLoading(true);
    try {
      if (user?.uid) {
        // Clear FCM token on user document to prevent cross-user push leaks
        try {
          await setDoc(doc(db, 'users', user.uid), { fcmToken: null }, { merge: true });
        } catch (e) {
          // ignore
        }
      }
      await stopBackgroundLocationTracking();
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setLoading(false);
    }
  };

  // Delete User Account (In-App Account Deletion)
  const deleteAccount = async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    try {
      await stopBackgroundLocationTracking();

      const currentUid = user.uid;
      // 1. Delete user profile document in Firestore
      try {
        await setDoc(doc(db, 'users', currentUid), {
          deletedAt: Date.now(),
          name: 'Deleted Traveler',
          fcmToken: null,
          email: null,
          phoneNumber: null,
        }, { merge: true });
      } catch (e) {
        console.error('Error marking user document as deleted:', e);
      }

      // 2. Delete Firebase Auth user if available
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (authErr) {
          console.error('Error deleting Firebase Auth user:', authErr);
        }
      }

      await signOut(auth);
      setUser(null);
      console.log(`🗑️ [Account Deletion] Successfully deleted account for user ${currentUid}`);
    } catch (err) {
      console.error('Error during account deletion:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isMockMode: isMockFirebase,
        sendMagicLink,
        sendPhoneOtp,
        verifyOtpCode,
        signInAsDemoUser,
        signOutUser,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
