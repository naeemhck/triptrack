import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

function requirePublicEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[TripTrack Supabase] Missing ${name}. Check the local .env file and restart Expo.`,
    );
  }

  return value.trim();
}

const supabaseUrl = requirePublicEnv(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);
const supabasePublishableKey = requirePublicEnv(
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
