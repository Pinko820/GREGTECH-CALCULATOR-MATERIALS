/* =====================================================================
   ui-common.js — Estado compartido, formato, badges e íconos
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const U = (G.u = {});
  const E = G.engine;

  // Estado global de la app
  G.S = { db: null, sel: null, fType: 'all', fCat: 'all' };

  U.$ = id => document.getElementById(id);
  U.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.fmt = (n, d = 2) => (+n || 0).toLocaleString('es', { maximumFractionDigits: d });
  U.save = () => G.data.save(G.S.db);
  U.item = id => G.S.db.items.find(i => i.id === id);
  U.mach = id => G.S.db.machines.find(m => m.id === id);
  U.rec = id => G.S.db.recipes.find(r => r.id === id);
  U.isFluid = it => it?.type === 'fluid';
  U.unitOf = it => (U.isFluid(it) ? 'mB' : 'u');
  U.allCats = () => {
    const s = new Set(G.data.PRESET_CATS);
    G.S.db.items.forEach(i => i.category && s.add(i.category));
    G.S.db.machines.forEach(m => m.category && s.add(m.category));
    return [...s];
  };

  /** Cantidad con su unidad; los fluidos ≥ 1000 mB muestran también cubos (B). */
  U.fmtQ = (it, n, sfx = '') => {
    let s = `${U.fmt(n, Math.abs(n) < 1 ? 4 : 2)} ${U.unitOf(it)}${sfx}`;
    if (U.isFluid(it) && Math.abs(n) >= 1000) s += ` · ${U.fmt(n / 1000)} B${sfx}`;
    return s;
  };
  /** Números grandes de energía: 7,34 M EU */
  U.fmtBig = (n, unit = '') => {
    const a = Math.abs(n), u = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']].find(([v]) => a >= v);
    return (u ? U.fmt(n / u[0], 2) + ' ' + u[1] : U.fmt(n, 2) + ' ') + unit;
  };

  /* ---------- Badges ---------- */
  U.badge = (cls, html, title = '') => `<span class="badge ${cls}"${title ? ` title="${U.esc(title)}"` : ''}>${html}</span>`;
  U.typeBadge = it => (U.isFluid(it) ? U.badge('b-fluid', '💧 Fluido · mB') : U.badge('b-item', '⚙️ Item · u'));
  U.catBadge = c => (c ? U.badge('b-cat', U.esc(c)) : '');
  U.energyBadge = (eut, label = 'EU/t') => U.badge('b-energy', `⚡ ${U.fmt(eut)} ${label}`);
  U.tierBadge = r => { const t = E.recTier(r); return t ? U.badge('b-tier', t, 'Tier de voltaje') : ''; };
  U.heatBadge = r => (r.heat_capacity ? U.badge('b-heat', `🔥 ${U.esc(r.heat_capacity)}`, 'Heat capacity requerida') : '');
  U.machBadge = m => (m ? U.badge('b-mach', `🏗️ ${U.esc(m.name)}`) : U.badge('b-cat', '✋ Manual'));
  U.chanceBadge = c => (c < 1 ? U.badge('b-warn', `🎲 ${U.fmt(c * 100, 1)}%`, 'Probabilidad de salida') : '');

  /* ---------- Íconos: imagen personalizada con respaldo a emoji ---------- */
  U.iconBox = (o, kind, emoji, cls = '') => {
    const img = o?.icon ? `<img src="${U.esc(o.icon)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    return `<span class="ico i-${kind} ${cls}">${emoji}${img}</span>`;
  };
  U.itemIcon = (it, cls = '') => (U.isFluid(it) ? U.iconBox(it, 'fluid', '💧', cls) : U.iconBox(it, 'item', '⚙️', cls));
  U.machIcon = (m, cls = '') => U.iconBox(m, 'mach', '🏗️', cls);

  /** Etiqueta "2 u Iron Dust · 144 mB Molten Redstone" */
  U.ioText = list => list.map(x => `${U.fmt(x.qty, 3)} ${U.unitOf(U.item(x.item))} ${U.esc(U.item(x.item)?.name || '?')}${x.chance != null && x.chance < 1 ? ` (${U.fmt(x.chance * 100, 1)}%)` : ''}`).join(' + ');
})();
