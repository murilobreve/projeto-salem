import { GAME_NAME, TAGLINE, TEAMS, IDS, KINDS, CARDS, CHARACTERS, ERRORS, RULES_TEXT, logLine, noteLine } from './theme.js';
import { CARDS as CARD_DEFS, CHARACTERS as CHAR_DEFS, RULES } from './content.js';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const roomCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const saved = {
  read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* navegacao privada: segue sem guardar */
    }
  },
};

const S = {
  online: false,
  room: null,
  game: null,
  you: null,
  watch: roomCode(params.get('mesa')) || null,
  form: { name: saved.read('inf.name') || '', code: roomCode(params.get('sala')) },
  sheet: null, // folha aberta pelo jogador: carta, regras, historico...
  sheetKey: '',
  minimized: false, // escolha pendente recolhida para olhar a mesa
  overSeen: false,
  night: {},
  hideIds: false,
  toast: null,
  lastLog: 0,
  lastNote: 0,
  fresh: new Set(), // cartas reveladas agora, para animar o carimbo
  pendingKey: '',
};

/* ---------- conexao ---------- */

let ws;
let retries = 0;

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    S.online = true;
    retries = 0;
    const session = saved.read('inf.session');
    if (S.watch) send({ t: 'watch', code: S.watch });
    else if (session && (!S.form.code || S.form.code === session.code)) send({ t: 'rejoin', ...session });
    render();
  };
  ws.onclose = () => {
    S.online = false;
    render();
    setTimeout(connect, Math.min(5000, 700 * ++retries));
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  else toast('Sem conexão com o servidor. Tentando de novo.');
}

function act(action) {
  S.sheet = null;
  send({ t: 'action', action });
  render();
}

function pendingKeyOf(g) {
  const p = g.pending;
  return p ? [p.type, p.stage, p.by, p.target, g.nights].join(':') : '';
}

function handle(msg) {
  if (msg.t === 'joined') {
    saved.write('inf.session', { code: msg.code, token: msg.token });
    history.replaceState(null, '', `?sala=${msg.code}`);
    return;
  }
  if (msg.t === 'gone') {
    saved.write('inf.session', null);
    return render();
  }
  if (msg.t === 'left') {
    saved.write('inf.session', null);
    Object.assign(S, { room: null, game: null, you: null, sheet: null });
    history.replaceState(null, '', location.pathname);
    if (msg.error) toast(ERRORS[msg.error]);
    return render();
  }
  if (msg.t === 'error') return toast(ERRORS[msg.error] || 'Não deu para fazer isso agora.');
  if (msg.t !== 'state') return;

  const g = msg.game;
  const had = !!S.game;
  S.room = msg.room;
  S.you = msg.you;
  S.fresh = new Set();
  if (g) {
    if (had) for (const e of g.log) if (e.n > S.lastLog && e.t === 'reveal') S.fresh.add(`${e.p}:${e.i}`);
    S.lastLog = g.log.length ? g.log.at(-1).n : 0;

    const notes = g.me ? g.me.notes : [];
    const news = had ? notes.filter((n) => n.n > S.lastNote) : [];
    S.lastNote = notes.length ? notes.at(-1).n : 0;
    S.game = g;
    if (news.some((n) => n.t === 'converted')) S.sheet = { kind: 'notice', text: noteLine({ t: 'converted' }, nameOf) };
    else if (news.length) toast(noteLine(news.at(-1), nameOf), false);

    const key = pendingKeyOf(g);
    if (key !== S.pendingKey) Object.assign(S, { pendingKey: key, minimized: false, night: {} });
    const sh = S.sheet;
    if (sh && sh.kind === 'card' && !(g.me && g.me.hand.some((c) => c.uid === sh.uid))) S.sheet = null;
    if (sh && sh.kind === 'ability' && !(g.me && g.me.legal.ability)) S.sheet = null;
    if (!g.winner) S.overSeen = false;
  } else {
    Object.assign(S, { game: null, lastLog: 0, lastNote: 0, overSeen: false, pendingKey: '' });
    if (S.sheet && S.sheet.kind !== 'rules') S.sheet = null;
  }
  render();
}

let toastTimer;
function toast(text, draw = true) {
  S.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    S.toast = null;
    render();
  }, 5000);
  if (draw) render();
}

/* ---------- consultas sobre a partida ---------- */

const player = (id) => S.game.players.find((p) => p.id === id);
const nameOf = (id) => (S.game && player(id) ? player(id).name : '');
const myPlayer = () => (S.game && S.game.me ? player(S.game.me.id) : null);
const seatOnline = (id) => {
  const seat = S.room.seats.find((s) => s.id === id);
  return !seat || seat.online;
};
const hiddenOf = (p) => p.ids.map((c, i) => (c.revealed ? -1 : i)).filter((i) => i >= 0);
const names = (ids) => ids.map(nameOf).join(', ');

