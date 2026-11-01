// Files a rider uploaded that live in Storage rather than the database, so deleting the account
// (which cascades through the database) doesn't remove them by itself. Best effort: a failure here
// never blocks or undoes an account deletion; the files sit at unguessable paths either way.
//
// Each bucket keeps a rider's files in a folder named after their user id.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKETS = ['rider-avatars'];

export async function removeRiderFiles(service: SupabaseClient, userId: string): Promise<void> {
  for (const bucket of BUCKETS) {
    try {
      const store = service.storage.from(bucket);
      const { data } = await store.list(userId, { limit: 1000 });
      const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
      if (paths.length) await store.remove(paths);
    } catch {
      // Bucket not created yet (server before the profile photo migration), or Storage is down.
    }
  }
}
