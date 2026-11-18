import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, viewFor, requiredActors, hiddenIdx, thresholdOf } from '../src/engine/engine.js';
import { botAction } from '../src/engine/bot.js';
import { SETUP, DECK_SIZE, IDENTITY, MIN_PLAYERS, MAX_PLAYERS } from '../src/engine/content.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Jogador ${i + 1}` }));
const game = (n, seed = 7, rules) => createGame(seats(n), { seed, rules });
const act = (state, id, action) => {
  const r = applyAction(state, id, action);
  assert.ok(r.ok, `acao recusada: ${JSON.stringify(action)} (${r.error})`);
};
const current = (state) => state.players[state.turn.seat];

// Deixa a partida num estado simples e conhecido para testar uma regra.
function plain(n = 5, seed = 7) {
  const state = game(n, seed);
  for (const p of state.players) {
    p.character = 'NONE';
    p.ids = p.ids.map(() => ({ type: IDENTITY.LOYAL, revealed: false }));
    p.everInfiltrator = false;
  }
  const [a, b] = state.players;
  a.ids[0].type = IDENTITY.INFILTRATOR;
  a.everInfiltrator = true;
  b.ids[0].type = IDENTITY.GUARDIAN;
  state.turn = { seat: 2, mode: null, drawsLeft: 0, played: 0 };
  return state;
}
let uid = 9000;
const give = (p, type) => {
  const card = { uid: uid++, type };
  p.hand.push(card);
  return card;
};

function invariants(state) {
  const n = state.players.length;
  const cards = [...state.deck, ...state.discard, ...state.players.flatMap((p) => [...p.hand, ...p.persistents])];
  if (state.nightCard) cards.push(state.nightCard);
  if (state.recruitCard) cards.push(state.recruitCard);
  assert.equal(cards.length, DECK_SIZE, 'cartas do baralho se conservam');
  assert.equal(new Set(cards.map((c) => c.uid)).size, DECK_SIZE, 'nenhuma carta duplicada');

  const ids = state.players.flatMap((p) => p.ids);
  assert.equal(ids.length, n * SETUP[n].each);
  assert.equal(ids.filter((c) => c.type === IDENTITY.INFILTRATOR).length, SETUP[n].infiltrators);
  assert.equal(ids.filter((c) => c.type === IDENTITY.GUARDIAN).length, 1);

  for (const p of state.players) {
    if (p.ids.some((c) => c.type === IDENTITY.INFILTRATOR)) assert.ok(p.everInfiltrator, 'quem tem a carta e do time');
    assert.ok(p.suspicion >= 0);
    if (!p.alive) {
      assert.equal(hiddenIdx(p).length, 0, 'eliminado mostra tudo');
      assert.equal(p.hand.length + p.persistents.length, 0);
    } else if (!state.winner) {
      assert.ok(hiddenIdx(p).length >= 1, 'vivo tem carta oculta');
      if (!state.pending) assert.ok(p.suspicion < thresholdOf(state, p), 'suspeita acima do limite sem revelar');
    }
  }
}

test('preparacao para todas as quantidades de jogadores', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const state = game(n, n * 13);
    invariants(state);
    for (const p of state.players) {
      assert.equal(p.ids.length, SETUP[n].each);
      assert.equal(p.hand.length, p.character === 'HEADSTART' ? 5 : 3);
    }
    assert.equal(new Set(state.players.map((p) => p.character)).size, n, 'personagens nao se repetem');
    const night = state.deck.findIndex((c) => c.type === 'NIGHT');
    assert.ok(night <= state.deck.length / 2, 'Noite na metade de baixo');
  }
  assert.throws(() => createGame(seats(3)));
  assert.throws(() => createGame(seats(13)));
});

