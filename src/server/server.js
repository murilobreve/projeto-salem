// Servidor de salas. Guarda o estado completo de cada partida e manda para
// cada aparelho so a visao daquele jogador. O navegador nunca recebe segredo
// de outra pessoa.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, viewFor, requiredActors } from '../engine/engine.js';
import { botAction } from '../engine/bot.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/content.js';

const PORT = Number(process.env.PORT) || 3000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, '..', '..', 'public');
// A tela le as mesmas definicoes de cartas que o motor usa.
const SHARED = { 'content.js': path.join(HERE, '..', 'engine', 'content.js') };
const OFFLINE_GRACE_MS = 25000; // depois disso o jogo decide por quem caiu
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const BOT_NAMES = ['Bia', 'Caio', 'Duda', 'Enzo', 'Fabi', 'Gui', 'Helena', 'Igor', 'Juca', 'Lia', 'Nando', 'Olga'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') return res.writeHead(200).end('ok');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = SHARED[rel] || path.join(PUBLIC_DIR, rel);
  if (!SHARED[rel] && !file.startsWith(PUBLIC_DIR + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    const ext = path.extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.woff2' ? 'public, max-age=604800' : 'no-cache',
    });
    res.end(data);
  });
});

/* ---------- salas ---------- */

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function cleanName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function addSeat(room, name, isBot) {
  let unique = name;
  for (let k = 2; room.seats.some((s) => s.name.toLowerCase() === unique.toLowerCase()); k++) unique = `${name} ${k}`;
  const seat = {
    id: `j${room.nextSeat++}`,
    name: unique,
    isBot,
    token: isBot ? null : crypto.randomBytes(16).toString('hex'),
    sockets: new Set(),
    offlineSince: null,
  };
  room.seats.push(seat);
  return seat;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function roomInfo(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: !!room.game,
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
    seats: room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, online: s.isBot || s.sockets.size > 0 })),
  };
}

function broadcast(room) {
  room.touched = Date.now();
  const info = roomInfo(room);
  for (const seat of room.seats) {
    if (!seat.sockets.size) continue;
    const msg = { t: 'state', room: info, you: seat.id, game: room.game ? viewFor(room.game, seat.id) : null };
    for (const ws of seat.sockets) send(ws, msg);
  }
  if (room.watchers.size) {
    const msg = { t: 'state', room: info, you: null, game: room.game ? viewFor(room.game, null) : null };
    for (const ws of room.watchers) send(ws, msg);
  }
}

/* ---------- bots e jogadores que cairam ---------- */

function autoActor(room) {
  if (!room.game) return null;
  const now = Date.now();
  for (const id of requiredActors(room.game)) {
    const seat = room.seats.find((s) => s.id === id);
    if (!seat) continue;
    if (seat.isBot) return seat;
    if (seat.offlineSince && now - seat.offlineSince >= OFFLINE_GRACE_MS) return seat;
  }
  return null;
}

function schedule(room) {
  if (room.timer || !room.game || room.game.winner) return;
  const seat = autoActor(room);
  if (!seat) return;
  const together = !!room.game.pending && room.game.pending.type !== 'reveal';
  const delay = together ? 300 + Math.random() * 600 : 900 + Math.random() * 900;
  room.timer = setTimeout(() => {
    room.timer = null;
    if (!room.game || room.game.winner) return;
    const actor = autoActor(room);
    if (actor) {
      applyAction(room.game, actor.id, botAction(room.game, actor.id));
      broadcast(room);
    }
    schedule(room);
  }, delay);
}

function stopGame(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.game = null;
}

/* ---------- mensagens ---------- */

// explicit: a pessoa escolheu sair. Queda de conexao so marca como ausente,
// para o lugar continuar dela quando o aparelho voltar.
function leaveSocket(ws, explicit = false) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  room.watchers.delete(ws);
  const seat = room.seats.find((s) => s.id === ws.seatId);
  ws.roomCode = null;
  ws.seatId = null;
  if (!seat) return;
  seat.sockets.delete(ws);
  if (seat.sockets.size) return;
  if (explicit && !room.game) {
    room.seats = room.seats.filter((s) => s !== seat);
    if (room.hostId === seat.id) room.hostId = room.seats.find((s) => !s.isBot)?.id || null;
    if (!room.hostId) return rooms.delete(room.code);
  } else {
    seat.offlineSince = explicit ? Date.now() - OFFLINE_GRACE_MS : Date.now();
    if (room.game) setTimeout(() => schedule(room), explicit ? 0 : OFFLINE_GRACE_MS + 200);
  }
  broadcast(room);
}

