// Construye el Connector (agent/) y lo coloca como sidecar de Tauri con el
// sufijo del target triple que Tauri espera. Idempotente: si el binario ya
// existe se omite (usa --force para reconstruir). Lo invoca tauri.conf.json en
// beforeDevCommand / beforeBuildCommand, así un clon nuevo funciona sin pasos
// manuales. El binario NO se versiona (está en .gitignore).

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const repo = resolve(desktop, "..");
const agentDir = join(repo, "agent");

const force = process.argv.includes("--force");

const triple = execSync("rustc -vV", { encoding: "utf8" })
  .split("\n")
  .find((l) => l.startsWith("host:"))
  ?.split(" ")[1]
  ?.trim();
if (!triple) {
  console.error("build-sidecar: no se pudo determinar el target triple (¿rustc?).");
  process.exit(1);
}

const isWin = triple.includes("windows");
const ext = isWin ? ".exe" : "";
const srcBin = join(agentDir, "target", "release", `noctcom-connector${ext}`);
const binDir = join(desktop, "src-tauri", "binaries");
const destBin = join(binDir, `noctcom-connector-${triple}${ext}`);

if (existsSync(destBin) && !force) {
  console.log(`build-sidecar: sidecar ya presente (${destBin}). Usa --force para reconstruir.`);
  process.exit(0);
}

console.log("build-sidecar: compilando el Connector (cargo build --release)…");
execSync("cargo build --release", { cwd: agentDir, stdio: "inherit" });

mkdirSync(binDir, { recursive: true });
copyFileSync(srcBin, destBin);
console.log(`build-sidecar: sidecar listo → ${destBin}`);
