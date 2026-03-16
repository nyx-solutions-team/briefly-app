import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const FALLBACK_SUPABASE_URL = 'https://placeholder.invalid';
const FALLBACK_SUPABASE_ANON_KEY = 'placeholder-anon-key';
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!hasSupabaseConfig) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export { hasSupabaseConfig };

export const supabase = createClient(
  hasSupabaseConfig ? SUPABASE_URL : FALLBACK_SUPABASE_URL,
  hasSupabaseConfig ? SUPABASE_ANON_KEY : FALLBACK_SUPABASE_ANON_KEY,
);
