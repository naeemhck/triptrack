export interface UserProfile {
  uid: string;
  name: string;
  avatar?: string;
  fcmToken?: string;
  email?: string | null;
  phoneNumber?: string | null;
  createdAt: number;
}

export type AuthMode = 'email' | 'phone' | 'demo';

export interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isMockMode: boolean;
  sendMagicLink: (email: string) => Promise<boolean>;
  sendPhoneOtp: (phoneNumber: string) => Promise<string | boolean>; // returns confirmationId or success
  verifyOtpCode: (verificationId: string, code: string) => Promise<boolean>;
  signInAsDemoUser: (name?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}
