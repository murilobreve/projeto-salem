// Motor de regras. Nao conhece rede nem tela: recebe acoes, muda o estado e
// devolve, para cada jogador, so o que ele tem direito de ver.

import { IDENTITY, SETUP, RULES, CARDS, CHARACTERS, MIN_PLAYERS, MAX_PLAYERS } from './content.js';

const { LOYAL, INFILTRATOR, GUARDIAN } = IDENTITY;

class RuleError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const deny = (code) => {
  throw new RuleError(code);
};

/* ---------- sorteio com semente, para partidas reproduziveis ---------- */

function rand(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (state, n) => Math.floor(rand(state) * n);
function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- consultas ---------- */

const byId = (state, id) => state.players.find((p) => p.id === id);
export const alivePlayers = (state) => state.players.filter((p) => p.alive);
export const hiddenIdx = (p) => p.ids.map((c, i) => (c.revealed ? -1 : i)).filter((i) => i >= 0);
export const isActiveGuardian = (p) => p.alive && p.ids.some((c) => c.type === GUARDIAN && !c.revealed);
const isEvent = (card) => CARDS[card.type].kind === 'event';

export function nextAlive(state, seat) {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const q = state.players[(seat + k) % n];
    if (q.alive) return q;
  }
  return null;
}

export function thresholdOf(state, p) {
  const armor = p.persistents.filter((c) => c.type === 'ARMOR').length;
  return state.rules.threshold + state.rules.armorBonus * armor;
}

function log(state, entry) {
  state.log.push({ n: state.logSeq++, ...entry });
  if (state.log.length > 400) state.log.shift();
}
function note(p, entry) {
  p.noteSeq = (p.noteSeq || 0) + 1;
  entry.n = p.noteSeq;
  p.notes.push(entry);
  if (p.notes.length > 40) p.notes.shift();
}

/* ---------- preparacao ---------- */

export function createGame(seats, opts = {}) {
  const n = seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('player_count');
  const state = {
    rngState: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    rules: { ...RULES, ...(opts.rules || {}) },
    phase: 'day',
    players: [],
    deck: [], // o topo e o fim do array
    discard: [],
    nightCard: null,
    recruitCard: null,
    turn: null,
    pending: null,
    log: [],
    logSeq: 1,
    nextUid: 1,
    winner: null,
    nights: 0,
    turns: 0,
  };
  const setup = SETUP[n];

  const pool = [];
  for (let i = 0; i < setup.infiltrators; i++) pool.push(INFILTRATOR);
  pool.push(GUARDIAN);
  while (pool.length < n * setup.each) pool.push(LOYAL);
  shuffle(state, pool);

  const cast = shuffle(state, CHARACTERS.map((c) => c.id)).slice(0, n);
  state.players = seats.map((s, i) => ({
    id: s.id,
    name: s.name,
    isBot: !!s.isBot,
    seat: i,
    character: cast[i],
    alive: true,
    everInfiltrator: false,
    hand: [],
    ids: [],
    suspicion: 0,
    persistents: [],
    skip: 0,
    used: {},
    notes: [],
  }));
  for (const p of state.players) {
    for (let k = 0; k < setup.each; k++) p.ids.push({ type: pool.pop(), revealed: false });
    p.everInfiltrator = p.ids.some((c) => c.type === INFILTRATOR);
  }

  const cards = [];
  for (const [type, def] of Object.entries(CARDS)) {
    if (def.kind === 'event') continue;
    for (let i = 0; i < def.copies; i++) cards.push({ uid: state.nextUid++, type });
  }
  shuffle(state, cards);
  for (const p of state.players) {
    const k = state.rules.startingHand + (p.character === 'HEADSTART' ? state.rules.headstartBonus : 0);
    for (let i = 0; i < k; i++) p.hand.push(cards.pop());
  }
  // O Aliciamento entra em qualquer altura; a Noite, na metade de baixo.
  cards.splice(randInt(state, cards.length + 1), 0, { uid: state.nextUid++, type: 'RECRUIT' });
  cards.splice(randInt(state, Math.floor(cards.length / 2) + 1), 0, { uid: state.nextUid++, type: 'NIGHT' });
  state.deck = cards;

  const first = randInt(state, n);
  state.turn = { seat: first, mode: null, drawsLeft: 0, played: 0 };
  log(state, { t: 'start', p: state.players[first].id });
  return state;
}

/* ---------- cartas de identidade ---------- */

