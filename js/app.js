/* =====================================================================
   app.js — Arranque y navegación por pestañas
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const U = G.u, S = G.S, $ = U.$;

  G.showTab = function (t) {
    ['db', 'calc'].forEach(x => { $('view-' + x).classList.toggle('hidden', x !== t); $('tab-' + x).classList.toggle('on', x === t); });
    if (t === 'calc') { G.calc.fill(); G.calc.run(); } else G.dbui.render();
    try { localStorage.setItem('crafteos-tab', t); } catch (e) { /* ignorar */ }
  };

  S.db = G.data.load();
  S.sel = S.db.recipes[0]?.outputs[0]?.item || S.db.items[0]?.id;
  G.calc.setMode('rate');
  let tab = 'db';
  try { tab = localStorage.getItem('crafteos-tab') || 'db'; } catch (e) { /* ignorar */ }
  G.showTab(tab === 'calc' ? 'calc' : 'db');
})();
