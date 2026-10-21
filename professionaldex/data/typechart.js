/* typechart.js — the 18 types and the Gen VI+ effectiveness chart.
   Encoded attack-wise: for each attacking type, which defenders take 2× / ½× / 0×.
   Everything else is 1×. Defensive profiles are derived from this in app.js. */
(function () {
  const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison',
    'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

  // attacker -> { x2:[...defenders], h:[...half], z:[...zero] }
  const ATK = {
    normal:   { x2: [],                                   h: ['rock','steel'],                                   z: ['ghost'] },
    fire:     { x2: ['grass','ice','bug','steel'],        h: ['fire','water','rock','dragon'],                   z: [] },
    water:    { x2: ['fire','ground','rock'],             h: ['water','grass','dragon'],                         z: [] },
    electric: { x2: ['water','flying'],                   h: ['electric','grass','dragon'],                      z: ['ground'] },
    grass:    { x2: ['water','ground','rock'],            h: ['fire','grass','poison','flying','bug','dragon','steel'], z: [] },
    ice:      { x2: ['grass','ground','flying','dragon'], h: ['fire','water','ice','steel'],                     z: [] },
    fighting: { x2: ['normal','ice','rock','dark','steel'], h: ['poison','flying','psychic','bug','fairy'],      z: ['ghost'] },
    poison:   { x2: ['grass','fairy'],                    h: ['poison','ground','rock','ghost'],                 z: ['steel'] },
    ground:   { x2: ['fire','electric','poison','rock','steel'], h: ['grass','bug'],                             z: ['flying'] },
    flying:   { x2: ['grass','fighting','bug'],           h: ['electric','rock','steel'],                        z: [] },
    psychic:  { x2: ['fighting','poison'],                h: ['psychic','steel'],                                z: ['dark'] },
    bug:      { x2: ['grass','psychic','dark'],           h: ['fire','fighting','poison','flying','ghost','steel','fairy'], z: [] },
    rock:     { x2: ['fire','ice','flying','bug'],        h: ['fighting','ground','steel'],                      z: [] },
    ghost:    { x2: ['psychic','ghost'],                  h: ['dark'],                                           z: ['normal'] },
    dragon:   { x2: ['dragon'],                           h: ['steel'],                                          z: ['fairy'] },
    dark:     { x2: ['psychic','ghost'],                  h: ['fighting','dark','fairy'],                        z: [] },
    steel:    { x2: ['ice','rock','fairy'],               h: ['fire','water','electric','steel'],                z: [] },
    fairy:    { x2: ['fighting','dragon','dark'],         h: ['fire','poison','steel'],                          z: [] },
  };

  // multiplier of one attacking type vs one defending type
  function pair(atk, def) {
    const a = ATK[atk]; if (!a) return 1;
    if (a.z.includes(def)) return 0;
    if (a.x2.includes(def)) return 2;
    if (a.h.includes(def)) return 0.5;
    return 1;
  }
  // multiplier of an attacking type vs a defender's (one or two) types
  function vs(atk, defTypes) {
    return defTypes.reduce((m, d) => m * pair(atk, d), 1);
  }
  // full defensive profile for a defender with 1–2 types
  function defense(defTypes) {
    const out = {};
    for (const atk of TYPES) out[atk] = vs(atk, defTypes);
    const by = (lo, hi) => TYPES.filter(t => out[t] > lo && out[t] <= hi);
    return {
      map: out,
      x4:   TYPES.filter(t => out[t] === 4),
      x2:   TYPES.filter(t => out[t] === 2),
      x05:  TYPES.filter(t => out[t] === 0.5),
      x025: TYPES.filter(t => out[t] === 0.25),
      x0:   TYPES.filter(t => out[t] === 0),
    };
  }

  window.TYPES = TYPES;
  window.TYPE_ATK = ATK;
  window.TC = { pair, vs, defense };
})();
