// Deletes the signed-in rider's own account straight away, from Profile > Delete Account
// (Apple guideline 5.1.1(v): deletion must happen in the app, not by request). Deleting the Auth
// user cascades to the profile, rides they organize, Garage, trips, groups and location history.
// Admin accounts can't delete themselves here; they are removed in the database.
//
// The audit log keeps only that an account deleted itself, never its email or name.
//
// Deploy:  supabase functions deploy delete-account   (JWT verification stays on)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const headers = {
  'Access-Control-Allow-Origin': 'https://onmylead.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  });
  const { data: who } = await caller.auth.getUser();
  const userId = who?.user?.id;
  if (!userId) return reply({ error: 'sign in first' }, 401);

  const { data: isAdmin } = await service.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (isAdmin) return reply({ error: 'Admin accounts are removed by the owner, not from the app.' }, 400);

  const { error: logError } = await service.from('admin_audit_log').insert({
    actor_id: userId, action: 'user.self_delete', target_type: 'user', target_id: userId, before: null, after: null,
  });
  if (logError) return reply({ error: logError.message }, 500);

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    await service.from('admin_audit_log').insert({
      actor_id: userId, action: 'user.self_delete_failed', target_type: 'user', target_id: userId, after: { error: error.message },
    });
    return reply({ error: error.message }, 500);
  }
  return reply({ ok: true });
});
