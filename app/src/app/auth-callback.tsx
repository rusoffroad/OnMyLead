import { Redirect } from 'expo-router';

/** Web OAuth lands here; the Supabase client reads the code from the URL on its own. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
