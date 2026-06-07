// Genera los iconos PWA desde logo.png (candado neón, elección del usuario).
// Uso: node scripts/generate-pwa-icons.mjs
// Salida en public/: icon-{72,192,512}.png, icon-maskable-{192,512}.png,
// apple-touch-icon.png (180).
//
// logo.png es 200×200 sin alpha y con fondo propio #0a0b0d: el lienzo usa ese
// MISMO color para que no se vea costura al componer. El maskable encoge el
// logo a la zona segura (~80% central) porque Android recorta con su máscara.
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const SRC = resolve(root, 'logo.png');
const BG = { r: 10, g: 11, b: 13, alpha: 1 }; // = esquinas de logo.png

async function make(file, size, contentScale) {
  const inner = Math.round(size * contentScale);
  const logo = await sharp(SRC).resize(inner, inner, { kernel: 'lanczos3' }).toBuffer();
  const off = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, left: off, top: off }])
    .png()
    .toFile(resolve(root, file));
  console.log('✓', file);
}

// Estándar e iOS: el logo casi a sangre (su propio círculo ya da el margen).
await make('icon-192.png', 192, 1);
await make('icon-512.png', 512, 1);
await make('apple-touch-icon.png', 180, 1);
// Badge FCM (lo referencia firebase-messaging-sw.js).
await make('icon-72.png', 72, 1);
// Maskable: contenido dentro de la zona segura.
await make('icon-maskable-192.png', 192, 0.78);
await make('icon-maskable-512.png', 512, 0.78);

// ── Splash screens de iOS (apple-touch-startup-image) ──────────────────────
// Wordmark (logo.svg) centrado sobre el fondo de marca. El SVG embebe un PNG
// de 190×84: no renderizar el wordmark a más de ~2× su tamaño nativo o sale
// borroso — en pantallas grandes queda proporcionalmente más pequeño, mejor
// eso que pixelado. Tamaños = puntos CSS × DPR de cada dispositivo (portrait).
const WORDMARK = resolve(root, 'logo.svg');
const SPLASHES = [
  { w: 750, h: 1334 }, // iPhone SE/8 @2x
  { w: 828, h: 1792 }, // iPhone XR/11 @2x
  { w: 1125, h: 2436 }, // iPhone X/XS/11 Pro/12-13 mini @3x
  { w: 1170, h: 2532 }, // iPhone 12/13/14 @3x
  { w: 1179, h: 2556 }, // iPhone 14-15 Pro @3x
  { w: 1242, h: 2688 }, // iPhone XS Max/11 Pro Max @3x
  { w: 1284, h: 2778 }, // iPhone 12-13 Pro Max/14 Plus @3x
  { w: 1290, h: 2796 }, // iPhone 14 Pro Max/15 Plus @3x
  { w: 1536, h: 2048 }, // iPad 9.7/10.2 @2x
  { w: 1668, h: 2388 }, // iPad Pro 11 @2x
  { w: 2048, h: 2732 }, // iPad Pro 12.9 @2x
];
for (const { w, h } of SPLASHES) {
  const lw = Math.min(Math.round(w * 0.45), 380); // tope: 2× el PNG embebido
  const mark = await sharp(WORDMARK).resize(lw, null, { kernel: 'lanczos3' }).toBuffer();
  const { height: lh } = await sharp(mark).metadata();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: mark, left: Math.round((w - lw) / 2), top: Math.round((h - lh) / 2) }])
    .png()
    .toFile(resolve(root, `splash-${w}x${h}.png`));
  console.log('✓', `splash-${w}x${h}.png`);
}
