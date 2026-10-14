'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const IMG = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const LS_KEY = 'usbreader.progress.v1';
  const app = $('#app');
  const canPick = 'showDirectoryPicker' in window;

  // ---------- library index ----------
  let LIB = window.LIBRARY || { series: [] };
  let byId;
  const indexLib = () => { byId = new Map(LIB.series.map(s => [s.id, s])); };
  indexLib();
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  const pageSrc = (s, c, pg) => `manga/${encodeURIComponent(s.id)}/${c.id === '.' ? '' : encPath(c.id) + '/'}${encodeURIComponent(pg)}`;
  const coverSrc = s => s.cover ? `manga/${encodeURIComponent(s.id)}/${encodeURIComponent(s.cover)}` : pageSrc(s, s.chapters[0], s.chapters[0].pages[0]);
  const chTitle = (s, c) => c.id === '.' ? s.title : c.id.replace(/\//g, ' / ');
  const readCount = (s, p) => { const r = new Set(p.read); return s.chapters.filter(c => r.has(c.id)).length; };

  // ---------- progress ----------
  // Sources: data/progress.js (loaded by START.html) and this browser's localStorage. Newest t wins per series.
  function merge(...srcs) {
    const out = { version: 1, resume: null, series: {} };
    for (const src of srcs) {
      if (!src || typeof src !== 'object') continue;
      for (const [k, v] of Object.entries(src.series || {})) if (v && (!out.series[k] || v.t > out.series[k].t)) out.series[k] = v;
      if (src.resume && (!out.resume || src.resume.t > out.resume.t)) out.resume = src.resume;
    }
    return out;
  }
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } };
  let P = merge(window.PROGRESS, loadLocal());

  const DEF = { t: 0, chapter: null, page: 0, frac: 0, read: [], fav: false, dir: null, spreads: true, shift: 0, fit: 'width' };
  const sp = id => ({ ...DEF, ...P.series[id] });
  function setSp(id, patch) { P.series[id] = { ...sp(id), ...patch, t: Date.now() }; save(); }
  function setResume(id) {
    if ((P.resume?.series ?? null) === id) return;
    P.resume = { series: id, t: Date.now() };
    save();
  }

  let saveTimer = 0;
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(P)); } catch {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveUsb, 2000);
  }

  // ---------- USB access (File System Access API) ----------
  let root = null, backedUp = false, usb = canPick ? 'off' : 'none', saving = Promise.resolve(), quietBoss = false;

  async function writeText(dir, name, text) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
  const saveUsb = () => (saving = saving.then(async () => {
    if (!root) return;
    try {
      const data = await root.getDirectoryHandle('data', { create: true });
      if (!backedUp) {
        backedUp = true;
        try { await writeText(data, 'progress.bak.js', await (await (await data.getFileHandle('progress.js')).getFile()).text()); } catch {}
      }
      await writeText(data, 'progress.js', 'window.PROGRESS = ' + JSON.stringify(P) + ';\n');
      usbState('saved');
    } catch (e) { usbState('error', e); }
  }));

  function usbState(st, err) {
    if (st === 'error' && usb !== 'error') toast(`Not saving to USB (${err?.message || 'unknown error'}). Progress is still kept in this browser. Reconnect from the library.`, 8000);
    usb = st;
    paintUsb();
  }
  function paintUsb() {
    const b = $('#usbBtn');
    if (!b) return;
    b.textContent = { off: 'Connect USB', connected: 'USB connected', saved: 'USB ✓ saved', error: 'USB ⚠ not saving', none: 'USB saving unavailable' }[usb];
    b.className = usb === 'error' ? 'error' : '';
    b.title = usb === 'none' ? 'This browser has no folder picker. Use Export/Import.' : 'Save progress to data\\progress.js on the USB';
  }

  // IndexedDB just remembers the USB folder handle on this computer.
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      const r = indexedDB.open('usbreader', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', mode), q = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res(q.result);
        tx.onerror = () => rej(tx.error);
      };
    });
  }
  const idbGet = k => idb('readonly', s => s.get(k));
  const idbSet = (k, v) => idb('readwrite', s => s.put(v, k));
  const idbDel = k => idb('readwrite', s => s.delete(k));
  const isUsbRoot = async h => { try { await h.getFileHandle('START.html'); return true; } catch { return false; } };
  function useRoot(h) { root = h; usbState('connected'); saveUsb(); }

  async function connect() {
    if (!canPick) return toast('This browser can\'t save to the USB. Use Export/Import instead.', 6000);
    let h = null;
    try { h = await idbGet('root'); } catch {}
    if (h) {
      try { if (await h.requestPermission({ mode: 'readwrite' }) === 'granted' && await isUsbRoot(h)) return useRoot(h); } catch {}
      try { await idbDel('root'); } catch {}
    }
    quietBoss = true;
    try {
      h = await showDirectoryPicker({ id: 'usbreader', mode: 'readwrite' });
    } catch (e) {
      if (e.name !== 'AbortError') toast(`Couldn't open the folder picker (${e.name}). Click Connect USB again. If it keeps failing, it's blocked here: use Export/Import.`, 9000);
      return;
    } finally { quietBoss = false; }
    if (!await isUsbRoot(h)) return toast('Pick the folder that contains START.html (the "Notes" folder on the USB).', 7000);
    try { await idbSet('root', h); } catch {}
    useRoot(h);
  }
  // Silent reconnect when this browser still remembers permission.
  (async () => {
    try {
      const h = canPick && await idbGet('root');
      if (h && await h.queryPermission({ mode: 'readwrite' }) === 'granted' && await isUsbRoot(h)) useRoot(h);
    } catch {}
  })();

  function parseInfo(s, text) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(title|direction)\s*:\s*(.+?)\s*$/i);
      if (!m) continue;
      if (m[1].toLowerCase() === 'title') s.title = m[2];
      else if (/^(ltr|rtl)$/i.test(m[2])) s.direction = m[2].toLowerCase();
    }
  }

  // Same rules as app/rebuild.ps1, minus CBZ unpacking.
  async function rescan() {
    if (!root) return toast('Connect USB first, or run REBUILD-LIBRARY.bat at home.', 6000);
    toast('Scanning manga folder…', 60000);
    try {
      const manga = await root.getDirectoryHandle('manga');
      const series = [];
      let cbz = 0;
      for await (const [name, h] of manga.entries()) {
        if (name.startsWith('.')) continue;
        if (h.kind === 'file') { if (/\.(cbz|zip|pdf)$/i.test(name)) cbz++; continue; }
        const s = { id: name, title: name, direction: 'rtl', cover: '', added: byId.get(name)?.added || Date.now(), chapters: [] };
        const walk = async (dir, rel) => {
          const pages = [], subs = [];
          for await (const [n, e] of dir.entries()) {
            if (n.startsWith('.')) continue;
            if (e.kind === 'directory') subs.push([n, e]);
            else if (/\.(cbz|zip|pdf)$/i.test(n)) cbz++;
            else if (!rel && /^info\.txt$/i.test(n)) parseInfo(s, await (await e.getFile()).text());
            else if (IMG.test(n)) { if (!rel && /^cover\./i.test(n)) s.cover = n; else pages.push(n); }
          }
          if (pages.length) s.chapters.push({ id: rel || '.', pages: pages.sort(coll.compare) });
          for (const [n, e] of subs) await walk(e, rel ? rel + '/' + n : n);
        };
        await walk(h, '');
        s.chapters.sort((a, b) => a.id === '.' ? -1 : b.id === '.' ? 1 : coll.compare(a.id, b.id));
        if (s.chapters.length) series.push(s);
      }
      series.sort((a, b) => coll.compare(a.id, b.id));
      LIB = { generated: new Date().toISOString(), series };
      indexLib();
      await writeText(await root.getDirectoryHandle('data', { create: true }), 'library.js', 'window.LIBRARY = ' + JSON.stringify(LIB) + ';\n');
      toast(`Found ${series.length} series.` + (cbz ? ` Skipped ${cbz} .cbz/.zip/.pdf file(s): run REBUILD-LIBRARY.bat at home to convert them.` : ''), 8000);
      route();
    } catch (e) { toast('Rescan failed: ' + e.message, 8000); }
  }

  function exportProgress() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['window.PROGRESS = ' + JSON.stringify(P) + ';\n'], { type: 'text/javascript' }));
    a.download = 'progress.js';
    quietBoss = true;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); quietBoss = false; }, 3000);
    toast('Saved progress.js to Downloads. Copy it into the USB "data" folder and replace the old one.', 9000);
  }
  function importProgress() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.js,.json';
    quietBoss = true;
    inp.oncancel = () => { quietBoss = false; };
    inp.onchange = async () => {
      quietBoss = false;
      try {
        const txt = await inp.files[0].text();
        const obj = JSON.parse(txt.replace(/^﻿?\s*window\.PROGRESS\s*=\s*/, '').replace(/;\s*$/, ''));
        if (!obj || typeof obj.series !== 'object') throw Error('not a progress file');
        P = merge(P, obj);
        save();
        route();
        toast('Progress imported and merged.');
      } catch (e) { toast('Import failed: ' + e.message, 7000); }
    };
    inp.click();
  }

  // ---------- small UI bits ----------
  let toastT = 0;
  function toast(msg, ms = 4000) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, ms);
  }

  function toggleHelp(show = !$('#helpbox')) {
    $('#helpbox')?.remove();
    if (!show) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="helpbox"><div>
      <h3>Reader</h3><table>
      <tr><td>Wheel, <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>Space</kbd>, <kbd>PgUp</kbd> <kbd>PgDn</kbd></td><td>Scroll</td></tr>
      <tr><td>Click top / bottom third</td><td>Scroll one screen up / down</td></tr>
      <tr><td>Click middle</td><td>Show / hide the top bar</td></tr>
      <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next page (follows reading direction)</td></tr>
      <tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Previous / next chapter or volume</td></tr>
      <tr><td><kbd>2</kbd></td><td>Spreads on / off</td></tr>
      <tr><td><kbd>O</kbd></td><td>Offset spread pairs by one</td></tr>
      <tr><td><kbd>F</kbd></td><td>Fullscreen</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Back</td></tr>
      <tr><td>Ctrl + wheel</td><td>Zoom</td></tr></table>
      <h3>Anywhere</h3><table>
      <tr><td><kbd>\`</kbd></td><td>Hide screen instantly (press again to come back)</td></tr>
      <tr><td><kbd>?</kbd></td><td>This help</td></tr>
      <tr><td>Right-click a chapter</td><td>Mark read / unread</td></tr></table>
      <p class="muted">Click anywhere to close.</p></div></div>`);
    $('#helpbox').onclick = () => toggleHelp(false);
  }

  let bossOn = false;
  function toggleBoss(on = !bossOn) {
    bossOn = on;
    $('#boss').hidden = !on;
    document.documentElement.classList.toggle('boss', on);
  }
  addEventListener('blur', () => { if (!quietBoss) toggleBoss(true); });

  const go = h => { if (location.hash === h) route(); else location.hash = h; };

  // ---------- library view ----------
  const libState = { q: '', sort: 'az', favs: false };
  const sorts = {
    az: (a, b) => coll.compare(a.title, b.title),
    recent: (a, b) => sp(b.id).t - sp(a.id).t || coll.compare(a.title, b.title),
    added: (a, b) => b.added - a.added || coll.compare(a.title, b.title),
  };

  function card(s, href) {
    const p = sp(s.id), total = s.chapters.length, read = readCount(s, p);
    return `<a class="card" href="${href}${encodeURIComponent(s.id)}">
      <div class="cv"><img loading="lazy" src="${esc(coverSrc(s))}" alt="" onerror="this.style.visibility='hidden'">
        ${total - read ? `<span class="badge" title="Unread chapters">${total - read}</span>` : ''}${p.fav ? '<span class="star">★</span>' : ''}</div>
      <div class="ttl">${esc(s.title)}</div>
      ${p.chapter ? `<div class="pbar"><i style="width:${read / total * 100}%"></i></div>` : ''}
    </a>`;
  }

  function showLibrary() {
    document.body.className = 'v-lib';
    const cont = LIB.series.filter(s => { const p = sp(s.id); return p.chapter && readCount(s, p) < s.chapters.length; })
      .sort(sorts.recent).slice(0, 6);
    app.innerHTML = `
      <header class="bar">
        <b class="brand">Library</b>
        <input id="q" type="search" placeholder="Search…" value="${esc(libState.q)}">
        <select id="sort">${[['az', 'A–Z'], ['recent', 'Recently read'], ['added', 'Recently added']]
          .map(([v, l]) => `<option value="${v}"${libState.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button id="favs" class="${libState.favs ? 'on' : ''}" title="Favorites only">★</button>
        <span class="grow"></span>
        <button id="usbBtn"></button>
        <button id="rescan" title="Re-read the manga folder (needs Connect USB)">Rescan</button>
        <button id="export" title="Download progress.js">Export</button>
        <button id="import" title="Load a progress.js file">Import</button>
        <button id="help" title="Keyboard shortcuts">?</button>
      </header>
      <main class="lib">
        ${cont.length ? `<h2>Continue reading</h2><div class="grid">${cont.map(s => card(s, '#/r/')).join('')}</div>` : ''}
        <h2>All series <span class="muted" id="count"></span></h2>
        <div class="grid" id="grid"></div>
      </main>`;
    paintUsb();
    renderGrid();
    $('#q').oninput = e => { libState.q = e.target.value; renderGrid(); };
    $('#sort').onchange = e => { libState.sort = e.target.value; renderGrid(); };
    app.oncontextmenu = null;
    app.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      ({
        favs: () => { libState.favs = !libState.favs; b.classList.toggle('on', libState.favs); renderGrid(); },
        usbBtn: connect, rescan, export: exportProgress, import: importProgress, help: () => toggleHelp(),
      })[b.id]?.();
    };
  }

  function renderGrid() {
    const q = libState.q.trim().toLowerCase();
    const list = LIB.series.filter(s => (!q || s.title.toLowerCase().includes(q)) && (!libState.favs || sp(s.id).fav)).sort(sorts[libState.sort]);
    $('#count').textContent = `(${list.length})`;
    $('#grid').innerHTML = list.map(s => card(s, '#/s/')).join('') || `<div class="empty">${LIB.series.length
      ? 'Nothing matches.'
      : 'No manga found. Put series folders in <b>manga\\</b>, then run <b>REBUILD-LIBRARY.bat</b> at home, or click <b>Connect USB</b> then <b>Rescan</b>.'}</div>`;
  }

  // ---------- series view ----------
  function showSeries(s) {
    document.body.className = 'v-series';
    const p = sp(s.id), rs = new Set(p.read), dir = p.dir || s.direction;
    const cur = s.chapters.find(c => c.id === p.chapter);
    const enc = encodeURIComponent(s.id);
    app.innerHTML = `
      <header class="bar"><button id="back">← Library</button><span class="grow"></span><button id="help">?</button></header>
      <main class="series">
        <div class="head">
          <img class="bigcv" src="${esc(coverSrc(s))}" alt="" onerror="this.style.visibility='hidden'">
          <div>
            <h1>${esc(s.title)}</h1>
            <div class="muted">${s.chapters.length} chapter${s.chapters.length === 1 ? '' : 's'} · ${readCount(s, p)} read</div>
            <div class="btns">
              <button id="readBtn" class="primary">${cur ? 'Continue: ' + esc(chTitle(s, cur)) : 'Start reading'}</button>
              <button id="fav" class="${p.fav ? 'on' : ''}">★ Favorite</button>
              <button id="dir" title="Reading direction">${dir === 'rtl' ? 'Right to left' : 'Left to right'}</button>
              <button id="allRead">Mark all read</button>
              <button id="allUnread">Mark all unread</button>
            </div>
          </div>
        </div>
        <ol class="chapters">${s.chapters.map((c, i) => `
          <li class="${rs.has(c.id) ? 'read' : ''}${c === cur ? ' cur' : ''}" data-i="${i}">
            <span>${esc(chTitle(s, c))}</span><span class="muted">${c.pages.length} pages${rs.has(c.id) ? ' ✓' : ''}</span></li>`).join('')}
        </ol>
        <p class="muted">Right-click a chapter to mark it read or unread.</p>
      </main>`;
    app.onclick = e => {
      const li = e.target.closest('li[data-i]');
      if (li) { setSp(s.id, { chapter: s.chapters[+li.dataset.i].id, page: 0, frac: 0 }); return go('#/r/' + enc); }
      const b = e.target.closest('button');
      if (!b) return;
      ({
        back: () => go('#/'),
        help: () => toggleHelp(),
        readBtn: () => {
          if (!cur) setSp(s.id, { chapter: (s.chapters.find(c => !rs.has(c.id)) || s.chapters[0]).id, page: 0, frac: 0 });
          go('#/r/' + enc);
        },
        fav: () => { setSp(s.id, { fav: !p.fav }); showSeries(s); },
        dir: () => { setSp(s.id, { dir: dir === 'rtl' ? 'ltr' : 'rtl' }); showSeries(s); },
        allRead: () => { setSp(s.id, { read: s.chapters.map(c => c.id) }); showSeries(s); },
        allUnread: () => { setSp(s.id, { read: [] }); showSeries(s); },
      })[b.id]?.();
    };
    app.oncontextmenu = e => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault();
      const id = s.chapters[+li.dataset.i].id;
      setSp(s.id, { read: rs.has(id) ? p.read.filter(x => x !== id) : [...p.read, id] });
      showSeries(s);
    };
  }

  // ---------- reader ----------
  let R = null, tick = 0;
  const FOCUS_Y = 0.3; // position is measured at 30% down the screen

  function showReader(s) {
    document.body.className = 'v-reader';
    setResume(s.id);
    const p = sp(s.id);
    let ci = s.chapters.findIndex(c => c.id === p.chapter);
    app.innerHTML = `
      <div id="prog"><i></i></div>
      <header class="bar rbar" id="rbar">
        <button data-k="back" title="Back (Esc)">←</button>
        <span class="rtitle"><b>${esc(s.title)}</b> <span id="chName" class="muted"></span></span>
        <span class="grow"></span>
        <button data-k="prev" title="Previous chapter ([)">Prev ch</button>
        <button data-k="next" title="Next chapter (])">Next ch</button>
        <button data-k="fit" id="fitBtn" title="Cycle fit width / height / original"></button>
        <button data-k="spreads" id="spBtn" title="Two pages side by side (2)">Spreads</button>
        <button data-k="shift" id="shBtn" title="Offset pairs by one (O)">Offset</button>
        <button data-k="dir" id="dirBtn" title="Reading direction"></button>
        <button data-k="full" title="Fullscreen (F)">Fullscreen</button>
        <button data-k="help" title="Keyboard shortcuts (?)">?</button>
      </header>
      <main id="strip" class="reader"></main>`;
    R = {
      s, first: 0, last: -1, cur: 0, y: 0, pos: null, posT: 0, barHidden: false,
      readObs: new IntersectionObserver(es => es.forEach(e => e.isIntersecting && markRead(+e.target.dataset.i))),
      moreObs: new IntersectionObserver(es => { if (es.some(e => e.isIntersecting && +e.target.dataset.i === R.last)) appendChapter(); },
        { rootMargin: '0px 0px 200% 0px' }),
    };
    const strip = $('#strip');
    strip.addEventListener('load', e => {
      const img = e.target;
      img.classList.add('ld');
      if (img.naturalWidth > img.naturalHeight) img.classList.add('wide');
      if (R.pin) scrollToImg(R.pin.img, R.pin.frac); // page sizes changed: re-apply the saved spot
    }, true);
    strip.addEventListener('error', e => e.target.classList?.add('broken'), true);
    app.oncontextmenu = null;
    app.onclick = e => {
      const b = e.target.closest('[data-k]');
      if (b) return acts[b.dataset.k]();
      if (!e.target.closest('#strip')) return;
      const y = e.clientY / innerHeight;
      if (y < 1 / 3) scrollBy({ top: -innerHeight * 0.85, behavior: 'smooth' });
      else if (y > 2 / 3) scrollBy({ top: innerHeight * 0.85, behavior: 'smooth' });
      else setBar(R.barHidden);
    };
    applyOpts();
    if (ci < 0) openChapter(0); else openChapter(ci, p.page, p.frac);
  }

  function teardownReader() {
    if (!R) return;
    flushPos();
    R.readObs.disconnect();
    R.moreObs.disconnect();
    clearTimeout(R.posT);
    R = null;
  }

  function applyOpts() {
    const p = sp(R.s.id), dir = p.dir || R.s.direction;
    $('#strip').className = `reader fit-${p.fit}${p.spreads ? ' spreads' : ''}${p.shift ? ' shift' : ''}${dir === 'rtl' ? ' rtl' : ''}`;
    $('#fitBtn').textContent = 'Fit: ' + p.fit;
    $('#spBtn').classList.toggle('on', p.spreads);
    $('#shBtn').classList.toggle('on', !!p.shift);
    $('#shBtn').hidden = !p.spreads;
    $('#dirBtn').textContent = dir === 'rtl' ? 'RTL' : 'LTR';
  }

  function openChapter(ci, page = 0, frac = 0) {
    const s = R.s, strip = $('#strip');
    R.readObs.disconnect();
    R.moreObs.disconnect();
    R.first = R.cur = ci;
    R.last = ci - 1;
    R.pin = null;
    strip.innerHTML = ci > 0 ? `<button class="prevch" data-k="prev">← Previous: ${esc(chTitle(s, s.chapters[ci - 1]))}</button>` : '';
    $('#chName').textContent = chTitle(s, s.chapters[ci]);
    appendChapter();
    const img = strip.querySelectorAll('.pg')[page];
    if (img && (page || frac)) pin(img, frac); else scrollTo(0, 0);
    R.y = scrollY;
  }

  // ponytail: chapters stay in the DOM once appended; unload old ones if very long sessions get sluggish.
  function appendChapter() {
    const s = R.s, i = R.last + 1, strip = $('#strip');
    if (i >= s.chapters.length) {
      if (!$('.caught')) strip.insertAdjacentHTML('beforeend', `<div class="caught">All caught up.<br><button data-k="back">Back to chapters</button></div>`);
      return;
    }
    const c = s.chapters[i];
    R.last = i;
    strip.insertAdjacentHTML('beforeend', `<section class="chap" data-i="${i}">
      <div class="divider">${esc(chTitle(s, c))}</div>
      <div class="pages">${c.pages.map((pg, j) => `<img class="pg" loading="lazy" decoding="async" data-j="${j}" src="${esc(pageSrc(s, c, pg))}" alt="">${j === 0 ? '<i class="brk"></i>' : ''}`).join('')}</div>
      <div class="end" data-i="${i}"></div></section>`);
    const end = strip.lastElementChild.querySelector('.end');
    R.readObs.observe(end);
    R.moreObs.observe(end);
  }

  function markRead(i) {
    const id = R.s.chapters[i].id, p = sp(R.s.id);
    if (!p.read.includes(id)) setSp(R.s.id, { read: [...p.read, id] });
  }

  function anchor() {
    const img = document.elementFromPoint(innerWidth / 2, innerHeight * FOCUS_Y)?.closest('.pg');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return r.height ? { img, frac: Math.min(1, Math.max(0, (innerHeight * FOCUS_Y - r.top) / r.height)) } : null;
  }
  function scrollToImg(img, frac) {
    scrollTo(0, img.getBoundingClientRect().top + scrollY + frac * img.offsetHeight - innerHeight * FOCUS_Y);
  }
  // Hold the view on a saved spot while images load and resize, until the reader scrolls/clicks/types.
  function pin(img, frac) {
    R.pin = { img, frac };
    scrollToImg(img, frac);
  }

  function trackPos() {
    const a = anchor();
    if (!a) return;
    const i = +a.img.closest('.chap').dataset.i, c = R.s.chapters[i], j = +a.img.dataset.j;
    $('#prog i').style.width = (j + a.frac) / c.pages.length * 100 + '%';
    if (R.cur !== i) { R.cur = i; $('#chName').textContent = chTitle(R.s, c); }
    if (R.pin) return; // still settling on the saved spot; don't overwrite it
    R.pos = { chapter: c.id, page: j, frac: +a.frac.toFixed(3) };
    clearTimeout(R.posT);
    R.posT = setTimeout(flushPos, 400);
  }
  function flushPos() {
    if (!R?.pos) return;
    const pos = R.pos;
    R.pos = null;
    setSp(R.s.id, pos);
  }

  function setBar(show) {
    R.barHidden = !show;
    $('#rbar').classList.toggle('hide', !show);
  }

  function opt(patch) {
    const a = anchor();
    setSp(R.s.id, patch);
    applyOpts();
    if (a) pin(a.img, a.frac);
  }

  function jump(d) {
    flushPos();
    const i = R.cur + d;
    if (i < 0) return toast('This is the first chapter.');
    if (i >= R.s.chapters.length) return toast('All caught up. No more chapters.');
    setSp(R.s.id, { chapter: R.s.chapters[i].id, page: 0, frac: 0 });
    openChapter(i);
  }

  // Move one page (or one spread row) and put its top at the top of the screen.
  function step(d) {
    const a = anchor();
    if (!a) return;
    const imgs = [...document.querySelectorAll('#strip .pg')], k = imgs.indexOf(a.img);
    const top = a.img.getBoundingClientRect().top;
    let t;
    if (d > 0) t = imgs.slice(k + 1).find(i => i.getBoundingClientRect().top > top + 5);
    else if (top < -5) t = a.img; // partway into this page: back to its top first
    else t = imgs.slice(0, k).reverse().find(i => i.getBoundingClientRect().top < top - 5);
    if (t) scrollTo(0, t.getBoundingClientRect().top + scrollY);
    else if (d > 0) scrollTo(0, document.documentElement.scrollHeight);
  }

  const acts = {
    back: () => go('#/s/' + encodeURIComponent(R.s.id)),
    prev: () => jump(-1),
    next: () => jump(1),
    pagePrev: () => step(-1),
    pageNext: () => step(1),
    fit: () => opt({ fit: { width: 'height', height: 'original', original: 'width' }[sp(R.s.id).fit] || 'width' }),
    spreads: () => opt({ spreads: !sp(R.s.id).spreads }),
    shift: () => opt({ shift: sp(R.s.id).shift ? 0 : 1 }),
    dir: () => opt({ dir: (sp(R.s.id).dir || R.s.direction) === 'rtl' ? 'ltr' : 'rtl' }),
    full: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is blocked here.')),
    help: () => toggleHelp(),
  };

  addEventListener('scroll', () => {
    if (!R || bossOn) return;
    const y = scrollY, d = y - R.y;
    if (Math.abs(d) > 30) { setBar(d < 0 || y < 100); R.y = y; }
    if (!tick) tick = setTimeout(() => { tick = 0; if (R) trackPos(); }, 100);
  }, { passive: true });
  addEventListener('mousemove', e => { if (R && R.barHidden && e.clientY < 40) setBar(true); });
  for (const ev of ['wheel', 'keydown', 'mousedown', 'touchstart']) addEventListener(ev, () => { if (R) R.pin = null; }, { capture: true, passive: true });

  // ---------- keyboard ----------
  addEventListener('keydown', e => {
    if (e.key === '`') { e.preventDefault(); return toggleBoss(); }
    if (bossOn) return e.preventDefault();
    if (e.target.matches?.('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') return toggleHelp();
    if ($('#helpbox') && e.key === 'Escape') return toggleHelp(false);
    const k = e.key.toLowerCase();
    if (R) {
      const rtl = (sp(R.s.id).dir || R.s.direction) === 'rtl';
      const a = { '[': 'prev', ']': 'next', arrowleft: rtl ? 'pageNext' : 'pagePrev', arrowright: rtl ? 'pagePrev' : 'pageNext', 2: 'spreads', o: 'shift', f: 'full', escape: 'back' }[k];
      if (a) { e.preventDefault(); acts[a](); }
    } else if (k === 'escape' && location.hash.startsWith('#/s/')) go('#/');
  });
  // Keep Space scrolling the page instead of re-pressing the last clicked button.
  addEventListener('click', e => e.target.closest?.('button')?.blur());

  addEventListener('pagehide', () => { flushPos(); saveUsb(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushPos(); clearTimeout(saveTimer); saveUsb(); } });

  // ---------- routing: #/  #/s/<id>  #/r/<id> ----------
  function route() {
    const [, view, id] = location.hash.match(/^#\/([sr])\/(.+)$/) || [];
    const s = id && byId.get(decodeURIComponent(id));
    teardownReader();
    toggleHelp(false);
    if (view === 'r' && s) return showReader(s);
    setResume(null);
    scrollTo(0, 0);
    if (view === 's' && s) return showSeries(s);
    showLibrary();
  }
  addEventListener('hashchange', route);
  // Chrome would otherwise restore the old pixel offset on reload, which lands on a different page
  // because unloaded pages have a placeholder height. The reader restores by page + fraction instead.
  history.scrollRestoration = 'manual';

  if (!location.hash && P.resume?.series && byId.has(P.resume.series)) history.replaceState(null, '', '#/r/' + encodeURIComponent(P.resume.series));
  route();
})();