/* ---------- pecas ---------- */

function idCard(p, c, i, opts = {}) {
  const mine = opts.mine && c.type && !c.revealed;
  const cls = ['idc', c.revealed ? 'open' : 'sealed', opts.slip ? 'slip' : '', c.type ? `t-${c.type}` : ''];
  if (c.revealed && S.fresh.has(`${p.id}:${i}`)) cls.push('fresh');
  let inner = '';
  let label = 'Carta oculta';
  if (c.revealed) {
    label = `Revelada: ${IDS[c.type].name}`;
    inner = `<span class="stamp">${opts.slip ? IDS[c.type].name : IDS[c.type].letter}</span>`;
  } else if (mine && !S.hideIds) {
    label = `Oculta: ${IDS[c.type].name}`;
    inner = `<span class="window">${IDS[c.type].name}</span>`;
  } else if (c.type && !opts.mine) {
    label = `Não revelada: ${IDS[c.type].name}`;
    inner = `<span class="window">${opts.slip ? IDS[c.type].name : IDS[c.type].letter}</span>`;
  }
  if (opts.action) {
    return `<button class="${cls.join(' ')}" data-a="${opts.action}" data-i="${i}" aria-label="${label}">${inner}</button>`;
  }
  return `<span class="${cls.join(' ')}" role="img" aria-label="${label}">${inner}</span>`;
}

function meter(p) {
  let pips = '';
  for (let i = 0; i < p.threshold; i++) pips += `<i class="pip${i < p.suspicion ? ' on' : ''}"></i>`;
  const hot = p.suspicion >= p.threshold - 1 ? ' hot' : '';
  return `<div class="meter${hot}" role="img" aria-label="Suspeita: ${p.suspicion} de ${p.threshold}"><span class="pips">${pips}</span><span class="meter-num">${p.suspicion} de ${p.threshold}</span></div>`;
}

function tagsOf(g, p, me) {
  const tags = [];
  if (g.turn.player === p.id && !g.winner && p.alive) tags.push(['na vez', 'turn']);
  if (!p.alive) tags.push(['fora da partida', 'out']);
  if (p.team && !(me && p.id === me.id)) {
    const one = TEAMS[p.team].one;
    tags.push([g.winner ? one : p.alive ? 'do seu time' : `era ${one}`, p.team]);
  }
  if (p.skip) tags.push([p.skip > 1 ? `perde ${p.skip} vezes` : 'perde a vez', 'warn']);
  for (const c of p.persistents) tags.push([CARDS[c.type].name, 'fixed']);
  if (p.isBot) tags.push(['bot', 'quiet']);
  else if (!seatOnline(p.id)) tags.push(['ausente', 'warn']);
  return tags.length ? `<ul class="tags">${tags.map(([t, k]) => `<li class="tag tag-${k}">${esc(t)}</li>`).join('')}</ul>` : '';
}

function who(p) {
  return `<button class="who" data-a="char" data-p="${p.id}"><span class="who-name">${esc(p.name)}</span><span class="who-role">${CHARACTERS[p.character].name}</span></button>`;
}

function playerTile(g, p, me) {
  const turn = g.turn.player === p.id && !g.winner;
  const cards = p.handCount === 1 ? '1 carta na mão' : `${p.handCount} cartas na mão`;
  return `<article class="player${turn ? ' is-turn' : ''}${p.alive ? '' : ' is-out'}">
    <header class="player-head">${who(p)}${p.alive ? `<span class="hand-count">${cards}</span>` : ''}</header>
    <div class="player-row"><div class="ids">${p.ids.map((c, i) => idCard(p, c, i)).join('')}</div>${p.alive ? meter(p) : ''}</div>
    ${tagsOf(g, p, me)}
  </article>`;
}

function handCard(c, legal) {
  const def = CARD_DEFS[c.type];
  const playable = !!legal.cards[c.uid];
  const body = def.kind === 'suspicion' ? `<span class="card-val">+${def.value}</span>` : `<span class="card-short">${CARDS[c.type].short}</span>`;
  return `<button class="card k-${def.kind}${playable ? '' : ' idle'}" data-a="card" data-uid="${c.uid}"><span class="card-name">${CARDS[c.type].name}</span>${body}</button>`;
}

