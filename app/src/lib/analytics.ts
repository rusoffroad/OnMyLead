import { supabase } from './supabase';

/**
 * Feature-usage events, recorded from launch so pricing can follow what riders value.
 * Never include precise location in props.
 */
export async function track(name: string, props: Record<string, unknown> = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('events').insert({ user_id: data.user?.id ?? null, name, props });
  } catch {
    // Analytics must never break the ride.
  }
}
