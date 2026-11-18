// Jogadores automaticos. Servem para completar a mesa e para testar.
// Jogam de forma simples e so usam o que o proprio assento pode saber.

import { CARDS, IDENTITY } from './content.js';
import { alivePlayers, hiddenIdx, isActiveGuardian, nextAlive, playOptions, abilityOptions } from './engine.js';

const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const HELPFUL = new Set(['CLEAR', 'SHIELD', 'ARMOR']);

function chooseTarget(state, me, card, options) {
  const players = options.map((id) => state.players.find((p) => p.id === id));
  const mates = players.filter((p) => me.everInfiltrator && p.everInfiltrator);
  const rivals = players.filter((p) => !(me.everInfiltrator && p.everInfiltrator));
  if (HELPFUL.has(card.type)) return pickFrom(mates.length ? mates : players);
  const pool = rivals.length ? rivals : players;
  if (CARDS[card.type].kind === 'suspicion' && Math.random() < 0.65) {
    // Concentra em quem ja esta mais perto do limite.
    return [...pool].sort((a, b) => b.suspicion - a.suspicion)[0];
  }
  return pickFrom(pool);
}

function buildPlay(state, me, card, options) {
  const target = chooseTarget(state, me, card, options);
  const action = { type: 'play', card: card.uid, target: target.id };
  if (card.type === 'PEEK') action.index = pickFrom(hiddenIdx(target));
  if (card.type === 'STRIP') action.persistent = pickFrom(target.persistents).uid;
  if (card.type === 'SHIFT') {
    const others = alivePlayers(state).filter((p) => p.id !== me.id && p.id !== target.id);
    const rivals = others.filter((p) => !(me.everInfiltrator && p.everInfiltrator));
    action.target2 = pickFrom(rivals.length ? rivals : others).id;
  }
  return action;
}

function turnAction(state, me) {
  const t = state.turn;
  const plays = t.mode === 'draw' ? [] : me.hand.map((card) => ({ card, options: playOptions(state, me, card) })).filter((x) => x.options.length);
  if (t.mode === null) {
    const ability = abilityOptions(state, me);
    if (ability && Math.random() < 0.25) {
      const targetId = pickFrom(ability);
      const target = state.players.find((p) => p.id === targetId);
      return { type: 'ability', target: target.id, index: pickFrom(hiddenIdx(target)) };
    }
    const wantsToPlay = plays.length && (me.hand.length >= 5 || Math.random() < 0.5);
    if (!wantsToPlay) return { type: 'draw' };
  }
  if (t.mode === 'play' && (!plays.length || Math.random() < 0.4)) return { type: 'end' };
  const suspicion = plays.filter((x) => CARDS[x.card.type].kind === 'suspicion');
  const choice = pickFrom(suspicion.length && Math.random() < 0.7 ? suspicion : plays);
  return buildPlay(state, me, choice.card, choice.options);
}

export function botAction(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  const pend = state.pending;
  const living = alivePlayers(state);
  const others = living.filter((p) => p.id !== me.id);

  if (!pend) return turnAction(state, me);

  if (pend.type === 'reveal') {
    const target = state.players.find((p) => p.id === pend.target);
    let options = hiddenIdx(target);
    if (target.id === me.id) {
      const safe = options.filter((i) => target.ids[i].type === IDENTITY.LOYAL);
      if (safe.length) options = safe;
    }
    return { type: 'reveal', index: pickFrom(options) };
  }

  if (pend.type === 'night' && pend.stage === 'act') {
    const action = { type: 'night' };
    if (me.everInfiltrator) {
      const rivals = living.filter((p) => !p.everInfiltrator);
      action.vote = pickFrom(rivals.length ? rivals : living).id;
    }
    if (isActiveGuardian(me)) action.protect = pickFrom(others).id;
    if (!me.everInfiltrator && !isActiveGuardian(me)) action.decoy = pickFrom(others).id;
    return action;
  }

  if (pend.type === 'night') {
    const hidden = hiddenIdx(me);
    const safe = hidden.filter((i) => me.ids[i].type === IDENTITY.LOYAL);
    const wants = hidden.length >= 3 && safe.length && Math.random() < 0.2;
    return { type: 'confess', index: wants ? pickFrom(safe) : null };
  }

  const from = nextAlive(state, me.seat);
  return { type: 'recruit', index: pickFrom(hiddenIdx(from)) };
}
