// Fictional-tournament teams with original, national-team-*inspired* kits.
// Colors/patterns only — no crests, logos, or licensed marks.

export const TEAMS = [
  {
    id: 'arg', name: 'Argentina', code: 'ARG',
    kit: { pattern: 'stripes', primary: '#7ec3ee', secondary: '#f5f9ff', trim: '#0e2a4a', shorts: '#ffffff', number: '#0e2a4a' },
    rating: 4,
  },
  {
    id: 'esp', name: 'Spain', code: 'ESP',
    kit: { pattern: 'solid', primary: '#c8102e', secondary: '#c8102e', trim: '#f5c518', shorts: '#1b2a5e', number: '#f5c518' },
    rating: 4,
  },
  {
    id: 'bra', name: 'Brazil', code: 'BRA',
    kit: { pattern: 'solid', primary: '#ffd93b', secondary: '#ffd93b', trim: '#0a8a4a', shorts: '#1c4fd6', number: '#0a8a4a' },
    rating: 5,
  },
  {
    id: 'fra', name: 'France', code: 'FRA',
    kit: { pattern: 'solid', primary: '#1e3fae', secondary: '#1e3fae', trim: '#f0f2fa', shorts: '#f0f2fa', number: '#f0f2fa' },
    rating: 5,
  },
  {
    id: 'ger', name: 'Germany', code: 'GER',
    kit: { pattern: 'solid', primary: '#f2f2f2', secondary: '#f2f2f2', trim: '#141414', shorts: '#141414', number: '#141414' },
    rating: 4,
  },
  {
    id: 'ned', name: 'Netherlands', code: 'NED',
    kit: { pattern: 'solid', primary: '#ff7a1a', secondary: '#ff7a1a', trim: '#ffffff', shorts: '#ffffff', number: '#ffffff' },
    rating: 3,
  },
];

export function teamById(id) {
  return TEAMS.find((t) => t.id === id) || TEAMS[0];
}
