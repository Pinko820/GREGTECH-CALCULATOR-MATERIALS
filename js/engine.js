/* =====================================================================
   engine.js — Motor de cálculo (sin DOM, probable en Node)

   Todas las tasas se expresan en la unidad propia de cada objeto por
   segundo (u/s para items, mB/s para fluidos).

   Resolución inversa con multi-salida:
     demanda r de X  →  receta que produce X con rendimiento y = Σ qty·eff(chance)
     crafteos/s      = r / y
     entrada i       = crafteos/s · qty_i           (recursivo)
     subproducto o   = crafteos/s · qty_o · eff(chance_o)

   eff(chance): modo 'avg'        → chance
                modo 'guaranteed' → 1 si chance ≥ 1, si no 0

   Energía:  Total EU = Power (EU/t) × Ticks × Ejecuciones
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const E = (G.engine = {});

  E.TIERS = [['ULV', 8], ['LV', 32], ['MV', 128], ['HV', 512], ['EV', 2048], ['IV', 8192], ['LuV', 32768], ['ZPM', 131072], ['UV', 524288], ['UHV', 2097152], ['UEV', 8388608], ['UIV', 33554432], ['UMV', 134217728], ['UXV', 536870912], ['MAX', Infinity]];
  E.tierNames = () => E.TIERS.map(t => t[0]);
  E.tierOf = p => { p = Math.abs(+p || 0); if (!p) return ''; for (const [n, max] of E.TIERS) if (p <= max) return n; return 'MAX'; };
  E.recTier = r => r.tier || E.tierOf(r.power);

  E.ticks = r => (r.tu === 't' ? +r.time : (+r.time || 0) * 20);
  E.secs = r => E.ticks(r) / 20;
  E.heatK = r => parseFloat(String(r.heat_capacity || '').replace(/[^\d.]/g, '')) || 0;
  /** Energía de una ejecución y de N ejecuciones: Power × Ticks × Runs */
  E.totalEU = (r, runs) => (+r.power || 0) * E.ticks(r) * runs;

  E.eff = (chance, mode) => (mode === 'guaranteed' ? (chance >= 1 ? 1 : 0) : chance);
  E.producers = (db, id) => db.recipes.filter(r => r.outputs.some(o => o.item === id && o.qty > 0 && o.chance > 0));
  E.yieldOf = (r, id, mode) => r.outputs.reduce((a, o) => (o.item === id ? a + o.qty * E.eff(o.chance, mode) : a), 0);

  /** Recetas utilizables para producir `id` en el modo dado (rendimiento > 0). */
  E.usable = (db, id, mode) => E.producers(db, id).filter(r => E.yieldOf(r, id, mode) > 0);

  E.pickRecipe = function (db, id, o) {
    const all = E.producers(db, id);
    if (!all.length) return { rec: null };
    const ok = all.filter(r => E.yieldOf(r, id, o.mode) > 0);
    if (!ok.length) return { rec: null, noGuarantee: true };       // solo sale con probabilidad < 1
    return { rec: ok.find(r => r.id === (o.choice || {})[id]) || ok[0] };
  };

  /**
   * solve(db, target, rate, opts)
   *  opts: { mode:'avg'|'guaranteed', choice:{itemId→recipeId}, forceRaw:Set,
   *          horizon: segundos del periodo para energía/totales, total: bool (ejecuciones enteras) }
   */
  E.solve = function (db, target, rate, o) {
    o = { mode: 'avg', choice: {}, forceRaw: new Set(), horizon: 3600, total: false, ...o };
    const items = new Map(db.items.map(i => [i.id, i]));
    const raw = {}, steps = {}, demand = {};
    let cycle = false;

    function walk(id, r, path) {
      const it = items.get(id) || { id, name: '(sin asignar)', type: 'item' };
      demand[id] = (demand[id] || 0) + r;
      const looped = path.includes(id);
      if (looped) cycle = true;
      let pick = { rec: null };
      if (id && !looped && !o.forceRaw.has(id)) pick = E.pickRecipe(db, id, o);
      const rec = pick.rec;
      if (!rec) {
        raw[id] = (raw[id] || 0) + r;
        return { it, r, raw: true, noGuarantee: !!pick.noGuarantee };
      }
      const y = E.yieldOf(rec, id, o.mode), cps = r / y;
      const st = (steps[rec.id] ||= { rec, cps: 0, mains: new Set() });
      st.cps += cps; st.mains.add(id);
      const children = rec.inputs.filter(x => x.item && x.qty > 0).map(x => walk(x.item, cps * x.qty, [...path, id]));
      return { it, r, rec, cps, y, children };
    }
    const tree = walk(target, rate, []);

    // ---- Pasos: máquinas, energía y subproductos ----
    const by = {};
    let eut = 0, euTotal = 0, machines = 0, maxHeat = 0, maxPower = 0;
    const stepList = Object.values(steps).map(st => {
      const r = st.rec, ticks = E.ticks(r), secs = ticks / 20;
      st.ticks = ticks; st.secs = secs;
      st.m = st.cps * secs;                                   // máquinas necesarias (fraccionario)
      st.n = Math.max(1, Math.ceil(st.m - 1e-9));
      st.runs = o.total ? Math.ceil(st.cps * o.horizon - 1e-9) : st.cps * o.horizon;
      st.euPerRun = E.totalEU(r, 1);
      st.eut = st.m * (+r.power || 0);                        // consumo medio continuo
      st.euTotal = E.totalEU(r, st.runs);
      st.dur = o.total ? Math.ceil(st.cps * o.horizon / st.n - 1e-9) * secs : secs;
      st.heat = E.heatK(r);
      st.tier = E.recTier(r);
      eut += st.eut; euTotal += st.euTotal; machines += st.n;
      maxHeat = Math.max(maxHeat, st.heat); maxPower = Math.max(maxPower, +r.power || 0);

      r.outputs.forEach(out => {                              // subproductos = salidas que no son la demanda
        if (!out.item || st.mains.has(out.item)) return;
        const b = (by[out.item] ||= { id: out.item, avg: 0, guar: 0 });
        b.avg += st.cps * out.qty * out.chance;
        b.guar += st.cps * out.qty * (out.chance >= 1 ? 1 : 0);
      });
      return st;
    });

    const dur = n => (n.raw ? 0 : steps[n.rec.id].dur + Math.max(0, ...n.children.map(dur)));

    return {
      tree, raw, steps: stepList, byproducts: Object.values(by), demand, cycle,
      totals: { eut, euTotal, machines, maxHeat, maxPower, maxTier: E.tierOf(maxPower), critical: dur(tree) },
    };
  };
})();
