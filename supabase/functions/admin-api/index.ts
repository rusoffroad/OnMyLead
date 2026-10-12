// Admin Dashboard actions that need Supabase's Auth admin API, which only the service role can
// call: suspending and reactivating accounts (an Auth ban, so the account can't sign in or
// refresh its session) and deleting an account (for deletion requests, Apple guideline 5.1.1(v)).
//
// The caller must be a dashboard admin signed in with an authenticator code: the function asks
// the database with the caller's own token (admin_session(), migration 20261018300000), so the
// same rule as every admin_* RPC applies. Admin accounts and the caller's own account can't be
// suspended or deleted from here. Every action is written to admin_audit_log.
//
// Body: {"action":"suspend","user_id":"...","reason":"..."}
//       {"action":"reactivate","user_id":"..."}
//       {"action":"delete_user","user_id":"...","reason":"..."}
//
// Deploy:  supabase functions deploy admin-api   (JWT verification stays on)
// Secrets: ADMIN_ORIGINS   optional, comma-separated extra origins allowed to call it (default https://onmylead.com)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const ORIGINS = new Set(['https://onmylead.com', 'https://www.onmylead.com', ...env('ADMIN_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// About 100 years: Auth has no "forever", and reactivating sets it back to none.
const BAN = '876000h';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://onmylead.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await caller.auth.getUser();
  const { data: session, error: sessionError } = await caller.rpc('admin_session');
  if (!who?.user || sessionError || !session?.is_admin) return reply({ error: 'admin only' }, 403);
  if (session.aal !== 'aal2') return reply({ error: 'admin needs two-factor sign-in' }, 403);
  const actorId = who.user.id;

  // deno-lint-ignore no-explicit-any
  const input: any = await req.json().catch(() => ({}));
  const action = String(input?.action ?? '');
  const userId = String(input?.user_id ?? '');
  const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 500) : null;
  if (!['suspend', 'reactivate', 'delete_user'].includes(action)) return reply({ error: 'unknown action' }, 400);
  if (!UUID.test(userId)) return reply({ error: 'user_id required' }, 400);
  if (userId === actorId) return reply({ error: "You can't do this to your own account." }, 400);

  const { data: target } = await service.auth.admin.getUserById(userId);
  if (!target?.user) return reply({ error: 'user not found' }, 404);
  const { data: isAdmin } = await service.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (isAdmin && action !== 'reactivate') return reply({ error: 'Admin accounts must be changed in the database, not from the dashboard.' }, 400);
  if ((action === 'suspend' || action === 'delete_user') && (!reason || reason.length < 3)) return reply({ error: 'a reason is required' }, 400);

  const { data: profile } = await service.from('profiles').select('display_name, created_at').eq('id', userId).maybeSingle();
  const before = {
    display_name: profile?.display_name ?? null,
    email: target.user.email ?? null,
    created_at: profile?.created_at ?? target.user.created_at,
    banned_until: (target.user as { banned_until?: string }).banned_until ?? null,
  };

  let after: Record<string, unknown>;
  if (action === 'suspend' || action === 'reactivate') {
    const { data, error } = await service.auth.admin.updateUserById(userId, { ban_duration: action === 'suspend' ? BAN : 'none' });
    if (error) return reply({ error: error.message }, 500);
    after = { banned_until: (data.user as { banned_until?: string } | null)?.banned_until ?? null, reason };
  } else {
    const { data: request } = await service.from('account_deletion_requests').select('requested_at, reason').eq('user_id', userId).maybeSingle();
    // Log first: the profile, its rides and the deletion request go with the account.
    const logged = await log(actorId, 'user.delete', userId, before, { reason, request: request ?? null });
    if (logged) return reply({ error: logged }, 500);
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) {
      await log(actorId, 'user.delete_failed', userId, null, { error: error.message });
      return reply({ error: error.message }, 500);
    }
    return reply({ ok: true });
  }

  const logged = await log(actorId, action === 'suspend' ? 'user.suspend' : 'user.reactivate', userId, before, after);
  if (logged) return reply({ error: logged }, 500);
  return reply({ ok: true, ...after });
});

async function log(actorId: string, action: string, userId: string, before: unknown, after: unknown): Promise<string | null> {
  const { error } = await service.from('admin_audit_log').insert({
    actor_id: actorId, action, target_type: 'user', target_id: userId, before, after,
  });
  return error ? error.message : null;
}
