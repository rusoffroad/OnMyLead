import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { ImportDone } from '@/components/import-waypoints';
import { useFlag } from '@/lib/app-settings';
import { showNotice } from '@/lib/confirm';
import { t as tr } from '@/lib/i18n';
import { requirePro } from '@/lib/pro';
import { pickWaypointFile, readWaypointFile, type WaypointFile } from '@/lib/waypoint-import';

/**
 * Import Waypoints on a map screen: the file the rider has open in the sheet, and the import they
 * just made (for the Imported bar and Undo). Pro, like adding a waypoint by hand; off when the
 * owner switches the feature off (Admin > Features).
 *
 * `incoming` is a file handed to the app from outside (the share sheet, Files, Mail): it opens once.
 * `drop` lets the website take a file dropped anywhere on the page.
 */
export function useWaypointImport({ incoming, onIncomingTaken, drop = false }: { incoming?: string | null; onIncomingTaken?: () => void; drop?: boolean } = {}) {
  const offered = useFlag('waypoint_import');
  const [file, setFile] = useState<WaypointFile | null>(null);
  const [done, setDone] = useState<ImportDone | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (read: () => Promise<WaypointFile | null>) => {
    if (!requirePro('waypoints')) return;
    setBusy(true);
    try {
      const f = await read();
      if (f) {
        setDone(null);
        setFile(f);
      }
    } catch (e) {
      showNotice(tr('Couldn’t Import That File'), e instanceof Error ? tr(e.message) : tr('That file could not be read. Export it again and try once more.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = useCallback(() => open(pickWaypointFile), [open]);

  useEffect(() => {
    if (!incoming || !offered) return;
    onIncomingTaken?.();
    // After this render, so the screen is up before the sheet opens.
    void Promise.resolve().then(() => open(() => readWaypointFile({ uri: incoming })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, offered]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !drop || !offered) return;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => {
      if (hasFile(e)) e.preventDefault();
    };
    const dropped = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      void open(() => readWaypointFile({ uri: '', name: f.name, file: f }));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', dropped);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', dropped);
    };
  }, [drop, offered, open]);

  return { offered, file, done, busy, pick, close: () => setFile(null), setDone };
}
