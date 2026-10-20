// Emotes (J in game): what others see your player do for a few seconds, and what they hear.
export const EMOTES = [
  { id: 'dance', label: 'Dance', secs: 4, say: '' },
  { id: 'laugh', label: 'Point and laugh', secs: 2.5, say: 'ha ha ha ha!' },
  { id: 'wave', label: 'Wave', secs: 2.2, say: 'hey!' },
  { id: 'salute', label: 'Salute', secs: 2.2, say: '' },
  { id: 'beckon', label: 'Come at me', secs: 2.5, say: 'come on!' },
  { id: 'cheer', label: 'Cheer', secs: 2.5, say: 'woo hoo!' },
  { id: 'facepalm', label: 'Facepalm', secs: 2.5, say: 'oh no...' },
];
export const EMOTE = Object.fromEntries(EMOTES.map(e => [e.id, e]));