function bind(ws, room, seat) {
  leaveSocket(ws);
  ws.roomCode = room.code;
  ws.seatId = seat.id;
  seat.sockets.add(ws);
  seat.offlineSince = null;
  send(ws, { t: 'joined', code: room.code, you: seat.id, token: seat.token });
  broadcast(room);
}

const fail = (ws, error) => send(ws, { t: 'error', error });

const HANDLERS = {
  create(ws, msg) {
    const name = cleanName(msg.name);
    if (!name) return fail(ws, 'name_required');
    const room = { code: newCode(), seats: [], nextSeat: 1, hostId: null, game: null, watchers: new Set(), timer: null, touched: Date.now() };
    rooms.set(room.code, room);
    const seat = addSeat(room, name, false);
    room.hostId = seat.id;
    bind(ws, room, seat);
  },
  join(ws, msg) {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const name = cleanName(msg.name);
    if (!room) return fail(ws, 'room_not_found');
    if (!name) return fail(ws, 'name_required');
    if (room.game) return fail(ws, 'room_started');
    if (room.seats.length >= MAX_PLAYERS) return fail(ws, 'room_full');
    bind(ws, room, addSeat(room, name, false));
  },
  rejoin(ws, msg) {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const seat = room && room.seats.find((s) => s.token && s.token === msg.token);
    if (!seat) return send(ws, { t: 'gone' });
    bind(ws, room, seat);
  },
  watch(ws, msg) {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!room) return fail(ws, 'room_not_found');
    leaveSocket(ws);
    ws.roomCode = room.code;
    room.watchers.add(ws);
    broadcast(room);
  },
  leave(ws) {
    leaveSocket(ws, true);
    send(ws, { t: 'left' });
  },
  addBot(ws, msg, room, seat) {
    if (!room || seat.id !== room.hostId || room.game) return fail(ws, 'not_allowed');
    if (room.seats.length >= MAX_PLAYERS) return fail(ws, 'room_full');
    const free = BOT_NAMES.filter((n) => !room.seats.some((s) => s.name === n));
    addSeat(room, free[crypto.randomInt(free.length)] || 'Bot', true);
    broadcast(room);
  },
  removeSeat(ws, msg, room, seat) {
    if (!room || seat.id !== room.hostId || room.game) return fail(ws, 'not_allowed');
    const target = room.seats.find((s) => s.id === msg.id);
    if (!target || target.id === room.hostId) return fail(ws, 'not_allowed');
    room.seats = room.seats.filter((s) => s !== target);
    for (const other of target.sockets) {
      other.roomCode = null;
      other.seatId = null;
      send(other, { t: 'left', error: 'removed' });
    }
    broadcast(room);
  },
  start(ws, msg, room, seat) {
    if (!room || seat.id !== room.hostId || room.game) return fail(ws, 'not_allowed');
    if (room.seats.length < MIN_PLAYERS) return fail(ws, 'too_few');
    room.game = createGame(room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })));
    broadcast(room);
    schedule(room);
  },
  action(ws, msg, room, seat) {
    if (!room || !room.game) return fail(ws, 'not_allowed');
    const result = applyAction(room.game, seat.id, msg.action);
    if (!result.ok) return fail(ws, result.error);
    broadcast(room);
    schedule(room);
  },
  // Volta para a sala de espera, mantendo quem esta nela.
  // Quem criou a sala pode fazer isso a qualquer momento; os outros, so com a partida encerrada.
  lobby(ws, msg, room, seat) {
    const over = room && room.game && room.game.winner;
    if (!room || (seat.id !== room.hostId && !over)) return fail(ws, 'not_allowed');
    stopGame(room);
    room.seats = room.seats.filter((s) => s.isBot || s.sockets.size > 0);
    if (!room.seats.some((s) => s.id === room.hostId)) room.hostId = seat.id;
    broadcast(room);
  },
};

const SEATED = new Set(['addBot', 'removeSeat', 'start', 'action', 'lobby']);

const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const handler = msg && HANDLERS[msg.t];
    if (!handler) return;
    const room = rooms.get(ws.roomCode);
    const seat = room && room.seats.find((s) => s.id === ws.seatId);
    if (SEATED.has(msg.t) && !seat) return fail(ws, 'not_allowed');
    try {
      handler(ws, msg, room, seat);
    } catch (e) {
      console.error(e);
      fail(ws, 'server_error');
    }
  });
  ws.on('close', () => leaveSocket(ws));
});

// Derruba conexoes mortas e apaga salas abandonadas.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const room of rooms.values()) {
    const empty = room.seats.every((s) => !s.sockets.size) && !room.watchers.size;
    if (empty && now - room.touched > ROOM_TTL_MS) {
      stopGame(room);
      rooms.delete(room.code);
    }
  }
}, 30000).unref();

server.listen(PORT, () => console.log(`Infiltrados em http://localhost:${PORT}`));
