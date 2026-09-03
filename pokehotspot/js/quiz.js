/* =============================================================================
   POKÉHOTSPOT — quiz.js
   QUIZ (ex-pokequiz "Trainer Profile"). Two reads that share one engine:
     · TRAINER PROFILE — a long personality read → the Pokémon you'd be, your
       type · region · form · strategy · kit, a scanned party of six, your rival.
     · TYPE SPECIALIST — pick a type, then the one of it you'd be + a squad.
   Any party the quiz forges can be ADOPTED straight into your hang-out (with
   legal movesets, via the shared forge builder). Re-dressed from the original
   editorial look into pokecenter glass; the station blooms to your leading type.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH;
  const { $, $$, SPRITE, spriteFallback, norm, clamp, buzz, byId } = P;
  const DEX   = () => P.DEX;
  const MOVES = () => P.MOVES;
  const archetype = P.archetype;

  // ---- display name (regional forms read nicely) ---------------------------
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
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  const TYPES = P.TYPES;
  const TYPE_HEX = { normal:"#a0a29f", fire:"#ff7043", water:"#4a90da", electric:"#f6c945",
    grass:"#5ec877", ice:"#79d0d8", fighting:"#e0526b", poison:"#b45fd6", ground:"#dba552",
    flying:"#92a8e6", psychic:"#fb6a8f", bug:"#a5c93a", rock:"#cbb87e", ghost:"#7b6bc4",
    dragon:"#6a7bff", dark:"#6b6a78", steel:"#7aa0b4", fairy:"#f38fd0" };
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
    { g:1, name:"KANTO",  vibe:"where it all began — classic, bold and endlessly iconic." },
    { g:2, name:"JOHTO",  vibe:"tradition and legend, wrapped in autumn gold." },
    { g:3, name:"HOENN",  vibe:"sun, sea and volcano — a land of beautiful extremes." },
    { g:4, name:"SINNOH", vibe:"myth-soaked peaks where the world itself was made." },
    { g:5, name:"UNOVA",  vibe:"big-city ambition and stark, modern drama." },
    { g:6, name:"KALOS",  vibe:"beauty, style and a whisper of ancient mystery." },
    { g:7, name:"ALOLA",  vibe:"island warmth, easy days and surprising depths." },
    { g:8, name:"GALAR",  vibe:"rain, grit and roaring stadium crowds." },
    { g:9, name:"PALDEA", vibe:"wide-open freedom and treasure worth chasing." },
  ];
  const STRATS = {
    offense:  { name:"Hyper-Offense",     desc:"Hit first, hit hardest. You'd rather win the fight before it becomes one." },
    balanced: { name:"The Balanced Ace",  desc:"An answer for every threat — you read the battle and never fold." },
    defense:  { name:"The Wall",          desc:"Outlast anything thrown at you. Patience is your sharpest weapon." },
    trickster:{ name:"The Trickster",     desc:"Status, hazards and misdirection win the fight before damage ever does." },
    breaker:  { name:"The Bulky Breaker", desc:"Tanky and relentless — you break through walls and keep on coming." },
    setup:    { name:"The Setup Sweeper", desc:"Give you a single free turn and it's over. You build to an unstoppable finish." },
  };
  const CREEDS = {
    offense:  "Strike first. Ask questions never.",
    breaker:  "Every wall is just a door I haven't broken yet.",
    defense:  "Outlast them — the mountain never chases the storm.",
    trickster:"The battle's won in their head before it starts.",
    setup:    "Give me one free turn. That's all I'll ever need.",
    balanced: "A partner for every problem. That's how you win.",
  };

  // legendary / mythical / pseudo tiers (kept out of the relatable "you'd be" pool)
  const LEGENDARY = new Set([144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,
    480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,638,639,640,641,642,643,644,645,646,647,648,649,
    716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,800,801,802,803,804,805,806,807,808,809,
    888,889,890,891,892,893,894,895,896,897,898,905,984,985,986,987,988,989,990,991,992,993,994,995,
    1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1014,1015,1016,1017,1020,1021,1022,1023,1024,1025]);
  const BATTLE_ONLY = /-mega|-gmax|-primal|-totem|-eternamax|-ultra|-busted|-crowned|-eternal|-ash|-starter/;
  const MYTHICAL = new Set([151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,801,802,807,808,809,893,1025]);
  const LEGEND_ONLY = new Set([...LEGENDARY].filter(d => !MYTHICAL.has(d)));
  const PSEUDO = new Set([149,248,373,376,445,635,706,784,887,998]);
  const SCARY_TYPES = new Set(["dragon","dark","ghost","rock","steel","poison","fighting","ground"]);
  const CUTE = new Set([25,26,35,36,39,40,113,133,134,135,136,172,173,174,175,176,183,184,209,300,301,468,700,517,546,547,684,685,702,761,856,857,926,957]);
  const CUTE_TYPES = new Set(["fairy","normal","grass","water","electric","psychic","ice"]);
  const monsterScore = u => u.bst / 100 + (SCARY_TYPES.has(u.t1) ? 1.4 : 0) + (SCARY_TYPES.has(u.t2) ? 1 : 0) + (PSEUDO.has(u.dexno) ? 3 : 0);
  const cuteScore = u => (CUTE.has(u.dexno) ? 4 : 0) + (CUTE_TYPES.has(u.t1) ? 1.4 : 0) + (CUTE_TYPES.has(u.t2) ? 0.8 : 0) + (u.bst < 480 ? 1 : 0);

  // FORM axis (which regional variant of a species you'd be)
  const FORMS = {
    base:  { name:"ORIGINAL",  adj:"true-to-form",   vibe:"timeless and unchanged — you honour the classics and never lose yourself to a trend." },
    alola: { name:"ALOLAN",    adj:"island-touched", vibe:"shaped by warmth and easy days — you adapt, relax into new places and wear change lightly." },
    galar: { name:"GALARIAN",  adj:"reforged",       vibe:"tempered by a harsher world — tougher, moodier and rebuilt from the ground up." },
    hisui: { name:"HISUIAN",   adj:"primal",         vibe:"ancient and untamed — you carry an older, wilder spirit the modern world forgot." },
    paldea:{ name:"PALDEAN",   adj:"unbound",        vibe:"bold and free — a fearless, modern reinvention that answers to no one." },
  };
  const FORM_KEYS = ["alola", "galar", "hisui", "paldea"];
  const formOf = ident => { for (const k of FORM_KEYS) if (ident.includes("-" + k)) return k; return "base"; };

  const STRAT_ARCH = {
    offense:  ["PHYS SWEEPER","SPEC SWEEPER","SCOUT","PHYS ATTACKER","SPEC ATTACKER"],
    breaker:  ["WALLBREAKER","SPEC BREAKER","MIXED ATTACKER","PHYS ATTACKER"],
    defense:  ["FORTRESS","PHYS WALL","SPEC WALL","BULKY PIVOT"],
    setup:    ["PHYS SWEEPER","SPEC SWEEPER","PHYS ATTACKER","SPEC ATTACKER"],
    trickster:["SCOUT","BULKY PIVOT","ALL-ROUNDER","SPEC WALL"],
    balanced: ["ALL-ROUNDER","BULKY PIVOT","MIXED ATTACKER","PHYS ATTACKER"],
  };

  // ---- the questions ---------------------------------------------------------
  const S1 = "I · TEMPERAMENT", S2 = "II · YOUR WORLD", S3 = "III · IN BATTLE",
        S4 = "IV · HEART & SOUL", S5 = "V · IDENTITY & FORM", S6 = "VI · DESTINY & BOND",
        S7 = "VII · FINE PRINT";
  const QUESTIONS = [
    /* ===================== I · TEMPERAMENT ===================== */
    { sec:S1, q:"Friends would call you…", o:[
      { a:"Bold and fiery", t:["fire","fighting"], s:["offense"] },
      { a:"Calm and dependable", t:["water","steel","rock"], s:["defense"] },
      { a:"Clever and unpredictable", t:["psychic","ghost","dark"], s:["trickster"] },
      { a:"Warm and loyal", t:["normal","fairy","grass"], s:["balanced"] },
      { a:"Restless and free", t:["flying","electric","bug"], s:["setup"] } ] },
    { sec:S1, q:"Your greatest strength?", o:[
      { a:"Raw power", t:["fighting","dragon","rock"], s:["breaker"] },
      { a:"Speed and instinct", t:["electric","flying","normal"], s:["offense"] },
      { a:"Resilience", t:["steel","rock","ground"], s:["defense"] },
      { a:"Cunning", t:["dark","ghost","poison"], s:["trickster"] },
      { a:"Empathy", t:["fairy","grass","water"], s:["balanced"] } ] },
    { sec:S1, q:"And your flaw?", o:[
      { a:"Reckless", t:["fire","fighting"], s:["offense"] },
      { a:"Stubborn", t:["rock","ground","steel"], s:["defense"] },
      { a:"Secretive", t:["dark","ghost","ice"], s:["trickster"] },
      { a:"Too trusting", t:["fairy","normal","grass"], s:["balanced"] },
      { a:"Aloof", t:["psychic","poison","dragon"], s:["setup"] } ] },
    { sec:S1, q:"In a crowded room, you're…", o:[
      { a:"The centre of it all", t:["fire","fairy","normal"], s:["offense"] },
      { a:"Reading everyone quietly", t:["psychic","dark","ghost"], s:["trickster"] },
      { a:"Bringing people together", t:["grass","water","normal"], s:["balanced"] },
      { a:"The unpredictable spark", t:["electric","bug","poison"], s:["setup"] },
      { a:"Watching from the wall", t:["steel","ice","rock"], s:["defense"] } ] },
    { sec:S1, q:"You make the big calls with…", o:[
      { a:"Gut instinct — fast", t:["fire","electric","flying"], s:["offense"] },
      { a:"Careful analysis", t:["psychic","steel","ice"], s:["setup"] },
      { a:"What feels right for everyone", t:["fairy","normal","grass"], s:["balanced"] },
      { a:"Firm principle, no bending", t:["fighting","rock","steel"], s:["breaker"] },
      { a:"A quiet hunch you keep to yourself", t:["dark","ghost","poison"], s:["trickster"] } ] },
    { sec:S1, q:"When a plan falls apart, you…", o:[
      { a:"Charge harder", t:["fire","fighting","dragon"], s:["offense"] },
      { a:"Dig in and outlast it", t:["rock","steel","water"], s:["defense"] },
      { a:"Improvise a new angle", t:["dark","ghost","bug"], s:["trickster"] },
      { a:"Calmly rebuild the plan", t:["psychic","grass","ice"], s:["setup"] },
      { a:"Rally everyone and adapt", t:["normal","fairy","flying"], s:["balanced"] } ] },
    { sec:S1, q:"Your daily discipline looks like…", o:[
      { a:"Relentless training", t:["fighting","steel","dragon"], s:["breaker"] },
      { a:"A steady, gentle routine", t:["normal","grass","fairy"], s:["defense"] },
      { a:"Chaotic bursts of genius", t:["electric","bug","fire"], s:["offense"] },
      { a:"Quiet study and planning", t:["psychic","ghost","ice"], s:["setup"] },
      { a:"Whatever the day demands", t:["water","flying","poison"], s:["balanced"] } ] },
    /* ===================== II · YOUR WORLD ===================== */
    { sec:S2, q:"Where do you feel most at home?", o:[
      { a:"A neon city that never sleeps", t:["electric","dark","steel"], r:[5,6], s:["offense"] },
      { a:"A quiet mountain village", t:["rock","ground","ice"], r:[4,2], s:["defense"] },
      { a:"Sun-soaked beaches and islands", t:["water","fire","grass"], r:[7,3], s:["balanced"], f:["alola"] },
      { a:"Rolling green countryside", t:["grass","normal","fairy"], r:[8,1,9], s:["defense"] },
      { a:"A wild, untouched frontier", t:["ground","flying","dragon"], r:[9,4], s:["setup"], f:["hisui","paldea"] } ] },
    { sec:S2, q:"You'd build your base in…", o:[
      { a:"A volcano's edge", t:["fire","rock"], r:[7,3], s:["offense"] },
      { a:"A deep forest grove", t:["grass","bug","poison"], r:[6,2], s:["balanced"], f:["hisui"] },
      { a:"An ancient, echoing ruin", t:["ghost","psychic","ground"], r:[9,4], s:["trickster"], f:["hisui"] },
      { a:"A cliffside above the sea", t:["water","flying","ice"], r:[3,8], s:["defense"] },
      { a:"A rain-slick industrial district", t:["steel","electric","dark"], r:[8,5], s:["breaker"], f:["galar"] } ] },
    { sec:S2, q:"Your kind of weather…", o:[
      { a:"Blazing sun", t:["fire","ground","grass"], r:[3,7], f:["alola"] },
      { a:"Pouring rain", t:["water","electric"], r:[8], f:["galar"] },
      { a:"A swirling sandstorm", t:["rock","ground","steel"], r:[9], f:["paldea"] },
      { a:"Silent snowfall", t:["ice","fairy","steel"], r:[4], f:["hisui"] },
      { a:"Clear skies and open wind", t:["flying","normal","dragon"], r:[1,2] } ] },
    { sec:S2, q:"You're a season.", o:[
      { a:"Blazing summer", t:["fire","grass"], r:[3,7], f:["alola"] },
      { a:"Still winter", t:["ice","steel"], r:[4,8], f:["galar"] },
      { a:"Golden autumn", t:["ground","rock","ghost"], r:[6,2,9], f:["hisui"] },
      { a:"Fresh spring", t:["fairy","grass","normal"], r:[1,8] },
      { a:"A storm season all its own", t:["electric","water","flying"], r:[5], f:["paldea"] } ] },
    { sec:S2, q:"A treasure worth chasing…", o:[
      { a:"A relic of the ancient world", t:["rock","ground","steel"], r:[4,9], s:["setup"], f:["hisui"] },
      { a:"A rare, radiant gem", t:["fairy","psychic"], r:[6], s:["balanced"] },
      { a:"Lost, humming technology", t:["electric","steel","poison"], r:[5], s:["trickster"], f:["galar"] },
      { a:"A legend's fallen feather", t:["flying","fire","dragon"], r:[2], s:["offense"] },
      { a:"Wide-open freedom itself", t:["normal","ground","grass"], r:[9], s:["balanced"], f:["paldea"] } ] },
    { sec:S2, q:"Pick a palette.", o:[
      { a:"Reds and embers", t:["fire","fighting"] },
      { a:"Blues and frost", t:["water","ice","flying"] },
      { a:"Violets and shadow", t:["poison","ghost","dark","psychic"] },
      { a:"Greens and gold", t:["grass","ground","bug","electric"] },
      { a:"Silver and steel", t:["steel","normal","rock"], f:["galar"] } ] },
    { sec:S2, q:"First thing you notice in a new town…", o:[
      { a:"The gym and its challengers", t:["fighting","fire"], r:[5], s:["offense"] },
      { a:"The market and its people", t:["normal","grass","fairy"], r:[8], s:["balanced"], f:["alola"] },
      { a:"The old shrine or lab", t:["psychic","ghost","steel"], r:[4], s:["setup"], f:["hisui"] },
      { a:"The wild edges beyond it", t:["dark","poison","ground"], r:[9], s:["trickster"], f:["paldea"] },
      { a:"The harbour and the horizon", t:["water","flying","ice"], r:[3,7] } ] },
    /* ===================== III · IN BATTLE ===================== */
    { sec:S3, q:"In a tough battle, you…", o:[
      { a:"Go all-in and overwhelm them", t:["fighting","fire","dragon"], s:["offense"] },
      { a:"Wear them down patiently", t:["steel","water","poison"], s:["defense"] },
      { a:"Set traps and flip the tide", t:["ghost","dark","bug"], s:["trickster"] },
      { a:"Read them and counter perfectly", t:["psychic","normal","fairy"], s:["balanced"] },
      { a:"Build one turn, then end it", t:["dragon","electric","ice"], s:["setup"] } ] },
    { sec:S3, q:"Your ideal adventure is…", o:[
      { a:"Racing to be the very best", t:["fire","electric","fighting"], r:[1], s:["offense"] },
      { a:"Uncovering ancient mysteries", t:["psychic","ghost","rock"], r:[4,9], s:["setup"], f:["hisui"] },
      { a:"Befriending every creature I meet", t:["normal","fairy","grass"], r:[8], s:["balanced"] },
      { a:"Testing myself against the strongest", t:["dragon","fighting","steel"], r:[3], s:["breaker"] },
      { a:"Wandering wherever the road goes", t:["flying","ground","water"], r:[9,7], s:["trickster"], f:["paldea"] } ] },
    { sec:S3, q:"What matters most in a battle team?", o:[
      { a:"Overwhelming firepower", t:["fire","dragon","fighting"], s:["breaker"] },
      { a:"An airtight, unbreakable core", t:["steel","rock","water"], s:["defense"] },
      { a:"Clever synergy and traps", t:["ghost","bug","poison"], s:["trickster"] },
      { a:"Speed and adaptability", t:["electric","flying","normal"], s:["offense"] },
      { a:"Deep, patient setup", t:["psychic","grass","ice"], s:["setup"] } ] },
    { sec:S3, q:"Your relationship with the rules…", o:[
      { a:"Honour them fully", t:["normal","steel","fairy"], s:["defense"], f:["base"] },
      { a:"Bend them when needed", t:["psychic","water","grass"], s:["balanced"] },
      { a:"Break them for the win", t:["fire","fighting","dragon"], s:["offense"] },
      { a:"Rewrite them entirely", t:["dark","ghost","poison"], s:["trickster"], f:["paldea"] },
      { a:"Never learned them anyway", t:["ground","rock","bug"], s:["breaker"], f:["hisui"] } ] },
    { sec:S3, q:"Your ideal victory is…", o:[
      { a:"A flawless, unanswered sweep", t:["dragon","electric","fire"], s:["setup"] },
      { a:"A grinding war of attrition", t:["steel","water","poison"], s:["defense"] },
      { a:"A perfectly sprung trap", t:["ghost","dark","bug"], s:["trickster"] },
      { a:"A hard-earned comeback", t:["fighting","fire","grass"], s:["breaker"] },
      { a:"One clean, decisive strike", t:["ice","rock","normal"], s:["offense"] } ] },
    { sec:S3, q:"Your training philosophy…", o:[
      { a:"Push past every limit", t:["fighting","dragon","fire"], s:["breaker"] },
      { a:"Perfect the fundamentals", t:["steel","normal","rock"], s:["defense"], f:["base"] },
      { a:"Trust the bond above all", t:["fairy","grass","water"], s:["balanced"] },
      { a:"Out-think the meta", t:["psychic","dark","ghost"], s:["trickster"] },
      { a:"Return to primal instinct", t:["ground","bug","poison"], s:["setup"], f:["hisui"] } ] },
    { sec:S3, q:"Pick a held-item vibe.", o:[
      { a:"Choice Band — commit hard", t:["fighting","dragon","rock"], s:["breaker"] },
      { a:"Leftovers — endure forever", t:["steel","water","poison"], s:["defense"] },
      { a:"Focus Sash — one clutch chance", t:["electric","ghost","ice"], s:["trickster"] },
      { a:"Life Orb — all risk, all reward", t:["fire","dark","dragon"], s:["offense"] },
      { a:"Eviolite — patience, potential", t:["grass","normal","fairy"], s:["setup"] } ] },
    /* ===================== IV · HEART & SOUL ===================== */
    { sec:S4, q:"An element calls to you.", o:[
      { a:"Flame", t:["fire"], r:[3], s:["offense"] },
      { a:"Deep water and ice", t:["water","ice"], r:[7,4], s:["defense"] },
      { a:"Storm and lightning", t:["electric","flying"], r:[5], s:["offense"] },
      { a:"Earth and growing things", t:["grass","ground"], r:[8,9], s:["defense"] },
      { a:"Mind and shadow", t:["psychic","ghost","dark"], r:[6,4], s:["trickster"] } ] },
    { sec:S4, q:"A legendary calls. You're drawn to the one that embodies…", o:[
      { a:"Time, space and creation", t:["steel","dragon","psychic"], r:[4], s:["setup"] },
      { a:"Nature, life and renewal", t:["fire","fairy","grass"], r:[2,6], s:["balanced"] },
      { a:"Shadow, dreams and the void", t:["dark","ghost","dragon"], r:[7,4], s:["trickster"] },
      { a:"Truth, ideals and thunder", t:["dragon","electric","ice"], r:[5], s:["breaker"] },
      { a:"Land, sea and sky", t:["ground","water","flying"], r:[3], s:["offense"] } ] },
    { sec:S4, q:"Your ideal partner Pokémon is…", o:[
      { a:"Fierce and proud", t:["fire","dragon","fighting"] },
      { a:"Gentle and loyal", t:["grass","normal","fairy"] },
      { a:"Sly and mischievous", t:["dark","ghost","poison"] },
      { a:"Cool and mysterious", t:["psychic","ice","steel"] },
      { a:"Playful and boundless", t:["electric","water","flying"] } ] },
    { sec:S4, q:"Your role among friends?", o:[
      { a:"The leader, out front", t:["fire","fighting"], s:["offense"] },
      { a:"The protector", t:["steel","rock","fairy"], s:["defense"] },
      { a:"The strategist", t:["psychic","ghost"], s:["setup"] },
      { a:"The heart that holds it together", t:["grass","water","normal"], s:["balanced"] },
      { a:"The wildcard", t:["electric","dark","bug"], s:["trickster"] } ] },
    { sec:S4, q:"A mythic spirit you'd embody…", o:[
      { a:"The rising phoenix", t:["fire","flying"], s:["offense"] },
      { a:"The deep-sea leviathan", t:["water","dragon"], s:["breaker"] },
      { a:"The mountain golem", t:["rock","ground","steel"], s:["defense"] },
      { a:"The forest sprite", t:["grass","fairy","bug"], s:["balanced"] },
      { a:"The midnight phantom", t:["ghost","dark","psychic"], s:["trickster"] } ] },
    { sec:S4, q:"If you could master one power…", o:[
      { a:"Command fire and storm", t:["fire","electric"], s:["offense"] },
      { a:"Bend mind and shadow", t:["psychic","ghost","dark"], s:["trickster"] },
      { a:"Shape stone and steel", t:["rock","ground","steel"], s:["defense"] },
      { a:"Speak with every living thing", t:["grass","normal","fairy","water"], s:["balanced"] },
      { a:"Ride the wind, unbound", t:["flying","dragon","ice"], s:["setup"] } ] },
    { sec:S4, q:"Above all, you love Pokémon for…", o:[
      { a:"The thrill of battle", t:["fighting","dragon"], s:["breaker","offense"] },
      { a:"Completing the whole dex", t:["normal","flying"], s:["balanced"] },
      { a:"The bond with your partners", t:["fairy","grass","water"], s:["defense"] },
      { a:"Mastering deep strategy", t:["psychic","steel"], s:["trickster","setup"] },
      { a:"Discovering the strange and rare", t:["ghost","poison","bug"], s:["setup"], f:["hisui","galar"] } ] },
    /* ===================== V · IDENTITY & FORM ===================== */
    { sec:S5, q:"How do you wear change?", o:[
      { a:"I stay true to who I've always been", t:["normal","rock","fighting"], f:["base"] },
      { a:"I adapt and mellow into new places", t:["water","grass","fairy"], f:["alola"] },
      { a:"I let hardship reforge me tougher", t:["steel","dark","poison"], f:["galar"] },
      { a:"I reconnect with something older in me", t:["ghost","ground","bug"], f:["hisui"] },
      { a:"I reinvent myself entirely, my way", t:["electric","fire","dragon"], f:["paldea"] } ] },
    { sec:S5, q:"A place transforms the people in it. Yours is…", o:[
      { a:"Nowhere — I'm the same everywhere", t:["normal","steel"], f:["base"] },
      { a:"A sunlit island that softens you", t:["water","fairy","grass"], r:[7], f:["alola"] },
      { a:"A cold, industrial city that hardens you", t:["steel","electric","dark"], r:[8], f:["galar"] },
      { a:"An ancient wilderness that awakens you", t:["ground","rock","ghost"], r:[4], f:["hisui"] },
      { a:"A wide frontier that sets you free", t:["flying","fighting","dragon"], r:[9], f:["paldea"] } ] },
    { sec:S5, q:"Your relationship with tradition…", o:[
      { a:"Honour it — classics are classic for a reason", t:["normal","fire","water"], f:["base"] },
      { a:"Blend the old and new, easygoing", t:["grass","fairy","psychic"], f:["alola"] },
      { a:"Rebuild it grittier and modern", t:["dark","steel","poison"], f:["galar"] },
      { a:"Dig beneath it to the primal roots", t:["ground","rock","bug"], f:["hisui"] },
      { a:"Toss it out and start fresh", t:["electric","fighting","dragon"], f:["paldea"] } ] },
    { sec:S5, q:"If your look got a redesign, it'd be…", o:[
      { a:"Unchanged — timeless", t:["normal","fighting","rock"], f:["base"] },
      { a:"Breezy, tropical, relaxed", t:["water","grass","fairy"], f:["alola"] },
      { a:"Darker, tougher, a little punk", t:["dark","steel","ghost"], f:["galar"] },
      { a:"Rugged, ancient, feral", t:["ground","fire","bug"], f:["hisui"] },
      { a:"Sleek, bold, rebellious", t:["electric","dragon","poison"], f:["paldea"] } ] },
    { sec:S5, q:"What awakens your true form?", o:[
      { a:"Nothing — I was always this", t:["normal","psychic","steel"], f:["base"] },
      { a:"Warmth, community and ease", t:["fairy","grass","water"], f:["alola"] },
      { a:"Pressure and hard weather", t:["ice","steel","fighting"], f:["galar"] },
      { a:"The call of a wilder past", t:["ghost","ground","rock"], f:["hisui"] },
      { a:"Freedom and the open road", t:["flying","fire","electric"], f:["paldea"] } ] },
    /* ============ VI · DESTINY & BOND ============ */
    { sec:S6, q:"A legendary Pokémon crosses your path. You…", o:[
      { a:"Capture it — power like that belongs with me", t:["dragon","psychic"], L:3, M:1 },
      { a:"Befriend it as an equal, never a trophy", t:["fairy","normal"], L:1, Y:1 },
      { a:"Bow and let it pass — some things aren't ours to hold", t:["grass","water"], L:-3 },
      { a:"Study it from afar, in awe", t:["psychic","ice"], Y:2, L:1 },
      { a:"Challenge it to prove myself", t:["fighting","fire"], L:2, M:2, P:1 } ] },
    { sec:S6, q:"Be honest — what would you ACTUALLY want on your team?", o:[
      { a:"A world-shaking legendary, obviously", t:["dragon","steel"], L:4 },
      { a:"A terrifying pseudo-legend powerhouse", t:["dragon","dark"], P:4, M:3 },
      { a:"A rare mythical few will ever see", t:["psychic","fairy"], Y:4, L:1 },
      { a:"A cute little partner I adore", t:["fairy","normal"], M:-4 },
      { a:"A balanced, reliable ace", t:["normal","fighting"], M:0 } ] },
    { sec:S6, q:"Do you believe you're destined for greatness?", o:[
      { a:"Absolutely — it's my fate", t:["dragon","fire"], L:3, s:["breaker"] },
      { a:"I'll earn it through sheer work", t:["fighting","steel"], L:1, s:["breaker"] },
      { a:"Greatness is overrated — I want joy", t:["fairy","grass"], L:-2, M:-2 },
      { a:"I revere those far greater than me", t:["psychic","ice"], Y:2, L:1 },
      { a:"I'd rather be feared than admired", t:["dark","poison"], M:3, P:1, s:["trickster"] } ] },
    { sec:S6, q:"The Pokémon that fits you is more…", o:[
      { a:"Cute and cuddly", t:["fairy","normal"], M:-3 },
      { a:"Cool and sleek", t:["ice","steel","dark"], M:1 },
      { a:"Fierce and monstrous", t:["dragon","dark","rock"], M:3, P:2 },
      { a:"Elegant and graceful", t:["fairy","psychic","flying"], M:-1, Y:1 },
      { a:"Ancient and powerful", t:["rock","ground","dragon"], L:2, Y:1, P:1 } ] },
    { sec:S6, q:"You'd rather your ACE be…", o:[
      { a:"A colossal, fearsome beast", t:["dragon","rock","ground"], P:3, M:2 },
      { a:"A radiant legendary", t:["psychic","fire","dragon"], L:3 },
      { a:"A juggernaut you raised from tiny", t:["dragon","fighting"], P:2, M:1 },
      { a:"A clever trickster", t:["ghost","dark","psychic"], M:-1, s:["trickster"] },
      { a:"A graceful, loyal companion", t:["fairy","grass","water"], M:-2 } ] },
    { sec:S6, q:"What would you do with unlimited power?", o:[
      { a:"Rule and reshape the world", t:["dark","dragon"], L:3, M:1 },
      { a:"Protect everyone I love", t:["fairy","steel"], L:-1, s:["defense"] },
      { a:"Explore every last mystery", t:["psychic","water"], Y:2, s:["setup"] },
      { a:"Prove I'm the undisputed strongest", t:["fighting","fire"], M:2, L:1, P:1 },
      { a:"Live free, bound to no one", t:["flying","electric"], L:-1, f:["paldea"] } ] },
    { sec:S6, q:"Your bond with your Pokémon is…", o:[
      { a:"One unbreakable lifelong partner", t:["normal","fairy"], M:-1, L:-1 },
      { a:"A whole loving family of them", t:["grass","water","normal"], M:-3, L:-2 },
      { a:"A pantheon of the mightiest", t:["dragon","steel"], L:3, P:1 },
      { a:"A rare, secret companion few have met", t:["ghost","psychic"], Y:3 },
      { a:"A rival-turned-ally forged in battle", t:["fighting","dark"], M:1, P:1 } ] },
    { sec:S6, q:"When your legend is finally written, it says…", o:[
      { a:"Conquered every challenge there was", t:["fighting","dragon"], L:2, M:1 },
      { a:"Was loved by every Pokémon they met", t:["fairy","grass"], M:-2, L:-1 },
      { a:"Touched the divine", t:["psychic","steel"], Y:3, L:1 },
      { a:"Was feared across every region", t:["dark","poison"], M:3, P:1 },
      { a:"Walked a path that was theirs alone", t:["dark","ghost"], s:["trickster"], f:["paldea"] } ] },
    /* ============ VII · FINE PRINT ============ */
    { sec:S7, q:"Your favourite stat to build around is…", o:[
      { a:"Attack — hit like a truck", t:["fighting","dragon","rock"], s:["breaker"], M:1 },
      { a:"Speed — act before they can", t:["electric","flying","normal"], s:["offense"] },
      { a:"Special Attack — precision blasts", t:["psychic","fire","ice"], s:["setup"] },
      { a:"Defense — an immovable object", t:["steel","rock","ground"], s:["defense"], M:1 },
      { a:"HP & bulk — never go down", t:["normal","fairy","poison"], s:["defense"], M:-1 } ] },
    { sec:S7, q:"Your battle tempo is…", o:[
      { a:"Blitz — over in three turns", t:["electric","fire","fighting"], s:["offense"] },
      { a:"A long, grinding chess match", t:["steel","water","psychic"], s:["defense"] },
      { a:"Feints, then a sudden kill", t:["dark","ghost","bug"], s:["trickster"] },
      { a:"Build up, then unleash", t:["dragon","grass","ice"], s:["setup"] },
      { a:"Adapt turn by turn", t:["normal","fairy","flying"], s:["balanced"] } ] },
    { sec:S7, q:"Honestly, which type do you just LOVE using?", o:[
      { a:"Fire, dragon, fighting — raw force", t:["fire","dragon","fighting"], M:1 },
      { a:"Water, ice, flying — cool and fluid", t:["water","ice","flying"] },
      { a:"Ghost, dark, poison — the shadows", t:["ghost","dark","poison"], M:1 },
      { a:"Grass, fairy, bug — nature's side", t:["grass","fairy","bug"], M:-1 },
      { a:"Steel, rock, electric, psychic — the sleek & strange", t:["steel","rock","electric","psychic"] } ] },
    { sec:S7, q:"Your team's overall aesthetic is…", o:[
      { a:"Terrifying and battle-scarred", t:["dark","dragon","rock"], M:3, P:1 },
      { a:"Sleek, cool and coordinated", t:["steel","ice","electric"], M:1 },
      { a:"Adorable and full of heart", t:["fairy","normal","grass"], M:-3 },
      { a:"Mystical and otherworldly", t:["psychic","ghost","fairy"], Y:1 },
      { a:"A chaotic mix — I just love them all", t:["normal","bug","water"], M:-1 } ] },
    { sec:S7, q:"You'd nickname your ace something…", o:[
      { a:"Fearsome — Ragnarök, Reaper, Fang", t:["dark","dragon","fire"], M:2 },
      { a:"Noble — Sir, Aegis, Valor", t:["steel","fighting","normal"] },
      { a:"Cute — Mochi, Pip, Sprout", t:["fairy","grass","normal"], M:-3 },
      { a:"Mysterious — Echo, Hex, Riddle", t:["ghost","psychic","dark"], Y:1 },
      { a:"No nickname — the name it earned is enough", t:["dragon","rock","steel"], L:1 } ] },
    { sec:S7, q:"One word for your trainer style?", o:[
      { a:"Relentless", t:["fighting","fire","dragon"], s:["breaker"] },
      { a:"Untouchable", t:["steel","water","psychic"], s:["defense"] },
      { a:"Devious", t:["dark","ghost","poison"], s:["trickster"] },
      { a:"Visionary", t:["psychic","ice","dragon"], s:["setup"] },
      { a:"Heartfelt", t:["fairy","grass","normal"], s:["balanced"], M:-1 } ] },
  ];

  // ---- rng ------------------------------------------------------------------
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hashSeed = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h; };
  const nativeIn = (u, gen) => P.NATIVE[gen] && P.NATIVE[gen].has(u.dexno);

  // ---- state ----------------------------------------------------------------
  let answers = [], qi = 0;
  let partyState = null, lastProfile = null, matchTeam = [];
  let activeQuiz = "trainer";            // "trainer" | "type"
  let typeChoice = null, typeState = null;
  let currentView = "intro", built = false, container = null;
  const activeQ = () => activeQuiz === "type" ? TYPE_Q : QUESTIONS;

  // ================================ SCORING =================================
  const leadingType = () => {
    const sc = {};
    answers.forEach((oi, i) => (QUESTIONS[i].o[oi].t || []).forEach((t, k) => sc[t] = (sc[t] || 0) + (k === 0 ? 3 : 1.5)));
    let best = null, bv = -1; for (const t in sc) if (sc[t] > bv) { bv = sc[t]; best = t; }
    return best;
  };
  const score = () => {
    const ty = {}, rg = {}, st = {}, fm = { base: 2 };
    let leg = 0, myth = 0, pseudo = 0, mon = 0;
    answers.forEach((oi, i) => {
      const o = QUESTIONS[i].o[oi];
      (o.t || []).forEach((t, k) => ty[t] = (ty[t] || 0) + (k === 0 ? 3 : 1.5));
      (o.r || []).forEach((r, k) => rg[r] = (rg[r] || 0) + (k === 0 ? 3 : 1.5));
      (o.s || []).forEach((s, k) => st[s] = (st[s] || 0) + (k === 0 ? 3 : 1.5));
      (o.f || []).forEach((f, k) => fm[f] = (fm[f] || 0) + (k === 0 ? 3 : 1.5));
      leg += o.L || 0; myth += o.Y || 0; pseudo += o.P || 0; mon += o.M || 0;
    });
    const rank = obj => Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    const tRank = rank(ty), rRank = rank(rg), sRank = rank(st), fRank = rank(fm);
    const topType = tRank[0] || "normal", secondType = tRank[1];
    const specialize = !secondType || (ty[topType] >= ty[secondType] + 3 && ty[topType] >= ty[secondType] * 1.35);
    const topGen = +(rRank[0] || 1), topStrat = sRank[0] || "balanced";
    const topRegional = fRank.find(k => k !== "base");
    const formDecisive = topRegional && (fm[topRegional] || 0) >= (fm.base || 0) + 3;
    const topForm = formDecisive ? topRegional : "base";
    const crownTier = myth >= 6 ? "mythical" : leg >= 5 ? "legendary" : "none";
    const wantsPseudo = pseudo >= 4 || (mon >= 4 && pseudo >= 1);
    const monsterLean = mon >= 3 ? "monster" : mon <= -3 ? "cute" : "mixed";
    return { ty, rg, st, fm, topType, secondType, specialize, topGen, topStrat, tRank, topForm, topRegional, formDecisive,
      leg, myth, pseudo, mon, crownTier, wantsPseudo, monsterLean };
  };

  const pickMon = (type, stratKey, gen, exclude, rnd, second, formPref) => {
    const arches = STRAT_ARCH[stratKey] || [];
    let best = null, bv = -1;
    for (const u of DEX()) {
      const fam = formOf(u.ident);
      if (fam !== "base") {
        if (!(formPref && fam === formPref)) continue;
        if (u.bst < 380) continue;
      } else if (u.bst < 430 || u.bst > 600) continue;
      if (LEGENDARY.has(u.dexno) || BATTLE_ONLY.test(u.ident)) continue;
      if (exclude && exclude.has(u.id)) continue;
      let sc = 0;
      if (u.t1 === type) sc += 5; else if (u.t2 === type) sc += 4;
      else if (second && (u.t1 === second || u.t2 === second)) sc += 1.5;
      const arch = archetype(u.stats);
      if (arches[0] === arch) sc += 4; else if (arches.includes(arch)) sc += 2.5;
      if (gen && nativeIn(u, gen)) sc += 2;
      if (formPref && formPref !== "base" && fam === formPref) sc += 6;
      sc += rnd() * 2.2;
      if (sc > bv) { bv = sc; best = u; }
    }
    return best || byId.get(25);
  };

  // ---- add-on facets --------------------------------------------------------
  const NATURES = {
    Adamant:{ up:"Atk", down:"SpA", f:"fiery and direct" }, Jolly:{ up:"Spe", down:"SpA", f:"restless and upbeat" },
    Modest:{ up:"SpA", down:"Atk", f:"quietly confident" }, Timid:{ up:"Spe", down:"Atk", f:"cautious but quick" },
    Bold:{ up:"Def", down:"Atk", f:"steady and protective" }, Calm:{ up:"SpD", down:"Atk", f:"serene and patient" },
    Impish:{ up:"Def", down:"SpA", f:"cheeky and tough" }, Careful:{ up:"SpD", down:"SpA", f:"watchful and wary" },
    Serious:{ up:"—", down:"—", f:"level-headed and even" },
  };
  const natureFor = (you, S) => {
    const phys = you.stats[1] >= you.stats[3], st = S.topStrat; let n = "Serious";
    if (st === "offense" || st === "setup") n = phys ? "Jolly" : "Timid";
    else if (st === "breaker") n = phys ? "Adamant" : "Modest";
    else if (st === "defense") n = (you.stats[2] >= you.stats[4]) ? "Impish" : "Calm";
    else if (st === "trickster") n = (you.stats[2] >= you.stats[4]) ? "Bold" : "Careful";
    return { name: n, ...NATURES[n] };
  };
  const FAVE_STATUS = /^(toxic|will-o-wisp|spore|thunder wave|recover|roost|calm mind|nasty plot|dragon dance|swords dance|spikes|stealth rock|substitute|hypnosis|confuse ray|quiver dance|shell smash|iron defense|synthesis|moonlight)$/i;
  const signatureMove = (you, S) => {
    if (!MOVES().length) return null;
    const t = S.topType, cat = you.stats[1] >= you.stats[3] ? "P" : "S";
    if (S.topStrat === "defense" || S.topStrat === "trickster") {
      const fave = MOVES().filter(m => m.type === t && m.cat === "N").find(m => FAVE_STATUS.test(m.name));
      if (fave) return fave;
    }
    let pool = MOVES().filter(m => m.type === t && m.power > 0 && m.cat === cat);
    if (!pool.length) pool = MOVES().filter(m => m.type === t && m.power > 0);
    pool.sort((a, b) => b.power - a.power);
    return pool[0] || null;
  };
  const RANK = { offense:"Blazing", breaker:"Relentless", defense:"Stalwart", trickster:"Cunning", setup:"Calculating", balanced:"Seasoned" };
  const CLASSK = { normal:"Ace Trainer", fire:"Kindler", water:"Swimmer", electric:"Guitarist", grass:"Ranger",
    ice:"Skier", fighting:"Black Belt", poison:"Chemist", ground:"Hiker", flying:"Bird Keeper", psychic:"Psychic",
    bug:"Bug Maniac", rock:"Collector", ghost:"Hex Maniac", dragon:"Dragon Tamer", dark:"Delinquent", steel:"Ironworker", fairy:"Enchanter" };
  const trainerTitle = S => `${RANK[S.topStrat] || "Seasoned"} ${CLASSK[S.topType] || "Ace Trainer"}`;
  const RIVAL_TYPE = { normal:"fighting", fire:"water", water:"grass", electric:"ground", grass:"fire", ice:"fire",
    fighting:"psychic", poison:"ground", ground:"water", flying:"electric", psychic:"dark", bug:"fire", rock:"water",
    ghost:"dark", dragon:"fairy", dark:"fighting", steel:"fire", fairy:"poison" };
  const RIVAL_STRAT = { offense:"defense", defense:"offense", breaker:"trickster", trickster:"breaker", setup:"balanced", balanced:"setup" };

  // ---- party of six (scanned, ranked, swappable) ----------------------------
  const isWall = a => a === "FORTRESS" || a === "PHYS WALL" || a === "SPEC WALL" || a === "BULKY PIVOT";
  const tagOf = u => MYTHICAL.has(u.dexno) ? "mythical" : LEGEND_ONLY.has(u.dexno) ? "legendary" : PSEUDO.has(u.dexno) ? "pseudo" : null;
  const archFit = (u, S) => { const a = archetype(u.stats), r = STRAT_ARCH[S.topStrat] || []; return r[0] === a ? 4 : r.includes(a) ? 2.5 : 0; };
  const typesOf = ids => { const t = new Set(); ids.forEach(id => { const u = byId.get(id); if (u) { t.add(u.t1); if (u.t2) t.add(u.t2); } }); return t; };

  const buildParty = (you, S, salt) => {
    const rnd = mulberry32((hashSeed(answers.join("")) ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0);
    const base = DEX().filter(u => !BATTLE_ONLY.test(u.ident) && formOf(u.ident) === "base");
    const normalPool = base.filter(u => u.bst >= 430 && !LEGENDARY.has(u.dexno));
    const pseudoPool = base.filter(u => PSEUDO.has(u.dexno));
    const legendPool = base.filter(u => LEGEND_ONLY.has(u.dexno));
    const mythPool   = base.filter(u => MYTHICAL.has(u.dexno));
    const tf = u => u.t1 === S.topType ? 4 : u.t2 === S.topType ? 3 : (S.secondType && (u.t1 === S.secondType || u.t2 === S.secondType)) ? 1.5 : 0;
    const natB = u => nativeIn(u, S.topGen) ? 1.5 : 0;
    const crownPool = S.crownTier === "mythical" ? mythPool.concat(legendPool) : S.crownTier === "legendary" ? legendPool : normalPool;
    const cfgs = [
      { key: "signature", pool: normalPool, score: u => (u.t1 === S.topType ? 5 : u.t2 === S.topType ? 4 : tf(u)) + archFit(u, S) + natB(u) },
      { key: "partner",   pool: normalPool, score: u => tf(u) * 1.2 + cuteScore(u) * (S.monsterLean === "cute" ? 2 : 0.6) - monsterScore(u) * 0.4 + natB(u) },
      { key: "powerhouse", pool: S.wantsPseudo && pseudoPool.length ? pseudoPool : normalPool,
        score: u => tf(u) * 1.4 + (S.wantsPseudo ? monsterScore(u) * 1.3 : Math.max(u.stats[1], u.stats[3]) / 20 + (u.bst >= 520 ? 2 : 0)) + natB(u) },
      { key: "guardian",  pool: normalPool, score: (u, tt) => (isWall(archetype(u.stats)) ? 6 : 0) + (u.stats[0] * (u.stats[2] + u.stats[4])) / 1400 + (!tt.has(u.t1) ? 2 : 0) + natB(u) },
      { key: "wildcard",  pool: normalPool, score: (u, tt) => (!tt.has(u.t1) ? 9 : 0) + (u.t2 && !tt.has(u.t2) ? 3 : 0) + (S.monsterLean === "cute" ? cuteScore(u) : S.monsterLean === "monster" ? monsterScore(u) : 1) },
      { key: "crown",     pool: crownPool,  score: u => tf(u) * 1.5 + natB(u) + (tagOf(u) ? 1 : 0) },
    ];
    const used = new Set(), slots = [];
    used.add(you.id); slots.push({ key: "signature", pick: you });
    for (let i = 1; i < cfgs.length; i++) {
      const cfg = cfgs[i], tt = typesOf([...used]); let best = null, bv = -1e9;
      for (const u of cfg.pool) { if (used.has(u.id)) continue; const s = cfg.score(u, tt) + rnd() * 3; if (s > bv) { bv = s; best = u; } }
      if (!best) best = cfg.pool.find(u => !used.has(u.id)) || normalPool[0];
      used.add(best.id); slots.push({ key: cfg.key, pick: best });
    }
    const pickIds = slots.map(s => s.pick.id);
    slots.forEach((slot, i) => {
      const cfg = cfgs[i], exclude = new Set(pickIds.filter((_, j) => j !== i));
      const tt = typesOf(pickIds.filter((_, j) => j !== i));
      const ranked = cfg.pool.filter(u => !exclude.has(u.id))
        .map(u => [u, cfg.score(u, tt) + (mulberry32((hashSeed(String(u.id)) ^ Math.imul(salt + 3, 0x85EBCA77)) >>> 0)()) * 2])
        .sort((a, b) => b[1] - a[1]).map(x => x[0]);
      slot.candidates = [slot.pick, ...ranked.filter(u => u.id !== slot.pick.id)].slice(0, 5);
    });
    return { you, salt, slots };
  };

  const ROLE_LABEL = { signature: "SIGNATURE", partner: "FIRST PARTNER", powerhouse: "POWERHOUSE", guardian: "GUARDIAN", wildcard: "WILDCARD", crown: "CROWN" };
  const slotRole = (key, u) => key === "crown" ? (tagOf(u) === "legendary" || tagOf(u) === "mythical" ? "CROWN" : "TRUE SIXTH") : ROLE_LABEL[key];
  const slotWhy = (key, u, S) => {
    const t = tagOf(u);
    switch (key) {
      case "signature": return "The Pokémon you'd be — your very heart on the field.";
      case "partner":   return S.monsterLean === "cute" ? "The gentle first partner you'd treasure — soft heart, fierce loyalty." : "The friend you'd start your whole journey with — loyal to the very end.";
      case "powerhouse": return t === "pseudo" ? `A pseudo-legendary monster — the raw power your ${S.monsterLean === "monster" ? "fearsome streak" : "ambition"} demands.` : `Your heavy hitter — ${S.topType} force, straight down the middle.`;
      case "guardian":  return "Your shield. You protect what matters — and so does it.";
      case "wildcard":  return "The unexpected one — because you were never just one thing.";
      case "crown":     return t === "mythical" ? "A mythical chose YOU — the divine reveals itself only to the rare few." : t === "legendary" ? "You WOULD wield a legend. Ambition like yours never settles for less." : "No idols. Your sixth is an equal, not a god on a leash — and that's the whole point.";
    }
    return "";
  };
  const partyDestiny = (state, S) => {
    const picks = state.slots.map(s => s.pick), tags = picks.map(tagOf);
    const crown = state.slots.find(s => s.key === "crown").pick;
    return { crown, legendary: tags.includes("legendary"), mythical: tags.includes("mythical"), pseudo: tags.includes("pseudo"), monsterLean: S.monsterLean };
  };
  const destinyLine = d => {
    const crownTxt = d.mythical ? `you'd be <b>chosen by a mythical</b> (${displayName(d.crown.ident)})`
      : d.legendary ? `you <b>would</b> wield a legendary (${displayName(d.crown.ident)})`
      : `you'd <b>never cage a legend</b> — no idols on your team`;
    const pseudoTxt = d.pseudo ? `you'd raise a <b>pseudo-legendary monster</b> as your powerhouse` : `you skip the pseudo-legend monsters`;
    const tasteTxt = d.monsterLean === "monster" ? `and you're drawn to the <b>fierce and monstrous</b>`
      : d.monsterLean === "cute" ? `and your heart's with the <b>cute and gentle</b>`
      : `with a taste that's <b>balanced</b> — a bit of everything`;
    return `The scan says ${crownTxt}, ${pseudoTxt}, ${tasteTxt}.`;
  };

  // ================================ TYPE SPECIALIST ==========================
  const TYPE_Q = [
    { q:"In a battle, your instinct is to…", o:[
      { a:"Hit hard and end it fast", role:"off", phys:1 }, { a:"Outlast and grind them down", role:"def" },
      { a:"Zip around, untouchable", role:"spd" }, { a:"Enable and empower my ally", role:"sup" },
      { a:"Confuse, trap, and control", role:"trk" } ] },
    { q:"Your power comes from…", o:[
      { a:"Brute physical muscle", phys:2, role:"off" }, { a:"Focused mental/energy force", phys:-2, role:"off" },
      { a:"Raw speed and precision", phys:1, role:"spd" }, { a:"Sheer toughness", phys:1, role:"def" },
      { a:"A bit of everything", role:"sup" } ] },
    { q:"Your presence is…", o:[
      { a:"Towering and imposing", big:2, vibe:"fierce" }, { a:"Small but scrappy", big:-2 },
      { a:"Sleek and unassuming", big:0, vibe:"graceful" }, { a:"Ancient and colossal", big:2, vibe:"noble", grand:1 },
      { a:"Odd and hard to place", vibe:"eerie" } ] },
    { q:"People describe you as…", o:[
      { a:"Fierce and intimidating", vibe:"fierce", phys:1 }, { a:"Adorable and sweet", vibe:"cute" },
      { a:"Elegant and graceful", vibe:"graceful" }, { a:"Strange and mysterious", vibe:"eerie" },
      { a:"Noble and dignified", vibe:"noble" } ] },
    { q:"Your ideal fight ends with…", o:[
      { a:"A single knockout blow", role:"off", phys:1 }, { a:"Them collapsing, exhausted", role:"def" },
      { a:"You never once getting hit", role:"spd" }, { a:"Your partner landing the win", role:"sup" },
      { a:"Them beating themselves", role:"trk" } ] },
    { q:"Pick a battle cry.", o:[
      { a:"A deafening roar", vibe:"fierce", big:1 }, { a:"A cheerful, bright chirp", vibe:"cute" },
      { a:"Silence — power speaks for you", vibe:"noble" }, { a:"A blur too fast to hear", role:"spd" },
      { a:"An unsettling whisper", vibe:"eerie" } ] },
    { q:"You'd rather be…", o:[
      { a:"Feared", vibe:"fierce", big:1 }, { a:"Adored", vibe:"cute" }, { a:"Respected", vibe:"noble" },
      { a:"Underestimated", role:"spd", vibe:"cute" }, { a:"A mystery", vibe:"eerie", role:"trk" } ] },
    { q:"Your build is…", o:[
      { a:"All offense — a glass cannon", role:"off", phys:1 }, { a:"A living fortress", role:"def", big:1 },
      { a:"Balanced and reliable", role:"sup" }, { a:"Fast and fragile", role:"spd" },
      { a:"A slow, unstoppable juggernaut", role:"off", big:1, phys:1 } ] },
    { q:"The strongest of your type would…", o:[
      { a:"Be a world-shaking legend — that's me", grand:3, vibe:"noble", big:1 },
      { a:"Be a fearsome monster — also me", vibe:"fierce", grand:1 }, { a:"Be a beloved icon", vibe:"cute" },
      { a:"Be a clever specialist", role:"trk" }, { a:"Be a humble, tireless workhorse", grand:-2, role:"def" } ] },
    { q:"You evolve by…", o:[
      { a:"Rage and relentless training", vibe:"fierce", role:"off", phys:1 }, { a:"Deep bonds and love", vibe:"cute", role:"sup" },
      { a:"An ancient ritual", vibe:"eerie", grand:1 }, { a:"Sheer stubborn persistence", role:"def" },
      { a:"A sudden flash of insight", role:"spd", phys:-1 } ] },
    { q:"Your signature is…", o:[
      { a:"A devastating physical strike", phys:2, role:"off" }, { a:"An overwhelming energy blast", phys:-2, role:"off" },
      { a:"An impenetrable defense", role:"def" }, { a:"A reality-bending trick", role:"trk", phys:-1 },
      { a:"Blinding, decisive speed", role:"spd" } ] },
    { q:"At your very heart, you are…", o:[
      { a:"A predator", vibe:"fierce", role:"off" }, { a:"A guardian", role:"def", vibe:"noble" },
      { a:"A companion", vibe:"cute", role:"sup" }, { a:"A trickster", role:"trk", vibe:"eerie" },
      { a:"A force of nature", grand:2, big:1, vibe:"noble" } ] },
  ];
  const ROLE_ARCH = {
    off: ["PHYS SWEEPER","SPEC SWEEPER","PHYS ATTACKER","SPEC ATTACKER","WALLBREAKER","SPEC BREAKER","MIXED ATTACKER"],
    def: ["FORTRESS","PHYS WALL","SPEC WALL","BULKY PIVOT"], spd: ["SCOUT","PHYS SWEEPER","SPEC SWEEPER"],
    sup: ["BULKY PIVOT","SPEC WALL","ALL-ROUNDER"], trk: ["ALL-ROUNDER","SCOUT","BULKY PIVOT"],
  };
  const GRACE_T = new Set(["fairy","psychic","flying","ice","water"]);
  const EERIE_T = new Set(["ghost","dark","poison","bug","psychic"]);
  const scoreType = () => {
    const role = {}, vibe = {}; let phys = 0, big = 0, grand = 0;
    answers.forEach((oi, i) => { const o = TYPE_Q[i].o[oi]; if (!o) return;
      if (o.role) role[o.role] = (role[o.role] || 0) + 2;
      if (o.vibe) vibe[o.vibe] = (vibe[o.vibe] || 0) + 2;
      phys += o.phys || 0; big += o.big || 0; grand += o.grand || 0;
    });
    const topRole = Object.keys(role).sort((a, b) => role[b] - role[a])[0] || "off";
    const topVibe = Object.keys(vibe).sort((a, b) => vibe[b] - vibe[a])[0] || "balanced";
    return { role, vibe, topRole, topVibe, phys, big, grand, wantsLegend: grand >= 5 };
  };
  const typePool = (type, allowLegend) => DEX().filter(u => (u.t1 === type || u.t2 === type) && !BATTLE_ONLY.test(u.ident) && formOf(u.ident) === "base" && u.bst >= 300 && (allowLegend || !LEGENDARY.has(u.dexno)));
  const rankType = (type, S2, exclude, rnd, roleOverride) => {
    const role = roleOverride || S2.topRole, arches = ROLE_ARCH[role] || [];
    const pool = typePool(type, S2.wantsLegend);
    return pool.filter(u => !exclude || !exclude.has(u.id)).map(u => {
      const a = archetype(u.stats); let s = arches[0] === a ? 5 : arches.includes(a) ? 3 : 0;
      s += S2.phys > 0 ? (u.stats[1] >= u.stats[3] ? 2 : 0) : S2.phys < 0 ? (u.stats[3] >= u.stats[1] ? 2 : 0) : 0.5;
      if (S2.topVibe === "fierce") s += monsterScore(u) * 0.8;
      else if (S2.topVibe === "cute") s += cuteScore(u) * 0.9;
      else if (S2.topVibe === "graceful") s += (u.stats[5] >= 90 ? 1.5 : 0) + (GRACE_T.has(u.t1) || GRACE_T.has(u.t2) ? 1.5 : 0) - monsterScore(u) * 0.2;
      else if (S2.topVibe === "eerie") s += (EERIE_T.has(u.t1) || EERIE_T.has(u.t2) ? 2 : 0) + (tagOf(u) === "pseudo" ? 1 : 0);
      else if (S2.topVibe === "noble") s += (u.bst >= 500 ? 1.5 : 0) + (tagOf(u) ? 1 : 0);
      s += S2.big > 0 ? u.bst / 140 : S2.big < 0 ? (520 - u.bst) / 170 : u.bst / 320;
      if (tagOf(u) === "legendary" || tagOf(u) === "mythical") s += S2.wantsLegend ? 4 : -100;
      s += (mulberry32((hashSeed(String(u.id)) ^ Math.imul((S2.salt || 0) + 5, 0x27d4eb2f)) >>> 0)()) * 2.4;
      return [u, s];
    }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  };
  const SQUAD_META = [
    { key: "ace",    label: "YOUR ACE",  sub: "the one you'd be" },
    { key: "muscle", label: "MUSCLE",    sub: "raw power",       role: "off" },
    { key: "anchor", label: "ANCHOR",    sub: "holds the line",  role: "def" },
    { key: "wild",   label: "WILDCARD",  sub: "your curveball",  role: "trk" },
  ];
  const buildTypeSquad = (S2, salt) => {
    S2 = { ...S2, salt };
    const rnd = mulberry32((hashSeed(answers.join("")) ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0);
    const youdbe = rankType(typeChoice, S2, null, rnd).slice(0, 8);
    const feature = youdbe[0], used = new Set([feature.id]);
    const slots = [{ key: "ace", pick: feature, candidates: youdbe.slice(0, 5) }];
    for (let i = 1; i < SQUAD_META.length; i++) {
      const ranked = rankType(typeChoice, S2, used, rnd, SQUAD_META[i].role);
      const pick = ranked[0] || DEX().find(u => (u.t1 === typeChoice || u.t2 === typeChoice) && !used.has(u.id));
      if (pick) used.add(pick.id);
      const cands = [pick, ...ranked.filter(u => u.id !== (pick ? pick.id : -1))].filter(Boolean).slice(0, 5);
      slots.push({ key: SQUAD_META[i].key, pick, candidates: cands });
    }
    return { type: typeChoice, S2, salt, youdbe, featureIdx: 0, slots, openSlot: null, legends: !!S2.wantsLegend };
  };
  const ROLE_WORD = { off: "attacker", def: "wall", spd: "speedster", sup: "supporter", trk: "trickster" };
  const VIBE_WORD = { fierce: "fierce", cute: "sweet-natured", graceful: "graceful", eerie: "eerie", noble: "noble", balanced: "well-rounded" };
  const whyType = (u, S2) => {
    const t = tagOf(u), cls = t === "legendary" || t === "mythical" ? "legendary " : t === "pseudo" ? "monstrous " : "";
    return `A ${VIBE_WORD[S2.topVibe] || "true"} ${cls}${ROLE_WORD[S2.topRole] || "all-rounder"} — the ${typeChoice}-type that's most <b>you</b>.`;
  };

  // ================================ VIEW / RENDER ============================
  const root = () => $("#quizRoot");
  const tint = t => { const r = root(); if (!r) return; r.dataset.qtype = t || "none"; r.style.setProperty("--qtype", t ? TYPE_HEX[t] : "var(--accent)"); };
  const spr = (u, alt) => `<img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${alt || ""}">`;
  const typeChip = t => t ? `<span class="qtchip" style="--tc:${TYPE_HEX[t]}">${t}</span>` : "";
  const typeDots = u => [u.t1, u.t2].filter(Boolean).map(t => `<i style="background:${TYPE_HEX[t]}"></i>`).join("");

  const VIEWS = ["intro","typeselect","quiz","crunch","results"];
  const show = v => {
    currentView = v;
    VIEWS.forEach(x => { const el = $("#qz-" + x); if (el) el.hidden = x !== v; });
    const el = $("#qz-" + v); if (el) el.scrollTop = 0;
    // header aux: RETAKE on results, otherwise clear
    const aux = $("#stAux");
    if (v === "results") { aux.innerHTML = `<button class="pill" id="qzRetake">↻ RETAKE</button>`;
      $("#qzRetake").onclick = () => { restart(); }; }
    else aux.innerHTML = "";
  };

  // ---- questions ------------------------------------------------------------
  const renderQuestion = () => {
    const QS = activeQ(), Q = QS[qi];
    $("#qzQNum").textContent = "Q" + (qi + 1);
    $("#qzQTot").textContent = "/ " + QS.length;
    $("#qzProgFill").style.width = (qi / QS.length * 100) + "%";
    $("#qzBack").style.visibility = qi === 0 ? "hidden" : "visible";
    const secLbl = activeQuiz === "type" ? `${typeChoice.toUpperCase()} · SPECIALIST` : (Q.sec || "");
    $("#qzStage").innerHTML =
      `<div class="qz-card">
        <div class="qz-sec">${secLbl}</div>
        <h2 class="qz-qtext">${Q.q}</h2>
        <div class="qz-opts">${Q.o.map((o, i) =>
          `<button class="qz-opt${answers[qi] === i ? " picked" : ""}" data-i="${i}" type="button">
             <span class="qzo-key">${"ABCDE"[i]}</span><span class="qzo-a">${o.a}</span><span class="qzo-go">›</span>
           </button>`).join("")}</div>
      </div>`;
  };
  const answer = i => {
    answers[qi] = i; buzz(8);
    if (activeQuiz === "type") tint(typeChoice); else { const lt = leadingType(); if (lt) tint(lt); }
    if (qi < activeQ().length - 1) { qi++; renderQuestion(); }
    else { $("#qzProgFill").style.width = "100%"; finish(); }
  };

  const CRUNCH_LINES = ["Reading your profile…", "Cross-checking the dex…", "Scouting your region…", "Drafting your team…", "Locking it in…"];
  const CRUNCH_TYPE  = ["Reading your soul…", "Sifting the species…", "Narrowing it down…", "Finding your match…", "Locking it in…"];
  const finish = () => {
    show("crunch");
    const lines = activeQuiz === "type" ? CRUNCH_TYPE : CRUNCH_LINES;
    const el = $("#qzCrunchTxt"); let k = 0; el.textContent = lines[0];
    const iv = setInterval(() => { k = (k + 1) % lines.length; el.textContent = lines[k]; }, 260);
    setTimeout(() => { clearInterval(iv); if (activeQuiz === "type") renderTypeResults(); else renderResults(); }, 1250);
  };

  // ---- trainer results ------------------------------------------------------
  const topTypeBars = S => {
    const max = S.ty[S.tRank[0]] || 1;
    return S.tRank.slice(0, 3).map(t =>
      `<div class="qz-tbar"><span class="qtb-l">${t}</span><span class="qtb-t"><i style="width:${(S.ty[t] / max * 100).toFixed(0)}%;background:${TYPE_HEX[t]}"></i></span></div>`).join("");
  };
  const memBadge = tag => tag ? `<span class="pm-badge pmb-${tag}">${tag === "mythical" ? "MYTH" : tag === "legendary" ? "LEGEND" : "PSEUDO"}</span>` : "";
  const partyRowsHTML = () => {
    const st = partyState, S = st.S;
    return st.slots.map(slot => {
      const u = slot.pick, tag = tagOf(u), role = slotRole(slot.key, u), why = slotWhy(slot.key, u, S);
      const swappable = slot.key !== "signature", open = st.openSlot === slot.key;
      const main =
        `<div class="pm-art">${spr(u, displayName(u.ident))}${memBadge(tag)}</div>
         <div class="pm-body">
           <div class="pm-top"><span class="pm-role">${role}</span><span class="pm-dots">${typeDots(u)}</span></div>
           <div class="pm-name">${displayName(u.ident)}</div>
           <div class="pm-why">${why}</div>
         </div>
         ${swappable ? `<span class="pm-swap">${open ? "▲" : "⇅"}</span>` : ""}`;
      const head = swappable ? `<button class="pm-main" data-open="${slot.key}">${main}</button>` : `<div class="pm-main">${main}</div>`;
      const tray = (swappable && open) ? `<div class="pm-tray">${slot.candidates.map((c, ci) =>
        `<button class="pm-alt${c.id === u.id ? " cur" : ""}" data-slot="${slot.key}" data-alt="${c.id}">
           <span class="alt-rank">#${ci + 1}</span>${spr(c)}<span class="alt-name">${displayName(c.ident)}</span>
           ${tagOf(c) ? `<span class="alt-tag tt-${tagOf(c)}">${tagOf(c).charAt(0).toUpperCase()}</span>` : ""}
         </button>`).join("")}</div>` : "";
      return `<div class="pmon${tag ? " tag-" + tag : ""}${open ? " open" : ""}" style="--tc:${TYPE_HEX[u.t1]}">${head}${tray}</div>`;
    }).join("");
  };
  const partyZoneHTML = () => {
    const st = partyState; if (!st) return "";
    const S = st.S, region = st.region, d = partyDestiny(st, S);
    return `
      <div class="qz-sect destiny-card">
        <div class="qz-h"><span class="qzh-ic">✵</span>DESTINY READ</div>
        <div class="destiny-line">${destinyLine(d)}</div>
        <div class="destiny-tags">
          <span class="dtag ${d.legendary ? "on leg" : d.mythical ? "on myth" : "off"}">${d.mythical ? "◆ MYTHICAL" : "◆ LEGENDARY"}</span>
          <span class="dtag ${d.pseudo ? "on pseudo" : "off"}">▲ PSEUDO</span>
          <span class="dtag on lean-${d.monsterLean}">${d.monsterLean === "monster" ? "☠ MONSTERS" : d.monsterLean === "cute" ? "♡ CUTIES" : "◑ BALANCED"}</span>
        </div>
      </div>
      <div class="qz-sect party-card">
        <div class="qz-h"><span class="qzh-ic">▦</span>YOUR PARTY OF SIX<span class="qzh-tag">${region.name}-forward</span>
          <button class="mini-btn" id="qzReshuffle">⟳ RESHUFFLE</button></div>
        <div class="party-list">${partyRowsHTML()}</div>
        <button class="qz-adopt" id="qzAdopt"><span>⤓ ADOPT AS MY TEAM</span><b>six join your hang-out</b></button>
        <div class="party-hint">Tap a slot for its ranked top&nbsp;5 · swap freely, then adopt.</div>
      </div>`;
  };
  const renderPartyZone = () => { const z = $("#qzPartyZone"); if (z) z.innerHTML = partyZoneHTML(); };

  // ---- match your team ------------------------------------------------------
  const MATCH_CAP = 30;
  const matchZoneHTML = () => `
    <div class="qz-sect match-card">
      <div class="qz-h"><span class="qzh-ic">◎</span>MATCH YOUR TEAM<span class="qzh-tag" id="qzMatchCount">${matchTeam.length}/6</span>
        <button class="mini-btn" id="qzMatchSeed">＋ MY SIX</button></div>
      <div class="match-sub">Score how <b>you</b> your real party actually is.</div>
      <div class="field qz-mfield"><span class="si-glyph" aria-hidden="true"></span>
        <input id="qzMatchSearch" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ADD A POKÉMON — NAME / Nº">
        <button class="si-clear" id="qzMatchClear" type="button">×</button></div>
      <div class="mt-results" id="qzMatchResults"></div>
      <div id="qzMatchBody">${matchBodyHTML()}</div>
    </div>`;
  const matchBodyHTML = () => {
    const chips = matchTeam.map(id => { const u = byId.get(id);
      return `<div class="mt-chip" style="--tc:${TYPE_HEX[u.t1]}">${spr(u)}<span>${displayName(u.ident)}</span><button class="mt-x" data-mrm="${id}">×</button></div>`; }).join("");
    return `<div class="mt-chips">${chips || `<span class="mt-empty">no units yet</span>`}</div>${matchTeam.length ? matchScoreHTML() : ""}`;
  };
  const matchScoreHTML = () => {
    const S = partyState.S, units = matchTeam.map(id => byId.get(id));
    const partyDex = new Set(partyState.slots.map(s => s.pick.dexno));
    let sum = 0, legends = 0; const rows = [];
    units.forEach(u => {
      const tag = tagOf(u);
      const onType = (u.t1 === S.topType || u.t2 === S.topType) ? 2 : (S.secondType && (u.t1 === S.secondType || u.t2 === S.secondType)) ? 1 : 0;
      const taste = S.monsterLean === "monster" ? (monsterScore(u) >= 3 ? 1 : 0.3) : S.monsterLean === "cute" ? (cuteScore(u) >= 2 ? 1 : 0.3) : 0.7;
      let legA = 0.7; if (tag === "legendary" || tag === "mythical") { legends++; legA = S.crownTier !== "none" ? 1 : 0.15; } else if (tag === "pseudo") legA = S.wantsPseudo ? 1 : 0.4;
      const inP = partyDex.has(u.dexno) ? 1 : 0;
      sum += (onType / 2) * 38 + taste * 24 + legA * 22 + inP * 16;
      rows.push({ u, onType, tag, inP });
    });
    let pct = Math.round(sum / units.length);
    if (S.crownTier === "none" && legends >= 2) pct -= 12;
    if (S.crownTier !== "none" && legends === 0) pct -= 8;
    pct = clamp(pct, 3, 99);
    const tier = pct >= 85 ? "SO you" : pct >= 70 ? "very you" : pct >= 55 ? "mostly you" : pct >= 40 ? "a bit of a stretch" : "fighting your nature";
    const perMon = rows.map(r => `<div class="mm-row" style="--tc:${TYPE_HEX[r.u.t1]}">${spr(r.u)}
        <span class="mm-n">${displayName(r.u.ident)}</span>
        <span class="mm-flags">${r.onType >= 2 ? '<b class="ok">on-type</b>' : r.onType === 1 ? '<b class="mid">near</b>' : '<b class="off">off</b>'}${r.inP ? ' <b class="ok">in party</b>' : ""}${r.tag ? ` <b class="tt-${r.tag}">${r.tag}</b>` : ""}</span>
      </div>`).join("");
    return `<div class="mt-score">
      <div class="mts-meter"><div class="mts-fill ${pct >= 70 ? "hi" : pct >= 45 ? "mid" : "lo"}" style="width:${pct}%"></div><span class="mts-pct">${pct}%</span></div>
      <div class="mts-verdict">This team is <b>${tier}</b>.</div>
      <div class="mm-list">${perMon}</div></div>`;
  };
  const renderMatchBody = () => { const b = $("#qzMatchBody"); if (b) b.innerHTML = matchBodyHTML(); const c = $("#qzMatchCount"); if (c) c.textContent = matchTeam.length + "/6"; };
  const renderMatchResults = q => {
    const res = $("#qzMatchResults"); if (!res) return;
    const nq = norm(q), digits = q.replace(/\D/g, "");
    if (!nq && !digits) { res.innerHTML = ""; res.classList.remove("show"); return; }
    let list = DEX().filter(u => (nq && u.key.includes(nq)) || (digits && (String(u.dexno).includes(digits) || String(u.id).includes(digits))));
    list.sort((a, b) => (nq ? (b.key.startsWith(nq) - a.key.startsWith(nq)) : 0) || a.dexno - b.dexno);
    list = list.slice(0, MATCH_CAP);
    res.classList.add("show");
    res.innerHTML = list.length ? list.map(u => { const has = matchTeam.includes(u.id), full = matchTeam.length >= 6;
      return `<button class="mtr-row${has ? " added" : ""}" data-madd="${u.id}" ${has || full ? "disabled" : ""}>
        ${spr(u)}<span class="mtr-n">${displayName(u.ident)}</span><span class="mtr-t">${typeDots(u)}</span><span class="mtr-p">${has ? "✓" : "+"}</span></button>`; }).join("")
      : `<div class="mtr-empty">no units match</div>`;
  };
  const addMatch = id => { if (matchTeam.includes(id) || matchTeam.length >= 6 || !byId.has(id)) return;
    matchTeam.push(id); renderMatchBody(); const i = $("#qzMatchSearch"); renderMatchResults(i ? i.value : ""); buzz(8); };

  const renderResults = () => {
    const S = score();
    const rnd = mulberry32(hashSeed(answers.join("")) >>> 0);
    const you = pickMon(S.topType, S.topStrat, S.topGen, null, rnd, S.secondType, S.topForm);
    const region = REGIONS[S.topGen - 1];
    partyState = buildParty(you, S, 0);
    partyState.S = S; partyState.region = region; partyState.openSlot = null;
    const strat = STRATS[S.topStrat], form = FORMS[S.topForm] || FORMS.base;
    const youIsForm = formOf(you.ident) !== "base", yArch = archetype(you.stats).toLowerCase();
    const title = trainerTitle(S), nature = natureFor(you, S), move = signatureMove(you, S);
    const rivalType = RIVAL_TYPE[S.topType] || "fighting", rivalStratKey = RIVAL_STRAT[S.topStrat] || "balanced";
    const rival = pickMon(rivalType, rivalStratKey, 0, new Set(partyState.slots.map(s => s.pick.id)), rnd);
    lastProfile = { you, S, region, strat, form, title, nature, move, rival, rivalType };
    tint(S.topType);

    const typeLine = S.specialize ? `You specialize in <b>${S.topType}</b>` : `You're a <b>generalist</b> — but you lean <b>${S.topType}</b>`;
    const personaBody = (S.topForm !== "base" ? form.adj + " " : "") + yArch;
    const personaLine = `${/^[aeiou]/i.test(personaBody) ? "An" : "A"} ${personaBody} at heart — ${TYPE_DESC[S.topType]}.`;
    const creed = CREEDS[S.topStrat] || CREEDS.balanced;

    $("#qz-results").innerHTML =
      `<div class="res-scroll scroll">
        <div class="res-kick">TRAINER PROFILE</div>
        <div class="hero-card" style="--tc:${TYPE_HEX[you.t1]}">
          <div class="hc-aura"></div>
          <div class="hc-kick">IF YOU WERE A POKÉMON</div>
          <div class="hc-body">
            <button class="hc-sprite" id="qzHeroCry" title="Cry">${spr(you, displayName(you.ident))}</button>
            <div class="hc-meta">
              <div class="hc-name">${displayName(you.ident)}</div>
              <div class="hc-types">${typeChip(you.t1)}${typeChip(you.t2)}<span class="hc-title">★ ${title}</span></div>
              <div class="hc-why">${personaLine}</div>
              <div class="hc-creed">“${creed}”</div>
            </div>
          </div>
        </div>

        <div class="facets">
          <div class="qz-sect facet">
            <div class="qz-h"><span class="qzh-ic">✦</span>YOUR TYPE</div>
            <div class="facet-big">${S.specialize ? S.topType : S.topType + " ·ish"}</div>
            <div class="facet-sub">${typeLine}. ${cap(TYPE_DESC[S.topType])}.</div>
            <div class="qz-tbars">${topTypeBars(S)}</div>
          </div>
          <div class="qz-sect facet">
            <div class="qz-h"><span class="qzh-ic">▲</span>YOUR REGION</div>
            <div class="facet-big">${region.name}</div>
            <div class="facet-sub">${cap(region.vibe)}</div>
          </div>
          <div class="qz-sect facet">
            <div class="qz-h"><span class="qzh-ic">◈</span>YOUR FORM</div>
            <div class="facet-big">${form.name}</div>
            <div class="facet-sub">${cap(form.vibe)}${youIsForm ? ` <b>And you'd be one.</b>` : ""}</div>
          </div>
          <div class="qz-sect facet">
            <div class="qz-h"><span class="qzh-ic">⚔</span>YOUR STRATEGY</div>
            <div class="facet-big">${strat.name}</div>
            <div class="facet-sub">${strat.desc}</div>
          </div>
          <div class="qz-sect facet">
            <div class="qz-h"><span class="qzh-ic">✧</span>YOUR KIT</div>
            <div class="kit-row"><span class="kit-k">Nature</span><span class="kit-v">${nature.name}</span><span class="kit-x">${nature.up !== "—" ? "+" + nature.up + " / −" + nature.down : "neutral"}</span></div>
            <div class="kit-row"><span class="kit-k">Signature</span><span class="kit-v">${move ? move.name : "—"}</span><span class="kit-x">${move ? (move.power > 0 ? move.power + " BP" : "STATUS") : ""}</span></div>
            <div class="facet-sub">${cap(nature.f)} — you'd reach for <b>${move ? move.name : "your favourite move"}</b> without thinking.</div>
          </div>
        </div>

        <div id="qzPartyZone">${partyZoneHTML()}</div>
        <div id="qzMatchZone">${matchZoneHTML()}</div>

        <div class="qz-sect rival-card" style="--tc:${TYPE_HEX[rivalType]}">
          <div class="rc-sprite">${spr(rival, displayName(rival.ident))}</div>
          <div class="rc-body">
            <div class="qz-h"><span class="qzh-ic">⚡</span>YOUR RIVAL</div>
            <div class="rc-name">${displayName(rival.ident)}</div>
            <div class="rc-sub">A ${rivalType}-type who plays <b>${STRATS[rivalStratKey].name}</b> — the trainer who'd love to knock you down a peg.</div>
          </div>
        </div>

        <div class="res-actions">
          <button class="ra-btn" id="qzCopy" type="button">Copy profile</button>
          <button class="ra-btn" id="qzRetake2" type="button">Retake</button>
        </div>
        <div class="res-foot">wasapok.com/pokehotspot · your read, one device</div>
      </div>`;
    show("results");
    P.playCry(you);
  };

  // ---- type results ---------------------------------------------------------
  const renderTypeResults = () => {
    const S2 = scoreType(); S2.salt = 0;
    typeState = buildTypeSquad(S2, 0);
    tint(typeChoice); paintTypeResults(); show("results");
    P.playCry(typeState.youdbe[typeState.featureIdx]);
  };
  const paintTypeResults = () => { $("#qz-results").innerHTML = typeResultsHTML(); };
  const typeResultsHTML = () => {
    const st = typeState, S2 = st.S2, type = st.type;
    const feat = st.youdbe[st.featureIdx] || st.slots[0].pick, ft = tagOf(feat);
    const options = st.youdbe.map((u, i) =>
      `<button class="tob${i === st.featureIdx ? " sel" : ""}" data-feat="${i}" style="--tc:${TYPE_HEX[u.t1]}" title="${displayName(u.ident)}">
         ${spr(u, displayName(u.ident))}<span class="tob-r">#${i + 1}</span></button>`).join("");
    const rows = st.slots.map(slot => {
      const u = slot.pick, tag = tagOf(u), swappable = slot.key !== "ace", open = st.openSlot === slot.key;
      const meta = SQUAD_META.find(m => m.key === slot.key);
      const main =
        `<div class="pm-art">${spr(u, displayName(u.ident))}${memBadge(tag)}</div>
         <div class="pm-body">
           <div class="pm-top"><span class="pm-role">${meta.label}</span><span class="pm-dots">${typeDots(u)}</span></div>
           <div class="pm-name">${displayName(u.ident)}</div>
           <div class="pm-why">${meta.sub} · ${archetype(u.stats).toLowerCase()}</div>
         </div>
         ${swappable ? `<span class="pm-swap">${open ? "▲" : "⇅"}</span>` : ""}`;
      const head = swappable ? `<button class="pm-main" data-open="${slot.key}">${main}</button>` : `<div class="pm-main">${main}</div>`;
      const tray = (swappable && open) ? `<div class="pm-tray">${slot.candidates.map((c, ci) =>
        `<button class="pm-alt${c.id === u.id ? " cur" : ""}" data-slot="${slot.key}" data-alt="${c.id}"><span class="alt-rank">#${ci + 1}</span>${spr(c)}<span class="alt-name">${displayName(c.ident)}</span>${tagOf(c) ? `<span class="alt-tag tt-${tagOf(c)}">${tagOf(c).charAt(0).toUpperCase()}</span>` : ""}</button>`).join("")}</div>` : "";
      return `<div class="pmon${tag ? " tag-" + tag : ""}${open ? " open" : ""}" style="--tc:${TYPE_HEX[u.t1]}">${head}${tray}</div>`;
    }).join("");
    return `<div class="res-scroll scroll">
      <div class="res-kick">${type.toUpperCase()} SPECIALIST</div>
      <div class="hero-card" style="--tc:${TYPE_HEX[feat.t1]}">
        <div class="hc-aura"></div>
        <div class="hc-kick">AS A ${type.toUpperCase()} TRAINER, YOU'D BE</div>
        <div class="hc-body">
          <button class="hc-sprite" id="qzHeroCry" title="Cry">${spr(feat, displayName(feat.ident))}</button>
          <div class="hc-meta">
            <div class="hc-name">${displayName(feat.ident)}</div>
            <div class="hc-types">${typeChip(feat.t1)}${feat.t2 ? typeChip(feat.t2) : ""}${ft ? `<span class="hc-title">${ft === "pseudo" ? "PSEUDO" : ft.toUpperCase()}</span>` : ""}</div>
            <div class="hc-why">${whyType(feat, S2)}</div>
          </div>
        </div>
      </div>
      <div class="qz-sect options-card">
        <div class="qz-h"><span class="qzh-ic">◓</span>MORE OPTIONS<span class="qzh-tag">tap to feature</span></div>
        <div class="tob-strip">${options}</div>
      </div>
      <div class="qz-sect party-card">
        <div class="qz-h"><span class="qzh-ic">▦</span>YOUR ${type.toUpperCase()} SQUAD
          <button class="mini-btn" id="qzReshuffle">⟳ RESHUFFLE</button></div>
        <div class="party-list">${rows}</div>
        <button class="qz-adopt" id="qzAdopt"><span>⤓ ADOPT AS MY TEAM</span><b>the squad joins your hang-out</b></button>
        <div class="party-hint">Tap a slot for its top&nbsp;5 · <button class="mini-tog" id="qzLegends">${st.S2.wantsLegend ? "◆ legends ON" : "◇ allow legends"}</button></div>
      </div>
      <div class="res-actions">
        <button class="ra-btn" id="qzCopy" type="button">Copy result</button>
        <button class="ra-btn" id="qzChangeType" type="button">Change type</button>
      </div>
      <div class="res-foot">wasapok.com/pokehotspot · Type Specialist</div>
    </div>`;
  };

  // ---- adopt into hang-out --------------------------------------------------
  const adoptUnits = (units, btnEl) => {
    const ids = units.map(u => u.id).slice(0, 6);
    const movesets = units.slice(0, 6).map(u => (P.movesetFor ? P.movesetFor(u).map(m => m.id) : []));
    P.adoptTeam(ids, movesets); buzz(24);
    if (btnEl) { btnEl.querySelector("span").textContent = "✓ ADOPTED — SEE THEM HOME";
      btnEl.classList.add("done"); btnEl.onclick = () => P.closeStation(); }
  };

  // ---- copy summaries -------------------------------------------------------
  const fallbackCopy = (txt, done) => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); done(); };
  const doCopy = (txt, btn, label) => { const done = () => { btn.textContent = "Copied ✓"; setTimeout(() => btn.textContent = label, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done)); else fallbackCopy(txt, done); };
  const copyProfile = btn => {
    const p = lastProfile; if (!p || !partyState) return;
    const { you, S, region, strat, form, title, nature, move, rival, rivalType } = p, d = partyDestiny(partyState, S);
    const crownTxt = d.mythical ? `mythical (${displayName(d.crown.ident)})` : d.legendary ? `legendary (${displayName(d.crown.ident)})` : "none — no idols";
    doCopy(`MY TRAINER PROFILE — wasapok.com/pokehotspot
★ Title:  ${title}
◓ I'd be: ${displayName(you.ident).toUpperCase()} (${[you.t1, you.t2].filter(Boolean).join("/")})
✦ Type:   ${S.specialize ? S.topType : "generalist, leaning " + S.topType}
▲ Region: ${region.name}   ◈ Form: ${form.name}   ⚔ Style: ${strat.name}
✧ Kit:    ${nature.name} nature · ${move ? move.name : "—"}
✵ Crown:  ${crownTxt}${d.pseudo ? " · + pseudo monster" : ""} · ${d.monsterLean}
▦ Party:  ${partyState.slots.map(s => displayName(s.pick.ident)).join(", ")}
⚡ Rival:  ${displayName(rival.ident)} (${rivalType})`, btn, "Copy profile");
  };
  const copyTypeProfile = btn => {
    const st = typeState, feat = st.youdbe[st.featureIdx];
    doCopy(`MY ${st.type.toUpperCase()} SPECIALIST — wasapok.com/pokehotspot
◓ I'd be: ${displayName(feat.ident).toUpperCase()}
▦ Squad:  ${st.slots.map(s => displayName(s.pick.ident)).join(", ")}`, btn, "Copy result");
  };

  // ---- flow control ---------------------------------------------------------
  const startTrainer = () => { activeQuiz = "trainer"; answers = []; qi = 0; partyState = null; matchTeam = []; tint(null); show("quiz"); renderQuestion(); };
  const openTypeSelect = () => {
    $("#qzTypeGrid").innerHTML = TYPES.map(t =>
      `<button class="ts-cell" data-tsel="${t}" style="--tc:${TYPE_HEX[t]}"><span class="tsc-dot"></span><span class="tsc-name">${t}</span></button>`).join("");
    show("typeselect");
  };
  const startTypeQuiz = type => { typeChoice = type; activeQuiz = "type"; answers = []; qi = 0; typeState = null; tint(type); show("quiz"); renderQuestion(); };
  const restart = () => { answers = []; qi = 0; partyState = null; matchTeam = []; activeQuiz = "trainer"; typeChoice = null; typeState = null; tint(null); show("intro"); };

  // ================================ BUILD ===================================
  const build = c => {
    container = c;
    c.innerHTML = `
      <div class="quiz-root" id="quizRoot">

        <!-- INTRO -->
        <section class="qz-view" id="qz-intro">
          <div class="intro-wrap">
            <div class="intro-mark" aria-hidden="true"><span></span><span></span></div>
            <h2 class="intro-title">TRAINER READ</h2>
            <p class="intro-lede">One quiz, computed against the whole dex — the Pokémon you'd be, your type, region, form, strategy and a party of six you can adopt on the spot.</p>
            <button class="intro-cta" id="qzStartTrainer" type="button">
              <span class="ic-k">◓</span><span class="ic-t"><b>TRAINER PROFILE</b><em>the full read · <i id="qzTrTotal">47</i> questions</em></span><span class="ic-go">›</span>
            </button>
            <button class="intro-cta alt" id="qzStartType" type="button">
              <span class="ic-k">✦</span><span class="ic-t"><b>TYPE SPECIALIST</b><em>pick a type · ${TYPE_Q.length} questions</em></span><span class="ic-go">›</span>
            </button>
            <div class="intro-foot" id="qzIntroFoot"></div>
          </div>
        </section>

        <!-- TYPE SELECT -->
        <section class="qz-view" id="qz-typeselect" hidden>
          <div class="ts-head"><button class="pill" id="qzTsBack">‹ BACK</button><span>CHOOSE A TYPE</span></div>
          <div class="ts-grid scroll" id="qzTypeGrid"></div>
        </section>

        <!-- QUIZ -->
        <section class="qz-view" id="qz-quiz" hidden>
          <div class="qz-prog">
            <button class="qz-pback" id="qzBack" type="button" aria-label="Previous">
              <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 5L7 11l6.5 6"/></svg>
            </button>
            <div class="qz-prog-track"><div class="qz-prog-fill" id="qzProgFill"></div></div>
            <div class="qz-count"><b id="qzQNum">Q1</b><span id="qzQTot">/ 47</span></div>
          </div>
          <div class="qz-stage" id="qzStage"></div>
        </section>

        <!-- CRUNCH -->
        <section class="qz-view" id="qz-crunch" hidden>
          <div class="crunch-wrap">
            <div class="crunch-ring" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="crunch-txt" id="qzCrunchTxt">Reading your profile…</div>
          </div>
        </section>

        <!-- RESULTS (trainer + type render here) -->
        <section class="qz-view" id="qz-results" hidden></section>
      </div>`;

    const r = $("#quizRoot");

    // intro
    $("#qzStartTrainer").onclick = startTrainer;
    $("#qzStartType").onclick = openTypeSelect;
    $("#qzTrTotal").textContent = QUESTIONS.length;
    $("#qzIntroFoot").textContent = `${DEX().length} species on file · answers scan every one`;

    // type select
    $("#qzTsBack").onclick = () => show("intro");
    $("#qzTypeGrid").addEventListener("click", e => { const b = e.target.closest("[data-tsel]"); if (b) startTypeQuiz(b.dataset.tsel); });

    // quiz
    $("#qzStage").addEventListener("click", e => { const b = e.target.closest(".qz-opt"); if (b) answer(+b.dataset.i); });
    $("#qzBack").onclick = () => { if (qi > 0) { qi--; buzz(6); if (activeQuiz === "type") tint(typeChoice); else tint(leadingType()); renderQuestion(); } };

    // results delegation (works for both trainer + type)
    r.addEventListener("input", e => { if (e.target.id === "qzMatchSearch") { const c = $("#qzMatchClear"); if (c) c.classList.toggle("show", e.target.value.length > 0); renderMatchResults(e.target.value); } });
    r.addEventListener("click", e => {
      if (e.target.closest("#qzHeroCry")) { const el = e.target.closest("#qzHeroCry");
        const u = activeQuiz === "type" ? typeState.youdbe[typeState.featureIdx] : lastProfile.you;
        P.playCry(u); el.classList.remove("cry"); void el.offsetWidth; el.classList.add("cry"); return; }
      if (e.target.closest("#qzRetake2")) { restart(); return; }
      if (e.target.closest("#qzCopy")) { activeQuiz === "type" ? copyTypeProfile(e.target.closest("#qzCopy")) : copyProfile(e.target.closest("#qzCopy")); return; }
      if (e.target.closest("#qzChangeType")) { openTypeSelect(); return; }
      if (e.target.closest("#qzAdopt")) { const btn = e.target.closest("#qzAdopt");
        const units = activeQuiz === "type" ? typeState.slots.map(s => s.pick) : partyState.slots.map(s => s.pick);
        adoptUnits(units, btn); return; }

      // reshuffle
      if (e.target.closest("#qzReshuffle")) {
        if (activeQuiz === "type") { const s = typeState.S2; typeState = buildTypeSquad(s, typeState.salt + 1); paintTypeResults(); buzz(10); }
        else { partyState.salt++; partyState.slots = buildParty(partyState.you, partyState.S, partyState.salt).slots; partyState.openSlot = null; renderPartyZone(); buzz(10); }
        return;
      }
      if (e.target.closest("#qzLegends")) { const s = typeState.S2; s.wantsLegend = !s.wantsLegend; typeState = buildTypeSquad(s, typeState.salt + 1); paintTypeResults(); buzz(8); return; }

      // feature swap (type)
      const feat = e.target.closest("[data-feat]");
      if (feat) { typeState.featureIdx = +feat.dataset.feat; typeState.slots[0].pick = typeState.youdbe[typeState.featureIdx]; typeState.slots[0].candidates = typeState.youdbe.slice(0, 5); paintTypeResults(); buzz(6); return; }

      // slot open / alt-pick (both)
      const alt = e.target.closest("[data-alt]");
      if (alt) {
        const stObj = activeQuiz === "type" ? typeState : partyState;
        const slot = stObj.slots.find(s => s.key === alt.dataset.slot), c = slot && slot.candidates.find(u => u.id === +alt.dataset.alt);
        if (c) { slot.pick = c; stObj.openSlot = null; activeQuiz === "type" ? paintTypeResults() : renderPartyZone(); buzz(6); }
        return;
      }
      const op = e.target.closest("[data-open]");
      if (op) { const stObj = activeQuiz === "type" ? typeState : partyState;
        stObj.openSlot = stObj.openSlot === op.dataset.open ? null : op.dataset.open;
        activeQuiz === "type" ? paintTypeResults() : renderPartyZone(); return; }

      // match your team
      const madd = e.target.closest("[data-madd]"); if (madd && !madd.disabled) { addMatch(+madd.dataset.madd); return; }
      const mrm = e.target.closest("[data-mrm]"); if (mrm) { matchTeam = matchTeam.filter(x => x !== +mrm.dataset.mrm); renderMatchBody(); const i = $("#qzMatchSearch"); renderMatchResults(i ? i.value : ""); return; }
      if (e.target.closest("#qzMatchSeed")) { P.teamUnits().forEach(u => { if (!matchTeam.includes(u.id) && matchTeam.length < 6) matchTeam.push(u.id); }); renderMatchBody(); buzz(10); return; }
      if (e.target.closest("#qzMatchClear")) { const inp = $("#qzMatchSearch"); if (inp) inp.value = ""; e.target.closest("#qzMatchClear").classList.remove("show"); renderMatchResults(""); return; }
    });

    built = true;
  };

  P.stations.quiz = {
    title: "QUIZ",
    open(c) {
      if (!built) { build(c); show("intro"); }
      else show(currentView);
    },
  };
})();
