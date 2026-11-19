// Import Waypoints (4.0): lets a rider send a GPX, KML or KMZ file to OnMyLead from another app.
//
// iOS: declares the file types (Info.plist CFBundleDocumentTypes + UTImportedTypeDeclarations), so
// OnMyLead shows in the share sheet and in Files' "Open With" for those files. iOS copies the file
// into the app's Inbox and hands it over as a file:// link.
//
// Android: opening a file (Files, Downloads, Gmail, Drive) is an ordinary VIEW intent; the filters
// for it are added here. Sharing one from another app's share sheet is a SEND intent, which carries
// the file in EXTRA_STREAM where React Native's Linking doesn't look. This plugin adds the SEND
// filter and a few lines in MainActivity that turn such an intent into a VIEW of the same file.
//
// Either way the link reaches src/app/+native-intent.ts, which opens Map Mode's Import Waypoints.
// Nothing here touches CarPlay or the scene set-up.
const { AndroidConfig, withAndroidManifest, withInfoPlist, withMainActivity } = require('expo/config-plugins');

const MARKER = '// onmylead: shared files';

const IOS_TYPES = [
  { id: 'com.topografix.gpx', name: 'GPX File', ext: ['gpx'], mime: ['application/gpx+xml'], conforms: ['public.xml'] },
  { id: 'com.google.earth.kml', name: 'KML File', ext: ['kml'], mime: ['application/vnd.google-earth.kml+xml'], conforms: ['public.xml'] },
  { id: 'com.google.earth.kmz', name: 'KMZ File', ext: ['kmz'], mime: ['application/vnd.google-earth.kmz'], conforms: ['public.data', 'public.archive'] },
  { id: 'public.geojson', name: 'GeoJSON File', ext: ['geojson'], mime: ['application/geo+json'], conforms: ['public.json'] },
];

/** What a shared file may call itself. Apps often send GPX as plain XML or as "some file". */
const SEND_TYPES = [
  'application/gpx+xml',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/geo+json',
  'application/xml',
  'text/xml',
  'application/octet-stream',
];

function withIosTypes(config) {
  return withInfoPlist(config, (c) => {
    const plist = c.modResults;
    const docs = (plist.CFBundleDocumentTypes ?? []).filter((d) => !IOS_TYPES.some((t) => d.LSItemContentTypes?.includes(t.id)));
    plist.CFBundleDocumentTypes = [
      ...docs,
      ...IOS_TYPES.map((t) => ({ CFBundleTypeName: t.name, CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate', LSItemContentTypes: [t.id] })),
    ];
    const imported = (plist.UTImportedTypeDeclarations ?? []).filter((d) => !IOS_TYPES.some((t) => d.UTTypeIdentifier === t.id));
    plist.UTImportedTypeDeclarations = [
      ...imported,
      ...IOS_TYPES.map((t) => ({
        UTTypeIdentifier: t.id,
        UTTypeDescription: t.name,
        UTTypeConformsTo: t.conforms,
        UTTypeTagSpecification: { 'public.filename-extension': t.ext, 'public.mime-type': t.mime },
      })),
    ];
    // iOS hands us our own copy of the file, so reading it needs no extra permission.
    plist.LSSupportsOpeningDocumentsInPlace = false;
    return c;
  });
}

const name = (n) => ({ $: { 'android:name': n } });
const VIEW_TYPES = SEND_TYPES.filter((t) => !/^(application\/xml|text\/xml|application\/octet-stream)$/.test(t));
// Files whose type the sending app didn't say: go by the name's ending. One pattern per ending
// (Android's patterns have no "or", and stop at the first dot, so names with dots need their own).
const BY_NAME = ['gpx', 'kml', 'kmz', 'geojson'].flatMap((ext) => [`.*\\.${ext}`, `.*\\..*\\.${ext}`]);

function withFileFilters(config) {
  return withAndroidManifest(config, (c) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const filters = (activity['intent-filter'] ??= []);
    const mine = (f) => f.data?.some((d) => /gpx/.test(d.$['android:mimeType'] ?? '') || /gpx/.test(d.$['android:pathPattern'] ?? ''));
    if (filters.some(mine)) return c;
    const tag = (f) => f;
    filters.push(
      // Shared from another app's share sheet.
      tag({ action: [name('android.intent.action.SEND')], category: [name('android.intent.category.DEFAULT')], data: SEND_TYPES.map((t) => ({ $: { 'android:mimeType': t } })) }),
      // Tapped in Files, Downloads, Gmail or Drive, by type...
      tag({
        action: [name('android.intent.action.VIEW')],
        category: [name('android.intent.category.DEFAULT'), name('android.intent.category.BROWSABLE')],
        data: [{ $: { 'android:scheme': 'content' } }, { $: { 'android:scheme': 'file' } }, ...VIEW_TYPES.map((t) => ({ $: { 'android:mimeType': t } }))],
      }),
      // ...or by name when the type is vague.
      tag({
        action: [name('android.intent.action.VIEW')],
        category: [name('android.intent.category.DEFAULT'), name('android.intent.category.BROWSABLE')],
        data: [
          { $: { 'android:scheme': 'content' } }, { $: { 'android:scheme': 'file' } }, { $: { 'android:host': '*' } }, { $: { 'android:mimeType': '*/*' } },
          ...BY_NAME.map((p) => ({ $: { 'android:pathPattern': p } })),
        ],
      }),
    );
    return c;
  });
}

/** Adds the SEND-to-VIEW lines to MainActivity.kt. Exported for tests. */
function addSharedFileHandling(src) {
  if (src.includes(MARKER)) return src;
  const superCreate = /\n([ \t]*)super\.onCreate\((null|savedInstanceState)\)/;
  if (!superCreate.test(src)) throw new Error('with-open-files: super.onCreate(...) not found in MainActivity.kt; the Expo template changed.');
  if (/override fun onNewIntent\(/.test(src)) throw new Error('with-open-files: MainActivity.kt already overrides onNewIntent; merge the shared-file lines by hand.');
  src = src.replace(superCreate, (_, pad, arg) => `\n${pad}sharedFileAsView(intent) ${MARKER}\n${pad}super.onCreate(${arg})`);
  const end = src.lastIndexOf('}');
  const block = `
  ${MARKER}: a file shared from another app (SEND) opens like one tapped in Files (VIEW).
  private fun sharedFileAsView(intent: android.content.Intent?) {
    if (intent == null || intent.action != android.content.Intent.ACTION_SEND || intent.data != null) return
    @Suppress("DEPRECATION")
    val uri = intent.getParcelableExtra<android.net.Uri>(android.content.Intent.EXTRA_STREAM) ?: return
    intent.action = android.content.Intent.ACTION_VIEW
    intent.data = uri
    intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }

  override fun onNewIntent(intent: android.content.Intent) {
    sharedFileAsView(intent)
    super.onNewIntent(intent)
  }
`;
  return src.slice(0, end) + block + src.slice(end);
}

function withSendAsView(config) {
  return withMainActivity(config, (c) => {
    if (c.modResults.language !== 'kt') throw new Error('with-open-files: expected a Kotlin MainActivity.');
    c.modResults.contents = addSharedFileHandling(c.modResults.contents);
    return c;
  });
}

module.exports = function withOpenFiles(config) {
  return withSendAsView(withFileFilters(withIosTypes(config)));
};
module.exports.addSharedFileHandling = addSharedFileHandling;
module.exports.IOS_TYPES = IOS_TYPES;