function targetButton(p, attrs, selected) {
  const me = myPlayer();
  const mate = me && p.id !== me.id && p.team === 'infiltrators' && p.alive ? '<span class="tag tag-infiltrators">do seu time</span>' : '';
  const self = me && p.id === me.id ? '<span class="tag tag-quiet">você</span>' : '';
  return `<li><button class="target" ${attrs} data-p="${p.id}"${selected === undefined ? '' : ` aria-pressed="${selected}"`}>
    <span class="target-name">${esc(p.name)}${self}${mate}</span>
    <span class="target-info">${CHARACTERS[p.character].name}, suspeita ${p.suspicion} de ${p.threshold}</span>
  </button></li>`;
}
const targetList = (ids, action) => `<ul class="targets">${ids.map((id) => targetButton(player(id), `data-a="${action}"`)).join('')}</ul>`;

function idPicker(p, action) {
  const me = myPlayer();
  const mine = !!me && p.id === me.id;
  const cards = hiddenOf(p).map((i) => idCard(p, p.ids[i], i, { action, slip: true, mine }));
  return `<div class="picker">${cards.join('')}</div>`;
}

function sheetWrap(key, title, body, opts = {}) {
  const enter = key !== S.sheetKey ? ' enter' : '';
  S.sheetKey = key;
  const close = opts.locked ? '' : '<button class="btn quiet" data-a="close">Fechar</button>';
  const back = opts.back ? '<button class="btn quiet" data-a="back">Voltar</button>' : '';
  const min = opts.locked && opts.minimize ? '<button class="btn quiet" data-a="minimize">Ver a mesa</button>' : '';
  return `<div class="veil${enter}"${opts.locked ? '' : ' data-a="close"'}></div>
  <section class="sheet${enter}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="sheet-head"><h2>${esc(title)}</h2><div class="sheet-tools">${back}${min}${close}</div></header>
    <div class="sheet-body" data-scroll="sheet">${body}</div>
  </section>`;
}

/* ---------- telas fora da partida ---------- */

function offlineNote() {
  return S.online ? '' : '<p class="notice" role="status">Sem conexão com o servidor. Tentando de novo.</p>';
}

function home() {
  if (S.watch) {
    return `<main class="home"><div class="ficha"><h1>${GAME_NAME}</h1><p>Procurando a sala ${esc(S.watch)} para mostrar a mesa.</p></div>${offlineNote()}
    <p><a class="link" href="/">Voltar para o início</a></p></main>`;
  }
  return `<main class="home">
    <div class="ficha"><h1>${GAME_NAME}</h1><p>${TAGLINE}</p><span class="ficha-stamp" aria-hidden="true">sigiloso</span></div>
    ${offlineNote()}
    <div class="field"><label for="f-name">Seu nome na mesa</label>
      <input id="f-name" maxlength="16" autocomplete="nickname" autocapitalize="words" value="${esc(S.form.name)}"></div>
    <div class="home-ways">
      <section><h2>Abrir uma sala</h2><p>Você recebe um código de 4 letras para chamar os outros. De 4 a 12 jogadores, com bots para completar.</p>
        <button class="btn primary" data-a="create">Criar sala</button></section>
      <section><h2>Entrar em uma sala</h2>
        <div class="field"><label for="f-code">Código da sala</label>
        <input id="f-code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(S.form.code)}"></div>
        <button class="btn" data-a="join">Entrar na sala</button></section>
    </div>
    <button class="link" data-a="rules">Como se joga</button>
  </main>`;
}

function lobby() {
  const r = S.room;
  const host = r.seats.find((s) => s.id === r.hostId);
  const amHost = S.you === r.hostId;
  const missing = r.min - r.seats.length;
  const origin = location.origin;
  const seats = r.seats
    .map((s) => {
      const tags = [];
      if (s.id === S.you) tags.push('<span class="tag tag-quiet">você</span>');
      if (s.id === r.hostId) tags.push('<span class="tag tag-quiet">criou a sala</span>');
      if (s.isBot) tags.push('<span class="tag tag-quiet">bot</span>');
      if (!s.online) tags.push('<span class="tag tag-warn">ausente</span>');
      const remove = amHost && s.id !== r.hostId ? `<button class="btn quiet" data-a="removeSeat" data-id="${s.id}" aria-label="Retirar ${esc(s.name)}">Retirar</button>` : '';
      return `<li class="seat"><span class="seat-name">${esc(s.name)}</span>${tags.join('')}${remove}</li>`;
    })
    .join('');
  let controls;
  if (S.watch) {
    controls = `<p class="hint">Esta tela mostra a mesa para todos. Cada jogador entra pelo próprio celular em ${esc(origin)} com o código acima.</p>`;
  } else if (amHost) {
    const hint = missing > 0 ? `<p class="hint">${missing === 1 ? 'Falta 1 jogador' : `Faltam ${missing} jogadores`} para começar. Bots ocupam os lugares vazios.</p>` : '';
    controls = `<div class="lobby-actions"><button class="btn primary" data-a="start"${missing > 0 ? ' disabled' : ''}>Começar a partida</button>
      <button class="btn" data-a="addBot"${r.seats.length >= r.max ? ' disabled' : ''}>Adicionar bot</button></div>${hint}`;
  } else {
    controls = `<p class="hint">Esperando ${esc(host ? host.name : 'quem criou a sala')} começar a partida.</p>`;
  }
  return `<main class="lobby">
    <header class="lobby-head"><p>Sala</p><h1 class="code">${esc(r.code)}</h1></header>
    ${offlineNote()}
    ${S.watch ? '' : `<div class="invite"><button class="btn" data-a="copy">Copiar link de convite</button><p class="hint">Ou passe o código acima. Quem entra digita o código na tela inicial.</p></div>`}
    <h2>${r.seats.length === 1 ? '1 jogador na sala' : `${r.seats.length} jogadores na sala`}</h2>
    <ul class="seats">${seats}</ul>
    ${controls}
    ${S.watch ? '' : `<p class="hint">Jogando na mesma mesa? Abra <span class="mono">${esc(origin)}/?mesa=${esc(r.code)}</span> em uma TV ou tablet para todos verem o andamento.</p>`}
    <div class="lobby-foot"><button class="link" data-a="rules">Como se joga</button>${S.watch ? '' : '<button class="link" data-a="leave">Sair da sala</button>'}</div>
  </main>`;
}