test('partidas automaticas chegam ao fim sem quebrar nenhuma regra', () => {
  const wins = { loyal: 0, infiltrators: 0 };
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    for (let round = 0; round < 40; round++) {
      const state = game(n, n * 1000 + round);
      let steps = 0;
      while (!state.winner) {
        assert.ok(++steps < 8000, `partida de ${n} nao terminou`);
        const actors = requiredActors(state);
        assert.ok(actors.length > 0, 'sempre ha alguem para agir');
        const id = actors[Math.floor(Math.random() * actors.length)];
        act(state, id, botAction(state, id));
        invariants(state);
      }
      wins[state.winner]++;
      assert.equal(state.pending, null);
      assert.equal(state.phase, 'over');
    }
  }
  assert.ok(wins.loyal > 0 && wins.infiltrators > 0, 'os dois lados conseguem vencer');
});

test('acoes invalidas sao recusadas sem alterar o estado', () => {
  const state = game(6, 42);
  const junk = [
    null,
    {},
    { type: 'nope' },
    { type: 'play', card: -1, target: 'p1' },
    { type: 'play', card: 1, target: 'ninguem' },
    { type: 'reveal', index: 0 },
    { type: 'night', vote: 'p1' },
    { type: 'confess', index: 99 },
    { type: 'recruit', index: 0 },
    { type: 'end' },
    { type: 'ability', target: 'p1', index: 0 },
  ];
  for (let step = 0; step < 400 && !state.winner; step++) {
    const before = JSON.stringify(state);
    const actors = requiredActors(state);
    const outsider = state.players.find((p) => !actors.includes(p.id));
    if (outsider) {
      for (const action of junk.concat([{ type: 'draw' }])) {
        const r = applyAction(state, outsider.id, action);
        assert.equal(r.ok, false);
      }
      assert.equal(JSON.stringify(state), before);
    }
    act(state, actors[0], botAction(state, actors[0]));
  }
});

test('suspeita no limite revela uma carta e zera a contagem', () => {
  const state = plain();
  const me = current(state);
  const target = state.players[3];
  target.suspicion = 4;
  const card = give(me, 'SUSP4');
  act(state, me.id, { type: 'play', card: card.uid, target: target.id });
  assert.deepEqual(state.pending, { type: 'reveal', by: me.id, target: target.id, reason: 'suspicion' });
  assert.equal(applyAction(state, target.id, { type: 'reveal', index: 0 }).ok, false, 'so o acusador escolhe');
  act(state, me.id, { type: 'reveal', index: 1 });
  assert.equal(target.suspicion, 0, 'o excedente nao sobra');
  assert.ok(target.ids[1].revealed && target.alive);
  assert.equal(current(state).id, me.id, 'o turno continua com quem acusou');
});

test('revelar a carta de infiltrado elimina e pode encerrar a partida', () => {
  const state = plain();
  const me = current(state);
  const traitor = state.players[0];
  traitor.suspicion = 5;
  const card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: traitor.id });
  act(state, me.id, { type: 'reveal', index: 0 });
  assert.equal(traitor.alive, false);
  assert.equal(state.winner, 'loyal');
});

test('ultima carta oculta revelada elimina o jogador', () => {
  const state = plain();
  const me = current(state);
  const target = state.players[3];
  target.ids.forEach((c, i) => (c.revealed = i > 0));
  target.suspicion = 5;
  const card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: target.id });
  act(state, me.id, { type: 'reveal', index: 0 });
  assert.equal(target.alive, false);
  assert.equal(state.winner, null);
});

test('nao da para jogar carta em si mesmo nem comprar depois de jogar', () => {
  const state = plain();
  const me = current(state);
  const card = give(me, 'SUSP1');
  assert.equal(applyAction(state, me.id, { type: 'play', card: card.uid, target: me.id }).error, 'bad_target');
  act(state, me.id, { type: 'play', card: card.uid, target: state.players[3].id });
  assert.equal(applyAction(state, me.id, { type: 'draw' }).error, 'already_acting');
  act(state, me.id, { type: 'end' });
  assert.notEqual(current(state).id, me.id);
});

