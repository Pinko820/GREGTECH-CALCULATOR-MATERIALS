/* =====================================================================
   ui-db.js — Pestaña "Base de Datos": objetos, máquinas y editor de recetas
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const E = G.engine, U = G.u, S = G.S, { $, esc, fmt } = U;
  const P = (G.dbui = {});

  /* ---------- Render general ---------- */
  P.render = function () {
    $('cat-list').innerHTML = U.allCats().map(c => `<option value="${esc(c)}">`).join('');
    P.renderList(); P.renderMachines(); P.renderEditor();
  };

  function renderFilters() {
    const db = S.db, count = c => db.items.filter(i => (i.category || '') === c).length;
    const tb = (v, l) => `<button class="chip ${S.fType === v ? 'on' : ''}" onclick="GT.S.fType='${v}';GT.dbui.renderList()">${l}</button>`;
    const cb = (v, l, n) => `<button class="chip ${S.fCat === v ? 'on' : ''}" data-cat="${esc(v)}">${esc(l)}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`;
    const cats = U.allCats().filter(c => count(c) || G.data.PRESET_CATS.includes(c));
    $('filters').innerHTML = `<div class="chips">${tb('all', 'Todos')}${tb('item', '⚙️ Item')}${tb('fluid', '💧 Fluido')}</div>
      <div class="chips">${cb('all', 'Todas')}${cats.map(c => cb(c, c, count(c))).join('')}${count('') ? cb('', 'Sin categoría', count('')) : ''}</div>`;
    $('filters').querySelectorAll('[data-cat]').forEach(b => (b.onclick = () => { S.fCat = b.dataset.cat; P.renderList(); }));
  }

  P.renderList = function () {
    renderFilters();
    const q = $('search').value.toLowerCase();
    const list = S.db.items.filter(i => (S.fType === 'all' || i.type === S.fType) && (S.fCat === 'all' || (i.category || '') === S.fCat) && i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = {};
    list.forEach(i => (groups[i.category || ''] ||= []).push(i));
    const order = [...U.allCats(), ''].filter(c => groups[c]);
    $('item-list').innerHTML = order.map(c => `<div class="cat-h">${esc(c || 'Sin categoría')}</div>` + groups[c].map(i => `
      <button class="li ${i.id === S.sel ? 'on' : ''}" onclick="GT.dbui.select('${i.id}')">
        <span class="row grow" style="min-width:0">${U.itemIcon(i, 'xs')}<span class="nm">${esc(i.name)}</span></span>
        <span class="row" style="gap:3px">${U.isFluid(i) ? U.badge('b-fluid', '💧 mB') : ''}${E.producers(S.db, i.id).length ? '' : U.badge('b-raw', 'básico')}</span>
      </button>`).join('')).join('') || '<p class="muted small" style="padding:6px">Sin resultados</p>';
  };

  P.select = id => { S.sel = id; P.render(); };

  /* ---------- Máquinas (sin consumo: el consumo vive en la receta) ---------- */
  P.renderMachines = function () {
    $('machine-list').innerHTML = S.db.machines.map(m => {
      const n = S.db.recipes.filter(r => r.machine === m.id).length;
      return `<div class="mrow">
        <div class="row">${U.machIcon(m)}
          <input class="inp sm" value="${esc(m.name)}" onchange="GT.dbui.setM('${m.id}','name',this.value)">
          <button class="btn btn-ghost" title="Eliminar" onclick="GT.dbui.delMachine('${m.id}')">🗑</button></div>
        <div class="row"><input class="inp sm" list="cat-list" placeholder="Categoría" value="${esc(m.category)}" onchange="GT.dbui.setM('${m.id}','category',this.value.trim())">
          <input class="inp sm" placeholder="Ícono URL" value="${esc(m.icon)}" onchange="GT.dbui.setM('${m.id}','icon',this.value.trim())"></div>
        <div class="chips">${U.badge('b-mach', '🏗️ Máquina')}${U.catBadge(m.category)}${U.badge('b-cat', n + ' receta' + (n === 1 ? '' : 's'))}</div></div>`;
    }).join('') || '<p class="muted small">Sin máquinas</p>';
  };
  P.setM = (id, k, v) => { U.mach(id)[k] = v; U.save(); P.render(); };
  P.addMachine = () => { S.db.machines.push({ id: G.data.uid(), name: 'Nueva máquina', category: 'Machines', icon: '' }); U.save(); P.render(); };
  P.delMachine = id => {
    if (!confirm('¿Eliminar máquina? Sus recetas quedarán como "Manual".')) return;
    S.db.machines = S.db.machines.filter(m => m.id !== id);
    S.db.recipes.forEach(r => { if (r.machine === id) r.machine = ''; });
    U.save(); P.render();
  };

  /* ---------- Objetos ---------- */
  P.addItem = () => { const it = { id: G.data.uid(), name: 'Nuevo objeto', type: 'item', category: '', icon: '' }; S.db.items.push(it); S.sel = it.id; U.save(); P.render(); };
  P.delItem = () => {
    if (!confirm('¿Eliminar este objeto? Se quitará de las recetas que lo usan.')) return;
    const id = S.sel, db = S.db;
    db.items = db.items.filter(i => i.id !== id);
    db.recipes.forEach(r => { r.inputs = r.inputs.filter(x => x.item !== id); r.outputs = r.outputs.filter(x => x.item !== id); });
    db.recipes = db.recipes.filter(r => r.outputs.length);
    S.sel = db.items[0]?.id; U.save(); P.render();
  };
  P.setItem = (k, v) => {
    const it = U.item(S.sel); it[k] = v;
    if (k === 'type') S.db.recipes.forEach(r => [...r.inputs, ...r.outputs].forEach(x => { if (x.item === it.id) x.type = v; }));
    U.save(); P.render();
  };

  /* ---------- Recetas ---------- */
  P.addRecipe = () => {
    const it = U.item(S.sel);
    S.db.recipes.push({ id: G.data.uid(), machine: S.db.machines[0]?.id || '', time: 1, tu: 's', power: 0, tier: '', heat_capacity: '', inputs: [],
      outputs: [{ item: it.id, qty: U.isFluid(it) ? 144 : 1, chance: 1, type: it.type }] });
    U.save(); P.render();
  };
  P.dupRecipe = rid => { const c = JSON.parse(JSON.stringify(U.rec(rid))); c.id = G.data.uid(); S.db.recipes.push(c); U.save(); P.render(); };
  P.delRecipe = rid => { S.db.recipes = S.db.recipes.filter(r => r.id !== rid); U.save(); P.render(); };
  P.setRec = (rid, k, v, redraw = true) => { U.rec(rid)[k] = v; U.save(); if (redraw) P.renderEditor(); };
  P.setIO = (rid, list, i, k, v) => {
    const x = U.rec(rid)[list][i];
    if (k === 'chance') v = Math.min(1, Math.max(0, +v));
    x[k] = v;
    if (k === 'item') { x.type = U.item(v)?.type || 'item'; U.save(); P.render(); } else U.save();
  };
  P.addIO = (rid, list) => { U.rec(rid)[list].push(list === 'outputs' ? { item: '', qty: 1, chance: 1, type: 'item' } : { item: '', qty: 1, type: 'item' }); U.save(); P.renderEditor(); };
  P.delIO = (rid, list, i) => { U.rec(rid)[list].splice(i, 1); U.save(); P.render(); };

  function itemOpts(cur) {
    return '<option value="">— elegir —</option>' + [...S.db.items].sort((a, b) => a.name.localeCompare(b.name))
      .map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${U.isFluid(o) ? '💧 ' : ''}${esc(o.name)}${U.isFluid(o) ? ' (mB)' : ''}</option>`).join('');
  }

  function ioRows(r, list) {
    const out = list === 'outputs';
    return r[list].map((x, i) => {
      const it = U.item(x.item), h = `GT.dbui.setIO('${r.id}','${list}',${i}`;
      return `<div class="io-row">
        <input class="inp sm w-q" type="number" min="0" step="any" value="${x.qty}" title="Cantidad" onchange="${h},'qty',+this.value)">
        <span class="unit ${U.isFluid(it) ? 'u-fluid' : 'u-item'}">${it ? U.unitOf(it) : '·'}</span>
        <select class="inp sm" onchange="${h},'item',this.value)">${itemOpts(x.item)}</select>
        ${out ? `<input class="inp sm w-c" type="number" min="0" max="1" step="0.01" value="${x.chance}" title="Probabilidad 0.0 – 1.0" onchange="${h},'chance',this.value)">` : ''}
        <button class="btn btn-ghost" onclick="GT.dbui.delIO('${r.id}','${list}',${i})">✕</button></div>`;
    }).join('') || `<p class="faint tiny" style="margin-top:4px">${out ? 'Sin salidas' : 'Sin entradas'}</p>`;
  }

  function recipeCard(r, selId) {
    const f = (k, v) => `GT.dbui.setRec('${r.id}','${k}',${v})`;
    const machOpts = '<option value="">Manual (sin máquina)</option>' + S.db.machines.map(m => `<option value="${m.id}" ${m.id === r.machine ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    const tierOpts = `<option value="">Auto (${E.tierOf(r.power) || '—'})</option>` + E.tierNames().map(t => `<option ${t === r.tier ? 'selected' : ''}>${t}</option>`).join('');
    const side = r.outputs[0]?.item !== selId;
    return `<div class="rec">
      <div class="row between wrap">
        <div class="row wrap" style="gap:5px"><b>🧪 Receta</b>${side ? U.badge('b-warn', 'subproducto') : ''}${U.tierBadge(r)}${U.heatBadge(r)}${U.energyBadge(r.power)}</div>
        <div class="row" style="gap:2px"><button class="btn btn-link" onclick="GT.dbui.dupRecipe('${r.id}')">Duplicar</button><button class="btn btn-ghost" onclick="GT.dbui.delRecipe('${r.id}')">🗑</button></div>
      </div>
      <div class="f-row">
        <div class="f"><label>🏗️ Máquina</label><select class="inp sm" onchange="${f('machine', 'this.value')}">${machOpts}</select></div>
        <div class="f"><label>⏱ Tiempo</label><div class="row" style="gap:4px"><input class="inp sm" type="number" min="0" step="any" value="${r.time}" onchange="${f('time', '+this.value')}">
          <select class="inp sm" style="width:72px" onchange="${f('tu', 'this.value')}"><option value="s" ${r.tu === 's' ? 'selected' : ''}>seg</option><option value="t" ${r.tu === 't' ? 'selected' : ''}>ticks</option></select></div></div>
        <div class="f"><label>⚡ Power (EU/t)</label><input class="inp sm" type="number" min="0" step="any" value="${r.power}" onchange="${f('power', '+this.value')}"></div>
        <div class="f"><label>Tier</label><select class="inp sm" onchange="${f('tier', 'this.value')}">${tierOpts}</select></div>
        <div class="f"><label>🔥 Heat capacity</label><input class="inp sm" placeholder="ej. 1500 K" value="${esc(r.heat_capacity)}" onchange="${f('heat_capacity', 'this.value.trim()')}"></div>
      </div>
      <div class="rec-io">
        <div><div class="io-h"><span>Entradas (items + fluidos)</span></div>${ioRows(r, 'inputs')}
          <button class="btn btn-link" onclick="GT.dbui.addIO('${r.id}','inputs')">＋ Entrada</button></div>
        <div><div class="io-h"><span>Salidas</span><span class="tiny faint">cant · obj · prob.</span></div>${ioRows(r, 'outputs')}
          <button class="btn btn-link" onclick="GT.dbui.addIO('${r.id}','outputs')">＋ Salida</button></div>
      </div>
      <p class="tiny muted">Energía por ejecución: <b>${U.fmtBig(E.totalEU(r, 1), 'EU')}</b> = ${fmt(r.power)} EU/t × ${fmt(E.ticks(r), 1)} ticks</p>
    </div>`;
  }

  P.renderEditor = function () {
    const it = U.item(S.sel), box = $('editor');
    if (!it) { box.innerHTML = '<div class="empty">Selecciona o crea un objeto</div>'; return; }
    const recs = E.producers(S.db, it.id);
    const users = S.db.recipes.filter(r => r.inputs.some(x => x.item === it.id));
    const usedIn = [...new Set(users.map(r => r.outputs[0]?.item).filter(Boolean))].map(U.item).filter(Boolean);
    box.innerHTML = `
      <div class="row wrap" style="margin-bottom:10px">${U.itemIcon(it, 'lg')}
        <input class="inp grow" style="font-size:17px;font-weight:600;max-width:420px" value="${esc(it.name)}" onchange="GT.dbui.setItem('name',this.value.trim()||'Sin nombre')">
        <div class="chips">${U.typeBadge(it)}${U.catBadge(it.category)}</div>
        <span class="grow"></span><button class="btn btn-danger" onclick="GT.dbui.delItem()">🗑 Eliminar</button></div>
      <div class="f-row" style="margin-bottom:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="f"><label>Tipo</label><select class="inp" onchange="GT.dbui.setItem('type',this.value)">
          <option value="item" ${!U.isFluid(it) ? 'selected' : ''}>⚙️ Item (unidades)</option><option value="fluid" ${U.isFluid(it) ? 'selected' : ''}>💧 Fluido (mB)</option></select></div>
        <div class="f"><label>Categoría</label><input class="inp" list="cat-list" value="${esc(it.category)}" onchange="GT.dbui.setItem('category',this.value.trim())"></div>
        <div class="f" style="grid-column:span 2"><label>Ícono (URL o ruta de asset)</label><input class="inp" value="${esc(it.icon)}" placeholder="https://… o assets/hierro.png" onchange="GT.dbui.setItem('icon',this.value.trim())"></div></div>
      ${U.isFluid(it) ? '<div class="note cy" style="margin-bottom:10px">💧 Las cantidades de este objeto son en <b>mB</b> (1 B = 1000 mB), tanto al producirlo como al usarlo de ingrediente.</div>' : ''}
      ${recs.length ? '' : '<div class="note am" style="margin-bottom:10px">💎 Sin recetas que lo produzcan: se trata como <b>materia prima básica</b>.</div>'}
      <div class="recipes">${recs.map(r => recipeCard(r, it.id)).join('')}</div>
      <div style="margin-top:12px"><button class="btn dash" onclick="GT.dbui.addRecipe()">＋ Añadir receta que produce «${esc(it.name)}»</button></div>
      ${usedIn.length ? `<div style="margin-top:14px"><p class="lbl" style="margin-bottom:4px">Se usa como ingrediente para</p><div class="chips">${usedIn.map(o => `<button class="chip" onclick="GT.dbui.select('${o.id}')">${esc(o.name)}</button>`).join('')}</div></div>` : ''}`;
  };

  /* ---------- Importar / exportar ---------- */
  P.exportDb = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S.db, null, 2)], { type: 'application/json' }));
    a.download = 'crafteos.json'; a.click();
  };
  P.importDb = el => {
    const f = el.files[0]; if (!f) return;
    f.text().then(t => {
      try { const d = JSON.parse(t); if (!d.items || !d.machines) throw 0; S.db = G.data.normalize(d); S.sel = S.db.items[0]?.id; S.fType = S.fCat = 'all'; U.save(); P.render(); }
      catch (e) { alert('Archivo no válido'); }
    });
    el.value = '';
  };
  P.resetDb = () => { if (confirm('¿Reemplazar la base de datos por el ejemplo?')) { S.db = G.data.sample(); S.sel = 'piston'; S.fType = S.fCat = 'all'; U.save(); P.render(); } };
})();