/* ---------- partida ---------- */

function statusText(g, me) {
  const pend = g.pending;
  const turnP = player(g.turn.player);
  if (g.winner) return `Fim da partida: vitória dos ${TEAMS[g.winner].name}.`;
  if (pend && pend.type === 'reveal') {
    const whose = me && pend.target === me.id ? 'sua' : `de ${nameOf(pend.target)}`;
    if (me && pend.by === me.id) return `Escolha uma carta ${whose} para revelar.`;
    return `${nameOf(pend.by)} está escolhendo uma carta ${whose} para revelar.`;
  }
  if (pend && pend.type === 'night') {
    if (pend.stage === 'act') return 'Noite. Cada jogador faz sua escolha em segredo.';
    return 'Noite. Alguém vai ser atacado: quem quiser se salvar confessa agora.';
  }
  if (pend && pend.type === 'recruit') return 'Aliciamento. Cada jogador pega uma carta de identidade do vizinho.';
  if (me && turnP.id === me.id) {
    if (g.turn.mode === 'play') return 'Sua vez. Jogue mais cartas ou encerre o turno.';
    return 'Sua vez. Compre 2 cartas ou jogue cartas da mão.';
  }
  return `Vez de ${turnP.name}.`;
}

const QUIET_LOG = new Set(['turn', 'draw', 'start']);

function statusBlock(g, me) {
  const pend = g.pending;
  let sub = '';
  if (pend && pend.waiting && pend.waiting.length) sub = `<p class="status-sub">Falta escolher: ${esc(names(pend.waiting))}.</p>`;
  const recent = g.log.filter((e) => !QUIET_LOG.has(e.t)).slice(-3).reverse();
  const lines = recent.map((e) => `<li>${esc(logLine(e, nameOf))}</li>`).join('');
  let button = '';
  if (g.winner && S.overSeen) button = '<button class="btn primary" data-a="lobby">Voltar para a sala</button>';
  else if (S.minimized && promptFor(g)) button = '<button class="btn primary" data-a="restore">Fazer minha escolha</button>';
  return `<section class="status"><p class="status-main" role="status">${esc(statusText(g, me))}</p>${sub}${button}
    ${lines ? `<ul class="status-log">${lines}</ul>` : ''}</section>`;
}

