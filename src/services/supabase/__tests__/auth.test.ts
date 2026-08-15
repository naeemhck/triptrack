import { supabase } from '../../../config/supabase';
import {
  handleSupabaseAuthCallback,
  loadProfile,
  requestPasswordReset,
  sendEmailOtp,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword,
  verifyEmailOtp,
} from '../auth';

jest.mock('../../../config/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      setSession: jest.fn(),
      signInWithOtp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn(),
      updateUser: jest.fn(),
      verifyOtp: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const client = supabase as any;

describe('Supabase auth service boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(client.auth).forEach((method: any) => method.mockResolvedValue({ error: null }));
  });

  it('normalizes credentials before password sign-in', async () => {
    await signInWithPassword(' traveler@example.com ', 'password');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'traveler@example.com',
      password: 'password',
    });
    await expect(signInWithPassword('invalid', '')).rejects.toBeTruthy();
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('preserves secure Magic Link and password-reset redirects', async () => {
    await sendEmailOtp('traveler@example.com');
    await requestPasswordReset('traveler@example.com');
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'traveler@example.com',
      options: { emailRedirectTo: 'triptrack://auth/callback', shouldCreateUser: false },
    });
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('traveler@example.com', {
      redirectTo: 'triptrack://auth/reset-password',
    });
  });

  it('normalizes signup metadata and reports confirmation requirements', async () => {
    client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(
      signUpWithPassword(' traveler@example.com ', 'password1', ' Traveler '),
    ).resolves.toBe(true);
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'traveler@example.com',
        options: expect.objectContaining({ data: { display_name: 'Traveler' } }),
      }),
    );
  });

  it('handles PKCE and token callbacks only on canonical native routes', async () => {
    await expect(
      handleSupabaseAuthCallback('triptrack://auth/callback?code=pkce-code'),
    ).resolves.toBe('signin');
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');

    await expect(
      handleSupabaseAuthCallback(
        'triptrack://auth/reset-password#access_token=access&refresh_token=refresh&type=recovery',
      ),
    ).resolves.toBe('recovery');
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    await expect(handleSupabaseAuthCallback('https://example.com/callback')).resolves.toBeNull();
  });

  it('rejects callback errors without logging tokens', async () => {
    await expect(
      handleSupabaseAuthCallback('triptrack://auth/callback?error=access_denied'),
    ).rejects.toThrow('invalid or has expired');
  });

  it('validates password updates and OTP email input', async () => {
    await updatePassword('password1');
    await verifyEmailOtp(' traveler@example.com ', '123456');
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'password1' });
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'traveler@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('loads a public profile and signs out', async () => {
    client.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'user-1',
              display_name: 'Traveler',
              avatar_url: null,
              created_at: '2026-08-15T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });
    await expect(loadProfile('user-1', 'traveler@example.com')).resolves.toMatchObject({
      uid: 'user-1',
      name: 'Traveler',
    });
    await signOut();
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
