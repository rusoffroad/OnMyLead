import { supabase } from './supabase';

/** Rows per request: the server's own cap (PostgREST max-rows) is 1000. */
const PAGE = 1000;

/**
 * Every row of a list the rider reads in full (their own backups), page by page, so a long list is
 * never quietly cut at the server's row cap. `key` orders the pages so none is skipped or repeated.
 */
export async function selectAll(table: string, columns: string, key: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order(key).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
