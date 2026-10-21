/* natures.js — all 25 natures. up/down are the raised/lowered stat (null = neutral).
   Flavors: a nature's liked flavor matches its raised stat, disliked its lowered. */
(function () {
  const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
  const FLAVOR = { atk: 'Spicy', def: 'Sour', spa: 'Dry', spd: 'Bitter', spe: 'Sweet' };
  // [name, up, down]
  const RAW = [
    ['Hardy', null, null], ['Lonely', 'atk', 'def'], ['Brave', 'atk', 'spe'], ['Adamant', 'atk', 'spa'], ['Naughty', 'atk', 'spd'],
    ['Bold', 'def', 'atk'], ['Docile', null, null], ['Relaxed', 'def', 'spe'], ['Impish', 'def', 'spa'], ['Lax', 'def', 'spd'],
    ['Timid', 'spe', 'atk'], ['Hasty', 'spe', 'def'], ['Serious', null, null], ['Jolly', 'spe', 'spa'], ['Naive', 'spe', 'spd'],
    ['Modest', 'spa', 'atk'], ['Mild', 'spa', 'def'], ['Quiet', 'spa', 'spe'], ['Bashful', null, null], ['Rash', 'spa', 'spd'],
    ['Calm', 'spd', 'atk'], ['Gentle', 'spd', 'def'], ['Sassy', 'spd', 'spe'], ['Careful', 'spd', 'spa'], ['Quirky', null, null],
  ];
  const NATURES = RAW.map(([name, up, down]) => ({
    name, up, down,
    neutral: !up,
    upStat: up ? STAT[up] : null, downStat: down ? STAT[down] : null,
    liked: up ? FLAVOR[up] : null, disliked: down ? FLAVOR[down] : null,
  }));
  window.NATURES = NATURES;
  window.NATURE_STATS = STAT;        // order helper
  window.NATURE_ORDER = ['atk', 'def', 'spa', 'spd', 'spe'];
})();
