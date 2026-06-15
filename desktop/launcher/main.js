"use strict";

// Puente a Tauri (withGlobalTauri). Si se abre fuera de Tauri (preview en
// navegador), invoke queda como no-op para que la UI siga siendo navegable.
const invoke = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
  ? window.__TAURI__.core.invoke
  : async () => { throw new Error("Tauri no disponible (preview)"); };
const inTauri = !!(window.__TAURI__ && window.__TAURI__.core);

const STORE_KEY = "noctcom.instances";
const SEL_KEY = "noctcom.selected";

const ICONS = {
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18H7Z"/></svg>',
  lan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>',
  selfhost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
};
const ICO_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>';
const ICO_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';

const TAG = { cloud: "gestionado", lan: "LAN", selfhost: "self-host" };

let instances = [];
let selectedId = null;
let editingId = null;
const status = {};

const $ = (id) => document.getElementById(id);
const listEl = $("list");
const formEl = $("form");
const connectBtn = $("connect");

function load() {
  try { instances = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { instances = []; }
  selectedId = localStorage.getItem(SEL_KEY);
  if (!instances.find((i) => i.id === selectedId)) selectedId = instances[0]?.id ?? null;
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(instances));
  if (selectedId) localStorage.setItem(SEL_KEY, selectedId); else localStorage.removeItem(SEL_KEY);
}

function normalizeUrl(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "");
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { new URL(u); return u; } catch { return null; }
}

function deriveType(url) {
  try {
    const h = new URL(url).hostname;
    if (/(^|\.)noctcom\.com$/i.test(h)) return "cloud";
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return "lan";
    return "selfhost";
  } catch { return "selfhost"; }
}

function statusLabel(id) {
  const s = status[id];
  if (!s) return { cls: "wait", txt: "comprobando…" };
  if (s.reachable) return { cls: "ok", txt: "en línea" };
  return { cls: "bad", txt: "no alcanzable" };
}

function render() {
  listEl.innerHTML = "";
  if (instances.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "Aún no hay instancias. Añade la URL de tu Noctcom (cloud, servidor o LAN).";
    listEl.appendChild(e);
  }
  for (const inst of instances) {
    const on = inst.id === selectedId;
    const sl = statusLabel(inst.id);
    const el = document.createElement("div");
    el.className = "item" + (on ? " on" : "");
    el.innerHTML =
      '<span class="item-ico">' + (ICONS[inst.type] || ICONS.selfhost) + "</span>" +
      '<div class="item-main">' +
        '<div class="item-name">' + escapeHtml(inst.name) +
          '<span class="tag">' + TAG[inst.type] + "</span></div>" +
        '<div class="item-url"><span class="mono">' + escapeHtml(inst.url) + "</span>" +
          '<span class="st"><span class="dot ' + sl.cls + '"></span>' + sl.txt + "</span></div>" +
      "</div>" +
      '<div class="item-actions">' +
        '<button class="icon-btn" data-act="edit" aria-label="Editar">' + ICO_EDIT + "</button>" +
        '<button class="icon-btn" data-act="del" aria-label="Eliminar">' + ICO_DEL + "</button>" +
      "</div>" +
      '<span class="radio"></span>';

    el.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (btn) {
        ev.stopPropagation();
        if (btn.dataset.act === "edit") showForm(inst.id);
        else removeInstance(inst.id);
        return;
      }
      selectedId = inst.id; save(); render(); cpSyncSelection();
    });
    listEl.appendChild(el);
  }
  connectBtn.disabled = !selectedId;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function pingAll() {
  await Promise.all(instances.map(async (inst) => {
    try { status[inst.id] = await invoke("ping_instance", { url: inst.url }); }
    catch { status[inst.id] = { reachable: false, status: 0 }; }
    render();
  }));
}

function showForm(id) {
  editingId = id || null;
  const inst = id ? instances.find((i) => i.id === id) : null;
  $("f-name").value = inst ? inst.name : "";
  $("f-url").value = inst ? inst.url : "";
  $("f-error").textContent = "";
  formEl.hidden = false;
  $("add-toggle").hidden = true;
  $("f-name").focus();
}

function hideForm() {
  formEl.hidden = true;
  $("add-toggle").hidden = false;
  editingId = null;
}

function submitForm(ev) {
  ev.preventDefault();
  const name = $("f-name").value.trim();
  const url = normalizeUrl($("f-url").value);
  if (!url) { $("f-error").textContent = "URL no válida. Ej: https://192.168.8.244"; return; }
  const type = deriveType(url);
  if (editingId) {
    const i = instances.find((x) => x.id === editingId);
    if (i) { i.name = name || i.name; i.url = url; i.type = type; }
  } else {
    const id = "ins_" + Math.random().toString(36).slice(2, 10);
    instances.push({ id, name: name || new URL(url).hostname, url, type });
    selectedId = id;
  }
  save();
  hideForm();
  render();
  pingAll();
}

function removeInstance(id) {
  instances = instances.filter((i) => i.id !== id);
  if (selectedId === id) selectedId = instances[0]?.id ?? null;
  delete status[id];
  save();
  render();
}

