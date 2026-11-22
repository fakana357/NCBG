// One match = one worker thread with its own copy of the game engine.
'use strict';
const { parentPort, workerData } = require('worker_threads');
require('./engine.js');
const B = globalThis.BG;
const BOT_NAMES = require('./botnames.js');

const HERO_PICK_MS = 30000;
const READY_MAX_MS = 60000;
const turnSeconds = t => Math.min(90, 45 + (t - 1) * 5);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const humans = workerData.humans;            // [{ seat, name }]
const fillBots = workerData.fillBots;
const seats = humans.length + (fillBots ? Math.max(0, 8 - humans.length) : 0);
const connected = new Set(humans.map(h => h.seat));

let G = null, phase = 'heroes', deadline = 0, timer = null, done = new Set(), ready = new Set();
const events = {};                            // seat -> queued UI events

const send = (seat, msg) => parentPort.postMessage({ to: seat, msg });
const sendAll = msg => humans.forEach(h => send(h.seat, msg));

// ---------- hero selection ----------
const tribes = B.pickTribes();
const used = [];
const heroOpts = {};
for (const h of humans) { const o = B.heroChoices(4, used, tribes).map(x => x.id); used.push(...o); heroOpts[h.seat] = o; }
const picked = {};
deadline = Date.now() + HERO_PICK_MS;
for (const h of humans) send(h.seat, { t: 'heroes', opts: heroOpts[h.seat], tribes, left: HERO_PICK_MS });
timer = setTimeout(startMatch, HERO_PICK_MS);

function startMatch() {
  if (phase !== 'heroes') return; phase = 'starting'; clearTimeout(timer);
  for (const h of humans) if (!picked[h.seat]) picked[h.seat] = heroOpts[h.seat][0];
  const taken = humans.map(h => picked[h.seat]);
  const nBots = seats - humans.length;
  const botHeroes = B.heroChoices(nBots, taken, tribes).map(h => h.id);
  while (botHeroes.length < nBots) botHeroes.push(B.heroChoices(1, [], tribes)[0].id);
  const ids = taken.concat(botHeroes);
  B.newGame(ids[0], humans[0].name, ids.slice(1), tribes, null, 0);
  G = B.G; G.multi = true;
  const names = shuffle(BOT_NAMES.slice());
  G.players.forEach((p, i) => {
    if (i < humans.length) { p.human = true; p.isAI = !connected.has(humans[i].seat); p.name = humans[i].name; p.seat = humans[i].seat; p.diff = 0; }
    else { const r = Math.random(); p.human = false; p.isAI = true; p.name = names[(i - humans.length) % names.length]; p.diff = r < .6 ? 0 : r < .9 ? 1 : 2; }
  });
  startRecruit();
}

// ---------- events from the engine ----------
B.hooks.onEvent = (type, data) => {
  const p = data && data.p ? data.p : data;
  if (!p || !p.human) return;
  let e = null;
  if (type === 'psycho' || type === 'clone') e = { type, uid: data.m.uid };
  else if (type === 'maxtac') e = { type, m: data.m };
  else if (type === 'scan') { const o = G.players.find(x => x.id === p.nextOpp); if (o) e = { type, o: pub(o), board: o.board }; }
  if (e) (events[p.seat] = events[p.seat] || []).push(e);
};

// ---------- serialization ----------
const strip = (k, v) => (k === 'hero' || k === 'ai' || k === 'onPick') ? undefined : v;
function mine(p) { const o = JSON.parse(JSON.stringify(p, strip)); o.heroId = p.hero.id; o.pending = p.pending.map(it => ({ type: it.type, kind: it.kind, opts: it.opts })); return o; }
function pub(p) {
  if (p.isGhost) return { isGhost: true, id: 'ghost', name: p.name, heroId: p.hero.id, tier: p.tier, ghostOf: p.ghostOf, hp: 0, armor: 0, alive: false };
  return { id: p.id, name: p.name, heroId: p.hero.id, hp: p.hp, armor: p.armor, tier: p.tier, alive: p.alive, placement: p.placement, lastSeen: p.lastSeen, lastResult: p.lastResult, lastOppName: p.lastOppName, lastOpp: p.lastOpp, nextOpp: p.nextOpp, human: !!p.human, perks: p.perks, engram: p.engram };
}
function game() { return { turn: G.turn, tribes: G.tribes, over: G.over, left: Math.max(0, deadline - Date.now()), phase, players: G.players.map(pub), ghost: (G.pairs || []).flat().filter(x => x.isGhost).map(pub)[0] || null }; }
function stateFor(p, extra) {
  const ev = events[p.seat] || []; events[p.seat] = [];
  return Object.assign({ t: 'state', me: mine(p), game: game(), done: done.has(p.seat), events: ev }, extra || {});
}
const humanPlayers = () => G.players.filter(p => p.human);
const pushStates = () => humanPlayers().forEach(p => send(p.seat, stateFor(p)));

// ---------- recruit ----------
function startRecruit() {
  phase = 'recruit'; done = new Set();
  B.startTurn(true);
  deadline = Date.now() + turnSeconds(G.turn) * 1000;
  clearTimeout(timer); timer = setTimeout(resolveTurn, deadline - Date.now());
  for (const p of humanPlayers()) send(p.seat, stateFor(p, { t: 'turn' }));
  thinkBots();
}
function thinkBots() {
  if (phase !== 'recruit') return;
  const more = B.aiStep();
  if (more) setTimeout(thinkBots, 5); else maybeResolve();
}
function activeHumans() { return humanPlayers().filter(p => p.alive && !p.isAI); }
function maybeResolve() {
  if (phase !== 'recruit') return;
  if (activeHumans().every(p => done.has(p.seat)) && !(G.aiQueue && G.aiQueue.length)) resolveTurn();
}