function shuffleHidden(state, p) {
  const slots = hiddenIdx(p);
  const cards = shuffle(state, slots.map((i) => p.ids[i]));
  slots.forEach((slot, k) => {
    p.ids[slot] = cards[k];
  });
}

function revealCard(state, owner, index, cause, by) {
  const card = owner.ids[index];
  card.revealed = true;
  log(state, { t: 'reveal', p: owner.id, card: card.type, i: index, cause, by: by ? by.id : null });
  if (card.type === INFILTRATOR) eliminate(state, owner, 'exposed');
  else if (hiddenIdx(owner).length === 0) eliminate(state, owner, 'exhausted');
}

function eliminate(state, p, cause) {
  if (!p.alive) return;
  p.alive = false;
  for (const c of p.ids) c.revealed = true;
  state.discard.push(...p.hand.splice(0), ...p.persistents.splice(0));
  p.suspicion = 0;
  p.skip = 0;
  log(state, {
    t: 'out',
    p: p.id,
    cause,
    team: state.rules.revealTeamOnDeath ? (p.everInfiltrator ? 'infiltrators' : 'loyal') : null,
    cards: p.ids.map((c) => c.type),
  });
  checkWin(state);
  if (state.winner) return;
  for (const q of alivePlayers(state)) {
    if (q.character === 'SCAVENGER') bonusDraw(state, q, state.rules.scavengerDraw, 'SCAVENGER');
  }
}

function checkWin(state) {
  if (state.winner) return;
  const infCards = state.players.flatMap((p) => p.ids).filter((c) => c.type === INFILTRATOR);
  const living = alivePlayers(state);
  if (infCards.every((c) => c.revealed)) state.winner = 'loyal';
  else if (living.every((p) => p.everInfiltrator)) state.winner = 'infiltrators';
  if (state.winner) {
    state.phase = 'over';
    state.pending = null;
    log(state, { t: 'win', team: state.winner });
  }
}

/* ---------- baralho ---------- */

function drawOne(state, p) {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return;
    state.deck = shuffle(state, state.discard.splice(0));
  }
  const card = state.deck.pop();
  if (card.type === 'NIGHT') {
    state.nightCard = card;
    startNight(state);
  } else if (card.type === 'RECRUIT') {
    state.recruitCard = card;
    startRecruit(state, p);
  } else {
    p.hand.push(card);
    log(state, { t: 'draw', p: p.id });
  }
}

// Compras dadas por habilidade nunca disparam evento: pulam Noite e Aliciamento.
function bonusDraw(state, p, n, why) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    let idx = state.deck.findLastIndex((c) => !isEvent(c));
    if (idx < 0 && state.discard.length) {
      state.deck.unshift(...shuffle(state, state.discard.splice(0)));
      idx = state.deck.findLastIndex((c) => !isEvent(c));
    }
    if (idx < 0) break;
    p.hand.push(state.deck.splice(idx, 1)[0]);
    got++;
  }
  if (got) log(state, { t: 'bonus', p: p.id, n: got, why });
}

function reshuffleAfterNight(state) {
  const all = shuffle(state, [...state.deck, ...state.discard]);
  state.discard = [];
  all.splice(randInt(state, Math.floor(all.length / 2) + 1), 0, state.nightCard);
  state.nightCard = null;
  state.deck = all;
}

/* ---------- suspeita ---------- */

function checkThreshold(state, by, target) {
  if (!target.alive || target.suspicion < thresholdOf(state, target)) return;
  if (target.character === 'SECOND_CHANCE' && !target.used.secondChance) {
    target.used.secondChance = true;
    target.suspicion = 0;
    log(state, { t: 'second_chance', p: target.id });
    return;
  }
  state.pending = { type: 'reveal', by: by.id, target: target.id, reason: 'suspicion' };
  log(state, { t: 'threshold', p: target.id, by: by.id });
}

/* ---------- o que da para jogar ---------- */

// Alvos validos (ids) para uma carta da mao. Lista vazia: nao da para jogar agora.
export function playOptions(state, me, card) {
  const others = alivePlayers(state).filter((p) => p.id !== me.id);
  let targets;
  switch (card.type) {
    case 'SUSP1':
    case 'SUSP2':
    case 'SUSP4':
    case 'STUN':
    case 'PEEK':
      targets = others;
      break;
    case 'CLEAR':
      targets = others.filter((p) => p.suspicion > 0);
      break;
    case 'STEAL':
      targets = others.filter((p) => p.hand.length > 0);
      break;
    case 'SHIFT':
      targets = others.length >= 2 ? others.filter((p) => p.suspicion > 0) : [];
      break;
    case 'STRIP':
      targets = others.filter((p) => p.persistents.length > 0);
      break;
    case 'SHIELD':
    case 'ARMOR':
      targets = others.filter((p) => !p.persistents.some((c) => c.type === card.type));
      break;
    default:
      targets = [];
  }
  return targets.map((p) => p.id);
}

