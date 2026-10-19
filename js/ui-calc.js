/* =====================================================================
   ui-calc.js — Pestaña "Calculadora": controles y vista de resultados
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const E = G.engine, U = G.u, S = G.S, { $, esc, fmt } = U;
  const C = (G.calc = {});
  const st = { mode: 'rate', prob: 'avg', choice: {}, forceRaw: new Set() };
  C.state = st;

  /* ---------- Controles ---------- */
  C.setMode = m => {
    st.mode = m;
    $('m-rate').classList.toggle('on', m === 'rate'); $('m-total').classList.toggle('on', m === 'total');
    $('rate-box').classList.toggle('hidden', m !== 'rate'); $('total-box').classList.toggle('hidden', m !== 'total');
    C.run();
  };
  C.setProb = p => {
    st.prob = p; st.choice = {};
    $('p-avg').classList.toggle('on', p === 'avg'); $('p-guaranteed').classList.toggle('on', p === 'guaranteed');
    C.fill(); C.run();
  };
  C.setChoice = (id, rid) => { st.choice[id] = rid; C.run(); };
  C.toggleRaw = (id, on) => { on ? st.forceRaw.add(id) : st.forceRaw.delete(id); C.run(); };

  C.fill = function () {
    const db = S.db, sel = $('c-item');
    const cur = sel.value || S.sel;
    const list = db.items.filter(i => E.usable(db, i.id, st.prob).length).sort((a, b) => a.name.localeCompare(b.name));
    const groups = {};
    list.forEach(i => (groups[i.category || ''] ||= []).push(i));
    sel.innerHTML = Object.keys(groups).sort().map(c => `<optgroup label="${esc(c || 'Sin categoría')}">${groups[c].map(i =>
      `<option value="${i.id}" ${i.id === cur ? 'selected' : ''}>${U.isFluid(i) ? '💧 ' : ''}${esc(i.name)} (${U.unitOf(i)})</option>`).join('')}</optgroup>`).join('')
      || '<option value="">(no hay objetos con receta)</option>';
  };

  /* ---------- Cálculo y render ---------- */
  C.run = function () {
    const db = S.db, out = $('results'), target = $('c-item').value, qty = +$('c-qty').value || 0;
    const tIt = U.item(target);
    if (!tIt) { out.innerHTML = '<div class="panel empty">Crea objetos con recetas en la Base de Datos.</div>'; return; }
    $('c-qty-l').textContent = `Cantidad (${U.unitOf(tIt)})`;

    const total = st.mode === 'total';
    const T = total ? (+$('c-T').value || 0) * +$('c-Tu').value : 0;
    if (total && T <= 0) { out.innerHTML = '<div class="panel note rd">Indica un plazo mayor que 0.</div>'; return; }
    const per = +$('c-per').value;
    const rate = total ? qty / T : qty / per;
    const perMul = total ? T : per;                                  // segundos del periodo mostrado
    const sfx = total ? '' : ({ 1: '/s', 60: '/min', 3600: '/h' }[per]);
    const res = E.solve(db, target, rate, { mode: st.prob, choice: st.choice, forceRaw: st.forceRaw, horizon: perMul, total });
    const { tree, raw, steps, byproducts, demand, totals } = res;
    const guar = st.prob === 'guaranteed';

    // nodos recorridos: alternativas de receta y objetos sin receta garantizada
    const noG = new Set(), alts = new Map();
    (function visit(n) {
      if (n.noGuarantee) noG.add(n.it.id);
      if (!n.raw) { if (E.usable(db, n.it.id, st.prob).length > 1) alts.set(n.it.id, n.rec.id); n.children.forEach(visit); }
    })(tree);

    /* --- tarjetas resumen --- */
    const stat = (ico, bg, label, val, sub) => `<div class="panel stat"><span class="ico" style="background:${bg}">${ico}</span><div><div class="small muted">${label}</div><div class="v">${val}</div><div class="s">${sub}</div></div></div>`;
    const rawE = Object.entries(raw);
    const sumRaw = f => rawE.filter(([id]) => f(U.item(id))).reduce((a, [, r]) => a + r, 0) * perMul;
    const rawSub = [sumRaw(i => !U.isFluid(i)) ? fmt(sumRaw(i => !U.isFluid(i))) + ' u' : '', sumRaw(U.isFluid) ? fmt(sumRaw(U.isFluid)) + ' mB' : ''].filter(Boolean).join(' + ');
    const periodLbl = total ? 'en el plazo' : ({ 1: 'por segundo', 60: 'por minuto', 3600: 'por hora' }[per]);

    const statsHtml = [
      stat('💎', '#fef3c7', 'Materias primas', rawE.length + ' tipos', rawSub + (sfx ? ' ' + sfx : '')),
      stat('⚡', '#fef9c3', 'Energía', U.fmtBig(totals.eut, 'EU/t'), `${U.fmtBig(totals.euTotal, 'EU')} ${periodLbl}`),
      stat('⏱', '#e0f2fe', total ? 'Tiempo (ruta crítica)' : 'Latencia de la cadena', fmt(totals.critical) + ' s', total ? `≈ ${fmt(totals.critical / 60)} min con las máquinas indicadas` : 'hasta la primera unidad'),
      stat('🏗️', '#e0e7ff', 'Máquinas en paralelo', totals.machines, steps.length + ' recetas distintas'),
      stat('🔥', '#fee2e2', 'Requisitos', totals.maxHeat ? fmt(totals.maxHeat, 0) + ' K' : 'Sin calor', totals.maxTier ? `Tier máx. ${totals.maxTier} (${fmt(totals.maxPower)} EU/t)` : 'Sin consumo eléctrico'),
    ].join('');

    /* --- materias primas --- */
    const rawRows = rawE.sort((a, b) => b[1] - a[1]).map(([id, r]) => {
      const it = U.item(id) || { name: '(sin asignar)' };
      const v = total ? Math.ceil(r * T - 1e-9) : r * perMul;
      return `<tr><td><span class="row">${U.itemIcon(it, 'xs')}<span>${esc(it.name)}</span>${noG.has(id) ? U.badge('b-warn', '🎲 sin receta garantizada') : ''}</span></td>
        <td class="r b ${U.isFluid(it) ? 'fluid-txt' : ''}">${U.fmtQ(it, v)}</td>
        <td class="r muted small">${U.fmtQ(it, total ? r * 60 : r * 3600, total ? '/min' : '/h')}</td></tr>`;
    }).join('');

    /* --- subproductos --- */
    const byRows = byproducts.sort((a, b) => b.avg - a.avg).map(b => {
      const it = U.item(b.id) || { name: '?' }, dem = demand[b.id] || 0, got = guar ? b.guar : b.avg;
      const cover = dem > 0 ? `<div class="tiny">${U.badge('b-ok', `cubre ${fmt(Math.min(999, got / dem * 100), 0)}% de lo que la cadena consume`)}</div>` : '';
      return `<tr><td><span class="row">${U.itemIcon(it, 'xs')}<span>${esc(it.name)}</span></span>${cover}</td>
        <td class="r ${guar ? 'b' : 'muted'}">${U.fmtQ(it, b.guar * perMul)}</td>
        <td class="r ${guar ? 'muted' : 'b'}">${U.fmtQ(it, b.avg * perMul)}</td></tr>`;
    }).join('');

    /* --- alternativas --- */
    const altHtml = [...alts].map(([id, cur]) => {
      const opts = E.usable(db, id, st.prob).map(r => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${esc(U.mach(r.machine)?.name || 'Manual')} · ${U.ioText(r.inputs)} → ${U.ioText(r.outputs)}</option>`).join('');
      return `<div class="f"><label>${esc(U.item(id).name)}</label><select class="inp sm" onchange="GT.calc.setChoice('${id}',this.value)">${opts}</select></div>`;
    }).join('');

    /* --- pasos --- */
    const stepRows = steps.map(s => {
      const r = s.rec, mains = [...s.mains].map(U.item), m = U.mach(r.machine);
      return `<tr><td><div class="row">${U.itemIcon(mains[0], 'xs')}<b>${mains.map(i => esc(i.name)).join(', ')}</b></div>
          <div class="tiny muted">${U.ioText(r.outputs)}</div></td>
        <td>${U.machBadge(m)}</td>
        <td><div class="chips">${U.energyBadge(r.power)}${U.tierBadge(r)}${U.heatBadge(r)}</div></td>
        <td class="r">${fmt(s.cps, 3)}</td>
        <td class="r"><b>${s.n}</b> <span class="faint tiny">(${fmt(s.m)})</span></td>
        <td class="r nowrap" title="${fmt(r.power)} EU/t × ${fmt(s.ticks, 1)} ticks × ${fmt(s.runs, 2)} ejecuciones">${U.fmtBig(s.euTotal, 'EU')}<div class="tiny muted">${U.fmtBig(s.euPerRun, 'EU')}/ejec.</div></td></tr>`;
    }).join('');

    /* --- árbol --- */
    const node = n => {
      const it = n.it, cls = U.isFluid(it) ? 'fluid-txt' : 'muted';
      const head = `${U.itemIcon(it, 'xs')}<b class="${U.isFluid(it) ? 'fluid-txt' : ''}">${esc(it.name)}</b><span class="${cls}">${U.fmtQ(it, n.r * perMul, sfx)}</span>`;
      if (n.raw) {
        const can = E.producers(db, it.id).length && st.forceRaw.has(it.id);
        return `<li><div class="nd">${head}${U.badge('b-raw', 'básico')}${can ? `<button class="btn-link small" onclick="GT.calc.toggleRaw('${it.id}',false)">expandir</button>` : ''}</div></li>`;
      }
      return `<li><div class="nd">${head}${U.machBadge(U.mach(n.rec.machine))}${U.energyBadge(n.rec.power)}${U.tierBadge(n.rec)}${U.heatBadge(n.rec)}
        <span class="badge b-cat">× ${fmt(n.cps * E.secs(n.rec))}</span>
        ${it.id !== target ? `<button class="btn-link small faint" onclick="GT.calc.toggleRaw('${it.id}',true)">tratar como básico</button>` : ''}</div>
        <ul>${n.children.map(node).join('')}</ul></li>`;
    };

    const unitNote = x => `<th class="r">${x}</th>`;
    out.innerHTML = `
      <div class="panel target">${U.itemIcon(tIt, 'lg')}
        <div><div class="small muted">Objetivo</div><div class="b" style="font-size:17px">${esc(tIt.name)} <span class="${U.isFluid(tIt) ? 'fluid-txt' : 'item-txt'}">${U.fmtQ(tIt, qty, sfx)}</span></div></div>
        <div class="chips">${U.typeBadge(tIt)}${U.catBadge(tIt.category)}${guar ? U.badge('b-ok', '🔒 Modo garantizado') : U.badge('b-tier', '🎲 Modo promedio')}</div></div>
      ${res.cycle ? '<div class="note rd" style="margin-bottom:12px">⚠ Receta cíclica detectada; el ciclo se cortó tratando el objeto repetido como materia prima.</div>' : ''}
      ${noG.size ? '<div class="note rd" style="margin-bottom:12px">🎲 Modo garantizado: algunos objetos solo salen con probabilidad &lt; 1, así que se tratan como suministro externo.</div>' : ''}
      <div class="stats">${statsHtml}</div>
      <div class="res-grid">
        <div class="stack">
          <div class="panel"><h2>💎 Materia prima básica</h2><div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th>Recurso</th>${unitNote(total ? 'Total' : 'Cantidad ' + sfx)}${unitNote(total ? '/min' : 'por hora')}</tr></thead><tbody>${rawRows}</tbody></table></div></div>
          <div class="panel"><h2>♻️ Subproductos generados</h2>${byRows ? `<div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th>Subproducto</th>${unitNote('Garantizado')}${unitNote('Esperado (prob.)')}</tr></thead><tbody>${byRows}</tbody></table></div>
            <p class="tiny muted" style="margin-top:6px">${total ? 'Total en el plazo.' : 'Cantidad ' + periodLbl + '.'} «Garantizado» solo cuenta salidas con 100 %.</p>` : '<p class="muted small">Esta cadena no genera subproductos.</p>'}</div>
          ${altHtml ? `<div class="panel"><h2>🔀 Recetas alternativas</h2><div class="stack">${altHtml}</div></div>` : ''}
        </div>
        <div class="stack">
          <div class="panel"><h2>🏭 Pasos de producción</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receta</th><th>Máquina</th><th>Requisitos</th><th class="r">Crafteos/s</th><th class="r">Máquinas</th><th class="r">Energía ${total ? '(total)' : periodLbl}</th></tr></thead><tbody>${stepRows}</tbody></table></div>
            <p class="tiny muted" style="margin-top:6px">Total EU = Power (EU/t) × Ticks × Ejecuciones.</p></div>
          <div class="panel tree c3"><h2>🌳 Árbol de crafteo</h2><ul>${node(tree)}</ul></div>
        </div>
      </div>`;
  };
})();
