export interface UserProfile {
  uid: string;
  name: string;
  avatar?: string;
  email?: string | null;
  phoneNumber?: string | null;
  createdAt: number;
}

export type AuthMode = 'password' | 'magic_link' | 'sign_up';

export interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isMockMode: boolean;
  passwordRecovery: boolean;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string, displayName: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (password: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<boolean>;
  sendPhoneOtp: (phoneNumber: string) => Promise<string | boolean>; // returns confirmationId or success
  verifyOtpCode: (email: string, code: string) => Promise<boolean>;
  signInAsDemoUser: (name?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}
