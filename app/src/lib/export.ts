import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

/** Share the plain-text build sheet through the system share sheet. Returns a short status for the UI. */
export async function shareBuildSheet(title: string, text: string): Promise<string | null> {
  await Share.share({ title, message: text });
  return null;
}

/** Write the CSV to the cache and open the share sheet so it can go to Files, email or a spreadsheet app. */
export async function shareCsv(fileBase: string, csv: string): Promise<string | null> {
  if (!(await Sharing.isAvailableAsync())) {
    await Share.share({ message: csv });
    return null;
  }
  const file = new File(Paths.cache, `${fileBase}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export build list' });
  return null;
}
