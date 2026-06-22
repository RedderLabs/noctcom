// Genera las capturas del manifest (PWA) para el diálogo de instalación
// enriquecido de Android/desktop. Captura páginas REALES de la app (landing y
// login) servidas en local — sin mockups ni datos inventados.
//
// Uso:
//   1) npm run build && npm run start   (o node .next/standalone/server.js)
//   2) node scripts/generate-pwa-screenshots.mjs [http://localhost:3001]
//
// Requiere puppeteer-core + un Chromium/Edge instalado (usa Edge en Windows).

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/screenshots');
const BASE = process.argv[2] || 'http://localhost:3001';

// Localiza un navegador Chromium instalado (Edge o Chrome en Windows).
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH || '',
];
const executablePath = CANDIDATES.find((p) => p && existsSync(p));
if (!executablePath) {
  console.error('No se encontró Edge/Chrome. Define CHROME_PATH.');
  process.exit(1);
}

// Cada captura: tamaño en px CSS × deviceScaleFactor = dimensión real del PNG.
// narrow = móvil (lo que usa Android para el diálogo enriquecido), wide = escritorio.
const SHOTS = [
  { key: 'landing-mobile', path: '/',      w: 390, h: 844, dsr: 2, mobile: true,  formFactor: 'narrow' },
  { key: 'login-mobile',   path: '/login', w: 390, h: 844, dsr: 2, mobile: true,  formFactor: 'narrow' },
  { key: 'landing-wide',   path: '/',      w: 1280, h: 800, dsr: 1, mobile: false, formFactor: 'wide' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--hide-scrollbars', '--disable-gpu', '--no-sandbox'],
});

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const manifestEntries = [];
for (const s of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: s.w, height: s.h, deviceScaleFactor: s.dsr,
    isMobile: s.mobile, hasTouch: s.mobile,
  });
  // Primer goto al origen para poder fijar el consentimiento de cookies y que
  // el banner no aparezca en la captura.
  await page.goto(BASE + s.path, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('noctcom.cookies-accepted', '1'));
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500); // deja asentar fuentes/animaciones de entrada
  const file = resolve(OUT_DIR, `${s.key}.png`);
  await page.screenshot({ path: file, type: 'png' });
  await page.close();
  manifestEntries.push({
    src: `/screenshots/${s.key}.png`,
    sizes: `${s.w * s.dsr}x${s.h * s.dsr}`,
    type: 'image/png',
    form_factor: s.formFactor,
  });
  console.log(`✓ ${s.key}.png  (${s.w * s.dsr}x${s.h * s.dsr})`);
}

await browser.close();

console.log('\nEntradas para manifest.ts (campo screenshots):');
console.log(JSON.stringify(manifestEntries, null, 2));
