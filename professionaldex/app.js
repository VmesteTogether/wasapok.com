/* inkdex — a Kindle-paper national Pokédex.
   Local dex.json powers the list + instant typing/matchups; PokéAPI supplies
   the deep per-Pokémon data (stats, learnsets by game, locations, move pages). */
(function () {
  'use strict';
  const API = 'https://pokeapi.co/api/v2';
  const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const sprite  = id => `${SPR}/${id}.png`;
  const artwork = id => `${SPR}/other/official-artwork/${id}.png`;

  const $ = s => document.querySelector(s);
  const listEl = $('#list'), detailEl = $('#detailView'), versusEl = $('#versusView');
  const backBtn = $('#backBtn'), barSub = $('#barSub'), toolRow = $('#toolRow');

  let DEX = [], byId = new Map();
  const versus = { a: null, b: null };
  let lastMoveMap = null;           // moveName -> [version groups] for current pokemon (for move pages)

  /* ---------- names ---------- */
  const NAME_FIX = {
    'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂', 'mr-mime': 'Mr. Mime', 'mr-rime': 'Mr. Rime',
    'mime-jr': 'Mime Jr.', 'type-null': 'Type: Null', 'ho-oh': 'Ho-Oh', 'porygon-z': 'Porygon-Z',
    'farfetchd': "Farfetch'd", 'sirfetchd': "Sirfetch'd", 'flabebe': 'Flabébé',
    'jangmo-o': 'Jangmo-o', 'hakamo-o': 'Hakamo-o', 'kommo-o': 'Kommo-o',
  };
  const pretty = n => NAME_FIX[n] || n.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const prettyWords = n => n.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const num = id => '#' + String(id).padStart(4, '0');

  /* ---------- fetch with cache ---------- */
  const cache = new Map();
  function j(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    cache.set(url, p); p.catch(() => cache.delete(url)); return p;
  }

  /* ---------- type chips ---------- */
  const tchip = (t, extra) => `<span class="ty ${extra || ''}" style="background:var(--t-${t})">${t}</span>`;

  /* ======================================================================
     LIST
  ====================================================================== */
  function rowHtml(p) {
    return `<div class="row" data-id="${p.id}">
      <span class="num">${num(p.id)}</span>
      <span class="pic"><img loading="lazy" src="${sprite(p.id)}" alt=""></span>
      <span class="nm">${pretty(p.name)}</span>
      <span class="tt">${p.types.map(t => tchip(t, 'sm')).join('')}</span></div>`;
  }
  function renderList(q) {
    q = (q || '').trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, '');
    const rows = DEX.filter(p => {
      if (!q) return true;
      if (digits && String(p.id).padStart(4, '0').includes(digits)) return true;
      if (pretty(p.name).toLowerCase().includes(q)) return true;
      return p.types.some(t => t.startsWith(q));
    });
    listEl.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<div class="loading">nothing in these pages</div>';
  }
  listEl.addEventListener('click', e => {
    const r = e.target.closest('.row'); if (r) go('#/p/' + r.dataset.id);
  });

  /* ======================================================================
     MATCHUPS (instant, from local types)
  ====================================================================== */
  function matchupHtml(types) {
    const d = TC.defense(types);
    const chips = (arr, cls, mult) => arr.map(t => `<span class="chip ${cls}">${tchip(t, 'sm')} <span class="x">${mult}</span></span>`).join('');
    const line = (lab, html) => html ? `<div class="mline"><span class="lab">${lab}</span><div class="chipwrap">${html}</div></div>` : '';
    // offensive strength: defending types that take ≥2× from this mon's STAB
    const strong = TYPES.filter(def => Math.max(...types.map(t => TC.pair(t, def))) >= 2);
    return `<div class="section">
      <h2>Type matchups</h2>
      ${line('Weak', chips(d.x4, 'w4', '×4') + chips(d.x2, 'w2', '×2')) || '<div class="mline"><span class="lab">Weak</span><span class="muted mono" style="font-size:11px">— none —</span></div>'}
      ${line('Resists', chips(d.x025, 'r4', '×¼') + chips(d.x05, 'r2', '×½'))}
      ${line('Immune', chips(d.x0, 'im', '×0'))}
      ${line('STAB beats', strong.map(t => tchip(t, 'sm')).join(' '))}
    </div>`;
  }

  /* ======================================================================
     DETAIL
  ====================================================================== */
  const STAT_LABEL = { hp: 'HP', attack: 'Atk', defense: 'Def', 'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'Spe' };

  const VG_ORDER = ['red-blue','yellow','gold-silver','crystal','ruby-sapphire','emerald','firered-leafgreen',
    'diamond-pearl','platinum','heartgold-soulsilver','black-white','black-2-white-2','colosseum','xd','x-y',
    'omega-ruby-alpha-sapphire','sun-moon','ultra-sun-ultra-moon','lets-go-pikachu-lets-go-eevee','sword-shield',
    'brilliant-diamond-and-shining-pearl','legends-arceus','scarlet-violet'];
  const VER_ORDER = ['red','blue','yellow','gold','silver','crystal','ruby','sapphire','emerald','firered','leafgreen',
    'diamond','pearl','platinum','heartgold','soulsilver','black','white','black-2','white-2','x','y','omega-ruby',
    'alpha-sapphire','sun','moon','ultra-sun','ultra-moon','lets-go-pikachu','lets-go-eevee','sword','shield',
    'brilliant-diamond','shining-pearl','legends-arceus','scarlet','violet'];
  const ordIdx = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 999 : i; };
  const vgLabel = v => prettyWords(v).replace(/ And /g, ' / ').replace(/-/g, ' ');

  async function showDetail(id) {
    setView('detail'); barSub.textContent = num(id);
    const base = byId.get(id);
    if (!base) { detailEl.innerHTML = '<div class="loading">unknown entry</div>'; return; }

    detailEl.innerHTML =
      `<div class="d-head">
        <div class="art"><img src="${artwork(id)}" onerror="this.src='${sprite(id)}'" alt=""></div>
        <div class="who"><div class="num">${num(id)}</div><h1>${pretty(base.name)}</h1>
          <div class="tt">${base.types.map(t => tchip(t)).join('')}</div></div>
      </div>
      ${matchupHtml(base.types)}
      <div id="d-stats" class="section"><h2>Base stats</h2><div class="loading">…</div></div>
      <div id="d-moves" class="section"><h2>Moves by game</h2><div class="loading">reading the move list…</div></div>
      <div id="d-locs" class="section"><h2>Where to find it</h2><div class="loading">tracing locations…</div></div>
      <div class="addvs"><button class="btn" id="toVersus">＋ add to versus</button></div>`;

    detailEl.scrollIntoView({ block: 'start' });
    $('#toVersus').onclick = () => { if (!versus.a) versus.a = id; else versus.b = id; go('#/vs'); };

    // deep data
    try {
      const p = await j(`${API}/pokemon/${id}`);
      renderStats(p);
      renderMoves(id, p);
    } catch (e) {
      $('#d-stats').innerHTML = '<h2>Base stats</h2><div class="muted mono" style="font-size:11px">offline — connect to load stats & moves</div>';
      $('#d-moves').innerHTML = '';
    }
    try {
      const enc = await j(`${API}/pokemon/${id}/encounters`);
      renderLocations(enc);
    } catch (e) {
      $('#d-locs').innerHTML = '<h2>Where to find it</h2><div class="muted mono" style="font-size:11px">offline — connect to load locations</div>';
    }
  }

  function renderStats(p) {
    const abil = p.abilities.map(a => `<span class="chip">${prettyWords(a.ability.name)}${a.is_hidden ? ' · hidden' : ''}</span>`).join(' ');
    const bars = p.stats.map(s => {
      const v = s.base_stat, w = Math.min(100, v / 200 * 100);
      return `<div class="stat"><span class="k">${STAT_LABEL[s.stat.name] || s.stat.name}</span><span class="v">${v}</span><span class="bar"><i style="width:${w}%"></i></span></div>`;
    }).join('');
    const total = p.stats.reduce((n, s) => n + s.base_stat, 0);
    $('#d-stats').innerHTML = `<h2>Base stats</h2>${bars}
      <div class="stat"><span class="k">Total</span><span class="v">${total}</span><span class="bar"></span></div>
      <div class="mline" style="margin-top:10px"><span class="lab">Abilities</span>${abil}</div>`;
  }

  function renderMoves(id, p) {
    // group: version_group -> { method -> [{name, level}] }
    const groups = {}; const moveVG = {};
    for (const m of p.moves) {
      const nm = m.move.name;
      for (const d of m.version_group_details) {
        const vg = d.version_group.name, method = d.move_learn_method.name;
        (groups[vg] ||= {}); (groups[vg][method] ||= []);
        groups[vg][method].push({ name: nm, level: d.level_learned_at });
        (moveVG[nm] ||= new Set()).add(vg);
      }
    }
    lastMoveMap = moveVG;
    const vgs = Object.keys(groups).sort((a, b) => ordIdx(VG_ORDER, a) - ordIdx(VG_ORDER, b));
    const methodOrder = ['level-up', 'machine', 'egg', 'tutor', 'form-change'];
    const methodLabel = { 'level-up': 'Level up', machine: 'TM / HM', egg: 'Egg', tutor: 'Tutor', 'form-change': 'Form' };
    let html = '<h2>Moves by game</h2>';
    for (const vg of vgs) {
      const methods = Object.keys(groups[vg]).sort((a, b) => (methodOrder.indexOf(a) + 1 || 99) - (methodOrder.indexOf(b) + 1 || 99));
      let count = 0; let body = '';
      for (const mth of methods) {
        const items = groups[vg][mth].sort((a, b) => a.level - b.level);
        body += `<div class="mline" style="margin:8px 0 2px"><span class="lab">${methodLabel[mth] || mth}</span></div>`;
        body += items.map(it => {
          count++;
          const lv = mth === 'level-up' ? (it.level > 0 ? 'Lv ' + it.level : 'start') : '';
          return `<div class="mv" data-move="${it.name}" data-pid="${id}"><span class="lv">${lv}</span><span class="nm">${prettyWords(it.name)}</span><span class="meta mono muted" style="font-size:10px">›</span></div>`;
        }).join('');
      }
      html += `<details class="acc"><summary>${vgLabel(vg)} <span class="muted">${count}</span></summary><div class="body">${body}</div></details>`;
    }
    $('#d-moves').innerHTML = html;
    $('#d-moves').querySelectorAll('.mv').forEach(el => el.onclick = () => go(`#/m/${el.dataset.pid}/${el.dataset.move}`));
  }

  function renderLocations(enc) {
    if (!enc.length) { $('#d-locs').innerHTML = '<h2>Where to find it</h2><div class="muted mono" style="font-size:11px">No wild encounters recorded — likely an evolution, gift, trade or event.</div>'; return; }
    const byVer = {};
    for (const e of enc) {
      const area = prettyWords(e.location_area.name.replace(/-area$/, ''));
      for (const vd of e.version_details) {
        const ver = vd.version.name;
        const methods = [...new Set(vd.encounter_details.map(d => d.method.name))].map(m => prettyWords(m)).join(', ');
        const lv = vd.encounter_details.reduce((a, d) => [Math.min(a[0], d.min_level), Math.max(a[1], d.max_level)], [99, 0]);
        (byVer[ver] ||= []).push({ area, methods, lv });
      }
    }
    const vers = Object.keys(byVer).sort((a, b) => ordIdx(VER_ORDER, a) - ordIdx(VER_ORDER, b));
    let html = '<h2>Where to find it</h2>';
    for (const v of vers) {
      const rows = byVer[v].map(r => `<div class="loc"><div class="where">${r.area}</div><div class="how">${r.methods}${r.lv[1] ? ' · Lv ' + (r.lv[0] === r.lv[1] ? r.lv[0] : r.lv[0] + '–' + r.lv[1]) : ''}</div></div>`).join('');
      html += `<details class="acc"><summary>${prettyWords(v)} <span class="muted">${byVer[v].length}</span></summary><div class="body">${rows}</div></details>`;
    }
    $('#d-locs').innerHTML = html;
  }

  /* ======================================================================
     MOVE PAGE
  ====================================================================== */
  async function showMove(pid, name) {
    setView('detail'); barSub.textContent = 'move';
    detailEl.innerHTML = `<div class="section"><h2>Move</h2><h1 style="margin:2px 0 10px;font-size:28px">${prettyWords(name)}</h1><div class="loading">reading…</div></div>`;
    try {
      const m = await j(`${API}/move/${name}`);
      const eff = (m.effect_entries.find(e => e.language.name === 'en') || {}).short_effect || '';
      const dmgClass = m.damage_class ? m.damage_class.name : '—';
      const games = lastMoveMap && lastMoveMap[name] ? [...lastMoveMap[name]].sort((a, b) => ordIdx(VG_ORDER, a) - ordIdx(VG_ORDER, b)) : [];
      const pm = byId.get(+pid);
      detailEl.innerHTML = `
        <div class="section">
          <div class="num mono muted" style="font-size:11px">${pm ? pretty(pm.name) + ' · ' : ''}move</div>
          <h1 style="margin:2px 0 10px;font-size:28px">${prettyWords(name)}</h1>
          <div class="mline">${tchip(m.type.name)} <span class="chip">${prettyWords(dmgClass)}</span></div>
          <div class="stat" style="margin-top:12px"><span class="k">Power</span><span class="v">${m.power ?? '—'}</span><span class="bar"><i style="width:${Math.min(100, (m.power || 0) / 180 * 100)}%"></i></span></div>
          <div class="stat"><span class="k">Accuracy</span><span class="v">${m.accuracy ?? '—'}</span><span class="bar"><i style="width:${m.accuracy || 0}%"></i></span></div>
          <div class="stat"><span class="k">PP</span><span class="v">${m.pp ?? '—'}</span><span class="bar"></span></div>
          ${eff ? `<p style="margin:12px 0 0;line-height:1.55">${eff.replace('$effect_chance%', (m.effect_chance || '') + '%')}</p>` : ''}
        </div>
        <div class="section"><h2>Learned in</h2>
          <div class="mline" style="flex-wrap:wrap;gap:6px">${games.length ? games.map(g => `<span class="chip">${vgLabel(g)}</span>`).join('') : '<span class="muted mono" style="font-size:11px">open from a Pokémon to see its games</span>'}</div>
        </div>
        <div class="addvs"><button class="btn" onclick="history.back()">‹ back</button></div>`;
    } catch (e) {
      detailEl.innerHTML = `<div class="section"><h1 style="font-size:26px">${prettyWords(name)}</h1><div class="muted mono" style="font-size:11px">offline — connect to load this move.</div><div class="addvs"><button class="btn" onclick="history.back()">‹ back</button></div></div>`;
    }
  }

  /* ======================================================================
     VERSUS
  ====================================================================== */
  function slotHtml(side, id) {
    if (!id) return `<div class="vs-slot" data-slot="${side}"><div class="empty">tap to choose<br>${side.toUpperCase()}</div></div>`;
    const p = byId.get(id);
    return `<div class="vs-slot" data-slot="${side}"><img src="${sprite(id)}" alt="">
      <div class="num">${num(id)}</div><div class="nm">${pretty(p.name)}</div>
      <div class="tt" style="display:flex;gap:5px;margin-top:5px">${p.types.map(t => tchip(t, 'sm')).join('')}</div></div>`;
  }
  function defenseMini(types) {
    const d = TC.defense(types);
    const chips = (arr, cls, mult) => arr.map(t => `<span class="chip ${cls}">${tchip(t, 'sm')} ${mult}</span>`).join('');
    return `${chips(d.x4, 'w4', '×4')}${chips(d.x2, 'w2', '×2')}${chips(d.x0, 'im', '×0')}` || '<span class="muted mono" style="font-size:11px">balanced</span>';
  }
  function bestOffense(att, def) { let best = 0, via = null; for (const t of att) { const m = TC.vs(t, def); if (m > best) { best = m; via = t; } } return { best, via }; }
  const multWord = m => m === 0 ? '×0' : (m % 1 ? '×' + m : '×' + m);

  function showVersus() {
    setView('versus'); barSub.textContent = 'versus';
    const a = versus.a, b = versus.b;
    let body = `<div class="vs-grid">${slotHtml('a', a)}${slotHtml('b', b)}</div><div class="vs-mid">VERSUS</div>`;
    if (a && b) {
      const A = byId.get(a), B = byId.get(b);
      const AB = bestOffense(A.types, B.types), BA = bestOffense(B.types, A.types);
      const edge = AB.best > BA.best ? `${pretty(A.name)} hits harder` : BA.best > AB.best ? `${pretty(B.name)} hits harder` : 'an even trade';
      const row = (att, dfn, o) => `<div style="margin:12px 0">
        <div class="mono muted" style="font-size:10px;letter-spacing:.08em;margin-bottom:6px">${pretty(att.name)} ↦ ${pretty(dfn.name)}</div>
        <div class="chipwrap">
          <span class="chip ${o.best >= 2 ? 'w2' : o.best <= 0.5 ? 'r2' : ''}"><b class="x">${multWord(o.best)}</b>${o.via ? ' via ' + tchip(o.via, 'sm') : ''}</span>
          ${att.types.map(t => { const m = TC.vs(t, dfn.types); return `<span class="chip ${m >= 2 ? 'w2' : m <= 0.5 ? 'r2' : ''}">${tchip(t, 'sm')} ${multWord(m)}</span>`; }).join('')}
        </div></div>`;
      body += `<div class="verdict"><b>${edge}.</b> Best case: ${pretty(A.name)} ${multWord(AB.best)} on ${pretty(B.name)}, and ${pretty(B.name)} ${multWord(BA.best)} back.</div>
        <div class="section"><h2>Offense</h2>${row(A, B, AB)}${row(B, A, BA)}</div>
        <div class="section"><h2>${pretty(A.name)} — defends</h2><div class="chipwrap">${defenseMini(A.types)}</div></div>
        <div class="section"><h2>${pretty(B.name)} — defends</h2><div class="chipwrap">${defenseMini(B.types)}</div></div>`;
    } else {
      body += `<div class="section"><div class="muted mono" style="font-size:11px;text-align:center">choose two pokémon to see how their types clash</div></div>`;
    }
    versusEl.innerHTML = body;
    versusEl.querySelectorAll('.vs-slot').forEach(el => el.onclick = () => openPicker(el.dataset.slot));
  }

  /* ======================================================================
     PICKER (for versus slots)
  ====================================================================== */
  const picker = $('#picker'), pickerList = $('#pickerList'), pickerSearch = $('#pickerSearch');
  let pickSlot = 'a';
  function openPicker(slot) { pickSlot = slot; picker.classList.add('on'); pickerSearch.value = ''; fillPicker(''); pickerSearch.focus(); }
  function fillPicker(q) {
    q = q.trim().toLowerCase();
    const rows = DEX.filter(p => !q || pretty(p.name).toLowerCase().includes(q) || String(p.id).padStart(4, '0').includes(q.replace(/[^0-9]/g, '')) && q.replace(/[^0-9]/g, ''));
    pickerList.innerHTML = rows.slice(0, 400).map(rowHtml).join('');
  }
  pickerSearch.addEventListener('input', () => fillPicker(pickerSearch.value));
  pickerList.addEventListener('click', e => {
    const r = e.target.closest('.row'); if (!r) return;
    versus[pickSlot] = +r.dataset.id; picker.classList.remove('on'); showVersus();
  });
  picker.addEventListener('click', e => { if (e.target === picker) picker.classList.remove('on'); });

  /* ======================================================================
     VIEW / ROUTER
  ====================================================================== */
  function setView(name) {
    for (const [v, el] of [['list', $('#listView')], ['detail', detailEl], ['versus', versusEl]]) el.classList.toggle('hidden', v !== name);
    backBtn.style.display = name === 'list' ? 'none' : 'inline';
    toolRow.style.display = name === 'list' ? 'flex' : 'none';
    if (name === 'list') barSub.textContent = 'national pokédex';
    window.scrollTo(0, name === 'list' ? scrollMemory : 0);
  }
  let scrollMemory = 0;
  function route() {
    const h = location.hash;
    if (h.startsWith('#charts')) {
      setView('list'); charts.classList.add('on');
      const which = h.includes('nature') ? 'nature' : 'type';
      document.querySelectorAll('.dtabs .pill').forEach(x => x.classList.toggle('on', x.dataset.chart === which));
      renderChart(which); return;
    }
    if (h.startsWith('#/p/')) showDetail(+h.slice(4));
    else if (h.startsWith('#/m/')) { const [, , pid, ...nm] = h.split('/'); showMove(pid, nm.join('/')); }
    else if (h.startsWith('#/vs')) { const p = h.split('/'); if (p[2]) versus.a = +p[2]; if (p[3]) versus.b = +p[3]; showVersus(); }
    else { setView('list'); }
  }
  function go(hash) { if (location.hash === '#/' && hash === '#/') return; location.hash = hash; }
  window.addEventListener('hashchange', route);
  backBtn.onclick = () => history.back();
  $('#versusTab').onclick = () => go('#/vs');
  window.addEventListener('scroll', () => { if (!location.hash || location.hash === '#/') scrollMemory = window.scrollY; });

  $('#search').addEventListener('input', e => renderList(e.target.value));

  /* ======================================================================
     CHARTS DRAWER
  ====================================================================== */
  const charts = $('#charts');
  $('#chartsHandle').onclick = () => { charts.classList.add('on'); };
  $('#chartsClose').onclick = () => charts.classList.remove('on');
  document.querySelectorAll('.dtabs .pill').forEach(b => b.onclick = () => {
    document.querySelectorAll('.dtabs .pill').forEach(x => x.classList.toggle('on', x === b));
    renderChart(b.dataset.chart);
  });
  function renderChart(which) {
    const body = $('#chartBody');
    if (which === 'nature') { body.innerHTML = natureChartHtml(); return; }
    // type grid
    const head = `<tr><th></th>${TYPES.map(t => `<th class="colh"><span>${t}</span></th>`).join('')}</tr>`;
    const rows = TYPES.map(atk => `<tr><th class="rowh">${atk} ↦</th>${TYPES.map(def => {
      const m = TC.pair(atk, def);
      const cls = m === 0 ? 'm0' : m === 2 ? 'm2' : m === 0.5 ? 'm05' : 'm1';
      const label = m === 0 ? '0' : m === 2 ? '2' : m === 0.5 ? '½' : '';
      return `<td class="${cls}">${label}</td>`;
    }).join('')}</tr>`).join('');
    body.innerHTML = `<p class="muted mono" style="font-size:10px;margin:0 0 8px">rows attack · columns defend</p>
      <div style="overflow:auto"><table class="tg">${head}${rows}</table></div>
      <div class="tgKey"><span><i style="background:#8f8a5a"></i>×2</span><span><i style="background:#cfcabb"></i>×½</span><span><i style="background:#3a362e"></i>×0</span><span><i style="background:transparent;border:1px solid var(--line)"></i>×1</span></div>`;
  }
  function natureChartHtml() {
    const order = NATURE_ORDER; // atk,def,spa,spd,spe
    const L = NATURE_STATS;
    const dirLookup = {}; NATURES.forEach(n => { if (n.up && n.down) dirLookup[n.up + '>' + n.down] = n.name; });
    const neutralByStat = { atk: 'Hardy', def: 'Docile', spa: 'Bashful', spd: 'Quirky', spe: 'Serious' };
    let rows = '';
    for (const up of order) {
      rows += `<tr><th>+${L[up]}</th>` + order.map(down => {
        if (up === down) return `<td class="neu">${neutralByStat[up]}</td>`;
        return `<td>${dirLookup[up + '>' + down] || '—'}</td>`;
      }).join('') + '</tr>';
    }
    const head = `<tr><th>＋ \\ −</th>${order.map(d => `<th>−${L[d]}</th>`).join('')}</tr>`;
    return `<table class="ng"><caption>rows raise a stat · columns lower one · diagonal is neutral</caption>${head}${rows}</table>`;
  }

  /* ======================================================================
     BOOT
  ====================================================================== */
  fetch('data/dex.json').then(r => r.json()).then(d => {
    DEX = d; byId = new Map(d.map(p => [p.id, p]));
    renderList('');
    renderChart('type');
    route();
  }).catch(err => { listEl.innerHTML = '<div class="loading">could not load the dex index.<br>' + err + '</div>'; });

  // service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