// Leva a Noite ate o momento da confissao, com o alvo dos infiltrados definido.
function nightUntilConfess(state, victimId, protectId) {
  state.deck.push(state.deck.splice(state.deck.findIndex((c) => c.type === 'NIGHT'), 1)[0]);
  act(state, current(state).id, { type: 'draw' });
  assert.equal(state.phase, 'night');
  for (const p of state.players.filter((q) => q.alive)) {
    const action = { type: 'night' };
    if (p.everInfiltrator) action.vote = victimId;
    const guardian = p.ids.some((c) => c.type === IDENTITY.GUARDIAN && !c.revealed);
    if (guardian) action.protect = protectId;
    if (!p.everInfiltrator && !guardian) action.decoy = state.players.find((q) => q.alive && q.id !== p.id).id;
    act(state, p.id, action);
  }
  assert.equal(state.pending.stage, 'confess');
}
function nobodyConfesses(state, except = {}) {
  for (const p of state.players.filter((q) => q.alive)) act(state, p.id, { type: 'confess', index: except[p.id] ?? null });
}

test('noite: ataque sem protecao elimina o alvo', () => {
  const state = plain();
  const drawer = current(state);
  const victim = state.players[4];
  nightUntilConfess(state, victim.id, state.players[3].id);
  nobodyConfesses(state);
  assert.equal(victim.alive, false);
  assert.equal(state.phase, 'day');
  assert.ok(state.deck.some((c) => c.type === 'NIGHT'), 'a Noite volta para o baralho');
  assert.equal(drawer.hand.length, 4, 'a segunda compra interrompida acontece depois');
});

test('noite: guardiao, confissao e escolta salvam o alvo', () => {
  let state = plain();
  let victim = state.players[4];
  nightUntilConfess(state, victim.id, victim.id);
  nobodyConfesses(state);
  assert.ok(victim.alive, 'guardiao protege');

  state = plain();
  victim = state.players[4];
  nightUntilConfess(state, victim.id, state.players[3].id);
  nobodyConfesses(state, { [victim.id]: 2 });
  assert.ok(victim.alive && victim.ids[2].revealed, 'confissao protege e revela');

  state = plain();
  victim = state.players[4];
  victim.persistents.push(state.deck.splice(state.deck.findIndex((c) => c.type === 'SHIELD'), 1)[0]);
  nightUntilConfess(state, victim.id, state.players[3].id);
  nobodyConfesses(state);
  assert.ok(victim.alive, 'escolta protege');
  assert.equal(victim.persistents.length, 0, 'e a escolta e gasta');
});

test('noite: confessar a ultima carta elimina mesmo assim', () => {
  const state = plain();
  const victim = state.players[4];
  victim.ids.forEach((c, i) => (c.revealed = i > 0));
  nightUntilConfess(state, state.players[3].id, state.players[2].id);
  nobodyConfesses(state, { [victim.id]: 0 });
  assert.equal(victim.alive, false);
});

test('aliciamento: troca simultanea, conversao permanente e pressao', () => {
  const state = plain(4);
  const [a, b, c, d] = state.players;
  // a tem o infiltrado na posicao 0; d pega de a (a e o proximo de d).
  state.turn.seat = 1;
  state.deck.push(state.deck.splice(state.deck.findIndex((x) => x.type === 'RECRUIT'), 1)[0]);
  c.suspicion = 3;
  act(state, b.id, { type: 'draw' });
  assert.equal(state.pending.reason, 'pressure', 'o mais suspeito revela uma carta antes');
  assert.equal(state.pending.target, c.id);
  act(state, b.id, { type: 'reveal', index: 4 });
  assert.equal(c.suspicion, 3, 'pressao nao zera a suspeita');

  act(state, d.id, { type: 'recruit', index: 0 });
  act(state, a.id, { type: 'recruit', index: 1 });
  act(state, b.id, { type: 'recruit', index: 1 });
  assert.equal(state.phase, 'recruit', 'so resolve quando todos escolheram');
  act(state, c.id, { type: 'recruit', index: 1 });

  assert.equal(state.phase, 'day');
  assert.ok(d.everInfiltrator && d.ids.some((x) => x.type === IDENTITY.INFILTRATOR), 'd recebeu a carta');
  assert.ok(a.everInfiltrator && !a.ids.some((x) => x.type === IDENTITY.INFILTRATOR), 'a continua no time sem a carta');
  for (const p of state.players) assert.equal(p.ids.length, 5);
  assert.ok(d.notes.some((x) => x.t === 'converted'));
  invariants(state);
});