export function abilityOptions(state, me) {
  const def = CHARACTERS.find((c) => c.id === me.character);
  if (!def || !def.active || me.used.ability) return null;
  return alivePlayers(state)
    .filter((p) => p.id !== me.id)
    .map((p) => p.id);
}

/* ---------- turno ---------- */

function requireTurn(state, me) {
  if (state.pending) deny('wait_decision');
  if (state.phase !== 'day' || state.players[state.turn.seat].id !== me.id || !me.alive) deny('not_your_turn');
}

function nextTurn(state) {
  let seat = state.turn.seat;
  for (let guard = 0; guard < 1000; guard++) {
    const q = nextAlive(state, seat);
    if (!q) return;
    seat = q.seat;
    if (q.skip > 0) {
      q.skip--;
      log(state, { t: 'skip', p: q.id });
      continue;
    }
    break;
  }
  state.turn = { seat, mode: null, drawsLeft: 0, played: 0 };
  state.turns++;
  log(state, { t: 'turn', p: state.players[seat].id });
}

function endTurn(state) {
  const p = state.players[state.turn.seat];
  if (p.alive && p.character === 'COURIER' && state.turn.played > 0) bonusDraw(state, p, 1, 'COURIER');
  nextTurn(state);
}

// Anda com o jogo ate precisar de uma decisao de alguem.
function advance(state) {
  for (let guard = 0; guard < 10000 && !state.winner && !state.pending; guard++) {
    const t = state.turn;
    const p = state.players[t.seat];
    if (!p.alive) {
      nextTurn(state);
    } else if (t.mode === 'draw') {
      if (t.drawsLeft > 0) {
        t.drawsLeft--;
        drawOne(state, p);
      } else nextTurn(state);
    } else if (t.mode === 'play' && p.hand.length === 0) {
      endTurn(state);
    } else break;
  }
}

function playCard(state, me, action) {
  requireTurn(state, me);
  if (state.turn.mode === 'draw') deny('already_drawing');
  const card = me.hand.find((c) => c.uid === action.card);
  if (!card) deny('no_card');
  if (!playOptions(state, me, card).includes(action.target)) deny('bad_target');
  const target = byId(state, action.target);
  const def = CARDS[card.type];

  // Tudo e validado antes de mexer no estado.
  let second = null;
  let persistent = null;
  if (card.type === 'PEEK' && !hiddenIdx(target).includes(action.index)) deny('bad_index');
  if (card.type === 'SHIFT') {
    second = byId(state, action.target2);
    if (!second || !second.alive || second.id === me.id || second.id === target.id) deny('bad_target');
  }
  if (card.type === 'STRIP') {
    persistent = target.persistents.find((c) => c.uid === action.persistent);
    if (!persistent) deny('bad_target');
  }

  me.hand.splice(me.hand.indexOf(card), 1);
  state.turn.mode = 'play';
  state.turn.played++;
  const entry = { t: 'play', p: me.id, card: card.type, target: target.id };

  if (def.kind === 'persistent') {
    target.persistents.push(card);
    log(state, entry);
    return;
  }
  state.discard.push(card);

  if (def.kind === 'suspicion') {
    const value = card.type === 'SUSP1' && me.character === 'LOUD' ? 2 : def.value;
    target.suspicion += value;
    log(state, { ...entry, value });
    checkThreshold(state, me, target);
    return;
  }
  switch (card.type) {
    case 'CLEAR': {
      const value = me.character === 'MEDIC' ? target.suspicion : Math.min(state.rules.clearAmount, target.suspicion);
      target.suspicion -= value;
      log(state, { ...entry, value });
      break;
    }
    case 'STUN': {
      const value = me.character === 'WARDEN' ? 2 : 1;
      target.skip += value;
      log(state, { ...entry, value });
      break;
    }
    case 'PEEK':
      note(me, { t: 'peek', p: target.id, card: target.ids[action.index].type });
      shuffleHidden(state, target);
      log(state, entry);
      break;
    case 'STEAL': {
      const taken = [];
      for (let i = 0; i < state.rules.stealAmount && target.hand.length; i++) {
        taken.push(target.hand.splice(randInt(state, target.hand.length), 1)[0]);
      }
      me.hand.push(...taken);
      note(me, { t: 'stole', p: target.id, cards: taken.map((c) => c.type) });
      note(target, { t: 'robbed', p: me.id, cards: taken.map((c) => c.type) });
      log(state, { ...entry, value: taken.length });
      break;
    }
    case 'SHIFT': {
      const value = target.suspicion;
      target.suspicion = 0;
      second.suspicion += value;
      log(state, { ...entry, target2: second.id, value });
      checkThreshold(state, me, second);
      break;
    }
    case 'STRIP':
      target.persistents.splice(target.persistents.indexOf(persistent), 1);
      state.discard.push(persistent);
      log(state, { ...entry, removed: persistent.type });
      checkThreshold(state, me, target);
      break;
  }
}