async function connect() {
  const inst = instances.find((i) => i.id === selectedId);
  if (!inst) return;
  connectBtn.disabled = true;
  connectBtn.textContent = "Conectando…";
  try {
    await invoke("open_instance", { url: inst.url, name: inst.name });
  } catch (e) {
    $("f-error").textContent = inTauri ? ("No se pudo abrir: " + e) : "Disponible solo dentro de la app.";
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "Desbloquear y conectar";
  }
}

// ── Connector (sidecar): emparejar / iniciar / detener ──
const cpState = { paired: false, server: null, running: false, busy: false };

function selectedInstance() { return instances.find((i) => i.id === selectedId) || null; }

async function cpRefresh() {
  if (!inTauri) { cpRender("La gestión de discos solo está disponible dentro de la app."); return; }
  try {
    const st = await invoke("connector_status");
    const out = st.output || "";
    cpState.paired = /agentId:/.test(out);
    const m = out.match(/(?:servidor|server):\s*(\S+)/);
    cpState.server = m ? m[1] : null;
    cpState.running = await invoke("connector_running");
  } catch (e) {
    cpRender("No se pudo consultar el Connector: " + e);
    return;
  }
  cpRender();
}

function cpRender(errorMsg) {
  const badge = $("cp-badge");
  const body = $("cp-body");
  if (errorMsg) {
    badge.className = "cp-badge"; badge.textContent = "—";
    body.innerHTML = '<p class="cp-msg">' + escapeHtml(errorMsg) + "</p>";
    return;
  }
  const inst = selectedInstance();
  if (cpState.running) { badge.className = "cp-badge on"; badge.textContent = "en marcha"; }
  else if (cpState.paired) { badge.className = "cp-badge paired"; badge.textContent = "emparejado"; }
  else { badge.className = "cp-badge"; badge.textContent = "sin emparejar"; }

  let html = "";
  if (!cpState.paired) {
    html += '<p class="cp-msg">Consigue un <b>código</b> en la web de la instancia → <b>Ajustes → Connector</b>, y pégalo aquí para dar a esta instancia acceso a los discos de este equipo.</p>';
    html += '<div class="cp-row"><input id="cp-code" type="text" placeholder="código de emparejamiento" autocomplete="off" />' +
            '<button id="cp-pair" class="btn" type="button"' + (inst ? "" : " disabled") + ">Emparejar</button></div>";
    if (!inst) html += '<p class="cp-out">Selecciona primero una instancia arriba.</p>';
  } else {
    html += '<p class="cp-msg">Emparejado con <b>' + escapeHtml(cpState.server || "—") + "</b>." +
            (cpState.running
              ? " Activo: sus discos aparecen en la instancia (Ajustes → Almacenamiento)."
              : " Inícialo para que la instancia vea los discos de este equipo.") + "</p>";
    html += '<div class="cp-row">' +
            (cpState.running
              ? '<button id="cp-stop" class="btn" type="button">Detener</button>'
              : '<button id="cp-start" class="btn primary" type="button">Iniciar</button>') +
            '<button id="cp-repair" class="btn ghost" type="button">Re-emparejar</button></div>';
  }
  html += '<p id="cp-out" class="cp-out"></p>';
  body.innerHTML = html;

  const pairBtn = $("cp-pair");
  if (pairBtn) pairBtn.addEventListener("click", cpPair);
  const startBtn = $("cp-start");
  if (startBtn) startBtn.addEventListener("click", cpStart);
  const stopBtn = $("cp-stop");
  if (stopBtn) stopBtn.addEventListener("click", cpStop);
  const repairBtn = $("cp-repair");
  if (repairBtn) repairBtn.addEventListener("click", () => { cpState.paired = false; cpRender(); });
}

function cpSyncSelection() {
  const pairBtn = document.getElementById("cp-pair");
  if (pairBtn) pairBtn.disabled = !selectedInstance();
}

function cpOut(msg, isErr) {
  const el = $("cp-out");
  if (el) { el.textContent = msg; el.className = "cp-out" + (isErr ? " err" : ""); }
}

async function cpPair() {
  const inst = selectedInstance();
  const code = ($("cp-code").value || "").trim();
  if (!inst || !code) { cpOut("Introduce el código.", true); return; }
  cpOut("Emparejando…");
  try {
    const r = await invoke("connector_pair", { server: inst.url, code });
    if (r.ok) { await cpRefresh(); cpOut("✓ Emparejado."); }
    else cpOut(r.output || "El emparejamiento falló.", true);
  } catch (e) { cpOut("Error: " + e, true); }
}

async function cpStart() {
  const server = cpState.server || (selectedInstance() && selectedInstance().url);
  if (!server) { cpOut("Sin servidor emparejado.", true); return; }
  cpOut("Iniciando…");
  try { await invoke("connector_start", { server }); await cpRefresh(); }
  catch (e) { cpOut("Error: " + e, true); }
}

async function cpStop() {
  cpOut("Deteniendo…");
  try { await invoke("connector_stop"); await cpRefresh(); }
  catch (e) { cpOut("Error: " + e, true); }
}

$("add-toggle").addEventListener("click", () => showForm());
$("f-cancel").addEventListener("click", hideForm);
formEl.addEventListener("submit", submitForm);
connectBtn.addEventListener("click", connect);

load();
render();
if (inTauri) { pingAll(); cpRefresh(); }
else cpRender("La gestión de discos solo está disponible dentro de la app.");
