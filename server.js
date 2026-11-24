'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const QUEUE_WAIT_MS = 30000;
const MAX_PLAYERS = 8;
const PUBLIC = path.join(__dirname, 'public');

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  let file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- state ----------
const clients = new Map();   // token -> client
const rooms = new Map();     // code -> room
let queue = [];              // clients waiting for a public match
let queueTimer = null, queueDeadline = 0;
const matches = new Set();

const send = (c, msg) => { if (c && c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); };
const cleanName = s => String(s || '').replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Choom';
const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c)); return c; };

// ---------- rooms ----------
function roomView(r) { return { t: 'room', code: r.code, host: r.host, fillBots: r.fillBots, players: r.members.map(c => ({ name: c.name, me: false, id: c.pid, ready: !!c.ready })) }; }
function pushRoom(r) { for (const c of r.members) { const v = roomView(r); v.players.forEach(p => { p.me = p.id === c.pid; }); v.isHost = r.host === c.pid; send(c, v); } pushRooms(); }
function roomList() { return [...rooms.values()].filter(r => !r.match && r.members.length).map(r => ({ code: r.code, host: (r.members.find(c => c.pid === r.host) || r.members[0]).name, count: r.members.length, fillBots: r.fillBots })); }
function pushRooms() { clearTimeout(pushRooms.t); pushRooms.t = setTimeout(() => { const l = roomList(); for (const c of clients.values()) if (c.ws && !c.match && !c.room) send(c, { t: 'rooms', rooms: l }); }, 50); }
const chatText = s => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
function chat(c, text) {
  text = chatText(text); if (!text) return;
  const now = Date.now(); c.chatT = (c.chatT || []).filter(t => now - t < 10000); if (c.chatT.length >= 8) return; c.chatT.push(now);
  const msg = { t: 'chat', from: c.name, text, ts: now };
  if (c.match) c.match.seats.forEach(x => { if (x.match === c.match) send(x, msg); });
  else if (c.room && rooms.get(c.room)) rooms.get(c.room).members.forEach(x => send(x, msg));
}
function leaveRoom(c) {
  const r = c.room && rooms.get(c.room); c.room = null; if (!r || r.match) return;
  r.members = r.members.filter(x => x !== c);
  if (!r.members.length) { rooms.delete(r.code); pushRooms(); return; }
  if (r.host === c.pid) r.host = r.members[0].pid;
  pushRoom(r);
}

// ---------- matchmaking ----------
function pushQueue() { for (const c of queue) send(c, { t: 'queue', count: queue.length, left: Math.max(0, queueDeadline - Date.now()) }); }
function leaveQueue(c) { if (!queue.includes(c)) return; queue = queue.filter(x => x !== c); if (!queue.length) { clearTimeout(queueTimer); queueTimer = null; } pushQueue(); }
function joinQueue(c) {
  if (queue.includes(c)) return;
  queue.push(c);
  if (!queueTimer) { queueDeadline = Date.now() + QUEUE_WAIT_MS; queueTimer = setTimeout(flushQueue, QUEUE_WAIT_MS); }
  if (queue.length >= MAX_PLAYERS) { startMatch(queue.splice(0, MAX_PLAYERS), true); if (!queue.length) { clearTimeout(queueTimer); queueTimer = null; } }
  pushQueue();
}
function flushQueue() {
  queueTimer = null;
  while (queue.length) startMatch(queue.splice(0, MAX_PLAYERS), true);
}

// ---------- matches ----------
function startMatch(members, fillBots, room) {
  const humans = members.map((c, i) => ({ seat: i, name: c.name }));
  const w = new Worker(path.join(__dirname, 'match.js'), { workerData: { humans, fillBots } });
  const m = { w, seats: members.slice(), room };
  matches.add(m);
  members.forEach((c, i) => { c.match = m; c.seat = i; send(c, { t: 'matchStart' }); });
  w.on('message', d => {
    if (d.end) return endMatch(m);
    const c = m.seats[d.to]; if (c && c.match === m) send(c, d.msg);
  });
  w.on('error', e => { console.error('match crashed', e); m.seats.forEach(c => send(c, { t: 'error', text: 'The match crashed.' })); endMatch(m); });
  if (room) room.match = m;
  pushRooms();
}
function endMatch(m) {
  if (!matches.has(m)) return; matches.delete(m);
  m.w.terminate();
  m.seats.forEach(c => { if (c.match === m) { c.match = null; c.seat = null; } });
  if (m.room) { m.room.match = null; m.room.members = m.room.members.filter(c => c.ws && c.room === m.room.code); m.room.members.forEach(c => { c.ready = false; }); if (m.room.members.length) { if (!m.room.members.some(c => c.pid === m.room.host)) m.room.host = m.room.members[0].pid; pushRoom(m.room); } else rooms.delete(m.room.code); }
  pushRooms();
}

