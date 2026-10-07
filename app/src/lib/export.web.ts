import * as Clipboard from 'expo-clipboard';

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Browser: use the Web Share API when there is one, otherwise copy to the clipboard. */
export async function shareBuildSheet(title: string, text: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return null;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return null;
    }
  }
  await Clipboard.setStringAsync(text);
  return 'Build sheet copied. Paste it anywhere.';
}

/** Browser: download the CSV file. */
export async function shareCsv(fileBase: string, csv: string): Promise<string | null> {
  download(`${fileBase}.csv`, 'text/csv;charset=utf-8', csv);
  return 'CSV downloaded.';
}
