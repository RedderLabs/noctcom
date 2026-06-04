'use client';

/**
 * Demo "tipo vídeo" de la prueba de seguridad zero-knowledge, embebida en la
 * landing. Sin archivo de vídeo: es una línea de tiempo (~84 s) que anima
 * escenas HTML — pesa unos KB y se ve nítida a cualquier resolución.
 *
 * Responsive: el escenario interno es 1920×1080 y se escala al ancho del
 * contenedor (como un vídeo 1080p). Autoplay al entrar en viewport, pausa al
 * salir. Controles: play/pausa, reiniciar y barra de progreso con seek.
 *
 * El motor es imperativo a propósito (refs + RAF, cero estado React): React
 * pinta una vez y la línea de tiempo muta el DOM, así el scrub es barato.
 * Versión standalone para grabar a MP4: marketing/demo-seguridad-zk.html.
 */

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

const T_TOTAL = 84000;

export function SecurityDemo() {
  const t = useTranslations('securityDemo');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stage = root.querySelector<HTMLElement>('.zk-stage')!;
    const wrap = root.querySelector<HTMLElement>('.zk-frame')!;
    const scenes = [...root.querySelectorAll<HTMLElement>('.zk-scene')].map((el) => ({
      el, from: +el.dataset.from!, to: +el.dataset.to!,
    }));
    const items = [...root.querySelectorAll<HTMLElement>('[data-at]')].map((el) => ({
      el, at: +el.dataset.at!, out: el.dataset.out ? +el.dataset.out : null,
    }));
    const typed = [...root.querySelectorAll<HTMLElement>('[data-type]')].map((el) => {
      // Guardar el texto original una sola vez (StrictMode monta dos veces en dev)
      if (el.dataset.full === undefined) el.dataset.full = el.textContent ?? '';
      el.textContent = '';
      return { el, full: el.dataset.full, at: +el.dataset.at!, cps: +(el.dataset.cps || 28) };
    });

    const fill = root.querySelector<HTMLElement>('.zk-fill')!;
    const timeEl = root.querySelector<HTMLElement>('.zk-time')!;
    const btnPlay = root.querySelector<HTMLElement>('.zk-play')!;
    const btnRestart = root.querySelector<HTMLElement>('.zk-restart')!;
    const bar = root.querySelector<HTMLElement>('.zk-bar')!;

    // ─── Escala 1920×1080 → ancho del contenedor ───
    const ro = new ResizeObserver(() => {
      stage.style.transform = `scale(${wrap.clientWidth / 1920})`;
    });
    ro.observe(wrap);

    // ─── Reloj ───
    let t = 0, playing = false, last = performance.now(), raf = 0, ended = false;

    const fmt = (ms: number) => {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    function render() {
      for (const sc of scenes) sc.el.classList.toggle('zk-active', t >= sc.from && t < sc.to);
      for (const it of items) {
        it.el.classList.toggle('zk-on', t >= it.at);
        if (it.out !== null) it.el.classList.toggle('zk-off', t >= it.out);
      }
      for (const ty of typed) {
        const n = t < ty.at ? 0 : Math.floor((t - ty.at) / 1000 * ty.cps);
        const shown = ty.full.slice(0, Math.min(n, ty.full.length));
        if (ty.el.textContent !== shown) ty.el.textContent = shown;
        ty.el.classList.toggle('zk-caret', n > 0 && n < ty.full.length);
      }
      fill.style.width = `${(t / T_TOTAL) * 100}%`;
      timeEl.textContent = `${fmt(t)} / ${fmt(T_TOTAL)}`;
    }

    function setPlaying(p: boolean) {
      playing = p;
      btnPlay.textContent = p ? '⏸' : '▶';
      root!.classList.toggle('zk-paused', !p);
    }

    function tick(now: number) {
      if (playing) {
        t = Math.min(T_TOTAL, t + (now - last));
        if (t >= T_TOTAL) { setPlaying(false); ended = true; }
      }
      last = now;
      render();
      raf = requestAnimationFrame(tick);
    }

    // ─── Controles ───
    const onPlay = () => { if (!playing && ended) { t = 0; ended = false; } setPlaying(!playing); };
    const onRestart = () => { t = 0; ended = false; setPlaying(true); };
    const onSeek = (e: MouseEvent) => {
      const r = bar.getBoundingClientRect();
      t = Math.max(0, Math.min(T_TOTAL, ((e.clientX - r.left) / r.width) * T_TOTAL));
      ended = t >= T_TOTAL;
      render();
    };
    btnPlay.addEventListener('click', onPlay);
    btnRestart.addEventListener('click', onRestart);
    bar.addEventListener('click', onSeek);

    // Autoplay al entrar en viewport; pausa al salir (sin consumir batería)
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !ended) setPlaying(true);
      else if (!entry.isIntersecting && playing) setPlaying(false);
    }, { threshold: 0.35 });
    io.observe(root);

    raf = requestAnimationFrame((now) => { last = now; tick(now); });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      btnPlay.removeEventListener('click', onPlay);
      btnRestart.removeEventListener('click', onRestart);
      bar.removeEventListener('click', onSeek);
    };
  }, []);

  return (
    <div ref={rootRef} className="zkdemo">
      <style>{CSS}</style>

      <div className="zk-frame">
        <div className="zk-stage">

          <div className="zk-brand"><span className="zk-dot" /><span>{t.rich('brand', { b: (c) => <b>{c}</b> })}</span></div>

          {/* ═══ Escena 0 · Intro ═══ */}
          <section className="zk-scene" data-from="0" data-to="9000" style={{ paddingTop: 280 }}>
            <span className="zk-kicker" data-at="500">{t('intro.kicker')}</span>
            <h3 className="zk-h1" data-at="1400">{t.rich('intro.title', { hl: (c) => <span className="zk-hl">{c}</span>, br: () => <br /> })}</h3>
            <p className="zk-sub" data-at="3200">{t('intro.sub')}</p>
            <div className="zk-chips" data-at="5600">
              <span className="zk-chip">Argon2id</span>
              <span className="zk-chip">XChaCha20-Poly1305</span>
              <span className="zk-chip">BLAKE2b</span>
              <span className="zk-chip">Ed25519 · X25519</span>
              <span className="zk-chip">AGPL-3.0</span>
            </div>
          </section>

          {/* ═══ Escena 1 · La contraseña ═══ */}
          <section className="zk-scene" data-from="9000" data-to="24000">
            <h4 className="zk-testname" data-at="9300">{t.rich('test1.name', { b: (c) => <b>{c}</b> })}</h4>
            <div className="zk-flow">
              <div className="zk-col">
                <div className="zk-panel" data-at="9700">
                  <div className="zk-ptitle"><span className="zk-lamp" /> {t('test1.browserTitle')}</div>
                  <pre className="zk-code"><span className="zk-dim">{t('test1.passwordLabel')}</span> <span data-type data-at="10300" data-cps="14">S3creta·Periodista!</span></pre>
                </div>
                <div className="zk-arrow" data-at="12600">▼</div>
                <div className="zk-panel" data-at="12900">
                  <div className="zk-ptitle"><span className="zk-lamp" /> {t('test1.deriveTitle')}</div>
                  <pre className="zk-code"><span className="zk-dim">{t('test1.deriveParams')}</span>{'\n'}<span className="zk-key">MK</span> = <span className="zk-hex" data-type data-at="14400" data-cps="42">7f3a 91c2 e4d8 0b6f a219 c7e3 55d0 8a1c …</span>{'\n'}<span className="zk-green" data-at="16400">{t('test1.mkComment')}</span></pre>
                </div>
              </div>
              <div className="zk-col">
                <div className="zk-panel" data-at="17400" style={{ marginTop: 90 }}>
                  <div className="zk-ptitle"><span className="zk-lamp" /> {t('test1.networkTitle')}</div>
                  <pre className="zk-code"><span className="zk-dim">POST</span> /api/v1/auth/login/finalize{'\n'}{'{'}{'\n'}  <span className="zk-key">&quot;challenge&quot;</span>:  <span className="zk-hex">&quot;Zku7…&quot;</span>,{'\n'}  <span className="zk-key">&quot;signature&quot;</span>:  <span className="zk-hex">&quot;MEUCIQDk…&quot;</span>   <span className="zk-dim">{t('test1.sigComment')}</span>{'\n'}{'}'}</pre>
                  <p className="zk-note" data-at="19400">{t.rich('test1.note', { b: (c) => <b>{c}</b> })}</p>
                </div>
              </div>
            </div>
            <div className="zk-verdict" data-at="21400"><span className="zk-tick">✓</span>
              {t('test1.verdict')}</div>
          </section>

          {/* ═══ Escena 2 · El archivo ═══ */}
          <section className="zk-scene" data-from="24000" data-to="42000">
            <h4 className="zk-testname" data-at="24300">{t.rich('test2.name', { b: (c) => <b>{c}</b> })}</h4>
            <div className="zk-panel" data-at="24700">
              <div className="zk-ptitle"><span className="zk-lamp" /> {t('test2.fileTitle')}</div>
              <div className="zk-layers">
                <div className="zk-layer" data-at="25600" data-out="30400">
                  <pre className="zk-code"><span className="zk-dim">{t('test2.confidential')}</span>{'\n'}{t('test2.docLine1')}{'\n'}{t('test2.docLine2')}{'\n'}{t('test2.docLine3')}{'\n'}{t('test2.docLine4')}</pre>
                </div>
                <div className="zk-layer" data-at="30400">
                  <pre className="zk-code zk-hex" data-type data-at="30600" data-cps="220">9f 3a c1 77 0e b2 5d 84 fa 21 6c d9 03 4e b7 58 e1 92 7a cf 44 08 d6 31 ab 5e 90 1f 73 c8 26 ed 4b a7 39 f2 80 15 ce 6a d4 b1 07 9e 52 e8 3c 61 fd 28 95 4a 0d 76 c3 1b 8f e4 57 a2 39 d0 6e 82 fb 14 c9 47 0a 75 b8 23 ef 5c 91 36 da 68 01 ae 53 c7 1d 89 f4 2e 60 bd 49 07 96 e3 5a 2f 78 cb</pre>
                </div>
              </div>
            </div>
            <div className="zk-flow" style={{ marginTop: 30 }}>
              <div className="zk-col">
                <div className="zk-panel" data-at="28600">
                  <div className="zk-ptitle"><span className="zk-lamp" /> {t('test2.encryptTitle')}</div>
                  <pre className="zk-code"><span className="zk-key">file_key</span> = {t('test2.fileKeyExpr')}         <span className="zk-dim">{t('test2.fileKeyComment')}</span>{'\n'}<span className="zk-key">{t('test2.cipherLabel')}</span>  = XChaCha20-Poly1305   <span className="zk-dim">{'// AEAD, tag 16 B'}</span></pre>
                </div>
              </div>
            </div>
            <div className="zk-chunkrow" data-at="34400">
              <div className="zk-chunk"><b>chunk 0</b> · 4 MiB · {t('test2.randomNonce')} · <span className="zk-aad">AAD &quot;chunk:0&quot;</span></div>
              <div className="zk-chunk"><b>chunk 1</b> · 4 MiB · {t('test2.randomNonce')} · <span className="zk-aad">AAD &quot;chunk:1&quot;</span></div>
              <div className="zk-chunk"><b>chunk N</b> · … · <span className="zk-aad">AAD &quot;chunk:N&quot;</span></div>
            </div>
            <p className="zk-note" data-at="36000">{t.rich('test2.note', { b: (c) => <b>{c}</b> })}</p>
            <div className="zk-verdict" data-at="38600"><span className="zk-tick">✓</span>
              {t('test2.verdict')}</div>
          </section>

          {/* ═══ Escena 3 · La red ═══ */}
          <section className="zk-scene" data-from="42000" data-to="54000">
            <h4 className="zk-testname" data-at="42300">{t.rich('test3.name', { b: (c) => <b>{c}</b> })}</h4>
            <div className="zk-panel" data-at="42700" style={{ maxWidth: 1500 }}>
              <div className="zk-ptitle"><span className="zk-lamp" /> {t('test3.captureTitle')}</div>
              <pre className="zk-code"><span className="zk-dim">POST</span> /api/v1/uploads/init{'\n'}{'{'}{'\n'}  <span className="zk-key">&quot;nameEncrypted&quot;</span>:  <span className="zk-hex" data-type data-at="43600" data-cps="60">&quot;mUz4kQ9rT2…&quot;</span>,   <span className="zk-dim">{t('test3.nameComment')}</span>{'\n'}  <span className="zk-key">&quot;metadataEncrypted&quot;</span>: <span className="zk-hex" data-type data-at="44800" data-cps="60">&quot;8wXc3PfA1N…&quot;</span>, <span className="zk-dim">{t('test3.metaComment')}</span>{'\n'}  <span className="zk-key">&quot;fileKeyWrapped&quot;</span>: <span className="zk-hex" data-type data-at="46000" data-cps="60">&quot;9hTqVb27Lm…&quot;</span>,  <span className="zk-dim">{t('test3.keyComment')}</span>{'\n'}  <span className="zk-key">&quot;chunks&quot;</span>: [ {'{'} <span className="zk-key">&quot;index&quot;</span>: 0, <span className="zk-key">&quot;nonce&quot;</span>: <span className="zk-hex">&quot;Rk31…&quot;</span> {'}'}, … ]{'\n'}{'}'}</pre>
            </div>
            <p className="zk-note" data-at="48200" style={{ maxWidth: 1400 }}>{t.rich('test3.note', { b: (c) => <b>{c}</b> })}</p>
            <div className="zk-verdict" data-at="50600"><span className="zk-tick">✓</span>
              {t('test3.verdict')}</div>
          </section>

          {/* ═══ Escena 4 · El servidor ═══ */}
          <section className="zk-scene" data-from="54000" data-to="72000">
            <h4 className="zk-testname" data-at="54300">{t.rich('test4.name', { b: (c) => <b>{c}</b> })}</h4>
            <div className="zk-term" data-at="54700" style={{ maxWidth: 1620 }}>
              <div className="zk-termbar"><i /><i /><i /><span>{t('test4.termLabel')}</span></div>
              <pre className="zk-code"><span className="zk-green">noctcom_prod=&gt;</span> <span data-type data-at="55400" data-cps="34">SELECT name_encrypted, file_key_wrapped FROM nodes LIMIT 2;</span>{'\n'}<span data-at="58200"><span className="zk-hex">\x6d533a4b…9f21</span>  |  <span className="zk-hex">\x39685471…b203</span>{'\n'}<span className="zk-hex">\x82f1c04d…77ae</span>  |  <span className="zk-hex">\xd4501be9…3c6f</span>{'\n'}<span className="zk-dim">{t('test4.rowsComment')}</span></span>{'\n'}{'\n'}<span className="zk-green">noctcom_prod=&gt;</span> <span data-type data-at="60800" data-cps="34">{t('test4.query2')}</span>{'\n'}<span data-at="63400"><span className="zk-dim">ERROR:  column &quot;email&quot; does not exist</span>{'\n'}<span className="zk-dim">ERROR:  column &quot;password&quot; does not exist</span>{'\n'}<span className="zk-dim">{t('test4.errComment')}</span></span></pre>
            </div>
            <p className="zk-note" data-at="65600" style={{ maxWidth: 1500 }}>{t.rich('test4.note', { b: (c) => <b>{c}</b> })}</p>
            <div className="zk-verdict" data-at="68600"><span className="zk-tick">✓</span>
              {t('test4.verdict')}</div>
          </section>

          {/* ═══ Escena 5 · Cierre ═══ */}
          <section className="zk-scene" data-from="72000" data-to="84000" style={{ paddingTop: 200 }}>
            <span className="zk-kicker" data-at="72300">{t('outro.kicker')}</span>
            <div className="zk-summary">
              <div className="zk-sumitem" data-at="73000"><span className="zk-tick">✓</span> {t('outro.s1')}</div>
              <div className="zk-sumitem" data-at="73600"><span className="zk-tick">✓</span> {t('outro.s2')}</div>
              <div className="zk-sumitem" data-at="74200"><span className="zk-tick">✓</span> {t('outro.s3')}</div>
              <div className="zk-sumitem" data-at="74800"><span className="zk-tick">✓</span> {t('outro.s4')}</div>
            </div>
            <h3 className="zk-closing" data-at="76600">{t.rich('outro.closing', { hl: (c) => <span className="zk-hl">{c}</span>, br: () => <br /> })}</h3>
            <p className="zk-cta" data-at="79400">{t.rich('outro.cta', { b: (c) => <b>{c}</b> })}</p>
          </section>

        </div>
      </div>

      {/* ─── Controles ─── */}
      <div className="zk-controls">
        <button type="button" className="zk-restart" title={t('controls.restart')} aria-label={t('controls.restart')}>↺</button>
        <button type="button" className="zk-play" title={t('controls.playPause')} aria-label={t('controls.playPause')}>▶</button>
        <div className="zk-bar"><div className="zk-fill" /></div>
        <div className="zk-time">0:00 / 1:24</div>
      </div>
    </div>
  );
}