function useAbility(state, me, action) {
  requireTurn(state, me);
  if (state.turn.mode === 'draw') deny('already_drawing');
  const options = abilityOptions(state, me);
  if (!options) deny('no_ability');
  if (!options.includes(action.target)) deny('bad_target');
  const target = byId(state, action.target);
  if (me.character === 'WATCHER') {
    if (!hiddenIdx(target).includes(action.index)) deny('bad_index');
    note(me, { t: 'peek', p: target.id, card: target.ids[action.index].type });
    shuffleHidden(state, target);
  } else if (me.character === 'TRADER') {
    [me.hand, target.hand] = [target.hand, me.hand];
  }
  me.used.ability = true;
  log(state, { t: 'ability', p: me.id, character: me.character, target: target.id });
}

function chooseReveal(state, me, action) {
  const pend = state.pending;
  if (!pend || pend.type !== 'reveal' || pend.by !== me.id) deny('not_your_decision');
  const target = byId(state, pend.target);
  if (!hiddenIdx(target).includes(action.index)) deny('bad_index');
  state.pending = null;
  if (pend.reason === 'suspicion') target.suspicion = 0;
  revealCard(state, target, action.index, pend.reason, me);
  if (pend.reason === 'suspicion' && target.character === 'AVENGER' && me.id !== target.id && me.alive && me.hand.length) {
    state.discard.push(...me.hand.splice(0));
    log(state, { t: 'avenger', p: target.id, victim: me.id });
  }
  if (!state.winner && pend.then === 'recruit') beginRecruitPicks(state);
}

/* ---------- noite ---------- */

function startNight(state) {
  state.phase = 'night';
  state.nights++;
  state.pending = { type: 'night', stage: 'act', done: {}, votes: {}, protect: null, decoy: {}, confess: {}, victim: null };
  log(state, { t: 'night_start', night: state.nights });
}

function nightAct(state, me, action) {
  const pend = state.pending;
  if (!pend || pend.type !== 'night' || pend.stage !== 'act') deny('not_your_decision');
  if (!me.alive || pend.done[me.id]) deny('already_done');
  const votes = me.everInfiltrator;
  const protects = isActiveGuardian(me);
  const pick = (id, allowSelf) => {
    const p = byId(state, id);
    if (!p || !p.alive || (!allowSelf && p.id === me.id)) deny('bad_target');
    return p.id;
  };
  const vote = votes ? pick(action.vote, true) : null;
  const protect = protects ? pick(action.protect, false) : null;
  const decoy = !votes && !protects ? pick(action.decoy, false) : null;
  if (votes) pend.votes[me.id] = vote;
  if (protects) pend.protect = protect;
  if (decoy) pend.decoy[me.id] = decoy;
  pend.done[me.id] = true;
  if (alivePlayers(state).every((p) => pend.done[p.id])) finishNightActs(state);
}

function finishNightActs(state) {
  const pend = state.pending;
  const tally = {};
  for (const id of Object.values(pend.votes)) tally[id] = (tally[id] || 0) + 1;
  const top = Math.max(0, ...Object.values(tally));
  const tied = Object.keys(tally).filter((id) => tally[id] === top);
  pend.victim = tied.length ? tied[randInt(state, tied.length)] : null;
  pend.stage = 'confess';
  pend.done = {};
  log(state, { t: 'night_protect', target: pend.protect });
}