function dock(g, me) {
  const legal = g.me.legal;
  if (!me.alive) {
    return `<section class="dock"><div class="dock-me">${who(me)}<p class="team">Você saiu da partida. Dá para continuar acompanhando a mesa.</p></div></section>`;
  }
  const side = [`<span class="tag tag-${me.team}">${TEAMS[me.team].one}</span>`];
  if (g.me.guardian) side.push(`<span class="tag tag-loyal">${IDS.GUARDIAN.name}</span>`);
  const hand = g.me.hand.length ? g.me.hand.map((c) => handCard(c, legal)).join('') : '<p class="hand-empty">Sua mão está vazia. Compre cartas na sua vez.</p>';
  const active = (CHAR_DEFS.find((c) => c.id === me.character) || {}).active;
  if (active && legal.ability) side.push('<button class="use-ability" data-a="ability">Usar habilidade</button>');
  const note = g.me.notes.length ? `<p class="dock-note">${esc(noteLine(g.me.notes.at(-1), nameOf))}</p>` : '';
  const myTurn = g.turn.player === me.id && !g.pending && !g.winner;
  return `<section class="dock${myTurn ? ' is-turn' : ''}">
    <div class="dock-me"><div class="dock-who">${who(me)}${S.hideIds ? side.slice(-1).filter((x) => x.includes('use-ability')).join('') : side.join('')}</div>${meter(me)}</div>
    <div class="dock-ids"><div class="ids slips">${me.ids.map((c, i) => idCard(me, c, i, { slip: true, mine: true })).join('')}</div>
      <button class="btn quiet small" data-a="toggleIds" aria-pressed="${S.hideIds}">${S.hideIds ? 'Mostrar' : 'Esconder'}</button></div>
    ${tagsOf(g, { ...me, team: null, isBot: false }, me)}
    <div class="hand" data-scroll="hand">${hand}</div>
    <div class="dock-actions">
      <button class="btn primary" data-a="draw"${legal.draw ? '' : ' disabled'}>Comprar ${RULES.drawPerTurn} cartas</button>
      <button class="btn" data-a="end"${legal.end ? '' : ' disabled'}>Encerrar turno</button>
    </div>${note}
  </section>`;
}

function phaseLabel(g) {
  if (g.winner) return 'Fim da partida';
  if (g.phase === 'night') return `Noite ${g.nights}`;
  if (g.phase === 'recruit') return 'Aliciamento';
  return g.nights ? `Dia ${g.nights + 1}` : 'Dia 1';
}

function gameView() {
  const g = S.game;
  const me = myPlayer();
  const start = me ? me.seat + 1 : 0;
  const order = g.players.map((_, k) => g.players[(start + k) % g.players.length]).filter((p) => !me || p.id !== me.id);
  return `<div class="game${me ? '' : ' watching'} phase-${g.phase}">
    <header class="bar">
      <div class="bar-info"><span class="bar-room">Sala ${esc(S.room.code)}</span><span>${phaseLabel(g)}</span><span>${g.deckCount} no baralho</span></div>
      <nav class="bar-nav"><button class="btn quiet small" data-a="log">Histórico</button><button class="btn quiet small" data-a="rules">Regras</button>${me ? '<button class="btn quiet small" data-a="askLeave">Sair</button>' : ''}</nav>
    </header>
    ${offlineNote()}
    ${statusBlock(g, me)}
    <section class="others${order.length > 5 ? ' many' : ''}" aria-label="Jogadores">${order.map((p) => playerTile(g, p, me)).join('')}</section>
    ${me ? dock(g, me) : ''}
  </div>`;
}

/* ---------- folhas ---------- */

function cardSheet(sh) {
  const g = S.game;
  const c = g.me.hand.find((x) => x.uid === sh.uid);
  const def = CARD_DEFS[c.type];
  const targets = g.me.legal.cards[c.uid] || [];
  const me = myPlayer();
  const head = `<div class="card-detail k-${def.kind}"><p class="card-kind">${KINDS[def.kind]}</p><p>${CARDS[c.type].text}</p></div>`;
  let body;
  if (!targets.length) {
    const myTurn = g.turn.player === me.id && !g.pending && g.phase === 'day';
    const why = !myTurn ? 'Você joga cartas na sua vez.' : g.turn.mode === 'draw' ? 'Neste turno você escolheu comprar.' : 'Nenhum jogador pode receber esta carta agora.';
    body = `<p class="hint">${why}</p>`;
  } else if (!sh.target) {
    body = `<h3>${def.pick === 'second' ? 'Tirar a suspeita de quem?' : 'Em quem?'}</h3>${targetList(targets, 'pickTarget')}`;
  } else {
    const t = player(sh.target);
    if (def.pick === 'second') {
      const rest = g.players.filter((p) => p.alive && p.id !== me.id && p.id !== t.id).map((p) => p.id);
      body = `<h3>Passar a suspeita de ${esc(t.name)} para quem?</h3>${targetList(rest, 'pickSecond')}`;
    } else if (def.pick === 'identity') {
      body = `<h3>Qual carta de ${esc(t.name)} você quer ver?</h3>${idPicker(t, 'pickIndex')}`;
    } else {
      body = `<h3>Qual carta fixa de ${esc(t.name)} sai?</h3><ul class="targets">${t.persistents
        .map((x) => `<li><button class="target" data-a="pickPersistent" data-uid="${x.uid}"><span class="target-name">${CARDS[x.type].name}</span><span class="target-info">${CARDS[x.type].text}</span></button></li>`)
        .join('')}</ul>`;
    }
  }
  return sheetWrap(`card:${sh.uid}`, CARDS[c.type].name, head + body, { back: !!sh.target });
}

