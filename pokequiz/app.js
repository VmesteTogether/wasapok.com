/* =============================================================================
   TRAINER PROFILE — a 12-question read of the trainer you'd be.
   One quiz → five answers computed together from the full National Dex:
   your Pokémon · your type · your region · your battle strategy · your team of 6.
   ========================================================================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const SPRITE_FALLBACK = dex => `this.onerror=null;this.src='${SPRITE(dex)}'`;
  const GEN_CAPS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const genOf = dex => { for (let i = 0; i < GEN_CAPS.length; i++) if (dex <= GEN_CAPS[i]) return i + 1; return 9; };
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const prettify = ident => ident.replace(/-/g, " ");
  // clean display name: regional forms read "Alolan Ninetales"; cosmetic/battle-form
  // descriptors ("-blaze-breed", "-midnight") collapse to the base species; a few
  // real hyphenated names are spelled out.
  const capW = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  const REGION_FORM = [[/-alola/, "Alolan"], [/-galar/, "Galarian"], [/-hisui/, "Hisuian"], [/-paldea/, "Paldean"]];
  const NAME_FIX = { "nidoran-f":"Nidoran ♀", "nidoran-m":"Nidoran ♂", "mr-mime":"Mr. Mime", "mr-rime":"Mr. Rime",
    "mime-jr":"Mime Jr.", "porygon-z":"Porygon-Z", "jangmo-o":"Jangmo-o", "hakamo-o":"Hakamo-o", "kommo-o":"Kommo-o", "ho-oh":"Ho-Oh" };
  const displayName = ident => {
    if (NAME_FIX[ident]) return NAME_FIX[ident];
    for (const [re, pre] of REGION_FORM) if (re.test(ident)) return pre + " " + capW(ident.split("-")[0]);
    if (ident.includes("-")) return capW(ident.split("-")[0]);
    return capW(ident);
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
    "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];
  const TYPE_HEX = { normal:"#9099a1", fire:"#ff7a3d", water:"#3f8dff", electric:"#f6c343",
    grass:"#4fbf5f", ice:"#5fd0d6", fighting:"#e0402f", poison:"#b45cd6", ground:"#d8a54a",
    flying:"#8fa9f2", psychic:"#ff5d8a", bug:"#9fb828", rock:"#c2a955", ghost:"#6b5ba8",
    dragon:"#6a53e6", dark:"#5a5366", steel:"#6d8a9c", fairy:"#f08fd0" };
  const TYPE_DESC = {
    normal:"adaptable, grounded and quietly versatile", fire:"passionate, driven and impossible to put out",
    water:"calm, deep and endlessly adaptable", electric:"quick, bright and a little bit shocking",
    grass:"patient, nurturing and quietly resilient", ice:"cool, precise and sharper than you look",
    fighting:"bold, disciplined and all heart", poison:"cunning, resilient and always underestimated",
    ground:"steady, dependable and deeply rooted", flying:"free-spirited, restless and always reaching higher",
    psychic:"intuitive, cerebral and three steps ahead", bug:"scrappy, industrious and quietly evolving",
    rock:"stubborn, sturdy and built to last", ghost:"mysterious, playful and hard to pin down",
    dragon:"proud, powerful and born for the big stage", dark:"shrewd, independent — you play by your own rules",
    steel:"disciplined, unbreakable and forged under pressure", fairy:"charming, kind and tougher than you seem" };

  const REGIONS = [
    { g:1, name:"Kanto",  vibe:"where it all began — classic, bold and endlessly iconic." },
    { g:2, name:"Johto",  vibe:"tradition and legend, wrapped in autumn gold." },
    { g:3, name:"Hoenn",  vibe:"sun, sea and volcano — a land of beautiful extremes." },
    { g:4, name:"Sinnoh", vibe:"myth-soaked peaks where the world itself was made." },
    { g:5, name:"Unova",  vibe:"big-city ambition and stark, modern drama." },
    { g:6, name:"Kalos",  vibe:"beauty, style and a whisper of ancient mystery." },
    { g:7, name:"Alola",  vibe:"island warmth, easy days and surprising depths." },
    { g:8, name:"Galar",  vibe:"rain, grit and roaring stadium crowds." },
    { g:9, name:"Paldea", vibe:"wide-open freedom and treasure worth chasing." },
  ];
  const STRATS = {
    offense:  { name:"Hyper-Offense",     tag:"end it early",   desc:"Hit first, hit hardest. You'd rather win the fight before it becomes one." },
    balanced: { name:"The Balanced Ace",  tag:"a tool for all", desc:"An answer for every threat — you read the battle and never fold." },
    defense:  { name:"The Wall",          tag:"outlast it all", desc:"Outlast anything thrown at you. Patience is your sharpest weapon." },
    trickster:{ name:"The Trickster",     tag:"win the mind",   desc:"Status, hazards and misdirection win the fight before damage ever does." },
    breaker:  { name:"The Bulky Breaker", tag:"break & advance",desc:"Tanky and relentless — you break through walls and keep on coming." },
    setup:    { name:"The Setup Sweeper", tag:"one free turn",  desc:"Give you a single free turn and it's over. You build to an unstoppable finish." },
  };
  // legendary / mythical / paradox tier (national dex nos) — kept out of the "you'd be"
  // pool + team so results stay relatable.
  const LEGENDARY = new Set([144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,
    480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,638,639,640,641,642,643,644,645,646,647,648,649,
    716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,800,801,802,803,804,805,806,807,808,809,
    888,889,890,891,892,893,894,895,896,897,898,905,984,985,986,987,988,989,990,991,992,993,994,995,
    1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1014,1015,1016,1017,1020,1021,1022,1023,1024,1025]);
  const BATTLE_ONLY = /-mega|-gmax|-primal|-totem|-eternamax|-ultra|-busted|-crowned|-eternal|-ash|-starter/;

  // combat class from base stats [hp,atk,def,spa,spd,spe] (ported from pokemeter)
  const archetype = s => {
    const [hp, atk, def, spa, spd] = s, spe = s[5];
    const off = Math.max(atk, spa), phys = atk >= spa;
    const bulkP = hp * def, bulkS = hp * spd, bst = s.reduce((a,b) => a+b, 0);
    if (off >= 100 && spe >= 100) return phys ? "PHYS SWEEPER" : "SPEC SWEEPER";
    if (atk >= 100 && spa >= 100) return "MIXED ATTACKER";
    if (off >= 115) return phys ? "WALLBREAKER" : "SPEC BREAKER";
    if (bulkP >= 9000 && bulkS >= 9000) return "FORTRESS";
    if (bulkP >= 8200) return "PHYS WALL";
    if (bulkS >= 8200) return "SPEC WALL";
    if (spe >= 110) return "SCOUT";
    if (off >= 95) return phys ? "PHYS ATTACKER" : "SPEC ATTACKER";
    if (hp >= 85 && def >= 65 && spd >= 65) return "BULKY PIVOT";
    if (bst < 430) return "IN TRAINING";
    return "ALL-ROUNDER";
  };
  const STRAT_ARCH = {
    offense:  ["PHYS SWEEPER","SPEC SWEEPER","SCOUT","PHYS ATTACKER","SPEC ATTACKER"],
    breaker:  ["WALLBREAKER","SPEC BREAKER","MIXED ATTACKER","PHYS ATTACKER"],
    defense:  ["FORTRESS","PHYS WALL","SPEC WALL","BULKY PIVOT"],
    setup:    ["PHYS SWEEPER","SPEC SWEEPER","PHYS ATTACKER","SPEC ATTACKER"],
    trickster:["SCOUT","BULKY PIVOT","ALL-ROUNDER","SPEC WALL"],
    balanced: ["ALL-ROUNDER","BULKY PIVOT","MIXED ATTACKER","PHYS ATTACKER"],
  };

  // ---- the questions, in four chapters. Each option seeds type (t) / region gen
  // (r) / strategy (s) vectors; the first item in a list weighs heaviest. ----
  const S1 = "I · Temperament", S2 = "II · Your World", S3 = "III · In Battle", S4 = "IV · Heart & Soul";
  const QUESTIONS = [
    /* ===================== I · TEMPERAMENT ===================== */
    { sec:S1, q:"Friends would call you…", o:[
      { a:"Bold and fiery", t:["fire","fighting"], s:["offense"] },
      { a:"Calm and dependable", t:["water","steel","rock"], s:["defense"] },
      { a:"Clever and unpredictable", t:["psychic","ghost","dark"], s:["trickster"] },
      { a:"Warm and loyal", t:["normal","fairy","grass"], s:["balanced"] } ] },
    { sec:S1, q:"Your greatest strength?", o:[
      { a:"Raw power", t:["fighting","dragon","rock"], s:["breaker"] },
      { a:"Speed and instinct", t:["electric","flying","normal"], s:["offense"] },
      { a:"Resilience", t:["steel","rock","ground"], s:["defense"] },
      { a:"Cunning", t:["dark","ghost","poison"], s:["trickster"] } ] },
    { sec:S1, q:"And your flaw?", o:[
      { a:"Reckless", t:["fire","fighting"], s:["offense"] },
      { a:"Stubborn", t:["rock","ground","steel"], s:["defense"] },
      { a:"Secretive", t:["dark","ghost","ice"], s:["trickster"] },
      { a:"Too trusting", t:["fairy","normal","grass"], s:["balanced"] } ] },
    { sec:S1, q:"In a crowded room, you're…", o:[
      { a:"The centre of it all", t:["fire","fairy","normal"], s:["offense"] },
      { a:"Reading everyone quietly", t:["psychic","dark","ghost"], s:["trickster"] },
      { a:"Bringing people together", t:["grass","water","normal"], s:["balanced"] },
      { a:"The unpredictable spark", t:["electric","bug","poison"], s:["setup"] } ] },
    { sec:S1, q:"You make the big calls with…", o:[
      { a:"Gut instinct — fast", t:["fire","electric","flying"], s:["offense"] },
      { a:"Careful analysis", t:["psychic","steel","ice"], s:["setup"] },
      { a:"What feels right for everyone", t:["fairy","normal","grass"], s:["balanced"] },
      { a:"Firm principle, no bending", t:["fighting","rock","steel"], s:["breaker"] } ] },
    { sec:S1, q:"When a plan falls apart, you…", o:[
      { a:"Charge harder", t:["fire","fighting","dragon"], s:["offense"] },
      { a:"Dig in and outlast it", t:["rock","steel","water"], s:["defense"] },
      { a:"Improvise a new angle", t:["dark","ghost","bug"], s:["trickster"] },
      { a:"Calmly rebuild the plan", t:["psychic","grass","ice"], s:["setup"] } ] },
    { sec:S1, q:"Your daily discipline looks like…", o:[
      { a:"Relentless training", t:["fighting","steel","dragon"], s:["breaker"] },
      { a:"A steady, gentle routine", t:["normal","grass","fairy"], s:["defense"] },
      { a:"Chaotic bursts of genius", t:["electric","bug","fire"], s:["offense"] },
      { a:"Quiet study and planning", t:["psychic","ghost","ice"], s:["setup"] } ] },
    /* ===================== II · YOUR WORLD ===================== */
    { sec:S2, q:"Where do you feel most at home?", o:[
      { a:"A neon city that never sleeps", t:["electric","dark","steel"], r:[5,6], s:["offense"] },
      { a:"A quiet mountain village", t:["rock","ground","ice"], r:[4,2], s:["defense"] },
      { a:"Sun-soaked beaches and islands", t:["water","fire","grass"], r:[7,3], s:["balanced"] },
      { a:"Rolling green countryside", t:["grass","normal","fairy"], r:[8,1,9], s:["defense"] } ] },
    { sec:S2, q:"You'd build your base in…", o:[
      { a:"A volcano's edge", t:["fire","rock"], r:[7,3], s:["offense"] },
      { a:"A deep forest grove", t:["grass","bug","poison"], r:[6,2], s:["balanced"] },
      { a:"An ancient, echoing ruin", t:["ghost","psychic","ground"], r:[9,4], s:["trickster"] },
      { a:"A cliffside above the sea", t:["water","flying","ice"], r:[3,8], s:["defense"] } ] },
    { sec:S2, q:"Your kind of weather…", o:[
      { a:"Blazing sun", t:["fire","ground","grass"], r:[3,7] },
      { a:"Pouring rain", t:["water","electric"], r:[8] },
      { a:"A swirling sandstorm", t:["rock","ground","steel"], r:[9] },
      { a:"Silent snowfall", t:["ice","fairy","steel"], r:[4] } ] },
    { sec:S2, q:"You're a season.", o:[
      { a:"Blazing summer", t:["fire","grass"], r:[3,7] },
      { a:"Still winter", t:["ice","steel"], r:[4,8] },
      { a:"Golden autumn", t:["ground","rock","ghost"], r:[6,2,9] },
      { a:"Fresh spring", t:["fairy","grass","normal"], r:[1,8] } ] },
    { sec:S2, q:"A treasure worth chasing…", o:[
      { a:"A relic of the ancient world", t:["rock","ground","steel"], r:[4,9], s:["setup"] },
      { a:"A rare, radiant gem", t:["fairy","psychic"], r:[6], s:["balanced"] },
      { a:"Lost, humming technology", t:["electric","steel","poison"], r:[5], s:["trickster"] },
      { a:"A legend's fallen feather", t:["flying","fire","dragon"], r:[2], s:["offense"] } ] },
    { sec:S2, q:"Pick a palette.", o:[
      { a:"Reds and embers", t:["fire","fighting"] },
      { a:"Blues and frost", t:["water","ice","flying"] },
      { a:"Violets and shadow", t:["poison","ghost","dark","psychic"] },
      { a:"Greens and gold", t:["grass","ground","bug","electric"] } ] },
    { sec:S2, q:"First thing you notice in a new town…", o:[
      { a:"The gym and its challengers", t:["fighting","fire"], r:[5], s:["offense"] },
      { a:"The market and its people", t:["normal","grass","fairy"], r:[8], s:["balanced"] },
      { a:"The old shrine or lab", t:["psychic","ghost","steel"], r:[4], s:["setup"] },
      { a:"The wild edges beyond it", t:["dark","poison","ground"], r:[9], s:["trickster"] } ] },
    /* ===================== III · IN BATTLE ===================== */
    { sec:S3, q:"In a tough battle, you…", o:[
      { a:"Go all-in and overwhelm them", t:["fighting","fire","dragon"], s:["offense"] },
      { a:"Wear them down patiently", t:["steel","water","poison"], s:["defense"] },
      { a:"Set traps and flip the tide", t:["ghost","dark","bug"], s:["trickster"] },
      { a:"Read them and counter perfectly", t:["psychic","normal","fairy"], s:["balanced"] } ] },
    { sec:S3, q:"Your ideal adventure is…", o:[
      { a:"Racing to be the very best", t:["fire","electric","fighting"], r:[1], s:["offense"] },
      { a:"Uncovering ancient mysteries", t:["psychic","ghost","rock"], r:[4,9], s:["setup"] },
      { a:"Befriending every creature I meet", t:["normal","fairy","grass"], r:[8], s:["balanced"] },
      { a:"Testing myself against the strongest", t:["dragon","fighting","steel"], r:[3], s:["breaker"] } ] },
    { sec:S3, q:"What matters most in a battle team?", o:[
      { a:"Overwhelming firepower", t:["fire","dragon","fighting"], s:["breaker"] },
      { a:"An airtight, unbreakable core", t:["steel","rock","water"], s:["defense"] },
      { a:"Clever synergy and traps", t:["ghost","bug","poison"], s:["trickster"] },
      { a:"Speed and adaptability", t:["electric","flying","normal"], s:["offense"] } ] },
    { sec:S3, q:"Your relationship with the rules…", o:[
      { a:"Honour them fully", t:["normal","steel","fairy"], s:["defense"] },
      { a:"Bend them when needed", t:["psychic","water","grass"], s:["balanced"] },
      { a:"Break them for the win", t:["fire","fighting","dragon"], s:["offense"] },
      { a:"Rewrite them entirely", t:["dark","ghost","poison"], s:["trickster"] } ] },
    { sec:S3, q:"Your ideal victory is…", o:[
      { a:"A flawless, unanswered sweep", t:["dragon","electric","fire"], s:["setup"] },
      { a:"A grinding war of attrition", t:["steel","water","poison"], s:["defense"] },
      { a:"A perfectly sprung trap", t:["ghost","dark","bug"], s:["trickster"] },
      { a:"A hard-earned comeback", t:["fighting","fire","grass"], s:["breaker"] } ] },
    { sec:S3, q:"Your training philosophy…", o:[
      { a:"Push past every limit", t:["fighting","dragon","fire"], s:["breaker"] },
      { a:"Perfect the fundamentals", t:["steel","normal","rock"], s:["defense"] },
      { a:"Trust the bond above all", t:["fairy","grass","water"], s:["balanced"] },
      { a:"Out-think the meta", t:["psychic","dark","ghost"], s:["trickster"] } ] },
    { sec:S3, q:"Pick a held-item vibe.", o:[
      { a:"Choice Band — commit hard", t:["fighting","dragon","rock"], s:["breaker"] },
      { a:"Leftovers — endure forever", t:["steel","water","poison"], s:["defense"] },
      { a:"Focus Sash — one clutch chance", t:["electric","ghost","ice"], s:["trickster"] },
      { a:"Life Orb — all risk, all reward", t:["fire","dark","dragon"], s:["offense"] } ] },
    /* ===================== IV · HEART & SOUL ===================== */
    { sec:S4, q:"An element calls to you.", o:[
      { a:"Flame", t:["fire"], r:[3], s:["offense"] },
      { a:"Deep water and ice", t:["water","ice"], r:[7,4], s:["defense"] },
      { a:"Storm and lightning", t:["electric","flying"], r:[5], s:["offense"] },
      { a:"Earth and growing things", t:["grass","ground"], r:[8,9], s:["defense"] } ] },
    { sec:S4, q:"A legendary calls. You're drawn to the one that embodies…", o:[
      { a:"Time, space and creation", t:["steel","dragon","psychic"], r:[4], s:["setup"] },
      { a:"Nature, life and renewal", t:["fire","fairy","grass"], r:[2,6], s:["balanced"] },
      { a:"Shadow, dreams and the void", t:["dark","ghost","dragon"], r:[7,4], s:["trickster"] },
      { a:"Truth, ideals and thunder", t:["dragon","electric","ice"], r:[5], s:["breaker"] } ] },
    { sec:S4, q:"Your ideal partner Pokémon is…", o:[
      { a:"Fierce and proud", t:["fire","dragon","fighting"] },
      { a:"Gentle and loyal", t:["grass","normal","fairy"] },
      { a:"Sly and mischievous", t:["dark","ghost","poison"] },
      { a:"Cool and mysterious", t:["psychic","ice","steel"] } ] },
    { sec:S4, q:"Your role among friends?", o:[
      { a:"The leader, out front", t:["fire","fighting"], s:["offense"] },
      { a:"The protector", t:["steel","rock","fairy"], s:["defense"] },
      { a:"The strategist", t:["psychic","ghost"], s:["setup"] },
      { a:"The heart that holds it together", t:["grass","water","normal"], s:["balanced"] } ] },
    { sec:S4, q:"A mythic spirit you'd embody…", o:[
      { a:"The rising phoenix", t:["fire","flying"], s:["offense"] },
      { a:"The deep-sea leviathan", t:["water","dragon"], s:["breaker"] },
      { a:"The mountain golem", t:["rock","ground","steel"], s:["defense"] },
      { a:"The forest sprite", t:["grass","fairy","bug"], s:["balanced"] } ] },
    { sec:S4, q:"If you could master one power…", o:[
      { a:"Command fire and storm", t:["fire","electric"], s:["offense"] },
      { a:"Bend mind and shadow", t:["psychic","ghost","dark"], s:["trickster"] },
      { a:"Shape stone and steel", t:["rock","ground","steel"], s:["defense"] },
      { a:"Speak with every living thing", t:["grass","normal","fairy","water"], s:["balanced"] } ] },
    { sec:S4, q:"Above all, you love Pokémon for…", o:[
      { a:"The thrill of battle", t:["fighting","dragon"], s:["breaker","offense"] },
      { a:"Completing the whole dex", t:["normal","flying"], s:["balanced"] },
      { a:"The bond with your partners", t:["fairy","grass","water"], s:["defense"] },
      { a:"Mastering deep strategy", t:["psychic","steel"], s:["trickster","setup"] } ] },
  ];

  // ---------------------------------------------------------------- audio ---
  let actx = null;
  const beep = (f0, f1, dur, { type = "triangle", vol = 0.05, when = 0 } = {}) => {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
      lp.type = "lowpass"; lp.frequency.value = 4200;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  };
  const sfx = {
    pick:  () => { beep(520, 720, 0.12, { vol: 0.05 }); },
    back:  () => { beep(420, 300, 0.10, { vol: 0.04, type: "sawtooth" }); },
    reveal:() => { beep(523, 523, 0.14, { vol: 0.06 }); beep(784, 784, 0.16, { vol: 0.055, when: 0.09 }); beep(1046, 1200, 0.28, { type: "sine", vol: 0.05, when: 0.2 }); },
  };
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- state ---
  let DEX = [], NATIVE = {}, NATIVE_OK = false, MOVES = [];
  const byId = new Map();
  let answers = [];            // chosen option index per question
  let qi = 0;
  const nativeIn = (u, gen) => NATIVE_OK && NATIVE[gen] && NATIVE[gen].has(u.dexno);
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // -------------------------------------------------------------- scoring ---
  const leadingType = () => {                       // best type so far (for live tinting)
    const sc = {};
    answers.forEach((oi, i) => (QUESTIONS[i].o[oi].t || []).forEach((t, k) => sc[t] = (sc[t] || 0) + (k === 0 ? 3 : 1.5)));
    let best = null, bv = -1; for (const t in sc) if (sc[t] > bv) { bv = sc[t]; best = t; }
    return best;
  };
  const score = () => {
    const ty = {}, rg = {}, st = {};
    answers.forEach((oi, i) => {
      const o = QUESTIONS[i].o[oi];
      (o.t || []).forEach((t, k) => ty[t] = (ty[t] || 0) + (k === 0 ? 3 : 1.5));
      (o.r || []).forEach((r, k) => rg[r] = (rg[r] || 0) + (k === 0 ? 3 : 1.5));
      (o.s || []).forEach((s, k) => st[s] = (st[s] || 0) + (k === 0 ? 3 : 1.5));
    });
    const rank = obj => Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    const tRank = rank(ty), rRank = rank(rg), sRank = rank(st);
    const topType = tRank[0] || "normal";
    const secondType = tRank[1];
    // "specialize (if any)": decisive only if the leader clears the runner-up
    const specialize = !secondType || (ty[topType] >= ty[secondType] + 3 && ty[topType] >= ty[secondType] * 1.35);
    const topGen = +(rRank[0] || 1);
    const topStrat = sRank[0] || "balanced";
    return { ty, rg, st, topType, secondType, specialize, topGen, topStrat, tRank };
  };

  // pick a relatable species best fitting a (type, strategy, region) — seeded.
  // Drives both the "you'd be" pick and your rival.
  const pickMon = (type, stratKey, gen, exclude, rnd, second) => {
    const arches = STRAT_ARCH[stratKey] || [];
    let best = null, bv = -1;
    for (const u of DEX) {
      if (u.bst < 430 || u.bst > 600) continue;
      if (LEGENDARY.has(u.dexno) || BATTLE_ONLY.test(u.ident)) continue;
      if (exclude && exclude.has(u.id)) continue;
      let sc = 0;
      if (u.t1 === type) sc += 5; else if (u.t2 === type) sc += 4;
      else if (second && (u.t1 === second || u.t2 === second)) sc += 1.5;
      const arch = archetype(u.stats);
      if (arches[0] === arch) sc += 4; else if (arches.includes(arch)) sc += 2.5;
      if (gen && nativeIn(u, gen)) sc += 2;
      sc += rnd() * 2.2;
      if (sc > bv) { bv = sc; best = u; }
    }
    return best || byId.get(25);
  };

  // ---- add-on facets: nature · signature move · trainer title · rival ----
  const NATURES = {
    Adamant:{ up:"Atk", down:"SpA", f:"fiery and direct" },
    Jolly:  { up:"Spe", down:"SpA", f:"restless and upbeat" },
    Modest: { up:"SpA", down:"Atk", f:"quietly confident" },
    Timid:  { up:"Spe", down:"Atk", f:"cautious but quick" },
    Bold:   { up:"Def", down:"Atk", f:"steady and protective" },
    Calm:   { up:"SpD", down:"Atk", f:"serene and patient" },
    Impish: { up:"Def", down:"SpA", f:"cheeky and tough" },
    Careful:{ up:"SpD", down:"SpA", f:"watchful and wary" },
    Serious:{ up:"—",   down:"—",   f:"level-headed and even" },
  };
  const natureFor = (you, S) => {
    const phys = you.stats[1] >= you.stats[3], st = S.topStrat;
    let n = "Serious";
    if (st === "offense" || st === "setup") n = phys ? "Jolly" : "Timid";
    else if (st === "breaker") n = phys ? "Adamant" : "Modest";
    else if (st === "defense") n = (you.stats[2] >= you.stats[4]) ? "Impish" : "Calm";
    else if (st === "trickster") n = (you.stats[2] >= you.stats[4]) ? "Bold" : "Careful";
    return { name: n, ...NATURES[n] };
  };
  const FAVE_STATUS = /^(toxic|will-o-wisp|spore|thunder wave|recover|roost|calm mind|nasty plot|dragon dance|swords dance|spikes|stealth rock|substitute|hypnosis|confuse ray|quiver dance|shell smash|iron defense|synthesis|moonlight)$/i;
  const signatureMove = (you, S) => {
    if (!MOVES.length) return null;
    const t = S.topType, cat = you.stats[1] >= you.stats[3] ? "P" : "S";
    if (S.topStrat === "defense" || S.topStrat === "trickster") {
      const fave = MOVES.filter(m => m.type === t && m.cat === "N").find(m => FAVE_STATUS.test(m.name));
      if (fave) return fave;
    }
    let pool = MOVES.filter(m => m.type === t && m.power > 0 && m.cat === cat);
    if (!pool.length) pool = MOVES.filter(m => m.type === t && m.power > 0);
    pool.sort((a, b) => b.power - a.power);
    return pool[0] || null;
  };
  const RANK = { offense:"Blazing", breaker:"Relentless", defense:"Stalwart", trickster:"Cunning", setup:"Calculating", balanced:"Seasoned" };
  const CLASSK = { normal:"Ace Trainer", fire:"Kindler", water:"Swimmer", electric:"Guitarist", grass:"Ranger",
    ice:"Skier", fighting:"Black Belt", poison:"Chemist", ground:"Hiker", flying:"Bird Keeper", psychic:"Psychic",
    bug:"Bug Maniac", rock:"Collector", ghost:"Hex Maniac", dragon:"Dragon Tamer", dark:"Delinquent", steel:"Ironworker", fairy:"Enchanter" };
  const trainerTitle = (S) => `${RANK[S.topStrat] || "Seasoned"} ${CLASSK[S.topType] || "Ace Trainer"}`;
  const RIVAL_TYPE = { normal:"fighting", fire:"water", water:"grass", electric:"ground", grass:"fire", ice:"fire",
    fighting:"psychic", poison:"ground", ground:"water", flying:"electric", psychic:"dark", bug:"fire", rock:"water",
    ghost:"dark", dragon:"fairy", dark:"fighting", steel:"fire", fairy:"poison" };
  const RIVAL_STRAT = { offense:"defense", defense:"offense", breaker:"trickster", trickster:"breaker", setup:"balanced", balanced:"setup" };

  // build a themed six — your ace, then role players, region-native where possible,
  // rewarding type diversity so the squad reads as a real balanced team
  const buildTeam = (you, S, rnd) => {
    let pool = DEX.filter(u => u.bst >= 430 && !LEGENDARY.has(u.dexno) && !BATTLE_ONLY.test(u.ident));
    const nat = pool.filter(u => nativeIn(u, S.topGen));
    const use = nat.length >= 12 ? nat : pool;
    const chosen = [you], used = new Set([you.id]);
    const teamT = new Set([you.t1, you.t2].filter(Boolean));
    const ROLES = [
      { name:"SWEEPER",  sub:"speed & pressure", f:u => u.stats[5] + Math.max(u.stats[1], u.stats[3]) },
      { name:"WALL",     sub:"defensive anchor", f:u => (u.stats[0]*u.stats[2] + u.stats[0]*u.stats[4]) / 60 },
      { name:"SPECIAL",  sub:"special punch",    f:u => u.stats[3]*1.4 + (u.stats[0]+u.stats[4])*0.25 },
      { name:"SUPPORT",  sub:"glue & pivot",     f:u => u.stats[0] + Math.min(u.stats[2], u.stats[4]) + u.stats[5]*0.4 },
      { name:"COVERAGE", sub:"fills the gaps",   f:u => 0 },
    ];
    for (const role of ROLES) {
      let best = null, bv = -1;
      for (const u of use) {
        if (used.has(u.id)) continue;
        let sc = role.f(u);
        const nov = (!teamT.has(u.t1) ? 1 : 0) + (u.t2 && !teamT.has(u.t2) ? 1 : 0);
        sc += nov * 22;
        if (role.name === "COVERAGE") sc += nov * 70;
        else if (u.t1 === S.topType || u.t2 === S.topType) sc += 12;
        sc += rnd() * 28;
        if (sc > bv) { bv = sc; best = u; }
      }
      if (best) { chosen.push(best); used.add(best.id); teamT.add(best.t1); if (best.t2) teamT.add(best.t2); }
    }
    while (chosen.length < 6) {                      // safety top-up
      const u = use[(rnd() * use.length) | 0];
      if (u && !used.has(u.id)) { chosen.push(u); used.add(u.id); }
    }
    return chosen.slice(0, 6).map((u, i) => ({ u, role: i === 0 ? "ACE" : ROLES[i - 1].name, sub: i === 0 ? "your signature" : ROLES[i - 1].sub }));
  };

  // --------------------------------------------------------------- render ---
  const app = $("#app");
  const setType = t => {                             // tint the whole UI toward a type
    app.dataset.type = t || "none";
    app.style.setProperty("--type", t ? TYPE_HEX[t] : "#7c86ff");
  };
  const show = id => { $$(".scene").forEach(s => s.classList.remove("active")); $("#" + id).classList.add("active"); window.scrollTo(0, 0); };

  const typeChip = t => t ? `<span class="tchip" style="--tc:${TYPE_HEX[t]}">${t}</span>` : "";
  const typeDots = u => [u.t1, u.t2].filter(Boolean).map(t => `<i style="background:${TYPE_HEX[t]}"></i>`).join("");

  const renderQuestion = () => {
    const Q = QUESTIONS[qi];
    $("#qNum").textContent = "Q" + (qi + 1);
    $("#qCount").textContent = "/ " + QUESTIONS.length;
    $("#qpFill").style.width = ((qi) / QUESTIONS.length * 100) + "%";
    $("#qBack").style.visibility = qi === 0 ? "hidden" : "visible";
    const stage = $("#qStage");
    stage.innerHTML =
      `<div class="qcard">
        <div class="q-sec">${Q.sec || ""}</div>
        <h2 class="q-text">${Q.q}</h2>
        <div class="q-opts">${Q.o.map((o, i) =>
          `<button class="opt${answers[qi] === i ? " picked" : ""}" data-i="${i}" type="button">
             <span class="opt-key">${"ABCD"[i]}</span><span class="opt-a">${o.a}</span><span class="opt-go">→</span>
           </button>`).join("")}</div>
      </div>`;
    if (!prefersReduced) { const c = stage.querySelector(".qcard"); c.classList.add("in"); }
  };

  const answer = (i) => {
    answers[qi] = i; sfx.pick();
    const lt = leadingType(); if (lt) setType(lt);
    if (qi < QUESTIONS.length - 1) { qi++; renderQuestion(); }
    else { $("#qpFill").style.width = "100%"; finish(); }
  };

  // ---- crunch → results ----
  const CRUNCH_LINES = ["Reading your profile…", "Cross-checking the dex…", "Scouting your region…", "Drafting your team…", "Locking it in…"];
  const finish = () => {
    show("crunch");
    const el = $("#crunchTxt"); let k = 0;
    el.textContent = CRUNCH_LINES[0];
    const iv = setInterval(() => { k = (k + 1) % CRUNCH_LINES.length; el.textContent = CRUNCH_LINES[k]; }, 340);
    const dur = prefersReduced ? 200 : 1550;
    setTimeout(() => { clearInterval(iv); renderResults(); }, dur);
    // stash a shareable code
    try { location.hash = "r=" + answers.join(""); } catch {}
  };

  const renderResults = () => {
    const S = score();
    const rnd = mulberry32(hashSeed(answers.join("")) >>> 0);
    const you = pickMon(S.topType, S.topStrat, S.topGen, null, rnd, S.secondType);
    const team = buildTeam(you, S, rnd);
    const region = REGIONS[S.topGen - 1];
    const strat = STRATS[S.topStrat];
    const yArch = archetype(you.stats).toLowerCase();
    const title = trainerTitle(S), nature = natureFor(you, S), move = signatureMove(you, S);
    const rivalType = RIVAL_TYPE[S.topType] || "fighting", rivalStratKey = RIVAL_STRAT[S.topStrat] || "balanced";
    const rival = pickMon(rivalType, rivalStratKey, 0, new Set(team.map(m => m.u.id)), rnd);
    setType(S.topType); sfx.reveal();

    const typeLine = S.specialize
      ? `You specialize in <b>${S.topType}</b>`
      : `You're a <b>generalist</b> — but you lean <b>${S.topType}</b>`;

    const el = $("#results");
    el.innerHTML =
      `<div class="res-wrap">
        <div class="res-top">POKÉQUIZ · YOUR TRAINER PROFILE</div>

        <div class="hero-card" style="--tc:${TYPE_HEX[you.t1]}">
          <div class="hc-aura"></div>
          <div class="hc-kick">IF YOU WERE A POKÉMON</div>
          <div class="hc-body">
            <div class="hc-sprite"><img src="${SPRITE(you.id)}" onerror="${SPRITE_FALLBACK(you.dexno)}" alt="${displayName(you.ident)}"></div>
            <div class="hc-meta">
              <div class="hc-name">${displayName(you.ident)}</div>
              <div class="hc-types">${typeChip(you.t1)}${typeChip(you.t2)}<span class="hc-title">★ ${title}</span></div>
              <div class="hc-why">A ${yArch} at heart — ${TYPE_DESC[S.topType]}.</div>
            </div>
          </div>
        </div>

        <div class="facets">
          <div class="facet f-type">
            <div class="facet-h"><span class="fh-ic">✦</span>YOUR TYPE</div>
            <div class="facet-big">${S.specialize ? S.topType : S.topType + " ·ish"}</div>
            <div class="facet-sub">${typeLine}. ${cap(TYPE_DESC[S.topType])}.</div>
            <div class="type-bars">${topTypeBars(S)}</div>
          </div>
          <div class="facet f-region">
            <div class="facet-h"><span class="fh-ic">▲</span>YOUR REGION</div>
            <div class="facet-big">${region.name}</div>
            <div class="facet-sub">${cap(region.vibe)}</div>
          </div>
          <div class="facet f-strat">
            <div class="facet-h"><span class="fh-ic">⚔</span>YOUR STRATEGY</div>
            <div class="facet-big">${strat.name}</div>
            <div class="facet-sub">${strat.desc}</div>
          </div>
          <div class="facet f-kit">
            <div class="facet-h"><span class="fh-ic">✧</span>YOUR KIT</div>
            <div class="kit-row"><span class="kit-k">Nature</span><span class="kit-v">${nature.name}</span><span class="kit-x">${nature.up !== "—" ? "+" + nature.up + " / −" + nature.down : "neutral"}</span></div>
            <div class="kit-row"><span class="kit-k">Signature</span><span class="kit-v">${move ? move.name : "—"}</span><span class="kit-x">${move ? (move.power > 0 ? move.power + " BP" : "STATUS") : ""}</span></div>
            <div class="facet-sub">${cap(nature.f)} — you'd reach for <b>${move ? move.name : "your favourite move"}</b> without thinking.</div>
          </div>
        </div>

        <div class="team-card">
          <div class="facet-h"><span class="fh-ic">▦</span>YOUR TEAM OF SIX <span class="tc-region">${region.name}-forward</span></div>
          <div class="team-grid">${team.map((m, i) =>
            `<div class="tmon" style="--tc:${TYPE_HEX[m.u.t1]}">
               <span class="tmon-role">${m.role}</span>
               <div class="tmon-art"><img src="${SPRITE(m.u.id)}" onerror="${SPRITE_FALLBACK(m.u.dexno)}" alt="${displayName(m.u.ident)}"></div>
               <div class="tmon-name">${displayName(m.u.ident)}</div>
               <div class="tmon-dots">${typeDots(m.u)}</div>
               <div class="tmon-sub">${m.sub}</div>
             </div>`).join("")}</div>
        </div>

        <div class="rival-card" style="--tc:${TYPE_HEX[rivalType]}">
          <div class="rc-sprite"><img src="${SPRITE(rival.id)}" onerror="${SPRITE_FALLBACK(rival.dexno)}" alt="${displayName(rival.ident)}"></div>
          <div class="rc-body">
            <div class="rc-h"><span class="fh-ic">⚡</span>YOUR RIVAL</div>
            <div class="rc-name">${displayName(rival.ident)}</div>
            <div class="rc-sub">A ${rivalType}-type who plays <b>${STRATS[rivalStratKey].name}</b> — the trainer who'd love to knock you down a peg.</div>
          </div>
        </div>

        <div class="res-actions">
          <button class="ra-btn primary" id="shareBtn" type="button">Copy my profile</button>
          <button class="ra-btn" id="retakeBtn" type="button">Retake the quiz</button>
        </div>
        <div class="res-foot">wasapok.com/pokequiz · answers live in the link — share it and a friend sees exactly this</div>
      </div>`;
    show("results");
    $("#retakeBtn").addEventListener("click", restart);
    $("#shareBtn").addEventListener("click", () => copyProfile({ you, S, region, strat, team, title, nature, move, rival, rivalType }));
    if (!prefersReduced) requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll(".tmon, .facet, .hero-card").forEach((n, i) => { n.style.animationDelay = (i * 70) + "ms"; n.classList.add("pop"); });
    }));
  };

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hashSeed = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h; };
  const topTypeBars = (S) => {
    const max = S.ty[S.tRank[0]] || 1;
    return S.tRank.slice(0, 3).map(t =>
      `<div class="tbar"><span class="tbar-l">${t}</span><div class="tbar-t"><div class="tbar-f" style="width:${(S.ty[t] / max * 100).toFixed(0)}%;background:${TYPE_HEX[t]}"></div></div></div>`).join("");
  };

  const copyProfile = ({ you, S, region, strat, team, title, nature, move, rival, rivalType }) => {
    const txt =
`MY TRAINER PROFILE — wasapok.com/pokequiz
★ Title:  ${title}
◓ I'd be: ${displayName(you.ident).toUpperCase()} (${[you.t1, you.t2].filter(Boolean).join("/")})
✦ Type:   ${S.specialize ? S.topType : "generalist, leaning " + S.topType}
▲ Region: ${region.name}
⚔ Style:  ${strat.name}
✧ Kit:    ${nature.name} nature · ${move ? move.name : "—"}
▦ Team:   ${team.map(m => displayName(m.u.ident)).join(", ")}
⚡ Rival:  ${displayName(rival.ident)} (${rivalType})
Take it: ${location.origin}/pokequiz/#r=${answers.join("")}`;
    const btn = $("#shareBtn");
    const done = () => { btn.textContent = "Copied! ✓"; setTimeout(() => btn.textContent = "Copy my profile", 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
  };
  const fallbackCopy = (txt, done) => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); done(); };

  const restart = () => { answers = []; qi = 0; setType(null); try { location.hash = ""; } catch {} show("intro"); };

  // ---------------------------------------------------------------- events --
  const startQuiz = () => { answers = []; qi = 0; setType(null); show("quiz"); renderQuestion(); };
  const wire = () => {
    $("#beginBtn").addEventListener("click", startQuiz);
    $("#qStage").addEventListener("click", e => { const b = e.target.closest(".opt"); if (b) answer(+b.dataset.i); });
    $("#qBack").addEventListener("click", () => { if (qi > 0) { qi--; sfx.back(); const lt = leadingType(); setType(lt); renderQuestion(); } });
    $("#qRestart").addEventListener("click", restart);
    addEventListener("keydown", e => {
      if (!$("#quiz").classList.contains("active")) return;
      const k = e.key.toUpperCase();
      if ("ABCD".includes(k)) { const i = "ABCD".indexOf(k); if (QUESTIONS[qi].o[i]) answer(i); }
      else if ((k === "1" || k === "2" || k === "3" || k === "4")) { const i = +k - 1; if (QUESTIONS[qi].o[i]) answer(i); }
      else if (e.key === "Backspace") { if (qi > 0) { qi--; renderQuestion(); } }
    });
  };

  // ------------------------------------------------------------------ boot --
  async function boot() {
    let raw;
    try { raw = await (await fetch("data/pokedex.json")).json(); }
    catch { $("#introFoot").innerHTML = `<span style="color:#ff8a8a">Couldn't load the dex — refresh to retry.</span>`; return; }
    DEX = raw.map(r => { const [id, ident, t1, t2, stats, dexno] = r;
      const u = { id, ident, name: prettify(ident), key: norm(ident), t1, t2: t2 || null, stats, bst: stats.reduce((a, b) => a + b, 0), dexno, gen: genOf(dexno) };
      byId.set(id, u); return u; });
    try { const nd = await (await fetch("data/nativedex.json")).json();
      for (let g = 1; g <= 9; g++) NATIVE[g] = new Set(nd[g] || nd[String(g)] || []); NATIVE_OK = true; } catch {}
    try { const mv = await (await fetch("data/moves.json")).json();
      MOVES = mv.map(r => ({ id: r[0], name: r[1], type: r[2], power: r[3] || 0, cat: r[4] || "N" })); } catch {}
    const qt = $("#qTotal"); if (qt) qt.textContent = QUESTIONS.length;
    $("#introFoot").textContent = `${DEX.length} species on file · ${QUESTIONS.length} questions · ~${Math.max(2, Math.round(QUESTIONS.length * 8 / 60))} min`;
    wire();
    if (location.hash === "#quiz") { startQuiz(); return; }   // dev/preview hook
    // deep-link: #r=<12 answer indices> jumps straight to a shared result
    const m = /(?:^|[#&])r=([0-3]{1,40})/.exec(location.hash);
    if (m && m[1].length === QUESTIONS.length) { answers = m[1].split("").map(Number); qi = QUESTIONS.length; renderResults(); }
  }
  boot();
})();