const findUid = (p, uid) => uid == null ? null : (p.board.find(m => m.uid === uid) || p.shop.find(m => m.uid === uid) || null);
function act(p, a) {
  switch (a.a) {
    case 'buy': return B.actBuy(p, a.i);
    case 'buySpell': return B.actBuySpell(p, a.i);
    case 'buyWare': return B.actBuyWare(p, a.i);
    case 'sell': return B.actSell(p, a.i);
    case 'reorder': return B.actReorder(p, a.from, a.to);
    case 'play': return B.actPlay(p, a.i, a.pos, findUid(p, a.tg));
    case 'install': return B.actInstall(p, a.i, findUid(p, a.tg));
    case 'cast': return B.actCast(p, a.i, findUid(p, a.tg));
    case 'power': return B.actHeroPower(p, findUid(p, a.tg));
    case 'upgrade': return B.actUpgrade(p);
    case 'refresh': return B.actRefresh(p);
    case 'freeze': return B.actFreeze(p);
    case 'pick': {
      const it = p.pending[0]; if (!it || !it.opts.includes(a.id)) return false;
      if (it.type === 'perk') { if (!B.actPickPerk(p, a.id)) return false; p.pending.shift(); return true; }
      p.pending.shift(); it.onPick(a.id); return true;
    }
  }
  return false;
}

// ---------- combat ----------
function mirror(r) {
  return { winner: r.winner === -1 ? -1 : 1 - r.winner, dmg: r.dmg, frames: r.frames.map(f => Object.assign({}, f, { L: f.R, R: f.L })) };
}
function resolveTurn() {
  if (phase !== 'recruit') return;
  phase = 'combat'; clearTimeout(timer);
  for (const p of humanPlayers()) while (p.pending.length) B.aiResolvePendingOne(p);
  const capT = B.damageCap();
  const results = B.endTurnAll();
  const before = {};
  for (const res of results) for (const pl of [res.a, res.b]) if (pl.human) before[pl.seat] = { me: mine(pl), game: game() };
  B.applyResults(results);
  ready = new Set();
  for (const res of results) {
    for (const [pl, opp, flip] of [[res.a, res.b, false], [res.b, res.a, true]]) {
      if (!pl.human) continue;
      const r = { winner: res.r.winner, dmg: res.r.dmg, frames: res.r.frames };
      send(pl.seat, { t: 'combat', capT, res: { r: flip ? mirror(r) : r, b: pub(opp) }, before: before[pl.seat], after: stateFor(pl) });
    }
  }
  if (G.over) { phase = 'over'; finish(); return; }
  clearTimeout(timer); timer = setTimeout(nextTurn, READY_MAX_MS);
}
function nextTurn() { if (phase !== 'combat') return; startRecruit(); }
function maybeNext() { if (phase === 'combat' && activeHumans().every(p => ready.has(p.seat))) { clearTimeout(timer); nextTurn(); } }
function finish() {
  const order = G.players.slice().sort((a, b) => (a.placement || 1) - (b.placement || 1)).map(p => ({ name: p.name, heroId: p.hero.id, placement: p.placement || 1, human: !!p.human }));
  sendAll({ t: 'over', standings: order });
  setTimeout(() => parentPort.postMessage({ end: true }), 2000);
}

// ---------- messages from the server ----------
parentPort.on('message', ({ seat, msg, sys }) => {
  if (sys === 'disconnect') {
    connected.delete(seat);
    if (G) { const p = G.players.find(x => x.seat === seat); if (p) { p.isAI = true; if (phase === 'recruit' && p.alive) { done.add(seat); B.aiTakeTurn(p); maybeResolve(); } maybeNext(); } }
    if (!connected.size) { clearTimeout(timer); parentPort.postMessage({ end: true }); }
    return;
  }
  if (sys === 'reconnect') {
    connected.add(seat);
    if (phase === 'heroes') { send(seat, { t: 'heroes', opts: heroOpts[seat], tribes, left: Math.max(0, deadline - Date.now()), picked: picked[seat] }); return; }
    if (G) { const p = G.players.find(x => x.seat === seat); if (p) { p.isAI = false; if (phase === 'recruit') done.delete(seat); send(seat, stateFor(p, { t: 'turn', resume: true })); } }
    return;
  }
  if (!msg) return;
  if (msg.t === 'hero' && phase === 'heroes') {
    if (heroOpts[seat] && heroOpts[seat].includes(msg.id)) picked[seat] = msg.id;
    send(seat, { t: 'heroPicked', id: picked[seat] });
    if (humans.every(h => picked[h.seat] || !connected.has(h.seat))) startMatch();
    return;
  }
  if (!G) return;
  const p = G.players.find(x => x.seat === seat); if (!p) return;
  if (msg.t === 'act') {
    if (phase === 'recruit' && p.alive && !done.has(seat)) { try { act(p, msg); } catch (e) { console.error(e); } }
    send(seat, stateFor(p));
  } else if (msg.t === 'end') {
    if (phase === 'recruit' && p.alive) { done.add(seat); send(seat, stateFor(p)); maybeResolve(); }
  } else if (msg.t === 'ready') {
    ready.add(seat); maybeNext();
  }
});
