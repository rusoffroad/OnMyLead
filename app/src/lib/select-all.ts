import { supabase } from './supabase';

/** Rows per request: the server's own cap (PostgREST max-rows) is 1000. */
const PAGE = 1000;

/**
 * Every row of a list the rider reads in full (their own backups), page by page, so a long list is
 * never quietly cut at the server's row cap. Each page starts after the last `key` already read, so
 * a row added or removed between pages can't shift a row out of the list or repeat one.
 */
export async function selectAll(table: string, columns: string, key: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let last: unknown = undefined;
  for (;;) {
    let q = supabase.from(table).select(columns).order(key).limit(PAGE);
    if (last !== undefined) q = q.gt(key, last as string);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    // A short page is the last one (PAGE is the server's own cap).
    if (rows.length < PAGE) return out;
    last = rows[rows.length - 1][key];
    if (last === undefined || last === null) throw new Error(`selectAll: ${key} must be one of the columns`);
  }
}
