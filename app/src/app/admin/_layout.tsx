import Head from '@/components/page-head';
import { Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';

import { AdminDialogs, AdminGate, AdminShell } from '@/components/admin';
import { signOut, useSession } from '@/lib/session';

/**
 * onmylead.com/admin: the owner-only Admin Dashboard. Web only; on the phone these routes send
 * you home, and nothing in the rider app links here. The gate asks for sign-in, checks Admin
 * and the authenticator code; the server checks both again on every call.
 */
export default function AdminLayout() {
  const { session, loading } = useSession();
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <>
      <Head>
        <title>OnMyLead Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminGate session={session} loading={loading}>
        <AdminDialogs>
          <AdminShell email={session?.user.email ?? null} onSignOut={() => signOut()}>
            <Slot />
          </AdminShell>
        </AdminDialogs>
      </AdminGate>
    </>
  );
}