function abilitySheet(sh) {
  const g = S.game;
  const me = myPlayer();
  const active = CHAR_DEFS.find((c) => c.id === me.character).active;
  const head = `<p>${CHARACTERS[me.character].text}</p>`;
  let body;
  if (!sh.target) body = `<h3>Em quem?</h3>${targetList(g.me.legal.ability || [], 'pickTarget')}`;
  else body = `<h3>Qual carta de ${esc(nameOf(sh.target))} você quer ver?</h3>${idPicker(player(sh.target), 'pickIndex')}`;
  return sheetWrap('ability', CHARACTERS[me.character].name, head + body, { back: !!sh.target && active === 'identity' });
}

function charSheet(sh) {
  const p = player(sh.p);
  const me = myPlayer();
  const used = p.abilityUsed ? '<p class="hint">Esta habilidade já foi usada nesta partida.</p>' : '';
  const mine = me && p.id === me.id;
  const use = mine && S.game.me.legal.ability ? '<button class="btn primary" data-a="ability">Usar agora</button>' : '';
  const title = mine ? `Seu personagem: ${CHARACTERS[p.character].name}` : `${p.name}: ${CHARACTERS[p.character].name}`;
  return sheetWrap(`char:${p.id}`, title, `<p>${CHARACTERS[p.character].text}</p>${used}${use}`);
}

function logSheet() {
  const g = S.game;
  const notes = g.me && g.me.notes.length ? `<h3>Só você sabe</h3><ul class="log-list private">${[...g.me.notes].reverse().map((n) => `<li>${esc(noteLine(n, nameOf))}</li>`).join('')}</ul>` : '';
  const lines = [...g.log].reverse().filter((e) => e.t !== 'draw').map((e) => `<li class="log-${e.t}">${esc(logLine(e, nameOf))}</li>`).join('');
  return sheetWrap('log', 'Histórico', `${notes}<h3>O que todos viram</h3><ul class="log-list">${lines}</ul>`);
}

function rulesSheet() {
  const sections = RULES_TEXT.map((s) => `<h3>${s.title}</h3>${s.body.map((p) => `<p>${p}</p>`).join('')}`).join('');
  const cards = Object.entries(CARD_DEFS)
    .map(([id, def]) => `<li class="k-${def.kind}"><strong>${CARDS[id].name}</strong> <span class="count">${def.copies} no baralho</span><br>${CARDS[id].text}</li>`)
    .join('');
  const cast = CHAR_DEFS.map((c) => `<li><strong>${CHARACTERS[c.id].name}</strong><br>${CHARACTERS[c.id].text}</li>`).join('');
  return sheetWrap('rules', 'Como se joga', `${sections}<h3>Cartas do baralho</h3><ul class="catalog">${cards}</ul><h3>Personagens</h3><p>Cada jogador recebe um, à vista de todos. Ele não diz de que time você é.</p><ul class="catalog">${cast}</ul>`);
}

function overSheet() {
  const g = S.game;
  const me = myPlayer();
  const verdict = me ? `<p class="verdict">${me.team === g.winner ? 'Seu time venceu.' : 'Seu time perdeu.'}</p>` : '';
  const rows = g.players
    .map((p) => `<li><span class="roster-name">${esc(p.name)}</span><span class="tag tag-${p.team}">${TEAMS[p.team].one}</span><span class="roster-info">${CHARACTERS[p.character].name}${p.alive ? '' : ', fora da partida'}</span></li>`)
    .join('');
  const buttons = `<div class="sheet-actions"><button class="btn primary" data-a="lobby">Voltar para a sala</button><button class="btn" data-a="seeTable">Ver a mesa</button></div>`;
  return sheetWrap('over', `Vitória dos ${TEAMS[g.winner].name}`, `${verdict}<ul class="roster">${rows}</ul>${me ? buttons : ''}`, { locked: !!me, minimize: false });
}

function pickBlock(key, title, hint, ids, extra = '') {
  const buttons = ids.map((id) => targetButton(player(id), `data-a="nightPick" data-k="${key}"`, S.night[key] === id)).join('');
  return `<h3>${title}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}<ul class="targets">${buttons}</ul>${extra}`;
}

