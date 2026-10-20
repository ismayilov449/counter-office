// CS-style ranks from the lifetime leaderboard rating (lib/stats.js). You climb by playing well over time.
export const RANKS = [
  { name: 'Silver I', min: 0 },
  { name: 'Silver II', min: 30 },
  { name: 'Silver III', min: 60 },
  { name: 'Silver IV', min: 100 },
  { name: 'Silver Elite', min: 150 },
  { name: 'Silver Elite Master', min: 210 },
  { name: 'Gold Nova I', min: 280 },
  { name: 'Gold Nova II', min: 360 },
  { name: 'Gold Nova III', min: 450 },
  { name: 'Gold Nova Master', min: 550 },
  { name: 'Master Guardian I', min: 670 },
  { name: 'Master Guardian II', min: 800 },
  { name: 'Master Guardian Elite', min: 950 },
  { name: 'Distinguished Master Guardian', min: 1120 },
  { name: 'Legendary Eagle', min: 1320 },
  { name: 'Legendary Eagle Master', min: 1550 },
  { name: 'Supreme Master First Class', min: 1850 },
  { name: 'The Global Elite', min: 2200 },
];

// Short labels for the scoreboard and kill feed.
export const RANK_SHORT = ['S1', 'S2', 'S3', 'S4', 'SE', 'SEM', 'GN1', 'GN2', 'GN3', 'GNM', 'MG1', 'MG2', 'MGE', 'DMG', 'LE', 'LEM', 'SMFC', 'GE'];

// You need a few rounds behind you before you get a rank.
export const PLACEMENT_ROUNDS = 15;

// Rank index (0..17), or -1 while unranked.
export function rankIndex(rating, rounds) {
  if ((rounds || 0) < PLACEMENT_ROUNDS) return -1;
  let i = 0;
  while (i + 1 < RANKS.length && rating >= RANKS[i + 1].min) i++;
  return i;
}

// Silver grey -> gold -> green -> blue -> purple -> red, like the badge colours.
export function rankColor(i) {
  if (i < 0) return '#8a8a80';
  if (i < 6) return '#b8c0c8';
  if (i < 10) return '#e8c050';
  if (i < 13) return '#6ad08a';
  if (i < 15) return '#6aa8ff';
  if (i < 17) return '#c08aff';
  return '#ff5a4a';
}