function confess(state, me, action) {
  const pend = state.pending;
  if (!pend || pend.type !== 'night' || pend.stage !== 'confess') deny('not_your_decision');
  if (!me.alive || pend.done[me.id]) deny('already_done');
  const index = action.index ?? null;
  if (index !== null && !hiddenIdx(me).includes(index)) deny('bad_index');
  pend.confess[me.id] = index;
  pend.done[me.id] = true;
  if (alivePlayers(state).every((p) => pend.done[p.id])) resolveNight(state);
}

function resolveNight(state) {
  const pend = state.pending;
  state.pending = null;
  const confessed = new Set();
  for (const p of alivePlayers(state)) {
    const index = pend.confess[p.id];
    if (index === null || index === undefined) continue;
    confessed.add(p.id);
    revealCard(state, p, index, 'confess', null);
    if (state.winner) return;
    if (p.alive && p.character === 'PENITENT') bonusDraw(state, p, state.rules.penitentDraw, 'PENITENT');
  }
  const victim = pend.victim ? byId(state, pend.victim) : null;
  if (victim) {
    let outcome;
    const shield = victim.persistents.find((c) => c.type === 'SHIELD');
    if (!victim.alive) outcome = 'already_out';
    else if (confessed.has(victim.id)) outcome = 'confessed';
    else if (pend.protect === victim.id) outcome = 'guardian';
    else if (shield) {
      victim.persistents.splice(victim.persistents.indexOf(shield), 1);
      state.discard.push(shield);
      outcome = 'shield';
    } else if (victim.character === 'SURVIVOR' && !victim.used.survivor) {
      victim.used.survivor = true;
      outcome = 'survivor';
    } else outcome = 'killed';
    log(state, { t: 'night_result', p: victim.id, outcome });
    if (outcome === 'killed') eliminate(state, victim, 'night');
    if (state.winner) return;
  }
  reshuffleAfterNight(state);
  state.phase = 'day';
  log(state, { t: 'night_end' });
}

/* ---------- aliciamento ---------- */

function startRecruit(state, drawer) {
  state.phase = 'recruit';
  log(state, { t: 'recruit_start' });
  // Quem tem mais suspeita, sozinho no topo, revela uma carta antes da troca.
  const living = alivePlayers(state);
  const top = Math.max(...living.map((p) => p.suspicion));
  const leaders = living.filter((p) => p.suspicion === top);
  if (top > 0 && leaders.length === 1) {
    state.pending = { type: 'reveal', by: drawer.id, target: leaders[0].id, reason: 'pressure', then: 'recruit' };
    log(state, { t: 'pressure', p: leaders[0].id, by: drawer.id });
  } else beginRecruitPicks(state);
}

function beginRecruitPicks(state) {
  if (alivePlayers(state).length < 2) return finishRecruit(state);
  state.pending = { type: 'recruit', picks: {} };
}

function recruitPick(state, me, action) {
  const pend = state.pending;
  if (!pend || pend.type !== 'recruit') deny('not_your_decision');
  if (!me.alive || me.id in pend.picks) deny('already_done');
  const from = nextAlive(state, me.seat);
  if (!hiddenIdx(from).includes(action.index)) deny('bad_index');
  pend.picks[me.id] = action.index;
  if (alivePlayers(state).every((p) => p.id in pend.picks)) resolveRecruit(state);
}

function resolveRecruit(state) {
  const pend = state.pending;
  state.pending = null;
  // Todas as cartas saem ao mesmo tempo e so depois chegam ao novo dono.
  const moves = alivePlayers(state).map((to) => {
    const from = nextAlive(state, to.seat);
    return { to, from, card: from.ids[pend.picks[to.id]] };
  });
  for (const m of moves) m.from.ids.splice(m.from.ids.indexOf(m.card), 1);
  for (const m of moves) {
    m.to.ids.push(m.card);
    note(m.to, { t: 'received', p: m.from.id, card: m.card.type });
    if (m.card.type === INFILTRATOR && !m.to.everInfiltrator) {
      m.to.everInfiltrator = true;
      note(m.to, { t: 'converted' });
    }
  }
  for (const m of moves) shuffleHidden(state, m.to);
  finishRecruit(state);
}

function finishRecruit(state) {
  state.discard.push(state.recruitCard);
  state.recruitCard = null;
  state.phase = 'day';
  log(state, { t: 'recruit_done' });
  checkWin(state);
}

/* ---------- entrada unica de acoes ---------- */

