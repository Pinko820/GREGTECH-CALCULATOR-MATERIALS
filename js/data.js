/* =====================================================================
   data.js — Esquema v3, migración desde v1/v2, datos de ejemplo y almacenamiento

   ESQUEMA v3
   {
     version: 3,
     machines: [{ id, name, category, icon }],             // ya NO llevan power
     items:    [{ id, name, type:'item'|'fluid', category, icon }],
     recipes:  [{                                           // lista GLOBAL de recetas
       id, machine, time, tu:'s'|'t',
       power,            // EU/t de ESTA receta
       tier,             // 'LV','MV'... ('' = automático según power)
       heat_capacity,    // ej. "1500 K" (opcional)
       inputs:  [{ item, qty, type }],                      // items y fluidos mezclados
       outputs: [{ item, qty, type, chance }]               // chance 0..1 (default 1)
     }]
   }
   - Cantidades: items en unidades, fluidos en mB.
   - Se aceptan también `inputs_fluid` / `outputs_fluid` al importar (se fusionan
     en inputs/outputs con type:'fluid').
   ===================================================================== */
(function () {
  const G = (globalThis.GT = globalThis.GT || {});
  const D = (G.data = {});

  D.VERSION = 3;
  D.KEY = 'crafteos-db-v3';
  D.OLD_KEYS = ['crafteos-db-v2', 'crafteos-db-v1'];
  D.PRESET_CATS = ['Raw Materials', 'Fluids', 'Components', 'Machines'];
  D.uid = () => Math.random().toString(36).slice(2, 9);

  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const clamp01 = v => Math.min(1, Math.max(0, num(v, 1)));

  /** Normaliza cualquier versión anterior al esquema v3 (devuelve una copia). */
  D.normalize = function (src) {
    const d = JSON.parse(JSON.stringify(src || {}));
    const legacyPower = {};

    const machines = (d.machines || []).map(m => {
      const id = m.id || D.uid();
      legacyPower[id] = num(m.power);
      return { id, name: m.name || 'Máquina', category: m.category ?? 'Machines', icon: m.icon ?? '' };
    });

    // v1/v2: las recetas vivían dentro de cada objeto con una única salida `out`.
    const recSrc = [...(d.recipes || [])];
    const items = (d.items || []).map(i => {
      (i.recipes || []).forEach(r => recSrc.push({ ...r, _owner: i.id }));
      return { id: i.id || D.uid(), name: i.name || 'Sin nombre', type: i.type === 'fluid' ? 'fluid' : 'item', category: i.category, icon: i.icon ?? '' };
    });
    const byId = new Map(items.map(i => [i.id, i]));
    const typeOf = id => byId.get(id)?.type || 'item';

    const seen = new Set();
    const recipes = recSrc.map(r => {
      let id = r.id || D.uid();
      if (seen.has(id)) id = D.uid();
      seen.add(id);

      const rawIn = [...(r.inputs || []), ...(r.inputs_fluid || []).map(x => ({ ...x, type: 'fluid' }))];
      const inputs = rawIn.filter(x => x && x.item).map(x => ({ item: x.item, qty: num(x.qty), type: byId.has(x.item) ? typeOf(x.item) : (x.type === 'fluid' ? 'fluid' : 'item') }));

      let rawOut = [...(r.outputs || []), ...(r.outputs_fluid || []).map(x => ({ ...x, type: 'fluid' }))];
      if (!rawOut.length && r._owner) rawOut = [{ item: r._owner, qty: num(r.out, 1) }];
      const outputs = rawOut.filter(x => x && x.item).map(x => ({
        item: x.item, qty: num(x.qty, 1), chance: clamp01(x.chance ?? 1),
        type: byId.has(x.item) ? typeOf(x.item) : (x.type === 'fluid' ? 'fluid' : 'item'),
      }));

      return {
        id, machine: r.machine || '',
        time: num(r.time), tu: r.tu === 't' ? 't' : 's',
        power: r.power != null ? num(r.power) : (legacyPower[r.machine] || 0),   // migración: máquina → receta
        tier: r.tier || '',
        heat_capacity: r.heat_capacity || '',
        inputs, outputs,
      };
    });

    const produced = new Set(recipes.flatMap(r => r.outputs.map(o => o.item)));
    items.forEach(i => { if (i.category == null) i.category = i.type === 'fluid' ? 'Fluids' : (produced.has(i.id) ? 'Components' : 'Raw Materials'); });

    return { version: D.VERSION, machines, items, recipes };
  };

  /** Datos de ejemplo (ilustran fluidos, EBF con calor, subproductos con chance). */
  D.sample = function () {
    const R = (machine, time, tu, power, inputs, outputs, extra = {}) => ({ id: D.uid(), machine, time, tu, power, inputs, outputs, ...extra });
    return D.normalize({
      machines: [
        { id: 'asm', name: 'Assembler LV', category: 'Machines' },
        { id: 'ext', name: 'Fluid Extractor LV', category: 'Machines' },
        { id: 'ebf', name: 'Electric Blast Furnace', category: 'Machines' },
        { id: 'cen', name: 'Centrifuge', category: 'Machines' },
        { id: 'hand', name: 'A mano', category: 'Machines' },
      ],
      items: [
        { id: 'redstone', name: 'Redstone Dust', category: 'Raw Materials' },
        { id: 'molten_redstone', name: 'Molten Redstone', type: 'fluid', category: 'Fluids' },
        { id: 'cobble', name: 'Cobblestone', category: 'Raw Materials' },
        { id: 'gear', name: 'Small Iron Gear', category: 'Raw Materials' },
        { id: 'planks', name: 'Oak Planks', category: 'Raw Materials' },
        { id: 'piston', name: 'Piston', category: 'Components' },
        { id: 'impure_iron', name: 'Impure Iron Dust', category: 'Raw Materials' },
        { id: 'iron_dust', name: 'Iron Dust', category: 'Components' },
        { id: 'stone_dust', name: 'Stone Dust', category: 'Components' },
        { id: 'coal_dust', name: 'Coal Dust', category: 'Raw Materials' },
        { id: 'steel', name: 'Steel Ingot', category: 'Components' },
        { id: 'ash', name: 'Ash Dust', category: 'Components' },
      ],
      recipes: [
        R('ext', 1.2, 's', 30, [{ item: 'redstone', qty: 1 }], [{ item: 'molten_redstone', qty: 144 }]),
        R('asm', 10, 's', 30, [{ item: 'molten_redstone', qty: 72 }, { item: 'cobble', qty: 1 }, { item: 'gear', qty: 1 }, { item: 'planks', qty: 3 }], [{ item: 'piston', qty: 1 }]),
        R('cen', 4, 's', 30, [{ item: 'impure_iron', qty: 1 }], [{ item: 'iron_dust', qty: 1 }, { item: 'stone_dust', qty: 1, chance: 0.1 }]),
        R('ebf', 1000, 't', 120, [{ item: 'iron_dust', qty: 1 }, { item: 'coal_dust', qty: 1 }], [{ item: 'steel', qty: 1 }, { item: 'ash', qty: 1, chance: 0.64 }], { heat_capacity: '1000 K' }),
      ],
    });
  };

  /* ---------------- Almacenamiento ---------------- */
  D.load = function () {
    try {
      for (const k of [D.KEY, ...D.OLD_KEYS]) {
        const raw = localStorage.getItem(k);
        if (raw) return D.normalize(JSON.parse(raw));
      }
    } catch (e) { /* storage no disponible */ }
    return D.sample();
  };
  D.save = function (db) { try { localStorage.setItem(D.KEY, JSON.stringify(db)); } catch (e) { /* ignorar */ } };
})();
