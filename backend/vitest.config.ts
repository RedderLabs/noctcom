import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// El build ESM de libsodium-wrappers-sumo importa ./libsodium-sumo.mjs de
// forma relativa; la resolución externalizada de Node falla en Linux/CI
// ("Cannot find module ...libsodium-sumo.mjs"). El build CJS es un único
// archivo autocontenido sin ese import. Apuntamos a él por ruta absoluta
// (una ruta de archivo evita el bloqueo del campo "exports" del paquete).
const libsodiumCjs = path.resolve(
  here,
  'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js',
);

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      'libsodium-wrappers-sumo': libsodiumCjs,
    },
  },
});
