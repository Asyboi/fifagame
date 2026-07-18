// Fictional player name pools (invented — no real footballer names).

const POOLS = {
  latin: ['A. Solano', 'D. Vega', 'M. Rios', 'J. Campos', 'L. Duarte', 'N. Serra', 'P. Aldana', 'R. Quintana', 'S. Maldoni', 'T. Ferrer', 'G. Salvatierra', 'E. Barrantes'],
  iberia: ['A. Iborra', 'D. Solis', 'M. Ferran', 'J. Roig', 'L. Casals', 'N. Vila', 'P. Sastre', 'R. Otero', 'S. Beltran', 'T. Guerrero', 'G. Montes', 'E. Prats'],
  global: ['A. Meyer', 'D. Costa', 'M. Aubert', 'J. Van Dijk', 'L. Moreau', 'N. Weber', 'P. Silva', 'R. Laurent', 'S. Bakker', 'T. Richter', 'G. Dubois', 'E. Fischer'],
};

export function namePool(teamId) {
  if (teamId === 'arg' || teamId === 'bra') return POOLS.latin;
  if (teamId === 'esp') return POOLS.iberia;
  return POOLS.global;
}

export function defaultNumber(role, slot) {
  if (role === 'GK') return 1;
  if (role === 'DEF') return 2 + slot;
  if (role === 'MID') return 6 + slot;
  return 9;
}
