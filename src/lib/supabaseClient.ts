import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Fetch wrapper that retries up to `maxRetries` times on network-level failures
 * (no internet, DNS timeout, etc.). HTTP error responses (4xx/5xx) are NOT retried.
 */
async function fetchWithRetry(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  const maxRetries = 3;
  const baseDelayMs = 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetch(...args);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        // Exponential back-off: 500ms → 1s → 2s
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)),
        );
      }
    }
  }
  throw lastErr;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithRetry,
  },
});