const HANDLERS = {
  draw(state, me) {
    requireTurn(state, me);
    if (state.turn.mode !== null) deny('already_acting');
    state.turn.mode = 'draw';
    state.turn.drawsLeft = state.rules.drawPerTurn;
  },
  play: playCard,
  end(state, me) {
    requireTurn(state, me);
    if (state.turn.mode !== 'play' || state.turn.played < 1) deny('must_act');
    endTurn(state);
  },
  ability: useAbility,
  reveal: chooseReveal,
  night: nightAct,
  confess,
  recruit: recruitPick,
};

export function applyAction(state, playerId, action) {
  if (state.winner) return { ok: false, error: 'game_over' };
  const me = byId(state, playerId);
  const handler = action && HANDLERS[action.type];
  if (!me || !handler) return { ok: false, error: 'bad_action' };
  try {
    handler(state, me, action);
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.code };
    throw e;
  }
  advance(state);
  return { ok: true };
}

// Quem precisa decidir algo agora.
export function requiredActors(state) {
  if (state.winner) return [];
  const pend = state.pending;
  if (!pend) return [state.players[state.turn.seat].id];
  if (pend.type === 'reveal') return [pend.by];
  const living = alivePlayers(state);
  if (pend.type === 'night') return living.filter((p) => !pend.done[p.id]).map((p) => p.id);
  return living.filter((p) => !(p.id in pend.picks)).map((p) => p.id);
}

/* ---------- visao de cada jogador ---------- */

function pendingView(state, me) {
  const pend = state.pending;
  if (!pend) return null;
  if (pend.type === 'reveal') return { type: 'reveal', by: pend.by, target: pend.target, reason: pend.reason };
  const view = { type: pend.type, waiting: requiredActors(state) };
  const playing = me && me.alive;
  if (pend.type === 'night') {
    view.stage = pend.stage;
    if (pend.stage === 'confess') view.protected = pend.protect;
    if (playing) {
      view.you = { done: !!pend.done[me.id] };
      if (pend.stage === 'act') {
        view.you.vote = me.everInfiltrator;
        view.you.protect = isActiveGuardian(me);
        if (me.everInfiltrator) view.teamVotes = { ...pend.votes };
      }
    }
  } else if (playing) {
    view.you = { done: me.id in pend.picks, from: nextAlive(state, me.seat).id };
  }
  return view;
}

function legalView(state, me) {
  const out = { draw: false, end: false, cards: {}, ability: null };
  if (state.winner || state.pending || !me.alive || state.phase !== 'day') return out;
  const t = state.turn;
  if (state.players[t.seat].id !== me.id) return out;
  out.draw = t.mode === null;
  out.end = t.mode === 'play' && t.played > 0;
  if (t.mode !== 'draw') {
    for (const c of me.hand) {
      const targets = playOptions(state, me, c);
      if (targets.length) out.cards[c.uid] = targets;
    }
    out.ability = abilityOptions(state, me);
  }
  return out;
}

// viewerId nulo: visao publica (tela da mesa).
export function viewFor(state, viewerId) {
  const me = viewerId ? byId(state, viewerId) : null;
  const over = !!state.winner;
  const teamOf = (p) => {
    const team = p.everInfiltrator ? 'infiltrators' : 'loyal';
    if (over || (me && p.id === me.id)) return team;
    if (!p.alive && state.rules.revealTeamOnDeath) return team;
    if (me && me.everInfiltrator && p.everInfiltrator) return team;
    return null;
  };
  return {
    phase: state.phase,
    winner: state.winner,
    nights: state.nights,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    turn: { player: state.players[state.turn.seat].id, mode: state.turn.mode, played: state.turn.played },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      seat: p.seat,
      character: p.character,
      abilityUsed: !!(p.used.ability || p.used.secondChance || p.used.survivor),
      alive: p.alive,
      team: teamOf(p),
      suspicion: p.suspicion,
      threshold: thresholdOf(state, p),
      skip: p.skip,
      handCount: p.hand.length,
      persistents: p.persistents.map((c) => ({ uid: c.uid, type: c.type })),
      ids: p.ids.map((c) => ({
        revealed: c.revealed,
        type: c.revealed || over || (me && p.id === me.id) ? c.type : null,
      })),
    })),
    me: me
      ? {
          id: me.id,
          hand: me.hand.map((c) => ({ uid: c.uid, type: c.type })),
          guardian: isActiveGuardian(me),
          notes: me.notes,
          legal: legalView(state, me),
        }
      : null,
    pending: pendingView(state, me),
    log: state.log,
  };
}
