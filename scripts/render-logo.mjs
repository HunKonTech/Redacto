// Renders the Redacto logo (docs/assets/redacto-logo.svg is the colour mark)
// into the extension icons, the web app icons and the README/store images.
// Usage: node scripts/render-logo.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PALETTES = {
  color: { from: '#14B8A6', to: '#4F46E5', bar: '#0B1220', line: '#FFFFFF' },
  inactive: { from: '#A5B4C8', to: '#7C8BA1', bar: '#334155', line: '#F1F5F9' },
  dark: { from: '#9CA3AF', to: '#6B7280', bar: '#1F2937', line: '#F9FAFB' },
};

// A rounded page with three text lines, parts of which are redacted (dark bars).
export function markSvg(palette = PALETTES.color, id = 'rd') {
  const p = palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.from}"/>
      <stop offset="1" stop-color="${p.to}"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#${id}-bg)"/>
  <rect x="24" y="30" width="30" height="14" rx="7" fill="${p.line}"/>
  <rect x="60" y="28" width="44" height="18" rx="5" fill="${p.bar}"/>
  <rect x="24" y="55" width="54" height="18" rx="5" fill="${p.bar}"/>
  <rect x="84" y="57" width="20" height="14" rx="7" fill="${p.line}"/>
  <rect x="24" y="84" width="44" height="14" rx="7" fill="${p.line}"/>
  <rect x="74" y="82" width="30" height="18" rx="5" fill="${p.bar}"/>
</svg>`;
}

// Single-colour mark for IDE toolbars and tool windows (24×24): the page outline,
// text lines as strokes and the redacted parts as solid bars.
export function glyphSvg(color = 'currentColor', size = 24) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-linecap="round">
  <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="4.5" stroke-width="1.5"/>
  <path d="M7.2 7.85h2.7M15.4 12h1.4M7.2 16.15h4.6" stroke-width="1.4"/>
  <g fill="${color}" stroke="none">
    <rect x="11.4" y="6.5" width="6.1" height="2.7" rx=".8"/>
    <rect x="6.5" y="10.65" width="7.4" height="2.7" rx=".8"/>
    <rect x="13.4" y="14.8" width="4.1" height="2.7" rx=".8"/>
  </g>
</svg>
`;
}

function fontFace() {
  const font = fs.readFileSync(path.join(root, 'src/assets/fonts/ibm-plex-sans-600.woff2')).toString('base64');
  return `@font-face{font-family:Plex;font-weight:600;src:url(data:font/woff2;base64,${font}) format('woff2');}`;
}

function wordmarkHtml(textColor, width, height, markSize, fontSize, tagline) {
  return `<html><head><style>${fontFace()}
  html,body{margin:0;background:transparent;}
  .wrap{width:${width}px;height:${height}px;display:flex;align-items:center;gap:${Math.round(markSize * 0.22)}px;
    font-family:Plex,sans-serif;font-weight:600;color:${textColor};box-sizing:border-box;padding:0 ${Math.round(markSize * 0.1)}px;}
  .mark svg{width:${markSize}px;height:${markSize}px;display:block;}
  .name{font-size:${fontSize}px;letter-spacing:-0.02em;line-height:1;}
  .tag{font-size:${Math.round(fontSize * 0.3)}px;font-weight:600;opacity:.75;margin-top:${Math.round(fontSize * 0.2)}px;letter-spacing:0;}
  </style></head><body><div class="wrap"><div class="mark">${markSvg()}</div>
  <div><div class="name">Redacto</div>${tagline ? `<div class="tag">${tagline}</div>` : ''}</div></div></body></html>`;
}

async function shot(page, html, width, height, out, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  console.log('wrote', path.relative(root, out));
}

const svgPage = (svg, size) =>
  `<html><body style="margin:0;background:transparent">${svg.replace('width="128" height="128"', `width="${size}" height="${size}"`)}</body></html>`;

// CHROMIUM_PATH lets the script use an installed Chromium instead of Playwright's download.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();

fs.writeFileSync(path.join(root, 'docs/assets/redacto-logo.svg'), markSvg() + '\n');

const icons = path.join(root, 'src/assets/icons');
for (const size of [16, 32, 48, 128]) {
  await shot(page, svgPage(markSvg(PALETTES.color), size), size, size, path.join(icons, `icon${size}.png`));
  await shot(page, svgPage(markSvg(PALETTES.color), size), size, size, path.join(icons, `active-${size}.png`));
  await shot(page, svgPage(markSvg(PALETTES.inactive), size), size, size, path.join(icons, `inactive-${size}.png`));
  await shot(page, svgPage(markSvg(PALETTES.dark), size), size, size, path.join(icons, `dark-${size}.png`));
}

// Web app (maskable): the mark centred inside the safe zone on the header colour.
const webSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Redacto mark (scripts/render-logo.mjs) on the header colour, inside the maskable safe zone. -->
  <rect width="512" height="512" fill="#0f172a"/>
  <g transform="translate(128 128) scale(2)">${markSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
</svg>
`;
fs.writeFileSync(path.join(root, 'src/web/icons/icon.svg'), webSvg);
for (const size of [192, 512]) {
  const html = `<html><body style="margin:0">${webSvg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`;
  await shot(page, html, size, size, path.join(root, `src/web/icons/icon-${size}.png`), false);
}

// IDE plugins: VS Code's activity bar tints the glyph itself; JetBrains wants a
// light- and a dark-theme file; Visual Studio menu commands take a 16×16 PNG.
fs.writeFileSync(path.join(root, 'ide/vscode/media/redacto.svg'), glyphSvg());
const jbIcons = path.join(root, 'ide/jetbrains/src/main/resources/icons');
fs.writeFileSync(path.join(jbIcons, 'redacto.svg'), glyphSvg('#6C707E', 16));
fs.writeFileSync(path.join(jbIcons, 'redacto_dark.svg'), glyphSvg('#CED0D6', 16));
await shot(
  page,
  svgPage(markSvg(PALETTES.color), 16),
  16,
  16,
  path.join(root, 'ide/visualstudio/PrivacyGuardrail.VisualStudio/Resources/Redacto.png'),
);

const assets = path.join(root, 'docs/assets');
await shot(page, wordmarkHtml('#0B1220', 640, 180, 150, 104), 640, 180, path.join(assets, 'redacto-logo-black.png'));
await shot(page, wordmarkHtml('#FFFFFF', 640, 180, 150, 104), 640, 180, path.join(assets, 'redacto-logo-white.png'));

const og = `<html><head><style>html,body{margin:0}</style></head><body style="width:1280px;height:640px;background:#0f172a;display:flex;align-items:center;justify-content:center">
  ${wordmarkHtml('#FFFFFF', 980, 320, 240, 150, 'Redact personal data before it reaches an AI chat').replace(/^<html><head>|<\/head><body>|<\/body><\/html>$/g, '')}
</body></html>`;
await shot(page, og, 1280, 640, path.join(assets, 'redacto-opengraph.png'), false);

await browser.close();
