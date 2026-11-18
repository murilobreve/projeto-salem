// Conteudo do jogo: so mecanica. Nomes e textos ficam em public/theme.js,
// entao trocar o tema nao exige mexer aqui.

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export const IDENTITY = {
  LOYAL: 'LOYAL',
  INFILTRATOR: 'INFILTRATOR',
  GUARDIAN: 'GUARDIAN',
};

// Cartas de identidade por jogador e quantas delas sao de infiltrado.
// Sempre entra exatamente uma carta de guardiao.
export const SETUP = {
  4: { each: 5, infiltrators: 1 },
  5: { each: 5, infiltrators: 1 },
  6: { each: 4, infiltrators: 2 },
  7: { each: 4, infiltrators: 2 },
  8: { each: 4, infiltrators: 2 },
  9: { each: 4, infiltrators: 2 },
  10: { each: 3, infiltrators: 2 },
  11: { each: 3, infiltrators: 2 },
  12: { each: 3, infiltrators: 2 },
};

export const RULES = {
  threshold: 6, // suspeita necessaria para revelar uma carta
  startingHand: 3,
  drawPerTurn: 2,
  armorBonus: 3, // quanto ARMOR soma ao limite
  clearAmount: 3,
  stealAmount: 2,
  headstartBonus: 2,
  scavengerDraw: 2,
  penitentDraw: 2,
  revealTeamOnDeath: true,
};

// kind: suspicion (soma suspeita), action (efeito e descarte),
// persistent (fica com o alvo), event (resolve ao ser comprada).
export const CARDS = {
  SUSP1: { kind: 'suspicion', value: 1, copies: 26 },
  SUSP2: { kind: 'suspicion', value: 2, copies: 8 },
  SUSP4: { kind: 'suspicion', value: 4, copies: 2 },
  CLEAR: { kind: 'action', copies: 4 },
  STUN: { kind: 'action', copies: 3 },
  PEEK: { kind: 'action', copies: 3, pick: 'identity' },
  STEAL: { kind: 'action', copies: 2 },
  SHIFT: { kind: 'action', copies: 2, pick: 'second' },
  STRIP: { kind: 'action', copies: 2, pick: 'persistent' },
  SHIELD: { kind: 'persistent', copies: 2 },
  ARMOR: { kind: 'persistent', copies: 2 },
  NIGHT: { kind: 'event', copies: 1 },
  RECRUIT: { kind: 'event', copies: 1 },
};

// active: habilidade que o jogador aciona no proprio turno, uma vez por partida.
export const CHARACTERS = [
  { id: 'HEADSTART' }, // comeca com cartas a mais
  { id: 'LOUD' }, // SUSP1 vale 2
  { id: 'COURIER' }, // compra 1 ao encerrar um turno em que jogou cartas
  { id: 'SECOND_CHANCE' }, // a primeira vez que estoura o limite, zera sem revelar
  { id: 'WATCHER', active: 'identity' }, // olha uma carta de identidade alheia
  { id: 'AVENGER' }, // quem revela carta dele por suspeita descarta a mao
  { id: 'SURVIVOR' }, // sobrevive ao primeiro ataque noturno
  { id: 'TRADER', active: 'player' }, // troca de mao com outro jogador
  { id: 'SCAVENGER' }, // compra quando alguem e eliminado
  { id: 'MEDIC' }, // CLEAR tira toda a suspeita
  { id: 'PENITENT' }, // compra ao confessar
  { id: 'WARDEN' }, // STUN vale 2 turnos
];

export const DECK_SIZE = Object.values(CARDS).reduce((n, c) => n + c.copies, 0);
