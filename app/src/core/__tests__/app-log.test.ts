import { describe, expect, it } from 'vitest';

import { addEntry, formatLog, requestLine, scrub, type LogEntry } from '../app-log';

describe('app log', () => {
  it('keeps the newest entries and counts repeats', () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < 5; i++) log = addEntry(log, { at: i, kind: 'screen', text: `/s${i}` }, 3);
    expect(log.map((e) => e.text)).toEqual(['/s2', '/s3', '/s4']);
    log = addEntry(log, { at: 9, kind: 'error', text: 'boom' });
    log = addEntry(log, { at: 10, kind: 'error', text: 'boom' });
    log = addEntry(log, { at: 11, kind: 'error', text: 'boom' });
    expect(log[log.length - 1]).toEqual({ at: 11, kind: 'error', text: 'boom (x3)' });
  });

  it('never keeps locations, emails, tokens or query strings', () => {
    const s = scrub('at 38.57330, -109.54980 for ben@example.com https://x.supabase.co/rest/v1/positions?lat=38.5&lng=-109.5 '
      + 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij phone 4155550123');
    expect(s).not.toMatch(/38\.57|109\.54|ben@|lat=|eyJ|4155550123/);
    expect(s).toContain('[place]');
    expect(s).toContain('https://x.supabase.co/rest/v1/positions');
  });

  it('writes failed requests without their query', () => {
    expect(requestLine('get', 'https://x.supabase.co/rest/v1/rides?select=*', 500)).toBe('GET x.supabase.co/rest/v1/rides failed 500');
    expect(requestLine('post', 'not a url?x=1', 'Network request failed')).toBe('POST not a url failed: Network request failed');
  });

  it('formats one line per entry in UTC', () => {
    expect(formatLog([{ at: Date.UTC(2026, 9, 15, 20, 14, 3, 120), kind: 'screen', text: '/ride/[id]' }])).toBe('20:14:03.120  screen   /ride/[id]');
  });
});