// ---------- sockets ----------
const wss = new WebSocketServer({ server });
let pidSeq = 1;
wss.on('connection', ws => {
  let c = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.t === 'hello') {
      const old = msg.token && clients.get(msg.token);
      if (old) { c = old; if (c.ws && c.ws !== ws) try { c.ws.close(); } catch (e) { } c.ws = ws; clearTimeout(c.gone); }
      else { c = { token: crypto.randomUUID(), pid: pidSeq++, ws, name: 'Choom', room: null, match: null, seat: null }; clients.set(c.token, c); }
      c.name = cleanName(msg.name || c.name);
      send(c, { t: 'welcome', token: c.token, inMatch: !!c.match });
      if (c.match) c.match.w.postMessage({ seat: c.seat, sys: 'reconnect' });
      else if (c.room && rooms.get(c.room)) pushRoom(rooms.get(c.room));
      else send(c, { t: 'rooms', rooms: roomList() });
      return;
    }
    if (!c) return;
    switch (msg.t) {
      case 'name': c.name = cleanName(msg.name); if (c.room && rooms.get(c.room)) pushRoom(rooms.get(c.room)); break;
      case 'queue': if (c.match) break; leaveRoom(c); joinQueue(c); break;
      case 'unqueue': leaveQueue(c); send(c, { t: 'left' }); break;
      case 'create': {
        if (c.match) break; leaveQueue(c); leaveRoom(c);
        c.ready = false; const r = { code: newCode(), host: c.pid, members: [c], fillBots: true, match: null };
        rooms.set(r.code, r); c.room = r.code; pushRoom(r); break;
      }
      case 'join': {
        if (c.match) break;
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) { send(c, { t: 'error', text: 'Room not found.' }); break; }
        if (r.match) { send(c, { t: 'error', text: 'That game already started.' }); break; }
        if (r.members.length >= MAX_PLAYERS) { send(c, { t: 'error', text: 'Room is full.' }); break; }
        leaveQueue(c); leaveRoom(c); c.ready = false; r.members.push(c); c.room = r.code; pushRoom(r); break;
      }
      case 'leave': leaveRoom(c); leaveQueue(c); send(c, { t: 'left' }); send(c, { t: 'rooms', rooms: roomList() }); break;
      case 'fill': { const r = rooms.get(c.room); if (r && r.host === c.pid && !r.match) { r.fillBots = !!msg.on; pushRoom(r); } break; }
      case 'start': {
        const r = rooms.get(c.room);
        if (!r || r.host !== c.pid || r.match) break;
        if (!r.fillBots && r.members.length < 2) { send(c, { t: 'error', text: 'Need at least 2 players without bots.' }); break; }
        if (r.members.some(x => x.pid !== r.host && !x.ready)) { send(c, { t: 'error', text: 'Not everyone is ready.' }); break; }
        startMatch(r.members.slice(), r.fillBots, r); break;
      }
      case 'ready': { if (c.match) { c.match.w.postMessage({ seat: c.seat, msg }); break; } const r = rooms.get(c.room); if (r && !r.match) { c.ready = !!msg.on; pushRoom(r); } break; }
      case 'chat': chat(c, msg.text); break;
      case 'rooms': send(c, { t: 'rooms', rooms: roomList() }); break;
      case 'quit': if (c.match) { c.match.w.postMessage({ seat: c.seat, sys: 'disconnect' }); c.match = null; c.seat = null; c.room = null; send(c, { t: 'rooms', rooms: roomList() }); } break;
      default: if (c.match) c.match.w.postMessage({ seat: c.seat, msg });
    }
  });
  ws.on('close', () => {
    if (!c || c.ws !== ws) return;
    c.ws = null;
    leaveQueue(c);
    if (c.match) c.match.w.postMessage({ seat: c.seat, sys: 'disconnect' });
    // keep the seat for a reconnect; forget the client after 10 minutes
    c.gone = setTimeout(() => { if (!c.ws) { leaveRoom(c); clients.delete(c.token); } }, 10 * 60 * 1000);
    if (c.room && !c.match) { const r = rooms.get(c.room); if (r) { leaveRoom(c); } }
  });
});
setInterval(() => wss.clients.forEach(ws => { try { ws.ping(); } catch (e) { } }), 25000);

server.listen(PORT, () => console.log(`Night City Battlegrounds server on :${PORT}`));