test('infiltrados vencem quando todos os vivos sao do time', () => {
  const state = plain(4);
  const [a, , c, d] = state.players;
  c.everInfiltrator = true;
  d.everInfiltrator = true;
  nightUntilConfess(state, state.players[1].id, a.id);
  nobodyConfesses(state);
  assert.equal(state.winner, 'infiltrators');
});

test('habilidades de personagem', () => {
  // LOUD: a carta de 1 vale 2.
  let state = plain();
  let me = current(state);
  me.character = 'LOUD';
  let card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: state.players[3].id });
  assert.equal(state.players[3].suspicion, 2);

  // SECOND_CHANCE: o primeiro estouro zera sem revelar.
  state = plain();
  me = current(state);
  const lucky = state.players[3];
  lucky.character = 'SECOND_CHANCE';
  lucky.suspicion = 5;
  card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: lucky.id });
  assert.equal(state.pending, null);
  assert.equal(lucky.suspicion, 0);
  lucky.suspicion = 5;
  card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: lucky.id });
  assert.equal(state.pending.type, 'reveal', 'so vale uma vez');

  // AVENGER: quem revela descarta a mao.
  state = plain();
  me = current(state);
  const avenger = state.players[3];
  avenger.character = 'AVENGER';
  avenger.suspicion = 5;
  card = give(me, 'SUSP1');
  act(state, me.id, { type: 'play', card: card.uid, target: avenger.id });
  act(state, me.id, { type: 'reveal', index: 0 });
  assert.equal(me.hand.length, 0);

  // MEDIC e ARMOR.
  state = plain();
  me = current(state);
  me.character = 'MEDIC';
  const sick = state.players[3];
  sick.suspicion = 5;
  card = give(me, 'CLEAR');
  act(state, me.id, { type: 'play', card: card.uid, target: sick.id });
  assert.equal(sick.suspicion, 0);
  card = give(me, 'ARMOR');
  act(state, me.id, { type: 'play', card: card.uid, target: sick.id });
  assert.equal(thresholdOf(state, sick), 9);

  // TRADER troca as maos; WATCHER olha uma carta e so ele fica sabendo.
  state = plain();
  me = current(state);
  me.character = 'TRADER';
  const mine = me.hand.map((c) => c.uid);
  act(state, me.id, { type: 'ability', target: state.players[3].id });
  assert.deepEqual(state.players[3].hand.map((c) => c.uid), mine);
  assert.equal(applyAction(state, me.id, { type: 'ability', target: state.players[3].id }).error, 'no_ability');

  state = plain();
  me = current(state);
  me.character = 'WATCHER';
  act(state, me.id, { type: 'ability', target: state.players[0].id, index: 0 });
  assert.deepEqual(me.notes.at(-1), { t: 'peek', p: state.players[0].id, card: IDENTITY.INFILTRATOR, n: 1 });
});

test('cada jogador so recebe o que pode ver', () => {
  const state = game(8, 99);
  const loyal = state.players.find((p) => !p.everInfiltrator);
  const traitor = state.players.find((p) => p.everInfiltrator);

  const view = viewFor(state, loyal.id);
  for (const p of view.players) {
    if (p.id === loyal.id) continue;
    assert.ok(p.ids.every((c) => c.type === null), 'identidade alheia fica oculta');
    assert.equal(p.team, null, 'time alheio fica oculto');
    assert.equal(p.hand, undefined);
  }
  assert.equal(view.me.hand.length, loyal.hand.length);
  assert.ok(!('deck' in view) && !('rngState' in view));
  assert.ok(!JSON.stringify(view).includes('notes":[{'), 'sem anotacoes privadas de outros');

  const mates = state.players.filter((p) => p.everInfiltrator && p.id !== traitor.id).map((p) => p.id);
  const seen = viewFor(state, traitor.id).players.filter((p) => p.team === 'infiltrators' && p.id !== traitor.id).map((p) => p.id);
  assert.deepEqual(seen, mates, 'infiltrados se reconhecem');

  const table = viewFor(state, null);
  assert.equal(table.me, null);
  assert.ok(table.players.every((p) => p.team === null && p.ids.every((c) => c.type === null)));
});