// Escolha que o jogo espera deste jogador agora, se houver.
function promptFor(g) {
  const pend = g.pending;
  const me = myPlayer();
  if (!pend || !me || !me.alive) return null;

  if (pend.type === 'reveal') {
    if (pend.by !== me.id) return null;
    const t = player(pend.target);
    const self = t.id === me.id;
    const why = pend.reason === 'pressure' ? `${self ? 'Você é' : `${esc(t.name)} é`} quem tem mais suspeita na hora do Aliciamento.` : `A suspeita sobre ${esc(t.name)} chegou ao limite.`;
    return { title: self ? 'Revele uma carta sua' : `Revele uma carta de ${t.name}`, body: `<p>${why} A carta que você tocar fica aberta para todos.</p>${idPicker(t, 'reveal')}` };
  }

  if (pend.type === 'night' && pend.you && !pend.you.done) {
    const living = g.players.filter((p) => p.alive).map((p) => p.id);
    const others = living.filter((id) => id !== me.id);
    if (pend.stage === 'act') {
      const keys = [];
      let body = '';
      if (pend.you.vote) {
        keys.push('vote');
        const votes = Object.entries(pend.teamVotes || {}).filter(([id]) => id !== me.id);
        const extra = votes.length ? `<p class="hint">${votes.map(([id, to]) => `${esc(nameOf(id))} votou em ${esc(nameOf(to))}.`).join(' ')}</p>` : '';
        body += pickBlock('vote', 'Quem os Infiltrados atacam esta noite?', 'Vale o alvo mais votado pelo time. Empate é decidido na sorte.', living, extra);
      }
      if (pend.you.protect) {
        keys.push('protect');
        body += pickBlock('protect', 'Você é o Guardião. Quem você protege?', 'A pessoa protegida fica a salvo do ataque desta noite. Todos vão saber quem foi.', others);
      }
      if (!keys.length) {
        keys.push('decoy');
        body += pickBlock('decoy', 'De quem você mais desconfia?', 'Sua resposta não muda o jogo e ninguém vê. Todos tocam na tela para não dar para saber quem está agindo.', others);
      }
      const ready = keys.every((k) => S.night[k]);
      body += `<div class="sheet-actions"><button class="btn primary" data-a="nightSend" data-keys="${keys.join(',')}"${ready ? '' : ' disabled'}>Confirmar escolha</button></div>`;
      return { title: `Noite ${g.nights}`, body };
    }
    const guard = pend.protected ? `O Guardião protege ${esc(nameOf(pend.protected))}.` : 'Ninguém está sob proteção do Guardião.';
    const hidden = hiddenOf(me);
    const last = hidden.length === 1 ? '<p class="warn-text">Esta é sua última carta oculta. Se confessar, você sai da partida.</p>' : '';
    const inf = me.ids.some((c) => c.type === 'INFILTRATOR' && !c.revealed) ? '<p class="hint">Revelar a carta de Infiltrado tira você da partida.</p>' : '';
    return {
      title: 'Confessar?',
      body: `<p>${guard} Os Infiltrados já escolheram o alvo. Confessar abre uma carta sua para todos e salva você do ataque desta noite.</p>${last}${inf}
        <h3>Toque na carta que você revela</h3>${idPicker(me, 'confess')}
        <div class="sheet-actions"><button class="btn primary" data-a="confess" data-i="">Não confessar</button></div>`,
    };
  }

  if (pend.type === 'recruit' && pend.you && !pend.you.done) {
    const from = player(pend.you.from);
    return { title: `Pegue uma carta de ${from.name}`, body: `<p>Você fica com a carta que tocar, sem ver antes. Ao mesmo tempo, alguém pega uma das suas.</p>${idPicker(from, 'recruit')}` };
  }
  return null;
}

function currentSheet() {
  const sh = S.sheet;
  if (sh) {
    if (sh.kind === 'rules') return rulesSheet();
    if (sh.kind === 'notice') return sheetWrap('notice', 'Você mudou de lado', `<p>${esc(sh.text)}</p><div class="sheet-actions"><button class="btn primary" data-a="close">Entendi</button></div>`);
    if (!S.game) return '';
    if (sh.kind === 'card') return cardSheet(sh);
    if (sh.kind === 'ability') return abilitySheet(sh);
    if (sh.kind === 'char') return charSheet(sh);
    if (sh.kind === 'log') return logSheet();
    if (sh.kind === 'leave') {
      return sheetWrap('leave', 'Sair da partida?', `<p>Seu lugar continua na mesa e o jogo passa a decidir por você. Para voltar, abra o link da sala neste aparelho.</p>
        <div class="sheet-actions"><button class="btn danger" data-a="leave">Sair da partida</button><button class="btn" data-a="close">Continuar jogando</button></div>`);
    }
  }
  if (!S.game) return '';
  if (S.game.winner && !S.overSeen) return overSheet();
  const prompt = S.minimized ? null : promptFor(S.game);
  if (prompt) return sheetWrap(`prompt:${S.pendingKey}`, prompt.title, prompt.body, { locked: true, minimize: true });
  S.sheetKey = '';
  return '';
}

/* ---------- desenho ---------- */

