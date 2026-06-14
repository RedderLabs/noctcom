/* ==========================================================================
   Noctcom · self-host shared runtime  ->  window.NCT
   - .ico       : SVG icon dictionary (24x24, currentColor)
   - .toast(m)  : transient status toast (auto-injected element)
   - .share(n)  : zero-knowledge share modal (auto-injected)
   - auto-wires [data-ico], [data-act], [data-toast] and role="switch"
     via event delegation, so dynamically-rendered rows work too.
   ========================================================================== */
(function () {
  "use strict";

  /* --- helper: build an <svg> wrapper around inner paths --- */
  function svg(inner, opts) {
    opts = opts || {};
    var sw = opts.sw || 1.8;
    var fill = opts.fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor"';
    return '<svg viewBox="0 0 24 24" ' + fill + ' stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  /* ---- icon dictionary --------------------------------------------------- */
  var ico = {
    /* security / status */
    lock:    svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', { sw: 2 }),
    eye:     svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    shield:  svg('<path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
    key:     svg('<circle cx="7" cy="17" r="3"/><path d="M9.5 14.5 21 3"/><path d="M18 6l2 2"/><path d="M15 9l2 2"/>'),
    check:   svg('<path d="m5 12 5 5 9-11"/>', { sw: 2.2 }),
    refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),

    /* nav */
    panel:   svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    folder:  svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'),
    folderfill: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>', { fill: true }),
    storage: svg('<rect x="3" y="5" width="18" height="6" rx="2"/><rect x="3" y="13" width="18" height="6" rx="2"/><path d="M6.5 8h1"/><path d="M6.5 16h1"/>'),
    globe:   svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),

    /* file types */
    doc:     svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>', { sw: 1.7 }),
    archive: svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>', { sw: 1.7 }),
    img:     svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>', { sw: 1.7 }),
    db:      svg('<ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>', { sw: 1.7 }),
    vid:     svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>', { sw: 1.6 }),
    cfg:     svg('<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>', { sw: 1.7 }),

    /* disks */
    ssd:     svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M11 10v4"/><circle cx="16.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>'),
    nvme:    svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
    hdd:     svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="m14.3 14.3 2.2 2.2"/>'),

    /* devices */
    laptop:  svg('<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20"/>'),
    phone:   svg('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'),
    server:  svg('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M6.5 7.5h1M6.5 16.5h1"/>'),

    /* actions */
    copy:    svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    link:    svg('<path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 6 6l1-1"/>'),
    down:    svg('<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>'),
    up:      svg('<path d="M12 20V9m0 0 4 4m-4-4-4 4"/><path d="M5 5h14"/>'),
    share:   svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/>'),
    search:  svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    list:    svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', { sw: 2 }),
    grid:    svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    folderplus: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 11v6M9 14h6"/>'),
    back:    svg('<path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>'),
    dots:    svg('<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>', { sw: 2.2 }),

    /* media controls */
    play:    svg('<path d="M7 5v14l11-7Z"/>', { fill: true }),
    pause:   svg('<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>', { fill: true }),
    volume:  svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M16 9a3 3 0 0 1 0 6"/>'),
    expand:  svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    zin:     svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/>'),
    zout:    svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>'),
    chevL:   svg('<path d="m15 6-6 6 6 6"/>', { sw: 2 }),
    chevR:   svg('<path d="m9 6 6 6-6 6"/>', { sw: 2 })
  };

  /* ---- toast ------------------------------------------------------------- */
  var toastEl = null, toastMsgEl = null, toastTimer = null;
  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.innerHTML = ico.check + '<span class="toast-msg"></span>';
    document.body.appendChild(toastEl);
    toastMsgEl = toastEl.querySelector(".toast-msg");
  }
  function toast(msg) {
    ensureToast();
    toastMsgEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ---- clipboard (best-effort, never throws) ----------------------------- */
  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }
  function fakeLink() {
    function r(n) { var s = ""; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); }
    return "https://noctcom.homelab/s/" + r(8) + "#k=" + r(22);
  }

  /* ---- share modal (lazy) ------------------------------------------------ */
  var modal = null, modalName = null, lastFocus = null;
  function buildModal() {
    modal = document.createElement("div");
    modal.className = "nct-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "nctShareTitle");
    modal.innerHTML =
      '<div class="nct-modal-card">' +
        '<div class="nct-modal-head">' +
          '<div><h3 id="nctShareTitle">Compartir de forma cifrada</h3>' +
            '<div class="ch-sub" id="nctShareSub">archivo</div></div>' +
          '<button class="act nct-modal-x" type="button" aria-label="Cerrar">' +
            svg('<path d="M6 6 18 18M18 6 6 18"/>', { sw: 2 }) + '</button>' +
        '</div>' +
        '<div class="nct-modal-body">' +
          '<div class="nct-linkrow">' +
            '<input id="nctShareLink" type="text" readonly aria-label="Enlace cifrado" />' +
            '<button class="btn btn-primary btn-sm" type="button" id="nctShareCopy">' + ico.copy + '<span>Copiar</span></button>' +
          '</div>' +
          '<div class="nct-zk">' + ico.shield +
            '<p>La clave de descifrado viaja en el <b>fragmento (#)</b> del enlace y nunca llega al host. Quien tenga el enlace puede descifrar; compártelo por un canal seguro.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest(".nct-modal-x")) closeModal();
    });
    modal.querySelector("#nctShareCopy").addEventListener("click", function () {
      copy(modal.querySelector("#nctShareLink").value);
      toast("Enlace cifrado copiado");
    });
  }
  function share(name) {
    if (!modal) buildModal();
    modalName = name || "archivo";
    lastFocus = document.activeElement;
    modal.querySelector("#nctShareSub").textContent = modalName;
    modal.querySelector("#nctShareLink").value = fakeLink();
    modal.classList.add("show");
    var copyBtn = modal.querySelector("#nctShareCopy");
    if (copyBtn) copyBtn.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove("show");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---- switch toggle ----------------------------------------------------- */
  function toggleSwitch(sw) {
    var on = sw.getAttribute("aria-checked") === "true";
    sw.setAttribute("aria-checked", on ? "false" : "true");
    var label = sw.getAttribute("data-label");
    if (label) toast(label + (on ? ": desactivado" : ": activado"));
  }

  /* ---- data-act handlers ------------------------------------------------- */
  function handleAct(btn) {
    var act = btn.getAttribute("data-act");
    if (act === "copy") {
      var scope = btn.closest(".card, .keybox, .metalist, body");
      var src = scope && (scope.querySelector(".kb-fp") || scope.querySelector(".words"));
      var text = src ? src.textContent.replace(/\s+/g, " ").trim()
        : (btn.getAttribute("aria-label") || "copiado");
      copy(text);
      toast("Copiado");
    } else if (act === "link") {
      copy(fakeLink());
      toast("Enlace cifrado copiado");
    } else if (act === "down") {
      toast("Descifrando en tu dispositivo…");
    } else {
      toast("Menú de acciones");
    }
  }

  /* ---- inject [data-ico] into static markup ------------------------------ */
  function injectIcons(root) {
    (root || document).querySelectorAll("[data-ico]").forEach(function (el) {
      if (el.dataset.icoDone) return;
      var key = el.getAttribute("data-ico");
      if (ico[key]) { el.innerHTML = ico[key]; el.dataset.icoDone = "1"; }
    });
  }

  /* ---- delegated events -------------------------------------------------- */
  function onClick(e) {
    var act = e.target.closest("[data-act]");
    if (act) { e.preventDefault(); e.stopPropagation(); handleAct(act); return; }

    var sw = e.target.closest('[role="switch"]');
    if (sw) { e.preventDefault(); toggleSwitch(sw); return; }

    var t = e.target.closest("[data-toast]");
    if (t) {
      if (t.tagName === "A") e.preventDefault();
      toast(t.getAttribute("data-toast"));
    }
  }
  function onKeydown(e) {
    if (e.key === "Escape" && modal && modal.classList.contains("show")) { closeModal(); return; }
    if ((e.key === "Enter" || e.key === " " || e.key === "Spacebar")) {
      var sw = e.target.closest && e.target.closest('[role="switch"]');
      if (sw) { e.preventDefault(); toggleSwitch(sw); }
    }
  }

  function init() {
    injectIcons(document);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---- public API -------------------------------------------------------- */
  window.NCT = {
    ico: ico,
    toast: toast,
    share: share,
    injectIcons: injectIcons
  };
})();
