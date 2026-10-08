// Adds the home-screen tags to the exported web app so "Add to Home Screen"
// opens it full screen with the OnMyLead icon. Run after `expo export`.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? 'dist/index.html';
const tags = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="theme-color" content="#020A14">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="OnMyLead">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
].join('');

const html = readFileSync(file, 'utf8');
if (html.includes('rel="manifest"')) process.exit(0);
if (!html.includes('</head>')) throw new Error(`${file} has no </head>`);
writeFileSync(file, html.replace('</head>', `${tags}</head>`));
console.log(`Added home-screen tags to ${file}`);