function render() {
  const active = document.activeElement;
  const focusId = active && active.id;
  const caret = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = [...$app.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollLeft, el.scrollTop]);

  const page = !S.room ? home() : S.game ? gameView() : lobby();
  const toastHtml = S.toast ? `<p class="toast" role="status">${esc(S.toast)}</p>` : '';
  $app.innerHTML = page + currentSheet() + toastHtml;

  for (const [key, x, y] of scrolls) {
    const el = $app.querySelector(`[data-scroll="${key}"]`);
    if (el) {
      el.scrollLeft = x;
      el.scrollTop = y;
    }
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (caret) el.setSelectionRange(...caret);
    }
  }
  document.title = S.room ? `${GAME_NAME}, sala ${S.room.code}` : GAME_NAME;
}

/* ---------- toques ---------- */

function playFromSheet(extra) {
  const sh = S.sheet;
  if (sh.kind === 'ability') return act({ type: 'ability', target: sh.target, ...extra });
  act({ type: 'play', card: sh.uid, target: sh.target, ...extra });
}

const ACTIONS = {
  create() {
    const name = S.form.name.trim();
    if (!name) return toast(ERRORS.name_required);
    saved.write('inf.name', name);
    send({ t: 'create', name });
  },
  join() {
    const name = S.form.name.trim();
    if (!name) return toast(ERRORS.name_required);
    if (S.form.code.length < 4) return toast('O código da sala tem 4 letras.');
    saved.write('inf.name', name);
    send({ t: 'join', name, code: S.form.code });
  },
  async copy() {
    const link = `${location.origin}/?sala=${S.room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link de convite copiado.');
    } catch {
      toast(`Copie e envie este link: ${link}`);
    }
  },
  addBot: () => send({ t: 'addBot' }),
  removeSeat: ({ id }) => send({ t: 'removeSeat', id }),
  start: () => send({ t: 'start' }),
  lobby: () => send({ t: 'lobby' }),
  leave() {
    S.sheet = null;
    send({ t: 'leave' });
  },
  askLeave() {
    S.sheet = { kind: 'leave' };
    render();
  },
  draw: () => act({ type: 'draw' }),
  end: () => act({ type: 'end' }),
  card({ uid }) {
    S.sheet = { kind: 'card', uid: Number(uid), target: null };
    render();
  },
  ability() {
    S.sheet = { kind: 'ability', target: null };
    render();
  },
  char({ p }) {
    S.sheet = { kind: 'char', p };
    render();
  },
  rules() {
    S.sheet = { kind: 'rules' };
    render();
  },
  log() {
    S.sheet = { kind: 'log' };
    render();
  },
  close() {
    if (!S.sheet && S.game && S.game.winner) S.overSeen = true;
    S.sheet = null;
    render();
  },
  back() {
    if (S.sheet) S.sheet.target = null;
    render();
  },
  minimize() {
    S.minimized = true;
    render();
  },
  restore() {
    S.minimized = false;
    render();
  },
  seeTable() {
    S.overSeen = true;
    render();
  },
  toggleIds() {
    S.hideIds = !S.hideIds;
    render();
  },
  pickTarget({ p }) {
    const sh = S.sheet;
    sh.target = p;
    if (sh.kind === 'ability') {
      const active = CHAR_DEFS.find((c) => c.id === myPlayer().character).active;
      return active === 'identity' ? render() : playFromSheet({});
    }
    const card = S.game.me.hand.find((c) => c.uid === sh.uid);
    return CARD_DEFS[card.type].pick ? render() : playFromSheet({});
  },
  pickSecond: ({ p }) => playFromSheet({ target2: p }),
  pickIndex: ({ i }) => playFromSheet({ index: Number(i) }),
  pickPersistent: ({ uid }) => playFromSheet({ persistent: Number(uid) }),
  reveal: ({ i }) => act({ type: 'reveal', index: Number(i) }),
  recruit: ({ i }) => act({ type: 'recruit', index: Number(i) }),
  confess: ({ i }) => act({ type: 'confess', index: i === '' ? null : Number(i) }),
  nightPick({ k, p }) {
    S.night[k] = p;
    render();
  },
  nightSend({ keys }) {
    const action = { type: 'night' };
    for (const k of keys.split(',')) action[k] = S.night[k];
    act(action);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.a];
  if (fn) fn(el.dataset);
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'f-name') S.form.name = e.target.value;
  if (e.target.id === 'f-code') {
    S.form.code = roomCode(e.target.value);
    e.target.value = S.form.code;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.id === 'f-name' || e.target.id === 'f-code')) {
    if (S.form.code.length === 4) ACTIONS.join();
    else ACTIONS.create();
  }
  if (e.key === 'Escape' && $app.querySelector('.veil[data-a]')) ACTIONS.close();
});

render();
connect();