// Estilos del escenario (1920×1080, se escala al contenedor). Prefijo zk- para
// no chocar con nada del sitio. Tamaños "grandes" a propósito: son px del
// lienzo virtual, como un vídeo 1080p.
const CSS = `
.zkdemo { position: relative; }
.zkdemo .zk-frame {
  position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
  border-radius: 16px; border: 1px solid var(--color-border-subtle);
  background:
    radial-gradient(ellipse 60% 50% at 50% -10%, rgba(139,92,246,.14), transparent),
    #0b0a14;
}
.zkdemo .zk-stage {
  position: absolute; top: 0; left: 0; width: 1920px; height: 1080px;
  transform-origin: top left; color: #ece9f7;
  font-family: var(--font-sans);
}
.zkdemo .zk-stage::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35;
  background-image:
    linear-gradient(rgba(139,92,246,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(139,92,246,.05) 1px, transparent 1px);
  background-size: 64px 64px;
}
.zkdemo .zk-brand {
  position: absolute; top: 44px; left: 56px; display: flex; align-items: center; gap: 14px;
  font-size: 26px; letter-spacing: .14em; color: #a8a3c0; z-index: 5;
}
.zkdemo .zk-brand b { color: #ece9f7; font-weight: 600; }
.zkdemo .zk-dot { width: 14px; height: 14px; border-radius: 50%; background: #8b5cf6; box-shadow: 0 0 18px #8b5cf6; }

.zkdemo .zk-scene { position: absolute; inset: 0; padding: 140px 120px 120px; display: none; }
.zkdemo .zk-scene.zk-active { display: block; }

.zkdemo [data-at] { opacity: 0; transform: translateY(14px); transition: opacity .55s ease, transform .55s ease; }
.zkdemo [data-at].zk-on { opacity: 1; transform: none; }
.zkdemo [data-at].zk-off { opacity: 0 !important; transform: translateY(-8px) !important; }

.zkdemo .zk-kicker {
  display: inline-block; font-family: var(--font-mono); font-size: 22px; letter-spacing: .28em;
  color: #c4b5fd; border: 1px solid rgba(139,92,246,.45); border-radius: 999px;
  padding: 12px 28px; background: rgba(139,92,246,.08); text-transform: uppercase;
}
.zkdemo .zk-h1 { font-size: 88px; font-weight: 300; line-height: 1.08; margin: 36px 0 0; }
.zkdemo .zk-hl { color: #c4b5fd; }
.zkdemo .zk-testname { font-size: 30px; font-family: var(--font-mono); letter-spacing: .22em;
  color: #6e6990; text-transform: uppercase; margin: 0 0 44px; font-weight: 400; }
.zkdemo .zk-testname b { color: #c4b5fd; font-weight: 600; }
.zkdemo .zk-sub { font-size: 34px; color: #a8a3c0; margin-top: 28px; max-width: 1100px; line-height: 1.5; }
.zkdemo .zk-chips { display: flex; gap: 18px; margin-top: 52px; flex-wrap: wrap; }
.zkdemo .zk-chip { font-family: var(--font-mono); font-size: 24px; color: #a8a3c0;
  border: 1px solid #2a2640; background: #14121f; border-radius: 12px; padding: 14px 26px; }

.zkdemo .zk-panel { background: #14121f; border: 1px solid #2a2640; border-radius: 18px;
  padding: 34px 40px; box-shadow: 0 18px 60px rgba(0,0,0,.45); }
.zkdemo .zk-ptitle { font-family: var(--font-mono); font-size: 21px; letter-spacing: .18em;
  text-transform: uppercase; color: #6e6990; margin-bottom: 22px; display: flex; align-items: center; gap: 12px; }
.zkdemo .zk-lamp { width: 10px; height: 10px; border-radius: 50%; background: #8b5cf6; box-shadow: 0 0 10px #8b5cf6; }

.zkdemo .zk-code { font-family: var(--font-mono); font-size: 26px; line-height: 1.65;
  color: #ece9f7; white-space: pre-wrap; word-break: break-all; margin: 0; }
.zkdemo .zk-key { color: #c4b5fd; }
.zkdemo .zk-dim { color: #6e6990; }
.zkdemo .zk-green { color: #34d399; }
.zkdemo .zk-hex { color: #fbbf24; }
.zkdemo .zk-caret::after { content: '▋'; color: #c4b5fd; animation: zk-blink 1s steps(1) infinite; }
@keyframes zk-blink { 50% { opacity: 0; } }

.zkdemo .zk-flow { display: flex; align-items: stretch; gap: 28px; }
.zkdemo .zk-col { flex: 1; min-width: 0; }
.zkdemo .zk-arrow { text-align: center; font-size: 40px; color: #8b5cf6; margin: 18px 0; }

.zkdemo .zk-verdict { display: flex; align-items: center; gap: 22px; margin-top: 44px;
  background: rgba(52,211,153,.07); border: 1px solid rgba(52,211,153,.4);
  border-radius: 16px; padding: 26px 34px; font-size: 32px; color: #d3f7e9; }
.zkdemo .zk-tick { width: 52px; height: 52px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: rgba(52,211,153,.15); border: 2px solid #34d399; color: #34d399; font-size: 30px; }
.zkdemo .zk-note { font-size: 26px; color: #a8a3c0; margin: 26px 0 0; line-height: 1.5; }
.zkdemo .zk-note b { color: #fbbf24; font-weight: 600; }

.zkdemo .zk-layers { position: relative; min-height: 320px; }
.zkdemo .zk-layer { position: absolute; inset: 0; }

.zkdemo .zk-chunkrow { display: flex; gap: 22px; margin-top: 30px; }
.zkdemo .zk-chunk { flex: 1; border: 1px dashed rgba(139,92,246,.5); border-radius: 14px; padding: 20px 24px;
  font-family: var(--font-mono); font-size: 22px; color: #a8a3c0; background: rgba(139,92,246,.05); }
.zkdemo .zk-chunk b { color: #c4b5fd; }
.zkdemo .zk-aad { color: #34d399; }

.zkdemo .zk-term { background: #0a0912; border: 1px solid #2a2640; border-radius: 16px; overflow: hidden;
  box-shadow: 0 18px 60px rgba(0,0,0,.5); }
.zkdemo .zk-termbar { display: flex; gap: 10px; padding: 16px 20px; background: #1b1828;
  border-bottom: 1px solid #2a2640; align-items: center; }
.zkdemo .zk-termbar i { width: 16px; height: 16px; border-radius: 50%; display: block; }
.zkdemo .zk-termbar i:nth-child(1) { background: #f87171; }
.zkdemo .zk-termbar i:nth-child(2) { background: #fbbf24; }
.zkdemo .zk-termbar i:nth-child(3) { background: #34d399; }
.zkdemo .zk-termbar span { font-family: var(--font-mono); font-size: 20px; color: #6e6990; margin-left: 14px; }
.zkdemo .zk-term .zk-code { padding: 28px 34px; font-size: 25px; }

.zkdemo .zk-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 54px; max-width: 1500px; }
.zkdemo .zk-sumitem { display: flex; gap: 18px; align-items: center; background: #14121f;
  border: 1px solid #2a2640; border-radius: 14px; padding: 24px 28px; font-size: 28px; color: #a8a3c0; }
.zkdemo .zk-sumitem .zk-tick { width: 42px; height: 42px; font-size: 24px; }
.zkdemo .zk-closing { font-size: 64px; font-weight: 300; margin: 70px 0 0; line-height: 1.25; }
.zkdemo .zk-cta { margin-top: 44px; font-family: var(--font-mono); font-size: 30px; color: #a8a3c0; }
.zkdemo .zk-cta b { color: #c4b5fd; }

/* ─── Controles (fuera del lienzo: tamaños reales, táctiles) ─── */
.zkdemo .zk-controls {
  display: flex; align-items: center; gap: 12px; margin-top: 12px;
  font-family: var(--font-mono); color: var(--color-text-secondary); user-select: none;
}
.zkdemo .zk-controls button {
  background: var(--color-bg-surface); border: 1px solid var(--color-border-faint);
  color: var(--color-text-primary); font-size: 14px; cursor: pointer;
  width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
  transition: background .2s;
}
.zkdemo .zk-controls button:hover { background: var(--color-bg-surface-2); }
.zkdemo .zk-bar { position: relative; flex: 1; height: 6px; background: var(--color-bg-surface-2);
  border-radius: 999px; cursor: pointer; }
.zkdemo .zk-fill { position: absolute; top: 0; bottom: 0; left: 0; width: 0;
  background: #8b5cf6; border-radius: 999px; box-shadow: 0 0 10px rgba(139,92,246,.5); }
.zkdemo .zk-time { font-size: 12px; min-width: 84px; text-align: right; color: var(--color-text-tertiary); }
`;
