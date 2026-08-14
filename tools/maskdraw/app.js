/* maskdraw — hand-authored walkability for painted scenes.
 *
 * The premise this tool exists to serve: a painting is the map, and the
 * mechanics under it are DRAWN BY A PERSON at the painting's native
 * resolution, with the real character walking on the mask while it is being
 * drawn. No auto-tracing, no segmentation guess, no plan-then-paint drift.
 * The person looks at a wall foot at 4x, paints the pixel, and immediately
 * walks into it.
 *
 * Encoding (matches src/game/painted/PaintedScene.tsx):
 *   0 = blocked. 40 = L0, 50 = ramp01, 60 = L1, 70 = ramp12, 80 = L2,
 *   90 = ramp23, 100 = L3.  A step is legal when |a-b| <= 10, so plateaus
 *   only connect through their painted stairs.
 *
 * Everything is plain DOM + canvas. No build step. Open it from the vite dev
 * server (http://localhost:5188/tools/maskdraw/) so /art/... resolves.
 */
(() => {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const IMG   = qs.get('img')    || '/art/scenes/harbor2/native.png';
  const ID    = qs.get('id')     || 'harbor2';
  const LOADL = qs.get('levels') || '';          // optional levels.png to continue from

  // ---- palette: the level vocabulary a person paints with -----------------
  const PAL = [
    { v: 0,   name: 'BLOCKED',  key: '0', col: [232,  70,  96] },
    { v: 40,  name: 'L0 low',   key: '1', col: [ 70, 150, 220] },
    { v: 50,  name: 'ramp 0-1', key: '2', col: [120, 220, 230] },
    { v: 60,  name: 'L1 mid',   key: '3', col: [ 90, 210, 120] },
    { v: 70,  name: 'ramp 1-2', key: '4', col: [200, 235, 110] },
    { v: 80,  name: 'L2 high',  key: '5', col: [245, 190,  70] },
    { v: 90,  name: 'ramp 2-3', key: '6', col: [245, 140,  70] },
    { v: 100, name: 'L3 top',   key: '7', col: [235, 110, 190] },
  ];
  const colOf = (v) => (PAL.find((p) => p.v === v) || PAL[0]).col;

  // ---- state --------------------------------------------------------------
  const S = {
    W: 512, H: 288, Z: 3,
    tool: 'brush', value: 60, brush: 2,
    opacity: 0.55, showMask: true, showOcc: true, showHits: false, grid: false,
    poly: [], dragRect: null, painting: false, lastPx: null,
    spawn: [256, 200], walk: false,
    occNext: 1, occs: [],           // {id, baseline, name}
    hist: [], t0: Date.now(), ops: 0, strokes: 0,
  };
  let lvl, occ, hits, img = null;
  const keys = {};

  const el = (id) => document.getElementById(id);
  const stack = el('stack'), stage = el('stage');
  const cvP = el('cv-paint'), cvM = el('cv-mask'), cvU = el('cv-ui');
  const gP = cvP.getContext('2d'), gM = cvM.getContext('2d'), gU = cvU.getContext('2d');
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  // offscreen native-resolution buffers
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let natMask, natOcc, natHits, gNM, gNO, gNH;

  // ---- indexing -----------------------------------------------------------
  const idx = (x, y) => y * S.W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < S.W && y < S.H;
  const lvlAt = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (!inB(xi, yi)) return 0;
    return lvl[idx(xi, yi)];
  };

  // ---- boot ---------------------------------------------------------------
  function alloc(w, h) {
    S.W = w; S.H = h;
    lvl = new Uint8Array(w * h); occ = new Uint8Array(w * h); hits = new Uint8Array(w * h);
    natMask = mk(w, h); gNM = natMask.getContext('2d');
    natOcc  = mk(w, h); gNO = natOcc.getContext('2d');
    natHits = mk(w, h); gNH = natHits.getContext('2d');
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
  }

  async function boot() {
    img = await loadImage(IMG);
    alloc(img.naturalWidth, img.naturalHeight);
    el('sceneid').textContent = ID;
    el('dims').textContent = `${S.W} x ${S.H} native  ·  source ${IMG}`;
    if (LOADL) { try { await importLevels(await loadImage(LOADL)); } catch (e) { console.warn('levels load failed', e); } }
    buildPalette();
    wire();
    setZoom(S.Z);
    loadThor();
    requestAnimationFrame(frame);
    window.__md.ready = true;
  }

  // ---- canvas sizing ------------------------------------------------------
  function setZoom(z) {
    S.Z = z;
    for (const c of [cvP, cvM, cvU]) {
      c.width = S.W * z * dpr; c.height = S.H * z * dpr;
      c.style.width = (S.W * z) + 'px'; c.style.height = (S.H * z) + 'px';
    }
    stack.style.width = (S.W * z) + 'px'; stack.style.height = (S.H * z) + 'px';
    for (const g of [gP, gM, gU]) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; }
    document.querySelectorAll('[data-zoom]').forEach((b) => b.classList.toggle('on', +b.dataset.zoom === z));
    drawPaint(); dirtyMask = true;
  }

  function drawPaint() {
    gP.imageSmoothingEnabled = false;
    gP.clearRect(0, 0, S.W * S.Z, S.H * S.Z);
    gP.drawImage(img, 0, 0, S.W * S.Z, S.H * S.Z);
  }

  // ---- mask rasterisation -------------------------------------------------
  let dirtyMask = true;
  function bakeMask() {
    const d = gNM.createImageData(S.W, S.H);
    const p = d.data;
    for (let i = 0; i < lvl.length; i++) {
      const v = lvl[i];
      const c = colOf(v);
      p[i * 4] = c[0]; p[i * 4 + 1] = c[1]; p[i * 4 + 2] = c[2];
      p[i * 4 + 3] = v === 0 ? 0 : 255;     // unpainted/blocked stays see-through
    }
    gNM.putImageData(d, 0, 0);

    const o = gNO.createImageData(S.W, S.H); const q = o.data;
    for (let i = 0; i < occ.length; i++) {
      if (!occ[i]) continue;
      q[i * 4] = 190; q[i * 4 + 1] = 120; q[i * 4 + 2] = 255; q[i * 4 + 3] = 150;
    }
    gNO.putImageData(o, 0, 0);

    const h = gNH.createImageData(S.W, S.H); const r = h.data;
    for (let i = 0; i < hits.length; i++) {
      if (!hits[i]) continue;
      const a = Math.min(255, hits[i] * 24);
      r[i * 4] = 255; r[i * 4 + 1] = 40; r[i * 4 + 2] = 40; r[i * 4 + 3] = a;
    }
    gNH.putImageData(h, 0, 0);

    gM.clearRect(0, 0, S.W * S.Z, S.H * S.Z);
    gM.imageSmoothingEnabled = false;
    if (S.showMask) { gM.globalAlpha = S.opacity; gM.drawImage(natMask, 0, 0, S.W * S.Z, S.H * S.Z); }
    gM.globalAlpha = 1;
    if (S.showOcc)  gM.drawImage(natOcc, 0, 0, S.W * S.Z, S.H * S.Z);
    if (S.showHits) gM.drawImage(natHits, 0, 0, S.W * S.Z, S.H * S.Z);
    dirtyMask = false;
    el('stats').textContent = statLine();
  }

  function statLine() {
    let walkable = 0, byv = {};
    for (let i = 0; i < lvl.length; i++) { const v = lvl[i]; if (v) walkable++; byv[v] = (byv[v] || 0) + 1; }
    const pct = (100 * walkable / lvl.length).toFixed(1);
    const mins = ((Date.now() - S.t0) / 60000).toFixed(1);
    return `walkable ${walkable}px (${pct}%)  ops ${S.ops}  strokes ${S.strokes}  ${mins} min`;
  }

  // ---- history ------------------------------------------------------------
  function snap() {
    S.hist.push({ l: lvl.slice(), o: occ.slice() });
    if (S.hist.length > 60) S.hist.shift();
  }
  function undo() {
    const h = S.hist.pop(); if (!h) return;
    lvl.set(h.l); occ.set(h.o); dirtyMask = true;
  }

  // ---- drawing primitives (all exact, no antialiasing) --------------------
  function setPx(x, y, v) {
    if (!inB(x, y)) return;
    lvl[idx(x, y)] = v;
  }
  function stamp(cx, cy, v) {
    const r = S.brush;
    if (r <= 1) { setPx(cx, cy, v); return; }
    const h0 = Math.floor((r - 1) / 2), h1 = Math.ceil((r - 1) / 2);
    for (let y = cy - h0; y <= cy + h1; y++)
      for (let x = cx - h0; x <= cx + h1; x++) setPx(x, y, v);
  }
  function line(x0, y0, x1, y1, fn) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function fillRect(x0, y0, x1, y1, v) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) setPx(x, y, v);
  }
  // exact scanline polygon fill, pixel centres, even-odd
  function fillPoly(pts, v, target) {
    if (pts.length < 3) return;
    const put = target === 'occ'
      ? (x, y, val) => { if (inB(x, y)) occ[idx(x, y)] = val; }
      : (x, y, val) => setPx(x, y, val);
    let miny = 1e9, maxy = -1e9;
    for (const p of pts) { miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    miny = Math.max(0, Math.floor(miny)); maxy = Math.min(S.H - 1, Math.ceil(maxy));
    for (let y = miny; y <= maxy; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi <= yc && yj > yc) || (yj <= yc && yi > yc))
          xs.push(xi + (yc - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.ceil(xs[k] - 0.5), b = Math.floor(xs[k + 1] - 0.5);
        for (let x = a; x <= b; x++) put(x, y, v);
      }
    }
  }
  // ---- SEAM HEAL ---------------------------------------------------------
  // Two polygons drawn as two independent outlines do not tile exactly: where
  // their vertex chains disagree by a fraction of a pixel, a 1px row of 0
  // survives between them. It is invisible below 6x and it hard-blocks the
  // character, because his hip probes are 2px out from his feet. This closes
  // any blocked pixel that is pinched between two walkable pixels whose levels
  // are a LEGAL STEP apart — so a real wall (a level difference bigger than
  // the tolerance, or a gap thicker than a pixel) is never eaten.
  function healSeams(tol) {
    tol = tol || 10;
    let filled = 0, pass = 0;
    for (pass = 0; pass < 3; pass++) {
      const before = filled;
      const copy = lvl.slice();
      for (let y = 1; y < S.H - 1; y++) for (let x = 1; x < S.W - 1; x++) {
        const i = idx(x, y);
        if (copy[i] !== 0) continue;
        const pairs = [[copy[i - 1], copy[i + 1]], [copy[i - S.W], copy[i + S.W]]];
        for (const [a, b] of pairs) {
          if (a > 0 && b > 0 && Math.abs(a - b) <= tol) { lvl[i] = Math.abs(a - b) === 0 ? a : Math.min(a, b); filled++; break; }
        }
      }
      if (filled === before) break;
    }
    dirtyMask = true;
    return { filled, passes: pass + 1 };
  }

  // ---- REACHABILITY CHECK ------------------------------------------------
  // Walk-flood from the spawn using the engine's own legality test, then list
  // every walkable island the player can never get to. This is the check that
  // would have caught the 1px breakwater seam before a human ever noticed.
  function checkReach(sx, sy) {
    sx = sx == null ? S.spawn[0] : sx; sy = sy == null ? S.spawn[1] : sy;
    readCfg();
    const seen = new Uint8Array(S.W * S.H), q = [[sx, sy]];
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    seen[idx(sx, sy)] = 1;
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h], cur = lvl[idx(x, y)];
      for (const [dx, dy] of D) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny) || seen[idx(nx, ny)]) continue;
        if (!canStandFrom(nx, ny, cur)) continue;
        seen[idx(nx, ny)] = 1; q.push([nx, ny]);
      }
    }
    // orphan islands: walkable pixels a body could stand on but never reach
    const orphan = new Uint8Array(S.W * S.H), out = [];
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
      const i = idx(x, y);
      if (seen[i] || orphan[i] || !lvl[i] || !canStand(x, y)) continue;
      let n = 0, minx = x, maxx = x, miny = y, maxy = y;
      const s = [[x, y]]; orphan[i] = 1;
      for (let h = 0; h < s.length; h++) {
        const [cx, cy] = s[h]; n++;
        minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
        for (const [dx, dy] of D) {
          const nx = cx + dx, ny = cy + dy;
          if (!inB(nx, ny) || orphan[idx(nx, ny)] || seen[idx(nx, ny)] || !lvl[idx(nx, ny)] || !canStand(nx, ny)) continue;
          orphan[idx(nx, ny)] = 1; s.push([nx, ny]);
        }
      }
      if (n > 12) out.push({ px: n, rect: [minx, miny, maxx, maxy], level: lvl[i] });
    }
    // paint the orphans into the HITS layer so they are visible on the map
    hits.fill(0);
    for (let i = 0; i < orphan.length; i++) if (orphan[i]) hits[i] = 8;
    dirtyMask = true;
    return { reached: q.length, orphanIslands: out.sort((a, b) => b.px - a.px).slice(0, 20) };
  }

  function bucket(sx, sy, v) {
    if (!inB(sx, sy)) return;
    const from = lvl[idx(sx, sy)];
    if (from === v) return;
    const q = [sx, sy];
    while (q.length) {
      const y = q.pop(), x = q.pop();
      if (!inB(x, y) || lvl[idx(x, y)] !== from) continue;
      lvl[idx(x, y)] = v;
      q.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }

  // ---- pointer ------------------------------------------------------------
  let cursor = null;
  function toNative(e) {
    const r = cvU.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / S.Z), Math.floor((e.clientY - r.top) / S.Z)];
  }

  function wire() {
    // ---- palette / tool / view buttons
    document.querySelectorAll('[data-zoom]').forEach((b) => b.onclick = () => setZoom(+b.dataset.zoom));
    document.querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => setTool(b.dataset.tool));
    el('opa').oninput = (e) => { S.opacity = +e.target.value / 100; el('opav').textContent = e.target.value; dirtyMask = true; };
    el('bsize').oninput = (e) => { S.brush = +e.target.value; el('bsizev').textContent = e.target.value; };
    el('tgrid').onclick = (e) => { S.grid = !S.grid; e.target.classList.toggle('on', S.grid); };
    el('tmask').onclick = (e) => { S.showMask = !S.showMask; e.target.classList.toggle('on', S.showMask); dirtyMask = true; };
    el('tocc').onclick  = (e) => { S.showOcc = !S.showOcc; e.target.classList.toggle('on', S.showOcc); dirtyMask = true; };
    el('thits').onclick = (e) => { S.showHits = !S.showHits; e.target.classList.toggle('on', S.showHits); dirtyMask = true; };
    el('undo').onclick = undo;
    el('clear').onclick = () => { snap(); lvl.fill(0); occ.fill(0); hits.fill(0); dirtyMask = true; };
    el('twalk').onclick = toggleWalk;
    el('respawn').onclick = () => { W.x = S.spawn[0]; W.y = S.spawn[1]; };
    el('setspawn').onclick = () => { S.spawn = [Math.round(W.x), Math.round(W.y)]; };
    el('exlevels').onclick = () => dl(levelsPNG(), `${ID}-levels.png`);
    el('exocc').onclick = () => dl(occPNG(), `${ID}-occluders.png`);
    el('exjson').onclick = () => dl('data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(specJSON(), null, 2)), `${ID}-walk.json`);
    el('heal').onclick = () => { snap(); const r = healSeams(); el('checkout').textContent = `healed ${r.filled} seam px in ${r.passes} passes`; };
    el('check').onclick = () => {
      const r = checkReach();
      el('checkout').innerHTML = `reached ${r.reached}px<br>` + (r.orphanIslands.length
        ? '<b style="color:var(--bad)">UNREACHABLE:</b><br>' + r.orphanIslands.map((o) => `${o.px}px lvl${o.level} @ ${o.rect.join(',')}`).join('<br>')
        : '<b style="color:var(--ok)">no orphan regions</b>');
      S.showHits = true; el('thits').classList.add('on'); dirtyMask = true;
    };
    el('imp').onclick = () => el('impf').click();
    el('impf').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      importLevels(await loadImage(URL.createObjectURL(f)));
    };
    el('occbase').onchange = (e) => { const o = S.occs[S.occs.length - 1]; if (o) { o.baseline = +e.target.value; renderOccList(); } };

    // ---- canvas pointer
    cvU.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return;                       // middle = pan (browser)
      const [x, y] = toNative(e);
      S.lastPx = [x, y];
      if (S.tool === 'pick') { const v = lvlAt(x, y); S.value = v; syncPal(); return; }
      if (S.tool === 'poly' || S.tool === 'occ') { S.poly.push([x + 0.5, y + 0.5]); S.ops++; return; }
      if (S.tool === 'bucket') { snap(); bucket(x, y, e.shiftKey ? 0 : S.value); S.ops++; dirtyMask = true; return; }
      const grab = () => { try { cvU.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ } };
      if (S.tool === 'rect') { snap(); S.dragRect = [x, y, x, y]; grab(); return; }
      // brush
      snap(); S.painting = true; S.strokes++; S.ops++;
      stamp(x, y, e.shiftKey || e.button === 2 ? 0 : S.value);
      grab();
      dirtyMask = true;
    });
    cvU.addEventListener('pointermove', (e) => {
      const [x, y] = toNative(e);
      cursor = [x, y];
      if (S.painting) {
        const [px, py] = S.lastPx || [x, y];
        line(px, py, x, y, (cx, cy) => stamp(cx, cy, e.shiftKey || (e.buttons & 2) ? 0 : S.value));
        dirtyMask = true;
      }
      if (S.dragRect) { S.dragRect[2] = x; S.dragRect[3] = y; }
      S.lastPx = [x, y];
      hud(x, y);
    });
    const endDraw = (e) => {
      if (S.dragRect) {
        const [a, b, c, d] = S.dragRect;
        fillRect(a, b, c, d, e && (e.shiftKey) ? 0 : S.value);
        S.dragRect = null; S.ops++; dirtyMask = true;
      }
      S.painting = false;
    };
    cvU.addEventListener('pointerup', endDraw);
    cvU.addEventListener('pointerleave', () => { cursor = null; });
    cvU.addEventListener('dblclick', () => closePoly());
    cvU.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const p = PAL.find((q) => q.key === e.key);
      if (p) { S.value = p.v; syncPal(); return; }
      if (k === 'b') setTool('brush');
      else if (k === 'r') setTool('rect');
      else if (k === 'p') setTool('poly');
      else if (k === 'f') setTool('bucket');
      else if (k === 'i') setTool('pick');
      else if (k === 'o') setTool('occ');
      else if (k === 't') toggleWalk();
      else if (k === 'z' && (e.ctrlKey || e.metaKey)) undo();
      else if (k === 'z' && !S.walk) undo();
      else if (e.key === 'Enter') closePoly();
      else if (e.key === 'Escape') { S.poly = []; }
      else if (e.key === 'Backspace') { S.poly.pop(); e.preventDefault(); }
      else if (k === '[') el('bsize').value = S.brush = Math.max(1, S.brush - 1);
      else if (k === ']') el('bsize').value = S.brush = Math.min(16, S.brush + 1);
      else if (k === '+' || k === '=') setZoom(Math.min(8, S.Z + 1));
      else if (k === '-') setZoom(Math.max(1, S.Z - 1));
      if (S.walk && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  }

  function setTool(t) {
    S.tool = t; S.poly = [];
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  }
  function closePoly() {
    if (S.poly.length < 3) { S.poly = []; return; }
    snap();
    if (S.tool === 'occ') {
      const id = S.occNext++;
      let maxy = 0; for (const p of S.poly) maxy = Math.max(maxy, p[1]);
      fillPoly(S.poly, id, 'occ');
      S.occs.push({ id, baseline: Math.round(maxy), name: 'occ' + id });
      el('occbase').value = Math.round(maxy);
      plates = null; renderOccList();
    } else {
      fillPoly(S.poly, S.value, 'lvl');
    }
    S.ops++; S.poly = []; dirtyMask = true;
  }
  function renderOccList() {
    el('occlist').innerHTML = S.occs.length
      ? S.occs.map((o) => `${o.name}: baseline y=${o.baseline}`).join('<br>')
      : 'none';
  }

  function buildPalette() {
    el('pal').innerHTML = PAL.map((p) =>
      `<div class="row"><button class="sw" data-v="${p.v}">
        <span class="chip" style="background:rgb(${p.col.join(',')})"></span>
        <span>${p.key} · ${p.name} <span style="color:var(--dim)">(${p.v})</span></span></button></div>`).join('');
    el('pal').querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { S.value = +b.dataset.v; syncPal(); });
    syncPal();
  }
  function syncPal() {
    el('pal').querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', +b.dataset.v === S.value));
  }

  function hud(x, y) {
    const v = inB(x, y) ? lvl[idx(x, y)] : -1;
    const o = inB(x, y) ? occ[idx(x, y)] : 0;
    const nm = (PAL.find((p) => p.v === v) || { name: '—' }).name;
    el('hud').innerHTML =
      `<b>${x},${y}</b>  zoom ${S.Z}x  1px = ${S.Z} screen px\n` +
      `level ${v} (${nm})${o ? '  occ#' + o : ''}\n` +
      (S.walk ? `thor ${W.x.toFixed(1)},${W.y.toFixed(1)} lvl ${lvlAt(W.x, W.y)} ${W.blocked ? 'BLOCKED' : ''}` : `tool ${S.tool} · value ${S.value} · brush ${S.brush}px`);
  }

  // ---- THE WALK TEST ------------------------------------------------------
  // The step law is transcribed from src/game/painted/PaintedScene.tsx
  // (lines 96-117 + the ticker at 262-295). Constants that are in painting
  // pixels are exposed, because they must scale with the map's resolution.
  const W = { x: 256, y: 200, facing: 'south', animT: 0, blocked: false, trail: [] };
  let cfg = { speed: 34, hip: 2, hipDY: 1, near: 10, charH: 18, yScale: 0.72 };
  function readCfg() {
    cfg.speed = +el('wspeed').value; cfg.hip = +el('whip').value;
    cfg.near = +el('wnear').value; cfg.charH = +el('wsize').value;
    cfg.hipDY = Math.max(1, Math.round(cfg.hip / 2));
  }
  const near = (a, b) => Math.abs(a - b) <= cfg.near;
  function canStandFrom(x, y, fromLvl) {
    const f = lvlAt(x, y);
    if (f === 0 || !near(f, fromLvl)) return false;
    const h1 = lvlAt(x - cfg.hip, y - cfg.hipDY), h2 = lvlAt(x + cfg.hip, y - cfg.hipDY);
    return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f);
  }
  const canStand = (x, y) => canStandFrom(x, y, lvlAt(x, y));

  function markHit(x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (inB(xi, yi)) hits[idx(xi, yi)] = Math.min(255, hits[idx(xi, yi)] + 1);
  }

  function stepWalk(dt) {
    readCfg();
    let dx = 0, dy = 0;
    if (keys['arrowup'] || keys['w']) dy -= 1;
    if (keys['arrowdown'] || keys['s']) dy += 1;
    if (keys['arrowleft'] || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    const moving = dx !== 0 || dy !== 0;
    W.blocked = false;
    if (moving) {
      const m = Math.hypot(dx, dy); dx /= m; dy /= m;
      const nx = W.x + dx * cfg.speed * dt, ny = W.y + dy * cfg.speed * dt * cfg.yScale;
      const cur = lvlAt(W.x, W.y);
      const stuck = cur === 0;
      if (canStandFrom(nx, ny, cur) || stuck) { W.x = nx; W.y = ny; }
      else if (canStandFrom(nx, W.y, cur)) { W.x = nx; markHit(nx, ny); W.blocked = true; }
      else if (canStandFrom(W.x, ny, cur)) { W.y = ny; markHit(nx, ny); W.blocked = true; }
      else { markHit(nx, ny); W.blocked = true; }
      W.facing = dirFrom(dx, dy * cfg.yScale);
      W.animT += dt * 9;
      const t = W.trail[W.trail.length - 1];
      if (!t || Math.hypot(t[0] - W.x, t[1] - W.y) > 1.5) W.trail.push([W.x, W.y]);
      if (W.trail.length > 6000) W.trail.shift();
      if (W.blocked) dirtyMask = S.showHits ? true : dirtyMask;
    } else W.animT = 0;
  }
  function dirFrom(dx, dy) {
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    if (a >= -22.5 && a < 22.5) return 'east';
    if (a >= 22.5 && a < 67.5) return 'south-east';
    if (a >= 67.5 && a < 112.5) return 'south';
    if (a >= 112.5 && a < 157.5) return 'south-west';
    if (a >= -67.5 && a < -22.5) return 'north-east';
    if (a >= -112.5 && a < -67.5) return 'north';
    if (a >= -157.5 && a < -112.5) return 'north-west';
    return 'west';
  }
  function toggleWalk() {
    S.walk = !S.walk;
    el('twalk').classList.toggle('on', S.walk);
    el('walkbadge').style.display = S.walk ? 'block' : 'none';
    if (S.walk) { W.x = S.spawn[0]; W.y = S.spawn[1]; }
  }

  // Thor's frames. The sprite canvas is 144x144 with the FOOT LINE at y=106
  // (content bbox measured 33..108 across all 8 dirs) — anchoring at the
  // canvas bottom, as the runtime does, floats him 38*scale px above the
  // pixel that is actually collision-tested.
  const FOOT = 106, SPRITE = 144, CONTENT_H = 70;
  const thorTex = {};
  function loadThor() {
    for (const d of ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']) {
      thorTex[d] = [];
      for (let i = 0; i < 6; i++) {
        const im = new Image();
        im.src = `/art/characters/thor/walk/${d}/${i}.png`;
        thorTex[d][i] = im;
      }
    }
  }
  function drawThor(g) {
    const s = cfg.charH / CONTENT_H, z = S.Z;
    const fr = (keys['w'] || keys['a'] || keys['s'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'])
      ? 1 + (Math.floor(W.animT) % 5) : 0;
    const im = (thorTex[W.facing] || [])[fr];
    const px = W.x * z, py = W.y * z;
    // shadow
    g.save();
    g.fillStyle = 'rgba(6,10,14,0.42)';
    g.beginPath(); g.ellipse(px, py, 4.5 * s * z * 2, 1.6 * s * z * 2, 0, 0, 6.284); g.fill();
    g.restore();
    if (im && im.complete && im.naturalWidth) {
      g.imageSmoothingEnabled = false;
      g.drawImage(im, px - (SPRITE / 2) * s * z, py - FOOT * s * z, SPRITE * s * z, SPRITE * s * z);
    } else {
      g.fillStyle = '#e7e7ef';
      g.fillRect(px - 2 * z, py - cfg.charH * z, 4 * z, cfg.charH * z);
    }
    // the exact collision point + the two hip probes
    g.fillStyle = W.blocked ? '#ff3040' : '#40ff90';
    g.fillRect(Math.round(W.x) * z, Math.round(W.y) * z, z, z);
    g.fillStyle = '#40c8ff';
    g.fillRect(Math.round(W.x - cfg.hip) * z, Math.round(W.y - cfg.hipDY) * z, z, z);
    g.fillRect(Math.round(W.x + cfg.hip) * z, Math.round(W.y - cfg.hipDY) * z, z, z);
  }

  // ---- occluder plates ----------------------------------------------------
  // An occluder is a piece of the PAINTING lifted back out of it and re-drawn
  // over the character when his feet are north of its baseline. Baking it from
  // the painting itself is what keeps it pixel-identical to the art.
  let plates = null;
  function bakePlates() {
    plates = S.occs.map((o) => {
      const c = mk(S.W, S.H), g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, S.W, S.H);
      for (let i = 0; i < occ.length; i++) if (occ[i] !== o.id) d.data[i * 4 + 3] = 0;
      g.putImageData(d, 0, 0);
      return { cv: c, baseline: o.baseline };
    });
  }
  function drawPlates(g) {
    if (!plates) bakePlates();
    g.imageSmoothingEnabled = false;
    for (const p of plates) if (W.y < p.baseline) g.drawImage(p.cv, 0, 0, S.W * S.Z, S.H * S.Z);
  }

  // ---- ui layer -----------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last) / 1000; last = now;
    if (S.walk) stepWalk(dt);
    if (dirtyMask) bakeMask();
    const z = S.Z;
    gU.clearRect(0, 0, S.W * z, S.H * z);

    if (S.grid && z >= 4) {
      gU.strokeStyle = 'rgba(255,255,255,0.09)'; gU.lineWidth = 1;
      gU.beginPath();
      for (let x = 0; x <= S.W; x += 1) { gU.moveTo(x * z + 0.5, 0); gU.lineTo(x * z + 0.5, S.H * z); }
      for (let y = 0; y <= S.H; y += 1) { gU.moveTo(0, y * z + 0.5); gU.lineTo(S.W * z, y * z + 0.5); }
      gU.stroke();
    }
    // poly rubber band
    if (S.poly.length) {
      gU.strokeStyle = S.tool === 'occ' ? '#c07aff' : '#ffd166';
      gU.lineWidth = 1.5;
      gU.beginPath();
      S.poly.forEach((p, i) => (i ? gU.lineTo(p[0] * z, p[1] * z) : gU.moveTo(p[0] * z, p[1] * z)));
      if (cursor) gU.lineTo((cursor[0] + 0.5) * z, (cursor[1] + 0.5) * z);
      gU.stroke();
      gU.fillStyle = '#ffd166';
      for (const p of S.poly) gU.fillRect(p[0] * z - 1.5, p[1] * z - 1.5, 3, 3);
    }
    if (S.dragRect) {
      const [a, b, c, d] = S.dragRect;
      gU.strokeStyle = '#ffd166'; gU.lineWidth = 1;
      gU.strokeRect(Math.min(a, c) * z + 0.5, Math.min(b, d) * z + 0.5, (Math.abs(c - a) + 1) * z - 1, (Math.abs(d - b) + 1) * z - 1);
    }
    // brush footprint: the person sees EXACTLY which native pixels will change
    if (cursor && !S.walk) {
      const r = S.brush, h0 = Math.floor((r - 1) / 2);
      gU.strokeStyle = '#ffffff'; gU.lineWidth = 1;
      gU.strokeRect((cursor[0] - h0) * z + 0.5, (cursor[1] - h0) * z + 0.5, r * z - 1, r * z - 1);
    }
    // spawn
    gU.strokeStyle = '#6fd08c';
    gU.strokeRect(S.spawn[0] * z - 2, S.spawn[1] * z - 2, 5, 5);
    if (S.walk) { drawThor(gU); if (S.occs.length) drawPlates(gU); }
    if (cursor) hud(cursor[0], cursor[1]);
    requestAnimationFrame(frame);
  }

  // ---- export -------------------------------------------------------------
  function levelsPNG() {
    const c = mk(S.W, S.H), g = c.getContext('2d');
    const d = g.createImageData(S.W, S.H);
    for (let i = 0; i < lvl.length; i++) {
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = lvl[i];
      d.data[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  }
  function occPNG() {
    const c = mk(S.W, S.H), g = c.getContext('2d');
    const d = g.createImageData(S.W, S.H);
    for (let i = 0; i < occ.length; i++) {
      d.data[i * 4] = occ[i]; d.data[i * 4 + 1] = occ[i] ? 255 : 0; d.data[i * 4 + 2] = 0;
      d.data[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  }
  function stairRegions() {
    // every ramp value becomes a named region with its bbox — the runtime
    // does not need this (the level values carry the law) but the game does,
    // for footstep sounds / camera / "you are on the stair" logic.
    const out = [];
    for (const rv of [50, 70, 90]) {
      const seen = new Uint8Array(S.W * S.H);
      for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
        const i = idx(x, y);
        if (lvl[i] !== rv || seen[i]) continue;
        let minx = x, maxx = x, miny = y, maxy = y, n = 0;
        const q = [x, y];
        while (q.length) {
          const cy = q.pop(), cx = q.pop();
          if (!inB(cx, cy)) continue;
          const j = idx(cx, cy);
          if (seen[j] || lvl[j] !== rv) continue;
          seen[j] = 1; n++;
          minx = Math.min(minx, cx); maxx = Math.max(maxx, cx);
          miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
          q.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
        }
        if (n > 6) out.push({ value: rv, connects: [rv - 10, rv + 10], rect: [minx, miny, maxx, maxy], px: n });
      }
    }
    return out;
  }
  function specJSON() {
    return {
      id: ID, source: IMG, w: S.W, h: S.H,
      encoding: { blocked: 0, L0: 40, ramp01: 50, L1: 60, ramp12: 70, L2: 80, ramp23: 90, L3: 100, stepTolerance: cfg.near },
      spawn: S.spawn,
      character: { heightPx: cfg.charH, hip: cfg.hip, hipDY: cfg.hipDY, footLine: FOOT, spriteSize: SPRITE },
      speed: cfg.speed, yScale: cfg.yScale,
      stairs: stairRegions(),
      occluders: S.occs.map((o) => ({ id: o.id, baseline: o.baseline })),
      authoring: { minutes: +((Date.now() - S.t0) / 60000).toFixed(1), ops: S.ops, strokes: S.strokes },
    };
  }
  function dl(url, name) {
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  }
  async function importLevels(image) {
    const c = mk(image.naturalWidth, image.naturalHeight), g = c.getContext('2d');
    g.drawImage(image, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    snap();
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
      const sx = Math.floor(x * c.width / S.W), sy = Math.floor(y * c.height / S.H);
      lvl[idx(x, y)] = d[(sy * c.width + sx) * 4];
    }
    dirtyMask = true;
  }

  // ---- scripting surface (measurement + automation; the UI is the same path)
  window.__md = {
    ready: false, S, get lvl() { return lvl; }, get occ() { return occ; }, get hits() { return hits; }, W, cfg,
    lvlAt, canStand, canStandFrom,
    setValue: (v) => { S.value = v; syncPal(); },
    setTool, setZoom, closePoly, undo,
    poly: (pts, v) => { snap(); fillPoly(pts.map((p) => [p[0] + 0.5, p[1] + 0.5]), v, 'lvl'); S.ops++; dirtyMask = true; },
    occPoly: (pts, baseline) => {
      snap(); const id = S.occNext++;
      fillPoly(pts.map((p) => [p[0] + 0.5, p[1] + 0.5]), id, 'occ');
      S.occs.push({ id, baseline, name: 'occ' + id }); renderOccList(); plates = null; dirtyMask = true; return id;
    },
    brushLine: (x0, y0, x1, y1, v, size) => {
      snap(); const b = S.brush; S.brush = size || S.brush;
      line(x0, y0, x1, y1, (x, y) => stamp(x, y, v)); S.brush = b; S.strokes++; S.ops++; dirtyMask = true;
    },
    bucket: (x, y, v) => { snap(); bucket(x, y, v); S.ops++; dirtyMask = true; },
    rect: (a, b, c, d, v) => { snap(); fillRect(a, b, c, d, v); S.ops++; dirtyMask = true; },
    warp: (x, y) => { W.x = x; W.y = y; return canStand(x, y); },
    spawnAt: (x, y) => { S.spawn = [x, y]; },
    press: (k, on) => { keys[k] = !!on; },
    walkOn: (v) => { if (!!v !== S.walk) toggleWalk(); },
    tick: (dt) => stepWalk(dt),
    clearHits: () => { hits.fill(0); dirtyMask = true; },
    heal: (tol) => { snap(); return healSeams(tol); },
    check: (x, y) => checkReach(x, y),
    levelsPNG, occPNG, specJSON,
    stats: () => statLine(),
    scrollTo: (x, y) => { stage.scrollLeft = x * S.Z - stage.clientWidth / 2; stage.scrollTop = y * S.Z - stage.clientHeight / 2; },
  };

  boot();
})();
