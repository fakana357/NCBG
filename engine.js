(function (root) {
'use strict';
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
let UID = 1;
const HAND_MAX = 10;
const COMBAT_CAP = 120;
const POOL_COUNT = [0, 16, 15, 13, 11, 9, 7];
const SHOP_SIZE = [0, 3, 4, 4, 5, 5, 6];
const UPC = { 2: 4, 3: 6, 4: 7, 5: 8, 6: 9 };
const PSYCHO_FRIENDLY_FIRE = 0.4, PSYCHO_FF_MAE = 0.10, MAXTAC_STEP = 0.08, MAXTAC_CAP = 0.75, MAXTAC_CAP_MAE = 0.2;

const TRIBES = {
  MIL: { name: 'Militech', color: '#4fc3ff', hum: 4 },
  MAE: { name: 'Maelstrom', color: '#ff3355', hum: 0 },
  TYG: { name: 'Tyger Claws', color: '#ff2a8a', hum: 3 },
  ALD: { name: 'Aldecaldos', color: '#d6a95c', hum: 3 },
  ARA: { name: 'Arasaka', color: '#f2f2f2', hum: 4 },
  VAL: { name: 'Valentinos', color: '#ffe14a', hum: 3 },
  VDB: { name: 'Voodoo Boys', color: '#a66bff', hum: 2 },
  ANI: { name: 'Animals', color: '#4dff88', hum: 3 },
  BIO: { name: 'Biotechnica', color: '#2fd6ae', hum: 3 },
  MOX: { name: 'The Mox', color: '#c43cff', hum: 3 },
};
const KW = { taunt: 'Bodyguard', shield: 'Barrier', reborn: 'Reboot', venom: 'Neurotoxin', windfury: 'Overclock', cleave: 'Cleave', stealth: 'Optical Camo', first: 'Kerenzikov', smash: 'Smash' };
const KW_DESC = {
  'Bodyguard': 'Enemies must attack this minion first.',
  'Barrier': 'The first time this would take damage, ignore it.',
  'Reboot': 'When this dies for the first time, it comes back with 1 Health.',
  'Neurotoxin': 'The first time this damages a minion, that minion is destroyed.',
  'Overclock': 'Attacks twice each combat round.',
  'Cleave': 'Also hits the minions next to its target.',
  'Optical Camo': 'Can\'t be targeted by attacks until it attacks.',
  'Kerenzikov': 'Strikes first. If its target dies, it takes no damage back.',
  'Smash': 'Damage beyond what kills the target hits the next enemy minion.',
  'Jack In': 'Triggers when you play it from your hand.',
  'Flatline': 'Triggers when it dies.',
  'Start of Combat': 'Triggers when combat begins.',
  'Cyberware': 'Bought in the Tavern, installed on a minion. Each piece uses Humanity.',
  'Humanity': 'How much Cyberware a minion can take. Go over it and the minion becomes a Cyberpsycho.',
  'Cyberpsycho': 'Double Attack in combat and ignores Bodyguard and Optical Camo. But 40% of its attacks hit a friendly minion instead, and Max-Tac hunts it. Maelstrom Cyberpsychos have quadruple Attack and quadruple Health instead, and Max-Tac hunts them far less.',
  'Max-Tac': 'Hunts Cyberpsychos. At the start of each turn, each of your Cyberpsychos may be destroyed. The chance grows by 8% every turn it stays a Cyberpsycho, up to 75%. For Maelstrom it grows by only 1% per turn, up to 20%.',
  'Malicious': 'A hidden downside that comes with a cheap or free implant.',
  'Turncoat': 'A minion driven to Cyberpsychosis by an enemy hack: double Attack, and every attack hits its own allies.',
  'Arsenal': 'How many pieces of Cyberware you have installed this game.',
  'Honor': 'How many enemy minions your Tyger Claws have destroyed this game.',
  'Mutation': 'Every Clone you create gets +1/+1 for each Mutation.',
  'Clone': 'A Biotechnica token, created with +Mutation/+Mutation. Selling one gives no €$.',
  'RAM': 'Spent on Quickhacks. Refills every turn; your maximum grows with Tavern Tier.',
  'Engram': 'A permanent bonus that every Arasaka you control has. Uploads add to it.',
  'faction': 'Minions with the same faction name. Neutral minions have no faction.',
  'Loyalty': 'How many of your turns the minion has spent on your board.',
};

let G = null;
const hooks = { onEvent: null };
function emit(type, data) { if (hooks.onEvent) hooks.onEvent(type, data); }

// ---------------- instances ----------------
function makeMinion(id, golden) {
  const c = CARDS[id]; const g = golden ? 3 : 1;
  const m = { uid: UID++, kind: 'minion', id, tribe: c.tribe, tier: c.tier, atk: c.atk * g, hp: c.hp * g, golden: !!golden, ware: [], humMod: 0, loy: 0, attached: [] };
  for (const k of c.kw) m[k] = true;
  return m;
}
function makeSpell(id) { return { uid: UID++, kind: 'spell', id }; }
function makeWare(id) { return { uid: UID++, kind: 'ware', id }; }
const gm = m => (m.golden ? 3 : 1);
function buff(m, a, h) { a = Math.ceil(a); h = Math.ceil(h); m.atk = Math.max(0, m.atk + a); m.hp += h; }
function humMax(m, p) {
  const c = CARDS[m.id];
  let h = (c.hum != null ? c.hum : (c.tribe ? TRIBES[c.tribe].hum : 3)) + (m.humMod || 0);
  if (p && p.perks && p.perks.some(x => x.id === 'pk_tolerance')) h += 2;
  return h;
}
function arsenalOf(p) { return (p && p.arsenal) || 0; }
function cntId(list, id) { let n = 0; for (const x of list) if (x.id === id) n = Math.max(n, x.golden ? 2 : 1); return n; }
function rallyMult(list) { const k = cntId(list, 'mox_matriarch'); return k ? k + 1 : 1; }
function factions(list) { const s = new Set(); for (const x of list) if (x.tribe) s.add(x.tribe); return s.size; }
function rally(list) { return factions(list) * rallyMult(list); }
function engMult(list) { const k = cntId(list, 'ara_mikoshi'); return k ? k + 1 : 1; }
function engBonus(p, m, list) {
  if (!p || !p.engram || p.isGhost) return [0, 0];
  const sab = m.tribe !== 'ARA'; if (sab && !(p.hero && p.hero.id === 'saburo')) return [0, 0];
  const k = engMult(list || p.board) * (hasPerk(p, 'pk_ara2') ? 1.5 : 1); return sab ? [Math.ceil(p.engram.a * k / 2), Math.ceil(p.engram.h * k / 2)] : [Math.ceil(p.engram.a * k), Math.ceil(p.engram.h * k)];
}
function effStats(m, p) { const [a, h] = engBonus(p, m); return { atk: m.atk + a, hp: m.hp + h }; }
function cloneStat(p) { const k = cntId(p.board || [], 'bio_hive'); return (1 + (p.mutation || 0)) * (k ? k + 1 : 1); }
function cloneMade(p) { if (p.splTurn === G.turn) return; const k = (p.board || []).reduce((s, x) => s + (x.id === 'bio_splicer' ? gm(x) : 0), 0); if (k) { p.mutation = (p.mutation || 0) + k; p.splTurn = G.turn; } }
function addClone(p, pos) {
  const m = makeMinion('tok_clone'); const st = cloneStat(p); m.atk = st; m.hp = st; m.noPool = true;
  pos = Math.max(0, Math.min(pos == null ? p.board.length : pos, p.board.length)); p.board.splice(pos, 0, m);
  cloneMade(p); emit('clone', { p, m }); return m;
}
function heatRate(m, p) { let r = m.tribe === 'MAE' ? .125 : 1; const k = cntId(p.board, 'mae_heatsink'); if (k) r /= 2 * k; return r; }
function maxTacChance(m, p) { if (hasPerk(p, 'pk_mae2')) return 0; return Math.min(m.tribe === 'MAE' ? MAXTAC_CAP_MAE : MAXTAC_CAP, ((m.heat || 0) + heatRate(m, p)) * MAXTAC_STEP); }
function maxTacSweep(p) {
  for (const m of p.board.slice()) {
    if (!isPsycho(m, p)) { m.heat = 0; m.psyT = 0; continue; }
    m.psyT = (m.psyT || 0) + 1;
    const ch = maxTacChance(m, p); m.heat = (m.heat || 0) + heatRate(m, p);
    if (Math.random() < ch) {
      const i = p.board.indexOf(m); p.board.splice(i, 1); returnToPool(m); p.maxtacLost = (p.maxtacLost || 0) + 1;
      emit('maxtac', { p, m, i });
      for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onMaxTac) c.onMaxTac(p, x, m); }
    }
  }
}
function humUsed(m) { return (m.ware || []).reduce((s, w) => s + WARE[w].hum, 0); }
function isPsycho(m, p) { return humUsed(m) > humMax(m, p); }

// ---------------- recruit helpers ----------------
function inLobby(c) { return !c.tribe || G.tribes.includes(c.tribe); }
function boardOf(p, tribe) { return p.board.filter(x => !tribe || x.tribe === tribe); }
function randOf(a) { return a.length ? pick(a) : null; }
function giveCard(p, card) { if (p.hand.length < HAND_MAX) { p.hand.push(card); if (card.kind === 'minion') checkTriple(p); return true; } return false; }
function giveSpell(p, id) { giveCard(p, makeSpell(id)); }
function giveWare(p, id) { giveCard(p, makeWare(id)); }
const RKW = ['taunt', 'shield', 'first', 'venom', 'windfury', 'reborn', 'stealth', 'cleave', 'smash'];
function randomSpellId(p) { return pick(SPELL_LIST.filter(s => s.tier <= p.tier)).id; }
function randomWareId(p, maxTier) { return pick(WARE_LIST.filter(w => w.tier <= (maxTier || p.tier))).id; }
function returnToPool(m) { const c = CARDS[m.id]; if (m.noPool) return; if (c && c.pool && G.pool[m.id] != null) G.pool[m.id] += m.poolCopies || (m.golden ? 3 : 1); }
function selfDamage(p, n) { let a = Math.min(p.armor, n); p.armor -= a; n -= a; p.hp = Math.max(1, p.hp - n); }
function buffShop(p, a, h) { for (const m of p.shop) buff(m, a, h); }
function adjacent(arr, m) { const i = arr.indexOf(m); return [arr[i - 1], arr[i + 1]].filter(Boolean); }
function queue(p, item) { p.pending.push(item); if (p.isAI) aiResolvePending(p); else emit('pending', p); }
function discoverMinion(p, tier, filter) {
  let cands = CARD_LIST.filter(c => c.tier === tier && inLobby(c) && (!filter || filter(c)));
  let avail = cands.filter(c => G.pool[c.id] > 0);
  if (avail.length < 3) avail = cands;
  const opts = shuffle(avail.slice()).slice(0, 3).map(c => c.id);
  if (!opts.length) return;
  queue(p, { type: 'discover', kind: 'minion', opts, onPick: id => { if (G.pool[id] > 0) G.pool[id]--; giveCard(p, makeMinion(id)); } });
}
function makeGolden(m) { if (m.golden) return; const c = CARDS[m.id]; m.poolCopies = m.poolCopies || 1; m.golden = true; m.atk += 2 * c.atk; m.hp += 2 * c.hp; }
function bcMult(p) { let n = 1; for (const x of p.board) if (x.id === 'n_delamain') n = Math.max(n, x.golden ? 3 : 2); return n; }
function spellMult(p) { let n = 1; for (const x of p.board) if (x.id === 'vdb_rache') n = Math.max(n, x.golden ? 3 : 2); if (hasPerk(p, 'pk_vdb2') && !p.loaUsed) n += 1; return n; }
function ramDiscount(p) {
  let d = 0; if (p.hero.id === 'reed') d++;
  if (hasPerk(p, 'pk_deck')) d++;
  let sm = 0; for (const x of p.board) if (x.id === 'vdb_spider') sm = Math.max(sm, gm(x)); d += sm;
  return d;
}
function spellCost(p, sp) { return Math.max(0, SPELLS[sp.id].cost - ramDiscount(p)); }
function wareCost(p, w) {
  let d = 0; for (const x of p.board) if (x.id === 'mil_quartermaster') d = Math.max(d, gm(x));
  if (hasPerk(p, 'pk_dealer')) d++;
  if (hasPerk(p, 'pk_mil1')) d++;
  if (p.hero.id === 'meredith') d++;
  return Math.max(0, WARE[w.id].cost - d);
}
function hasPerk(p, id) { return (p.perks || []).some(x => x.id === id); }
function ramMax(p) {
  let r = Math.min(8, 2 + p.tier) + (p.ramBonus || 0);
  for (const x of p.board) if (x.id === 'vdb_netrunner') r += 2 * gm(x);
  if (hasPerk(p, 'pk_ram')) r += 2;
  if (hasPerk(p, 'pk_vdb1')) r += 3;
  if (p.hero.id === 'placide') r += 1;
  const bw = cntId(p.board, 'vdb_blackwall'); if (bw) r *= bw + 1;
  return r;
}
function buyCost(p) { return p.hero.id === 'dexter' && !p.boughtThisTurn ? 2 : 3; }
function upgradeCost(p) { let c = p.upCost; return Math.max(0, c); }
function shopSize(p) { let n = SHOP_SIZE[p.tier]; if (hasPerk(p, 'pk_cred')) n++; if (p.hero && p.hero.id === 'hands') n += 2; return n; }
function addEngram(p, a, h) { p.engram.a += Math.ceil(a); p.engram.h += Math.ceil(h); }
function psychoCheck(p, m, wasPsycho) {
  if (!wasPsycho && isPsycho(m, p)) { if (hasPerk(p, 'pk_mae1')) buff(m, 3, 3); for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onPsycho) c.onPsycho(p, x, m); } emit('psycho', { p, m }); }
}
function installWare(p, m, wid, free) {
  const w = WARE[wid]; const was = isPsycho(m, p);
  m.ware.push(wid); p.arsenal = (p.arsenal || 0) + (hasPerk(p, 'pk_mil1') ? 2 : 1);
  const rnd4 = p.board.reduce((s, x) => s + (x.id === 'mil_rnd' ? gm(x) : 0), 0) * p.arsenal;
  if (rnd4) buff(m, rnd4, rnd4);
  const mult = m.id === 'mil_behemoth' ? (m.golden ? 3 : 2) : 1;
  for (let i = 0; i < mult; i++) { buff(m, w.atk || 0, w.hp || 0); if (w.install) w.install(p, m); }
  for (const k of (w.kw || [])) m[k] = true;
  for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onInstall) c.onInstall(p, x, m, w); }
  psychoCheck(p, m, was);
}

// ---------------- CARDS ----------------
const CARDS = {}; const CARD_LIST = [];
function C(id, name, tier, tribe, atk, hp, o) {
  const c = Object.assign({ id, name, tier, tribe, atk, hp, kw: [], pool: true, text: '' }, o || {});
  CARDS[id] = c; if (c.pool) CARD_LIST.push(c); return c;
}
const isT = t => m => m.tribe === t;
C('tok_mackinaw', 'Mackinaw', 1, 'ALD', 1, 1, { kw: ['taunt'], pool: false, token: true });
C('tok_clone', 'Clone', 1, 'BIO', 1, 1, { pool: false, token: true, text: 'Grown in a vat. Created with +Mutation/+Mutation.' });
C('tok_drone', 'Combat Drone', 1, 'MIL', 2, 2, { pool: false, token: true });

// ---- MILITECH: Arsenal. Every piece of Cyberware you install raises Arsenal; Militech scale off it. Humanity 4 ----
C('mil_grunt', 'Militech Grunt', 1, 'MIL', 3, 2, { text: g => `Jack In: Get ${g > 1 ? 'three random Tier 1 Cyberware' : 'a random Tier 1 Cyberware'}.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) giveWare(p, randomWareId(p, 1)); } });
C('mil_supply', 'Supply Drone', 1, 'MIL', 1, 3, { text: g => `After you install Cyberware on a Militech, give it +${3 * g}/+${3 * g}.`,
  onInstall: (p, m, t) => { if (t.tribe === 'MIL') buff(t, 3 * gm(m), 3 * gm(m)); } });
C('mil_recruit', 'Militech Recruit', 1, 'MIL', 2, 3, { text: g => `Start of Combat: Gain +${g}/+${g} for each Arsenal.`,
  soc: (cs, m, side) => { const n = arsenalOf(cs.sides[side].p) * gm(m); cs.buff(m, n, n); } });
C('mil_quartermaster', 'Quartermaster', 2, 'MIL', 3, 4, { text: g => `Your Cyberware costs (${g}) less €$.` });
C('mil_medic', 'Combat Medic', 2, 'MIL', 3, 2, { text: g => `Flatline: Give a random friendly minion with Cyberware +${2 * g}/+${2 * g} for each piece it has.`,
  dr: (cs, m, side) => { const t = randOf(cs.allies(side).filter(x => x.ware && x.ware.length)); if (t) { const n = t.ware.length * 2 * gm(m); cs.buff(t, n, n); } } });
C('mil_dealer', 'Arms Dealer', 3, 'MIL', 3, 3, { text: g => `At the start of your turn, get ${g > 1 ? 'three random Tier 1–2 Cyberware' : 'a random Tier 1–2 Cyberware'}.`,
  sot: (p, m) => { for (let i = 0; i < gm(m); i++) giveWare(p, randomWareId(p, 2)); } });
C('mil_trooper', 'Militech Trooper', 3, 'MIL', 2, 5, { text: g => `Start of Combat: Gain +${2 * g}/+${2 * g} for each piece of Cyberware on your minions.`,
  soc: (cs, m, side) => { const n = cs.allies(side).reduce((s, x) => s + (x.ware ? x.ware.length : 0), 0); cs.buff(m, 2 * n * gm(m), 2 * n * gm(m)); } });
C('mil_rnd', 'R&D Engineer', 3, 'MIL', 3, 4, { text: g => `Cyberware you install gives an extra +${g}/+${g} for each Arsenal.` });
C('mil_fieldrip', 'Field Ripperdoc', 4, 'MIL', 5, 6, { text: g => `Jack In: Install ${g > 1 ? 'three random Cyberware' : 'a random Cyberware'} on a friendly Militech.`, target: 'MIL',
  bc: (p, m, t) => { if (t) for (let i = 0; i < gm(m); i++) installWare(p, t, randomWareId(p)); } });
C('mil_hellhound', 'Hellhound Squad', 4, 'MIL', 4, 5, { text: g => `After you install Cyberware, give your Militech +${3 * g}/+${3 * g}.`,
  onInstall: (p, m) => boardOf(p, 'MIL').forEach(x => buff(x, 3 * gm(m), 3 * gm(m))) });
C('mil_swarm', 'Drone Swarm', 4, 'MIL', 3, 3, { text: g => `Start of Combat: Summon a 2/2 Combat Drone for every 2 Arsenal (up to ${6 * g}).`,
  soc: (cs, m, side) => { const n = Math.min(6 * gm(m), Math.floor(arsenalOf(cs.sides[side].p) / 2)); let pos = cs.sides[side].b.indexOf(m) + 1; for (let i = 0; i < n; i++) cs.summon(side, 'tok_drone', pos++, false); } });
C('mil_commando', 'Chrome Commando', 5, 'MIL', 6, 6, { text: g => `Start of Combat: Give each friendly minion +${2 * g}/+${g} for each piece of Cyberware it has.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x.ware && x.ware.length && cs.buff(x, 2 * x.ware.length * gm(m), x.ware.length * gm(m))) });
C('mil_reaper', 'Reaper Squad', 5, 'MIL', 5, 5, { text: g => `Start of Combat: Give your other Militech +${2 * g}/+${2 * g} for each Arsenal.`,
  soc: (cs, m, side) => { const n = 2 * arsenalOf(cs.sides[side].p) * gm(m); cs.allies(side).forEach(x => x !== m && x.tribe === 'MIL' && cs.buff(x, n, n)); } });
C('mil_behemoth', 'Militech Behemoth', 6, 'MIL', 7, 9, { hum: 8, text: g => `Humanity 8. Cyberware installed on this applies ${g > 1 ? 'three times' : 'twice'}.` });
C('mil_chimera', 'Chimera', 6, 'MIL', 7, 7, { text: g => `Start of Combat: Each friendly Militech gains the effect of ${g > 1 ? 'three random Cyberware' : 'a random Cyberware'} (this combat only).`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => { if (x.tribe === 'MIL') for (let i = 0; i < gm(m); i++) cs.tempWare(x, randomWareId(cs.sides[side].p)); }) });
C('mil_av', 'Militech AV', 6, 'MIL', 8, 8, { text: g => `After you install Cyberware, install a copy of it on ${g > 1 ? 'three other random Militech' : 'another random Militech'}.`,
  onInstall: (p, m, t, w) => { if (p._avBusy) return; p._avBusy = true; try { shuffle(boardOf(p, 'MIL').filter(x => x !== t)).slice(0, gm(m)).forEach(x => installWare(p, x, w.id)); } finally { p._avBusy = false; } } });

// ---- MAELSTROM: Chrome madness. Cyberpsychos hit twice as hard but Max-Tac hunts them. Humanity 1 ----
C('mae_ganger', 'Maelstrom Ganger', 1, 'MAE', 4, 3, { text: g => `Jack In: Install ${g > 1 ? 'three random Tier 1 Cyberware' : 'a random Tier 1 Cyberware'} on this.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) installWare(p, m, randomWareId(p, 1)); } });
C('mae_junkie', 'Chrome Junkie', 1, 'MAE', 2, 4, { text: g => `After a friendly minion becomes a Cyberpsycho, gain +${5 * g}/+${5 * g}.`,
  onPsycho: (p, m) => buff(m, 5 * gm(m), 5 * gm(m)) });
C('mae_scrap', 'Scrap Hound', 1, 'MAE', 3, 2, { text: g => `Whenever another friendly Cyberpsycho dies, gain ${g > 1 ? 'all' : 'a third'} of its Attack and Health permanently.`,
  onFriendlyDeathC: (cs, m, side, d) => { if (!d.psycho) return; const k = m.golden ? 1 : 1 / 3; cs.perm(m, Math.ceil((d.ma || d.atk) * k), Math.ceil((d.mx || 1) * k)); } });
C('mae_glitch', 'Glitch Rider', 2, 'MAE', 3, 4, { text: g => `Your Cyberpsychos hit your own minions half as often. Start of Combat: Your Cyberpsychos gain +${2 * g}/+${2 * g}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x.psycho && cs.buff(x, 2 * gm(m), 2 * gm(m))) });
C('mae_redeyes', 'Red Eyes', 2, 'MAE', 4, 5, { text: g => `After this attacks as a Cyberpsycho, gain +${5 * g}/+${5 * g} permanently.`,
  afterAttackC: (cs, m) => { if (m.psycho) cs.perm(m, 5 * gm(m), 5 * gm(m)); } });
C('mae_bouncer', 'Totentanz Bouncer', 3, 'MAE', 3, 5, { kw: ['taunt'], target: 'friendly', text: g => `Jack In: Give a friendly minion +${3 * g}/+${3 * g} and -1 Humanity.`,
  bc: (p, m, t) => { if (!t) return; const w = isPsycho(t, p); buff(t, 3 * gm(m), 3 * gm(m)); t.humMod = (t.humMod || 0) - 1; psychoCheck(p, t, w); } });
C('mae_fiend', 'Chrome Fiend', 3, 'MAE', 4, 4, { text: g => `Start of Combat: If this is a Cyberpsycho, gain +${9 * g}/+${9 * g}.`,
  soc: (cs, m) => { if (m.psycho) cs.buff(m, 9 * gm(m), 9 * gm(m)); } });
C('mae_feeder', 'Bloodfeeder', 3, 'MAE', 3, 3, { text: g => `After a friendly Cyberpsycho attacks, give it +${5 * g}/+${5 * g} permanently.`,
  onFriendlyAttackC: (cs, m, side, a) => { if (a.psycho && a.hp > 0) cs.perm(a, 5 * gm(m), 5 * gm(m)); } });
C('mae_brick', 'Brick', 4, 'MAE', 5, 6, { kw: ['taunt'], text: g => `Start of Combat: Give your Cyberpsychos +${7 * g}/+${7 * g}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x.psycho && cs.buff(x, 7 * gm(m), 7 * gm(m))) });
C('mae_splicer', 'Maelstrom Splicer', 4, 'MAE', 5, 6, { text: g => `After you install Cyberware on a Maelstrom, give your Maelstrom +${2 * g}/+${g}.`,
  onInstall: (p, m, t) => { if (t.tribe === 'MAE') boardOf(p, 'MAE').forEach(x => buff(x, 2 * gm(m), gm(m))); } });
C('mae_heatsink', 'Heat Sink', 4, 'MAE', 3, 6, { kw: ['taunt'], text: g => `Max-Tac hunts your Cyberpsychos ${g > 1 ? 'four' : 'two'} times slower.` });
C('mae_dumdum', 'Dum Dum', 5, 'MAE', 7, 8, { target: 'friendly', text: g => `Jack In: Give a friendly minion +${4 * g}/+${4 * g} and make it a Cyberpsycho.`,
  bc: (p, m, t) => { if (!t) return; const w = isPsycho(t, p); buff(t, 4 * gm(m), 4 * gm(m)); while (!isPsycho(t, p)) t.humMod = (t.humMod || 0) - 1; psychoCheck(p, t, w); } });
C('mae_patricia', 'Patricia', 5, 'MAE', 5, 5, { text: g => `Whenever a friendly Cyberpsycho destroys a minion, give it +${5 * g}/+${5 * g} permanently.`,
  onKillFriendlyC: (cs, m, side, killer) => { if (killer.psycho) cs.perm(killer, 5 * gm(m), 5 * gm(m)); } });
C('mae_frenzy', 'Frenzy Lord', 5, 'MAE', 5, 5, { text: g => `Your Cyberpsychos multiply their Attack by ${g} more in combat (×2 becomes ×${2 + g}, Maelstrom ×4 becomes ×${4 + g}).` });
C('mae_warlord', 'Maelstrom Warlord', 6, 'MAE', 7, 7, { text: g => `Start of Combat: Your Cyberpsychos gain Cleave and +${3 * g}/+${3 * g}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => { if (x.psycho) { x.cleave = true; cs.buff(x, 3 * gm(m), 3 * gm(m)); } }) });
C('mae_overdrive', 'Overdrive', 6, 'MAE', 6, 6, { text: g => `End of Turn: Give each Cyberpsycho +${3 * g}/+${3 * g} for each turn it has been a Cyberpsycho.`,
  eot: (p, m) => p.board.forEach(x => { if (isPsycho(x, p)) { const n = 3 * gm(m) * Math.max(1, x.psyT || 0); buff(x, n, n); } }) });

// ---- TYGER CLAWS: Honor. Every enemy a Tyger Claws destroys earns Honor; their blades scale with it. ----
C('tyg_prospect', 'Tyger Prospect', 1, 'TYG', 2, 1, { kw: ['first'], text: g => `After this destroys a minion, gain +${2 * g}/+${2 * g} permanently.`,
  onKillC: (cs, m) => cs.perm(m, 2 * gm(m), 2 * gm(m)) });
C('tyg_scooter', 'Scooter Punk', 1, 'TYG', 1, 2, { target: 'TYG', text: g => `Jack In: Give a friendly Tyger Claws Kerenzikov${g > 1 ? ' and +3/+3' : ''}.`,
  bc: (p, m, t) => { if (t) { t.first = true; if (m.golden) buff(t, 3, 3); } } });
C('tyg_initiate', 'Claw Initiate', 1, 'TYG', 2, 2, { text: g => `Start of Combat: Gain +${g} Attack for every 3 Honor.`,
  soc: (cs, m, side) => cs.buff(m, Math.floor((cs.sides[side].p.honor || 0) / 3) * gm(m), 0) });
C('tyg_adept', 'Katana Adept', 2, 'TYG', 2, 2, { kw: ['venom'], text: g => `After this attacks, give a random friendly Tyger Claws +${g}/+${g}.`,
  afterAttackC: (cs, m, side) => { const t = randOf(cs.allies(side).filter(x => x.tribe === 'TYG' && x !== m)); if (t) cs.buff(t, gm(m), gm(m)); } });
C('tyg_saint', 'Sword Saint', 2, 'TYG', 3, 2, { kw: ['first'], text: g => `Before this attacks a minion with higher Attack, gain +${2 * g}/+${2 * g} permanently.`,
  beforeAttackC: (cs, m, side, t) => { if (t.atk > m.atk) cs.perm(m, 2 * gm(m), 2 * gm(m)); } });
C('tyg_trainee', 'Sword Trainee', 2, 'TYG', 2, 3, { text: g => `Jack In: Gain +${g}/+${g} for every 2 Honor.`,
  bc: (p, m) => { const n = Math.floor((p.honor || 0) / 2) * gm(m); buff(m, n, n); } });
C('tyg_jotaro', 'Jotaro Shobo', 3, 'TYG', 3, 3, { target: 'TYG', text: g => `Jack In: Give a friendly Tyger Claws Neurotoxin${g > 1 ? ' and +3/+3' : ''}.`,
  bc: (p, m, t) => { if (t) { t.venom = true; if (m.golden) buff(t, 3, 3); } } });
C('tyg_master', 'Blade Master', 3, 'TYG', 3, 4, { text: g => `Start of Combat: Give your minions with Kerenzikov +${2 * g} Attack.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x.first && cs.buff(x, 2 * gm(m), 0)) });
C('tyg_dojo', 'Dojo Sensei', 3, 'TYG', 2, 5, { text: g => `End of Turn: Give your Tyger Claws +${g}/+${g} for every 5 Honor.`,
  eot: (p, m) => { const n = Math.floor((p.honor || 0) / 5) * gm(m); if (n) boardOf(p, 'TYG').forEach(x => buff(x, n, n)); } });
C('tyg_mantis', 'Mantis Assassin', 4, 'TYG', 4, 4, { kw: ['first'], text: g => `After this destroys a minion, it attacks again${g > 1 ? ' with +2 Attack' : ''} (once per turn).`,
  onKillC: (cs, m, side) => { if (!m._again) { m._again = true; if (m.golden) cs.buff(m, 2, 0); cs.extraAttack(m, side); } } });
C('tyg_enforcer', 'Tyger Enforcer', 4, 'TYG', 3, 5, { text: g => `After you play a Tyger Claws, give it +${2 * g}/+${g}.`,
  onPlayFriendly: (p, m, x) => x.tribe === 'TYG' && buff(x, 2 * gm(m), gm(m)) });
C('tyg_ronin', 'Ronin', 4, 'TYG', 4, 3, { kw: ['first'], text: g => `Start of Combat: Gain +${g}/+${g} for each Honor.`,
  soc: (cs, m, side) => { const n = (cs.sides[side].p.honor || 0) * gm(m); cs.buff(m, n, n); } });
C('tyg_oni', 'Oni Mask Assassin', 5, 'TYG', 5, 6, { text: g => `Start of Combat: Give your Tyger Claws Kerenzikov${g > 1 ? ' and +3/+3' : ''}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => { if (x.tribe === 'TYG') { x.first = true; if (m.golden) cs.buff(x, 3, 3); } }) });
C('tyg_wakako', 'Wakako Okada', 5, 'TYG', 3, 6, { text: g => `End of Turn: Give your Tyger Claws +${g}/+${g}.`,
  eot: (p, m) => boardOf(p, 'TYG').forEach(x => buff(x, gm(m), gm(m))) });
C('tyg_oyabun', 'Oyabun', 5, 'TYG', 5, 5, { text: g => `Whenever a friendly Tyger Claws destroys a minion, give your Tyger Claws +${g}/+${g}.`,
  onKillFriendlyC: (cs, m, side, killer) => { if (killer.tribe === 'TYG') cs.allies(side).forEach(x => x.tribe === 'TYG' && cs.buff(x, gm(m), gm(m))); } });
C('tyg_shogun', 'Tyger Shogun', 6, 'TYG', 7, 7, { kw: ['first', 'venom'], text: g => `After this destroys a minion, it regains Neurotoxin${g > 1 ? ' and gains +3/+3' : ''}.`,
  onKillC: (cs, m) => { m.venom = true; if (m.golden) cs.buff(m, 3, 3); } });
C('tyg_wraith', 'Blade Wraith', 6, 'TYG', 6, 6, { kw: ['first', 'stealth'], text: g => `Your Tyger Claws earn ${g > 1 ? 'triple' : 'double'} Honor.` });

// ---- ALDECALDOS: Convoy. End of Turn buffs flow along the line; the Captain makes them fire again. ----
C('ald_mechanic', 'Nomad Mechanic', 1, 'ALD', 1, 3, { text: g => `End of Turn: Give the minion to the right of this +${2 * g}/+${2 * g}.`,
  eot: (p, m) => { const i = p.board.indexOf(m); const t = p.board[i + 1]; if (t) buff(t, 2 * gm(m), 2 * gm(m)); } });
C('ald_kid', 'Nomad Kid', 1, 'ALD', 2, 2, { text: g => `End of Turn: Give the minion to the left of this +${2 * g}/+${2 * g}.`,
  eot: (p, m) => { const i = p.board.indexOf(m); const t = p.board[i - 1]; if (t) buff(t, 2 * gm(m), 2 * gm(m)); } });
C('ald_scout', 'Desert Scout', 1, 'ALD', 2, 1, { text: g => `Flatline: Give the minions next to this +${g}/+${g}.`,
  dr: (cs, m, side, pos) => { const b = cs.sides[side].b; [b[pos - 1], b[pos]].forEach(x => x && !x.dead && cs.buff(x, gm(m), gm(m))); } });
C('ald_mack', 'Thorton Mackinaw', 2, 'ALD', 2, 5, { kw: ['taunt'], text: g => `Start of Combat: Gain +${2 * g} Attack for each Aldecaldo next to this.`,
  soc: (cs, m, side) => { const n = cs.adj(m, side).filter(isT('ALD')).length; cs.buff(m, 2 * gm(m) * n, 0); } });
C('ald_runner', 'Convoy Runner', 2, 'ALD', 3, 2, { text: g => `Jack In: Give the minions next to this +${g}/+${g}.`,
  bc: (p, m) => adjacent(p.board, m).forEach(x => buff(x, gm(m), gm(m))) });
C('ald_fuel', 'Fuel Runner', 2, 'ALD', 2, 3, { text: g => `End of Turn: Give the minion to the right of this +${g} Attack for each Aldecaldo you control.`,
  eot: (p, m) => { const i = p.board.indexOf(m); const t = p.board[i + 1]; if (t) buff(t, boardOf(p, 'ALD').length * gm(m), 0); } });
C('ald_saul', 'Saul Bright', 3, 'ALD', 3, 4, { text: g => `End of Turn: Give the minions next to this +${2 * g}/+${2 * g}.`,
  eot: (p, m) => adjacent(p.board, m).forEach(x => buff(x, 2 * gm(m), 2 * gm(m))) });
C('ald_sharp', 'Nomad Sharpshooter', 3, 'ALD', 4, 2, { text: g => `Start of Combat: Deal ${2 * g} damage to a random enemy minion for each Aldecaldo next to this.`,
  soc: (cs, m, side) => { const n = cs.adj(m, side).filter(isT('ALD')).length; for (let i = 0; i < n; i++) { const t = randOf(cs.allies(1 - side)); if (t) cs.damage(t, 2 * gm(m), m); } } });
C('ald_relay', 'Convoy Relay', 3, 'ALD', 2, 4, { text: g => `End of Turn: Trigger the End of Turn effects of the minions next to this${g > 1 ? ' three times' : ''}.`,
  eot: (p, m) => { for (let k = 0; k < gm(m); k++) adjacent(p.board, m).forEach(x => { const c = CARDS[x.id]; if (c.eot && x.id !== 'ald_relay') c.eot(p, x); }); } });
C('ald_tank', 'Basilisk Tank', 4, 'ALD', 5, 6, { kw: ['taunt'], text: g => `Flatline: Give the minions next to this Barrier${g > 1 ? ' and +3/+3' : ''}.`,
  dr: (cs, m, side, pos) => { const b = cs.sides[side].b; [b[pos - 1], b[pos]].forEach(x => { if (x && !x.dead) { x.shield = true; if (m.golden) cs.buff(x, 3, 3); } }); } });
C('ald_mitch', 'Mitch Anderson', 4, 'ALD', 4, 5, { text: g => `After a minion next to this attacks, give it +${2 * g}/+${2 * g}.`,
  onFriendlyAttackC: (cs, m, side, a) => { if (cs.adj(m, side).includes(a) && a.hp > 0) cs.buff(a, 2 * gm(m), 2 * gm(m)); } });
C('ald_rig', 'Big Rig', 4, 'ALD', 3, 8, { kw: ['taunt'], text: g => `Start of Combat: Give the minions next to this ${g > 1 ? 'triple ' : ''}this minion's Health.`,
  soc: (cs, m, side) => cs.adj(m, side).forEach(x => cs.buff(x, 0, m.hp * gm(m))) });
C('ald_carol', 'Carol Emeka', 5, 'ALD', 5, 5, { text: g => `End of Turn: Give your Aldecaldos +${3 * g}/+${3 * g}.`,
  eot: (p, m) => boardOf(p, 'ALD').forEach(x => buff(x, 3 * gm(m), 3 * gm(m))) });
C('ald_captain', 'Convoy Captain', 5, 'ALD', 5, 6, { text: g => `Your other Aldecaldos' End of Turn effects trigger ${g > 1 ? 'three times' : 'twice'}.` });
C('ald_hauler', 'Convoy Hauler', 6, 'ALD', 6, 8, { kw: ['taunt'], text: g => `Start of Combat: Give the minions next to this +${5 * g}/+${5 * g} and Bodyguard.`,
  soc: (cs, m, side) => cs.adj(m, side).forEach(x => { cs.buff(x, 5 * gm(m), 5 * gm(m)); x.taunt = true; }) });
C('ald_roadking', 'Road King', 6, 'ALD', 7, 7, { text: g => `End of Turn: Give your Aldecaldos +${g}/+${g} for each Aldecaldo you control.`,
  eot: (p, m) => { const a = boardOf(p, 'ALD'); const n = a.length * gm(m); a.forEach(x => buff(x, n, n)); } });

// ---- ARASAKA: Engram. Uploads build a permanent bonus that every Arasaka you control has. ----
C('ara_guard', 'Arasaka Guard', 1, 'ARA', 2, 3, { kw: ['taunt'], text: 'Start of Combat: If an Arasaka is next to this, gain Barrier.',
  soc: (cs, m, side) => { if (cs.adj(m, side).some(isT('ARA'))) m.shield = true; } });
C('ara_courier', 'Engram Courier', 3, 'ARA', 2, 2, { text: g => `Flatline: Upload +${g}/+${g} to your Engram.`,
  dr: (cs, m, side) => cs.engram(side, gm(m), gm(m)) });
C('ara_sniper', 'Arasaka Sniper', 2, 'ARA', 3, 2, { text: g => `Start of Combat: Deal ${2 * g} damage to the enemy minion with the lowest Health.`,
  soc: (cs, m, side) => { const e = cs.allies(1 - side); if (e.length) cs.damage(e.reduce((a, b) => b.hp < a.hp ? b : a), 2 * gm(m), m); } });
C('ara_tech', 'Soulkiller Tech', 1, 'ARA', 1, 2, { text: g => `Flatline: Upload +${g}/+0 to your Engram.`, dr: (cs, m, side) => cs.engram(side, gm(m), 0) });
C('ara_drone', 'Security Drone', 2, 'ARA', 2, 2, { text: g => `Jack In: Upload +${g}/+0 for every 2 other Arasaka you control.`,
  bc: (p, m) => addEngram(p, Math.floor((boardOf(p, 'ARA').length - 1) / 2) * gm(m), 0) });
C('ara_oda', 'Sandayu Oda', 3, 'ARA', 3, 4, { text: g => `Start of Combat: Give another random Arasaka Barrier and +${2 * g} Attack.`,
  soc: (cs, m, side) => { const t = randOf(cs.allies(side).filter(x => x !== m && x.tribe === 'ARA')); if (t) { t.shield = true; cs.buff(t, 2 * gm(m), 0); } } });
C('ara_researcher', 'Relic Researcher', 3, 'ARA', 2, 4, { text: g => `After you play an Arasaka, upload +${g}/+${g} to your Engram.`,
  onPlayFriendly: (p, m, x) => { if (x.tribe === 'ARA') addEngram(p, gm(m), gm(m)); } });
C('ara_sync', 'Data Synchronizer', 3, 'ARA', 3, 3, { text: g => `End of Turn: Upload +${g}/+0 to your Engram.`, eot: (p, m) => addEngram(p, gm(m), 0) });
C('ara_ninja', 'Arasaka Ninja', 4, 'ARA', 4, 4, { kw: ['stealth'], text: g => `Start of Combat: Deal ${4 * g} damage to the enemy minion with the highest Attack.`,
  soc: (cs, m, side) => { const e = cs.allies(1 - side); if (e.length) cs.damage(e.reduce((a, b) => b.atk > a.atk ? b : a), 4 * gm(m), m); } });
C('ara_exec', 'Arasaka Executive', 4, 'ARA', 3, 5, { text: g => `End of Turn: Upload +${g}/+${g} for every 3 Arasaka you control.`,
  eot: (p, m) => { const n = Math.floor(boardOf(p, 'ARA').length / 3) * gm(m); addEngram(p, n, n); } });
C('ara_handler', 'Engram Handler', 4, 'ARA', 4, 4, { text: g => `Start of Combat: Your non-Arasaka minions also get ${g > 1 ? 'triple ' : ''}your Engram bonus.`,
  soc: (cs, m, side) => { const p = cs.sides[side].p; const k = engMult(cs.allies(side)); const e = p.engram || { a: 0, h: 0 }; cs.allies(side).forEach(x => x.tribe !== 'ARA' && cs.buff(x, e.a * k * gm(m), e.h * k * gm(m))); } });
C('ara_warden', 'Arasaka Warden', 5, 'ARA', 6, 6, { text: g => `Start of Combat: Give your other Arasaka +${3 * g}/+${3 * g}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x !== m && x.tribe === 'ARA' && cs.buff(x, 3 * gm(m), 3 * gm(m))) });
C('ara_backup', 'Backup Server', 5, 'ARA', 3, 7, { text: g => `Whenever another friendly Arasaka dies, upload +${g}/+${g} to your Engram.`,
  onFriendlyDeathC: (cs, m, side, d) => { if (d.tribe === 'ARA') cs.engram(side, gm(m), gm(m)); } });
C('ara_mikoshi', 'Mikoshi', 6, 'ARA', 6, 6, { text: g => `Your Engram bonus is ${g > 1 ? 'tripled' : 'doubled'}.` });
C('ara_tower', 'Arasaka Tower', 6, 'ARA', 10, 10, { text: g => `End of Turn: Increase your Engram by ${10 * g}%.`,
  eot: (p, m) => { const k = .1 * gm(m); p.engram.a += Math.max(1, Math.ceil(p.engram.a * k)); p.engram.h += Math.max(1, Math.ceil(p.engram.h * k)); } });

// ---- VALENTINOS: Familia. Eddies and Loyalty: the longer they stay, the faster they grow. ----
C('val_lookout', 'Valentinos Lookout', 1, 'VAL', 2, 2, { text: g => `Jack In: Gain ${g} €$.`, bc: (p, m) => { p.gold += gm(m); } });
C('val_kid', 'Heywood Kid', 1, 'VAL', 1, 1, { text: g => `At the start of your turn, gain +${2 * g}/+${2 * g}.`, sot: (p, m) => buff(m, 2 * gm(m), 2 * gm(m)) });
C('val_abuela', 'Abuela', 1, 'VAL', 1, 3, { text: g => `End of Turn: Give your minion with the most Loyalty +${3 * g}/+${3 * g}.`,
  eot: (p, m) => { if (p.board.length) { const t = p.board.reduce((a, b) => (b.loy || 0) > (a.loy || 0) ? b : a); buff(t, 3 * gm(m), 3 * gm(m)); } } });
C('val_lowrider', 'Lowrider', 2, 'VAL', 2, 3, { text: g => `After you buy a minion, gain +${2 * g}/+${2 * g}.`, onBuyFriendly: (p, m) => buff(m, 2 * gm(m), 2 * gm(m)) });
C('val_familia', 'Familia Saint', 2, 'VAL', 2, 2, { text: g => `Jack In: Gain +${g}/+${g} for each turn your most Loyal minion has been on your board (up to 6).`,
  bc: (p, m) => { const n = Math.min(6, Math.max(0, ...p.board.map(x => x.loy || 0))); buff(m, n * gm(m), n * gm(m)); } });
C('val_bank', 'Street Banker', 2, 'VAL', 2, 3, { text: g => `End of Turn: Save up to ${2 * g} unspent €$ for next turn.`,
  eot: (p, m) => { p.nextGold += Math.min(p.gold, 2 * gm(m)); } });
C('val_padre', 'Padre', 3, 'VAL', 3, 4, { text: g => `At the start of your turn, gain ${g} €$.`, sot: (p, m) => { p.gold += gm(m); } });
C('val_collector', 'Debt Collector', 3, 'VAL', 3, 3, { text: g => `After you sell a minion, gain +${3 * g}/+${3 * g}.`, onSellFriendly: (p, m) => buff(m, 3 * gm(m), 3 * gm(m)) });
C('val_padrino', 'El Padrino', 3, 'VAL', 3, 4, { text: g => `At the start of your turn, give each Valentinos +${g}/+${g} for every 2 Loyalty it has.`,
  sot: (p, m) => boardOf(p, 'VAL').forEach(x => { const n = Math.floor((x.loy || 0) / 2) * gm(m); if (n) buff(x, n, n); }) });
C('val_capitan', 'El Capitán', 4, 'VAL', 4, 5, { text: g => `Jack In: Gain 1 €$ for each other Valentinos you control (up to ${3 * g}).`,
  bc: (p, m) => { p.gold += Math.min(3 * gm(m), boardOf(p, 'VAL').filter(x => x !== m).length); } });
C('val_chain', 'Gold Chain Dealer', 4, 'VAL', 3, 4, { text: g => `Start of Combat: Give your minions with 3+ Loyalty +${2 * g}/+${2 * g}.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => (x.loy || 0) >= 3 && cs.buff(x, 2 * gm(m), 2 * gm(m))) });
C('val_chapel', 'Chapel Guardian', 4, 'VAL', 3, 6, { kw: ['taunt'], text: g => `Your minions gain Loyalty ${g > 1 ? 'three times' : 'twice'} as fast.` });
C('val_jefe', 'Valentinos Jefe', 5, 'VAL', 5, 5, { text: g => `After you buy a Valentinos, give your Valentinos +${3 * g}/+${3 * g}.`,
  onBuyFriendly: (p, m, b) => { if (b.tribe === 'VAL') boardOf(p, 'VAL').forEach(x => buff(x, 3 * gm(m), 3 * gm(m))); } });
C('val_mama', 'Mama Welles', 5, 'VAL', 4, 6, { text: g => `End of Turn: Give your Valentinos +${g}/+${g} for every 2 €$ you spent this turn.`,
  eot: (p, m) => { const n = Math.floor((p.spent || 0) / 2) * gm(m); if (n) boardOf(p, 'VAL').forEach(x => buff(x, n, n)); } });
C('val_patron', 'Patron Saint', 6, 'VAL', 6, 6, { text: g => `End of Turn: Give your Valentinos +${g}/+${g} for each unspent €$.`,
  eot: (p, m) => { const n = p.gold; if (n > 0) boardOf(p, 'VAL').forEach(x => buff(x, n * gm(m), n * gm(m))); } });
C('val_virgen', 'La Virgen', 6, 'VAL', 6, 7, { text: g => `Start of Combat: Double the stats of your ${g > 1 ? 'three minions' : 'minion'} with the most Loyalty.`,
  soc: (cs, m, side) => cs.allies(side).slice().sort((a, b) => (b.loy || 0) - (a.loy || 0)).slice(0, gm(m)).forEach(x => cs.buff(x, x.atk, x.hp)) });

// ---- VOODOO BOYS: Netrunning. RAM, Quickhacks and daemons; hoard RAM or burn it. Humanity 2 ----
C('vdb_kiddie', 'Script Kiddie', 1, 'VDB', 2, 2, { text: g => `Jack In: Gain ${2 * g} RAM and get a random Tier 1 Quickhack.`, bc: (p, m) => { p.ram += 2 * gm(m); giveSpell(p, pick(SPELL_LIST.filter(x => x.tier === 1)).id); } });
C('vdb_apprentice', 'Netrunner Apprentice', 1, 'VDB', 1, 1, { text: g => `After you cast a Quickhack, gain +${2 * g}/+${2 * g}.`, onSpell: (p, m) => buff(m, 2 * gm(m), 2 * gm(m)) });
C('vdb_coder', 'Daemon Coder', 1, 'VDB', 2, 2, { text: g => `End of Turn: Gain +${g}/+${g} for each unspent RAM.`,
  eot: (p, m) => { const n = p.ram * gm(m); buff(m, n, n); } });
C('vdb_netrunner', 'Voodoo Netrunner', 2, 'VDB', 3, 4, { text: g => `You have +${2 * g} maximum RAM.` });
C('vdb_ping', 'Ping Daemon', 2, 'VDB', 2, 2, { text: g => `Start of Combat: Give a random enemy minion -${3 * g} Attack.`,
  soc: (cs, m, side) => { const t = randOf(cs.allies(1 - side)); if (t) cs.buff(t, -3 * gm(m), 0); } });
C('vdb_tracer', 'Tracer', 2, 'VDB', 2, 3, { text: g => `Start of Combat: Give your Voodoo Boys +${g}/+${g} for each Quickhack you've cast this game.`,
  soc: (cs, m, side) => { const n = (cs.sides[side].p.hacksCast || 0) * gm(m); if (n) cs.allies(side).forEach(x => x.tribe === 'VDB' && cs.buff(x, n, n)); } });
C('vdb_hacker', 'Voodoo Hacker', 3, 'VDB', 3, 3, { text: g => `Jack In: Get ${g > 1 ? 'three random Quickhacks' : 'a random Quickhack'}.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) giveSpell(p, randomSpellId(p)); } });
C('vdb_breach', 'Breach Runner', 3, 'VDB', 3, 2, { text: g => `After you cast a Quickhack, give your Voodoo Boys +${2 * g}/+${2 * g}.`, onSpell: (p, m) => boardOf(p, 'VDB').forEach(x => buff(x, 2 * gm(m), 2 * gm(m))) });
C('vdb_cache', 'RAM Cache', 3, 'VDB', 2, 5, { text: g => `End of Turn: Store up to ${8 * g} unspent RAM. Next turn you get it on top of your maximum.`,
  eot: (p, m) => { p.ramCarry = Math.max(p.ramCarry || 0, Math.min(p.ram, 8 * gm(m))); } });
C('vdb_spider', 'Spider Murphy', 4, 'VDB', 4, 4, { text: g => `Your Quickhacks cost (${g}) less RAM.` });
C('vdb_shortc', 'Short Circuit Daemon', 4, 'VDB', 3, 5, { text: g => `Start of Combat: Deal ${3 * g} damage to each enemy minion that has Cyberware.`,
  soc: (cs, m, side) => cs.allies(1 - side).forEach(t => t.ware && t.ware.length && cs.damage(t, 3 * gm(m), m)) });
C('vdb_overflow', 'Overflow Daemon', 4, 'VDB', 3, 4, { text: g => `End of Turn: Give your Voodoo Boys +${g}/+${g} for each unspent RAM.`,
  eot: (p, m) => { const n = p.ram * gm(m); if (n) boardOf(p, 'VDB').forEach(x => buff(x, n, n)); } });
C('vdb_oldnet', 'Old Net Daemon', 5, 'VDB', 5, 5, { text: g => `After you cast a Quickhack, minions in the Tavern have +${g}/+${g} for the rest of the game.`,
  onSpell: (p, m) => { p.tavBuff.a += gm(m); p.tavBuff.h += gm(m); buffShop(p, gm(m), gm(m)); } });
C('vdb_ghost', 'Net Ghost', 5, 'VDB', 4, 5, { text: g => `Start of Combat: Deal ${g} damage to all enemy minions for every 5 Quickhacks you've cast this game.`,
  soc: (cs, m, side) => { const n = Math.floor((cs.sides[side].p.hacksCast || 0) / 5) * gm(m); if (n) cs.allies(1 - side).forEach(t => cs.damage(t, n, m)); } });
C('vdb_madness', 'Madness Daemon', 5, 'VDB', 4, 6, { text: g => `Start of Combat: ${g > 1 ? 'The three enemy minions' : 'The enemy minion'} with the highest Attack ${g > 1 ? 'go' : 'goes'} Cyberpsycho: double Attack, and ${g > 1 ? 'they attack' : 'it attacks'} only ${g > 1 ? 'their' : 'its'} own allies.`,
  soc: (cs, m, side) => cs.allies(1 - side).filter(x => !x.turncoat).sort((a, b) => b.atk - a.atk).slice(0, gm(m)).forEach(t => turncoat(cs, t)) });
C('vdb_rache', 'Rache Bartmoss', 6, 'VDB', 6, 7, { text: g => `Your Quickhacks are cast ${g > 1 ? 'three times' : 'twice'}.` });
C('vdb_blackwall', 'Blackwall Entity', 6, 'VDB', 6, 8, { text: g => `Your maximum RAM is ${g > 1 ? 'tripled' : 'doubled'}.` });

// ---- ANIMALS: Juice. Health compounds; big bodies hit with their Health. ----
C('ani_rookie', 'Juiced Rookie', 1, 'ANI', 3, 3, { kw: ['smash'] });
C('ani_gymrat', 'Gym Rat', 1, 'ANI', 1, 3, { text: g => `After this takes damage and survives, gain +${g}/+${2 * g} permanently.`,
  onDamagedC: (cs, m) => cs.perm(m, gm(m), 2 * gm(m)) });
C('ani_lifter', 'Lifter', 1, 'ANI', 1, 4, { text: g => `End of Turn: Give a random friendly Animal +0/+${2 * g}.`,
  eot: (p, m) => { const t = randOf(boardOf(p, 'ANI')); if (t) buff(t, 0, 2 * gm(m)); } });
C('ani_bouncer', 'Animals Bouncer', 2, 'ANI', 3, 3, { kw: ['taunt'], text: g => `Whenever this takes damage, gain +${g} Attack permanently.`, onDamagedC: (cs, m) => cs.perm(m, gm(m), 0) });
C('ani_junkie', 'HGH Junkie', 2, 'ANI', 2, 2, { target: 'ANI', text: g => `Jack In: Give a friendly Animal +${2 * g}/+${4 * g}.`, bc: (p, m, t) => t && buff(t, 2 * gm(m), 4 * gm(m)) });
C('ani_spotter', 'Spotter', 2, 'ANI', 2, 4, { kw: ['taunt'], text: g => `After another friendly Animal takes damage and survives, give it +${g}/+${g} permanently.`,
  onFriendlyDamagedC: (cs, m, side, t) => { if (t.tribe === 'ANI') cs.perm(t, gm(m), gm(m)); } });
C('ani_pumper', 'Muscle Pumper', 3, 'ANI', 3, 3, { text: g => `End of Turn: Give your Animal with the most Health +${3 * g}/+${3 * g}.`,
  eot: (p, m) => { const a = boardOf(p, 'ANI'); if (a.length) { const t = a.reduce((x, y) => y.hp > x.hp ? y : x); buff(t, 3 * gm(m), 3 * gm(m)); } } });
C('ani_brawler', 'Pit Brawler', 3, 'ANI', 4, 3, { kw: ['smash'], text: g => `After this destroys a minion, gain +${2 * g}/+${2 * g} permanently.`, onKillC: (cs, m) => cs.perm(m, 2 * gm(m), 2 * gm(m)) });
C('ani_doc', 'Juice Doc', 3, 'ANI', 3, 3, { target: 'ANI', text: g => `Jack In: ${g > 1 ? 'Quadruple' : 'Double'} a friendly Animal's Health.`,
  bc: (p, m, t) => { if (t) buff(t, 0, t.hp * gm(m)); } });
C('ani_enforcer', 'Animals Enforcer', 4, 'ANI', 4, 6, { text: g => `Start of Combat: Your Animals gain Attack equal to ${g > 1 ? 'three quarters' : 'a quarter'} of their Health.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x.tribe === 'ANI' && cs.buff(x, Math.ceil(x.hp * (m.golden ? .75 : .25)), 0)) });
C('ani_dealer', 'Juice Dealer', 4, 'ANI', 3, 4, { text: g => `After you play an Animal, give it +${g}/+${3 * g}.`, onPlayFriendly: (p, m, x) => x.tribe === 'ANI' && buff(x, gm(m), 3 * gm(m)) });
C('ani_crusher', 'Bone Crusher', 4, 'ANI', 1, 8, { kw: ['smash'], hpAttack: true, text: g => `Attacks with its Health instead of its Attack.${g > 1 ? ' Start of Combat: Gain +8 Health.' : ''}`,
  soc: (cs, m) => { if (m.golden) cs.buff(m, 0, 8); } });
C('ani_hulk', 'Animals Hulk', 5, 'ANI', 4, 10, { kw: ['smash'], text: g => `After this takes damage and survives, give your other Animals +${2 * g}/+${2 * g}.`,
  onDamagedC: (cs, m, side) => cs.allies(side).forEach(x => x !== m && x.tribe === 'ANI' && cs.buff(x, 2 * gm(m), 2 * gm(m))) });
C('ani_queen', 'Animals Queen', 5, 'ANI', 5, 8, { text: g => `End of Turn: Your Animals gain ${15 * g}% more Health.`,
  eot: (p, m) => boardOf(p, 'ANI').forEach(x => buff(x, 0, Math.max(1, Math.ceil(x.hp * .15 * gm(m))))) });
C('ani_sasquatch', 'Mall Juggernaut', 6, 'ANI', 8, 10, { kw: ['taunt', 'smash'], text: g => `Start of Combat: ${g > 1 ? 'Quadruple' : 'Double'} the Health of your other Animals.`,
  soc: (cs, m, side) => cs.allies(side).forEach(x => x !== m && x.tribe === 'ANI' && cs.buff(x, 0, x.hp * gm(m))) });
C('ani_titan', 'Iron Titan', 6, 'ANI', 7, 12, { kw: ['taunt'], text: g => `After another friendly Animal takes damage and survives, give it +${2 * g}/+${2 * g} permanently.`,
  onFriendlyDamagedC: (cs, m, side, t) => { if (t.tribe === 'ANI') cs.perm(t, 2 * gm(m), 2 * gm(m)); } });

// ---- BIOTECHNICA: Clones. Grow Clones from vats; Mutation makes every new Clone bigger. ----
C('bio_vat', 'Vat Tech', 1, 'BIO', 1, 2, { text: g => `Flatline: Summon ${g > 1 ? 'three Clones' : 'a Clone'}.`,
  dr: (cs, m, side, pos) => { for (let i = 0; i < gm(m); i++) cs.spawnClone(side, pos); } });
C('bio_seed', 'Seedling', 2, 'BIO', 2, 2, { text: g => `Every other End of Turn: Grow ${g > 1 ? 'three Clones' : 'a Clone'} on your board.`,
  eot: (p, m) => { if (G.turn % 2) return; for (let i = 0; i < gm(m); i++) addClone(p, p.board.indexOf(m) + 1); } });
C('bio_splicer', 'Gene Splicer', 2, 'BIO', 2, 3, { text: g => `The first time you create a Clone each turn, gain ${g} Mutation.` });
C('bio_lab', 'Lab Assistant', 2, 'BIO', 3, 2, { text: g => `Jack In: Grow ${g > 1 ? 'three Clones' : 'a Clone'} next to this.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) addClone(p, p.board.indexOf(m) + 1); } });
C('bio_graft', 'Tissue Graft', 3, 'BIO', 3, 4, { text: g => `Start of Combat: Give your Clones +${g}/+${g} for every 2 Clones you control.`,
  soc: (cs, m, side) => { const cl = cs.allies(side).filter(x => x.id === 'tok_clone'); const n = Math.floor(cl.length / 2) * gm(m); cl.forEach(x => cs.buff(x, n, n)); } });
C('bio_incubator', 'Incubator', 3, 'BIO', 2, 5, { text: g => `End of Turn: Grow a Clone for every 3 non-Clone Biotechnica you control (up to ${3 * g}).`,
  eot: (p, m) => { const n = Math.min(3 * gm(m), Math.floor(boardOf(p, 'BIO').filter(x => x.id !== 'tok_clone').length / 3)); for (let i = 0; i < n; i++) addClone(p, p.board.indexOf(m) + 1); } });
C('bio_harvest', 'Organ Harvester', 4, 'BIO', 4, 4, { text: g => `Whenever a friendly Clone dies, give a random friendly non-Clone Biotechnica +${g}/+${g} permanently.`,
  onFriendlyDeathC: (cs, m, side, d) => { if (d.id !== 'tok_clone') return; const t = randOf(cs.allies(side).filter(x => x.tribe === 'BIO' && x.id !== 'tok_clone')); if (t) cs.perm(t, gm(m), gm(m)); } });
C('bio_mitosis', 'Mitosis Pod', 4, 'BIO', 3, 5, { text: g => `The first ${3 * g} times a friendly Clone dies each combat, summon a Clone.`,
  onFriendlyDeathC: (cs, m, side, d) => { if (d.id !== 'tok_clone' || (m._mit || 0) >= 3 * gm(m)) return; m._mit = (m._mit || 0) + 1; cs.spawnClone(side, cs.sides[side].b.length); } });
C('bio_exec', 'Biotechnica Exec', 5, 'BIO', 4, 6, { text: g => `End of Turn: Gain ${2 * g} Mutation.`, eot: (p, m) => { p.mutation = (p.mutation || 0) + 2 * gm(m); } });
C('bio_hive', 'Hive Mind', 5, 'BIO', 5, 5, { text: g => `Clones you create have ${g > 1 ? 'triple' : 'double'} stats.` });
C('bio_genesis', 'Project Genesis', 6, 'BIO', 6, 6, { text: g => `Start of Combat: Summon a Clone for each other non-Clone Biotechnica you control (up to ${8 * g}).`,
  soc: (cs, m, side) => { const n = Math.min(8 * gm(m), cs.allies(side).filter(x => x !== m && x.tribe === 'BIO' && x.id !== 'tok_clone').length); for (let i = 0; i < n; i++) cs.spawnClone(side, cs.sides[side].b.length); } });
C('bio_mother', 'Mother Vat', 6, 'BIO', 5, 9, { text: g => `End of Turn: Give your Clones +${g}/+${g} for every 2 Mutation.`,
  eot: (p, m) => { const n = Math.floor((p.mutation || 0) / 2) * gm(m); if (n) p.board.forEach(x => x.id === 'tok_clone' && buff(x, n, n)); } });

// ---- THE MOX: Rally. They protect each other; buffs scale with how many factions you control. ----
C('mox_bouncer', 'Mox Bouncer', 1, 'MOX', 3, 3, { kw: ['taunt'], text: g => `Start of Combat: Gain +${g}/+${g} for each faction you control.`,
  soc: (cs, m, side) => { const n = rally(cs.allies(side)) * gm(m); cs.buff(m, n, n); } });
C('mox_hostess', 'Lizzie\'s Hostess', 1, 'MOX', 1, 2, { target: 'friendly', text: g => `Jack In: Give a friendly minion +${g}/+${g} for each faction you control.`,
  bc: (p, m, t) => { if (t) { const n = rally(p.board) * gm(m); buff(t, n, n); } } });
C('mox_guard', 'Mox Guardian', 2, 'MOX', 3, 3, { text: g => `Whenever a friendly minion of another faction dies, gain +${2 * g}/+${2 * g}.`,
  onFriendlyDeathC: (cs, m, side, d) => { if (d.tribe !== 'MOX') cs.buff(m, 2 * gm(m), 2 * gm(m)); } });
C('mox_recruiter', 'Mox Recruiter', 2, 'MOX', 2, 2, { text: g => `Jack In: Discover a minion from a faction you don't control${g > 1 ? ' three times' : ''}.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) { const have = new Set(p.board.map(x => x.tribe)); discoverMinion(p, Math.max(1, p.tier - 1), c => c.tribe && !have.has(c.tribe)); } } });
C('mox_bartender', 'Lizzie\'s Bartender', 3, 'MOX', 3, 4, { text: g => `End of Turn: Give a random minion of each faction you control +${2 * g}/+${2 * g}.`,
  eot: (p, m) => { const by = {}; p.board.forEach(x => { if (x.tribe) (by[x.tribe] = by[x.tribe] || []).push(x); }); const k = rallyMult(p.board); for (const t in by) for (let i = 0; i < k; i++) buff(pick(by[t]), 2 * gm(m), 2 * gm(m)); } });
C('mox_dancer', 'Braindance Star', 3, 'MOX', 2, 5, { text: g => `Start of Combat: Give your minions +${g}/+${g} for each faction you control.`,
  soc: (cs, m, side) => { const n = rally(cs.allies(side)) * gm(m); cs.allies(side).forEach(x => cs.buff(x, n, n)); } });
C('mox_sister', 'Mox Sisterhood', 4, 'MOX', 4, 5, { text: g => `After you play a minion of a faction you didn't control, give your minions +${g}/+${g}.`,
  onPlayFriendly: (p, m, x) => { if (x.tribe && p.board.filter(y => y.tribe === x.tribe).length === 1) p.board.forEach(y => buff(y, gm(m), gm(m))); } });
C('mox_shield', 'Mox Shieldmaiden', 4, 'MOX', 3, 6, { kw: ['taunt'], text: g => `Start of Combat: Give ${g > 1 ? 'three minions' : 'one minion'} of each other faction you control Barrier.`,
  soc: (cs, m, side) => { const by = {}; cs.allies(side).forEach(x => { if (x.tribe && x.tribe !== 'MOX') (by[x.tribe] = by[x.tribe] || []).push(x); }); for (const t in by) shuffle(by[t].filter(x => !x.shield)).slice(0, gm(m)).forEach(x => x.shield = true); } });
C('mox_susie', 'Susie Q', 5, 'MOX', 5, 5, { text: g => `End of Turn: Give your minions +${g}/+${g} for each faction you control.`,
  eot: (p, m) => { const n = rally(p.board) * gm(m); if (n) p.board.forEach(x => buff(x, n, n)); } });
C('mox_avenger', 'Mox Avenger', 5, 'MOX', 6, 4, { text: g => `Whenever another friendly minion dies, give your Mox +${2 * g}/+${2 * g}.`,
  onFriendlyDeathC: (cs, m, side) => cs.allies(side).forEach(x => x.tribe === 'MOX' && cs.buff(x, 2 * gm(m), 2 * gm(m))) });
C('mox_matriarch', 'Mox Matriarch', 6, 'MOX', 6, 7, { text: g => `Your effects count each faction you control ${g > 1 ? 'three times' : 'twice'}.` });
C('mox_unity', 'Street Unity', 6, 'MOX', 7, 7, { text: g => `Start of Combat: Give your minions +${g}/+${g} for each faction you control.`,
  soc: (cs, m, side) => { const n = rally(cs.allies(side)) * gm(m); cs.allies(side).forEach(x => cs.buff(x, n, n)); } });

// ---- NEUTRAL ----
C('n_streetkid', 'Street Kid', 1, null, 3, 3, { kw: ['taunt'], text: g => `Flatline: Give a random friendly minion +${2 * g}/+${2 * g} permanently.`,
  dr: (cs, m, side) => { const t = randOf(cs.allies(side)); if (t) cs.perm(t, 2 * gm(m), 2 * gm(m)); } });
C('n_scav', 'Scavenger', 1, null, 3, 2, { text: g => `Jack In: Gain +${g}/+${g} for each other minion you control (up to ${8 * g}).`,
  bc: (p, m) => { const n = Math.min(8, p.board.length - 1) * gm(m); buff(m, n, n); } });
C('n_medic', 'Trauma Team Medic', 2, null, 2, 3, { text: g => `Flatline: Give ${g > 1 ? 'three random friendly minions' : 'a random friendly minion'} Barrier.`,
  dr: (cs, m, side) => shuffle(cs.allies(side).filter(x => !x.shield)).slice(0, gm(m)).forEach(x => x.shield = true) });
C('n_ripper', 'Back-Alley Ripper', 2, null, 2, 3, { target: 'friendly', text: g => `Jack In: Give a friendly minion +${g}/+${g} and +${g} Humanity.`,
  bc: (p, m, t) => { if (t) { buff(t, gm(m), gm(m)); t.humMod = (t.humMod || 0) + gm(m); } } });
C('n_fixer', 'Fixer', 3, null, 3, 3, { text: g => `Jack In: Discover a minion of your Tavern Tier${g > 1 ? ' three times' : ''}.`,
  bc: (p, m) => { for (let i = 0; i < gm(m); i++) discoverMinion(p, p.tier); } });
C('n_merc', 'Afterlife Merc', 3, null, 3, 3, { text: g => `Whenever another friendly minion dies, gain +${g}/+${g} permanently.`, onFriendlyDeathC: (cs, m) => cs.perm(m, gm(m), gm(m)) });
C('n_maxtac', 'Max-Tac Officer', 4, null, 3, 5, { kw: ['cleave'], text: g => `Start of Combat: Deal ${4 * g} damage to each enemy Cyberpsycho.`,
  soc: (cs, m, side) => cs.allies(1 - side).forEach(t => t.psycho && cs.damage(t, 4 * gm(m), m)) });
C('n_bartender', 'Afterlife Bartender', 4, null, 3, 3, { text: g => `Jack In: Give your other minions +${g}/+${g}.`, bc: (p, m) => p.board.forEach(x => x !== m && buff(x, gm(m), gm(m))) });
C('n_delamain', 'Delamain', 5, null, 3, 4, { text: g => `Your Jack In effects trigger ${g > 1 ? 'three times' : 'twice'}.` });
C('n_traumaav', 'Trauma Team AV', 5, null, 5, 6, { text: g => `Flatline: Give ${g > 1 ? 'six' : 'two'} random friendly minions Barrier.`,
  dr: (cs, m, side) => shuffle(cs.allies(side).filter(x => !x.shield)).slice(0, 2 * gm(m)).forEach(x => x.shield = true) });
C('n_soulkiller', 'Soulkiller', 6, null, 7, 10, { kw: ['windfury'], attackLowest: true, text: 'Always attacks the enemy minion with the lowest Attack.' });
C('n_legend', 'Afterlife Legend', 6, null, 5, 7, { kw: ['taunt', 'shield'], text: g => `After this loses Barrier, give your other minions +${g}/+${g}.`,
  onShieldLostC: (cs, m, side, l) => { if (l === m) cs.allies(side).forEach(x => x !== m && cs.buff(x, gm(m), gm(m))); } });

function cardText(c, golden) { const t = typeof c.text === 'function' ? c.text(golden ? 3 : 1) : c.text; return t || ''; }

// ---------------- CYBERWARE ----------------
const WARE = {}; const WARE_LIST = [];
function W(id, name, tier, cost, hum, text, o) { const w = Object.assign({ id, name, tier, cost, hum, text, kw: [] }, o || {}); WARE[id] = w; WARE_LIST.push(w); }
W('cw_optics', 'Kiroshi Optics', 1, 1, 1, '+3 Attack.', { atk: 3 });
W('cw_subderm', 'Subdermal Armor', 1, 1, 1, '+5 Health.', { hp: 5 });
W('cw_neofiber', 'Neofiber', 1, 1, 1, '+2/+2.', { atk: 2, hp: 2 });
W('cw_camo', 'Optical Camo', 2, 1, 1, '+1/+1 and Optical Camo.', { atk: 1, hp: 1, kw: ['stealth'] });
W('cw_gorilla', 'Gorilla Arms', 2, 2, 2, '+4/+2 and Smash.', { atk: 4, hp: 2, kw: ['smash'] });
W('cw_mantis', 'Mantis Blades', 2, 2, 2, '+3 Attack. After this attacks, deal 3 damage to a random enemy minion.', { atk: 3,
  afterAttackC: (cs, m, side) => { const t = randOf(cs.allies(1 - side)); if (t) cs.damage(t, 3, m); } });
W('cw_bloodpump', 'Blood Pump', 2, 1, 1, '+1/+1. Flatline: Give a random friendly minion +3/+3.', { atk: 1, hp: 1,
  dr: (cs, m, side) => { const t = randOf(cs.allies(side)); if (t) cs.buff(t, 3, 3); } });
W('cw_monowire', 'Monowire', 3, 2, 2, '+2 Attack and Cleave.', { atk: 2, kw: ['cleave'] });
W('cw_kerenzikov', 'Kerenzikov', 3, 2, 2, '+2/+2 and Kerenzikov.', { atk: 2, hp: 2, kw: ['first'] });
W('cw_paineditor', 'Pain Editor', 3, 2, 2, '+0/+3 and Barrier.', { hp: 3, kw: ['shield'] });
W('cw_launcher', 'Projectile Launcher', 3, 2, 2, 'Start of Combat: Deal 5 damage to a random enemy minion.', {
  soc: (cs, m, side) => { const t = randOf(cs.allies(1 - side)); if (t) cs.damage(t, 5, m); } });
W('cw_smartlink', 'Smart Link', 4, 2, 1, '+2/+2 and Neurotoxin.', { atk: 2, hp: 2, kw: ['venom'] });
W('cw_heart', 'Second Heart', 4, 2, 2, '+2/+3 and Reboot.', { atk: 2, hp: 3, kw: ['reborn'] });
W('cw_sandevistan', 'Sandevistan', 4, 2, 3, '+3/+3 and Overclock.', { atk: 3, hp: 3, kw: ['windfury'] });
W('cw_berserk', 'Berserk', 5, 2, 3, '+6/+6. Whenever this takes damage, gain +2 Attack.', { atk: 6, hp: 6, onDamagedC: (cs, m) => cs.buff(m, 2, 0) });
W('cw_synaptic', 'Synaptic Accelerator', 5, 2, 2, 'Start of Combat: Gain +Attack and +Health equal to your Tavern Tier ×3.', {
  soc: (cs, m, side) => cs.buff(m, 3 * (cs.sides[side].p.tier || 1), 3 * (cs.sides[side].p.tier || 1)) });
W('cw_militech', 'Militech Apogee', 6, 4, 3, '+8/+8 and Barrier.', { atk: 8, hp: 8, kw: ['shield'] });
W('cw_blackchip', 'Black-Market Chip', 1, 1, 0, '+3/+3. Uses a random 0–3 Humanity, rolled when installed.', { atk: 3, hp: 3, rnd: true, install: (p, m) => { m.humMod = (m.humMod || 0) - rnd(4); } });
W('cw_roulette', 'Roulette Implant', 1, 1, 1, 'Gain +0 to +6 Attack and +0 to +6 Health, rolled when installed.', { rnd: true, install: (p, m) => buff(m, rnd(7), rnd(7)) });
W('cw_malware', 'Free Implant', 1, 0, 0, '+5/+5. Malicious: each combat, 25% chance it turns on its own allies.', { atk: 5, hp: 5, rnd: true, malicious: true,
  soc: (cs, m) => { if (Math.random() < .25) turncoat(cs, m); } });
W('cw_firmware', 'Unstable Firmware', 2, 2, 1, '+1/+1. Start of Combat: Gain a random keyword.', { atk: 1, hp: 1, rnd: true, soc: (cs, m) => { m[pick(RKW)] = true; } });
W('cw_bootleg', 'Bootleg Sandevistan', 2, 1, 1, 'Overclock. Start of Combat: 50% chance it glitches and this loses Overclock.', { kw: ['windfury'], rnd: true, soc: (cs, m) => { if (Math.random() < .5) m.windfury = false; } });
W('cw_parasite', 'Parasite Firmware', 3, 1, 0, '+6/+6. Malicious: each End of Turn, eats 1 Humanity.', { atk: 6, hp: 6, rnd: true, malicious: true,
  eot: (p, m) => { const w = isPsycho(m, p); m.humMod = (m.humMod || 0) - 1; psychoCheck(p, m, w); } });
W('cw_lottery', 'Lottery Chip', 3, 2, 0, 'Becomes a random Cyberware, up to one Tier above your Tavern.', { rnd: true,
  install: (p, m) => { const i = m.ware.lastIndexOf('cw_lottery'); if (i >= 0) m.ware.splice(i, 1); p.arsenal = Math.max(0, (p.arsenal || 0) - 1); const l = WARE_LIST.filter(w => w.tier <= Math.min(6, p.tier + 1) && w.id !== 'cw_lottery'); installWare(p, m, pick(l).id); } });
W('cw_gambler', 'Gambler’s Reflexes', 4, 2, 1, 'Start of Combat: Flip a coin: double this minion’s Attack, or halve it.', { rnd: true, soc: (cs, m) => { if (Math.random() < .5) cs.buff(m, m.atk, 0); else m.atk = Math.floor(m.atk / 2); } });
W('cw_overcharge', 'Overcharged Core', 4, 2, 2, '+8 Attack. After this attacks, 30% chance it takes 4 damage.', { atk: 8, rnd: true, afterAttackC: (cs, m) => { if (m.hp > 0 && Math.random() < .3) cs.damage(m, 4, null); } });
W('cw_rogueai', 'Rogue AI Shard', 5, 2, 1, '+5/+5. Start of Combat: Copy a random keyword from a random enemy minion.', { atk: 5, hp: 5, rnd: true,
  soc: (cs, m, side) => { const e = randOf(cs.allies(1 - side)); if (!e) return; const ks = RKW.filter(k => e[k]); if (ks.length) m[pick(ks)] = true; } });

// ---------------- QUICKHACKS (cost RAM) ----------------
const SPELLS = {}; const SPELL_LIST = [];
function S(id, name, tier, cost, text, o) { const s = Object.assign({ id, name, tier, cost, text, kind: 'spell' }, o); SPELLS[id] = s; SPELL_LIST.push(s); }
S('sp_ping', 'Ping', 1, 1, 'Refresh the Tavern.', { cast: p => refreshShop(p) });
S('sp_optics', 'Reboot Optics', 1, 1, 'Give a friendly minion Optical Camo and +1/+1.', { target: true, cast: (p, t) => { t.stealth = true; buff(t, 1, 1); } });
S('sp_shortc', 'Short Circuit', 1, 2, 'Give a friendly minion +3 Attack.', { target: true, cast: (p, t) => buff(t, 3, 0) });
S('sp_wipe', 'Memory Wipe', 2, 2, 'Give a friendly minion +2 Humanity and +1/+1.', { target: true, cast: (p, t) => { t.humMod = (t.humMod || 0) + 2; buff(t, 1, 1); } });
S('sp_glitch', 'Weapon Glitch', 2, 2, 'Next combat: The enemy minion with the highest Attack has its Attack set to 1.', { cast: p => p.hacks.push('glitch') });
S('sp_contagion', 'Contagion', 2, 3, 'Give a friendly minion Neurotoxin.', { target: true, cast: (p, t) => { t.venom = true; } });
S('sp_breach', 'Breach Protocol', 2, 3, 'Discover a minion of your Tavern Tier.', { cast: p => discoverMinion(p, p.tier) });
S('sp_malfunction', 'Cyberware Malfunction', 3, 3, 'Next combat: Deal 4 damage to each enemy minion that has Cyberware.', { cast: p => p.hacks.push('malfunction') });
S('sp_overheat', 'Overheat', 3, 3, 'Next combat: Deal 2 damage to all enemy minions.', { cast: p => p.hacks.push('overheat') });
S('sp_sonic', 'Sonic Shock', 3, 3, 'Give a friendly minion Barrier.', { target: true, cast: (p, t) => { t.shield = true; } });
S('sp_backup', 'Request Backup', 3, 3, 'Get a random minion of your Tavern Tier.', { cast: p => { const l = CARD_LIST.filter(c => c.tier === p.tier && inLobby(c) && G.pool[c.id] > 0); if (!l.length) return; const c = pick(l); G.pool[c.id]--; giveCard(p, makeMinion(c.id)); } });
S('sp_psychosis', 'Chrome Overload', 4, 4, 'Give a friendly minion +6/+6. It becomes a Cyberpsycho.', { target: true,
  cast: (p, t) => { const w = isPsycho(t, p); buff(t, 6, 6); while (!isPsycho(t, p)) t.humMod = (t.humMod || 0) - 1; psychoCheck(p, t, w); } });
S('sp_madness', 'Cyberpsychosis', 3, 4, 'Next combat: The strongest enemy minion turns on its own allies with double Attack.', { cast: p => p.hacks.push('madness') });
S('sp_burnout', 'Synapse Burnout', 4, 4, 'Next combat: Deal 8 damage to the enemy minion with the highest Attack.', { cast: p => p.hacks.push('burnout') });
S('sp_reset', 'System Reset', 4, 4, 'Give a friendly minion Reboot.', { target: true, cast: (p, t) => { t.reborn = true; } });
S('sp_grenade', 'Detonate Grenade', 5, 5, 'Give your minions +2/+1.', { cast: p => p.board.forEach(x => buff(x, 2, 1)) });
S('sp_blackwall', 'Blackwall Breach', 6, 7, 'Make a friendly minion Golden.', { target: true, tfilter: t => !t.golden, cast: (p, t) => makeGolden(t) });
S('sp_collapse', 'System Collapse', 6, 8, 'Give your minions +3/+3.', { cast: p => p.board.forEach(x => buff(x, 3, 3)) });
function turncoat(cs, t) { if (!t || t.turncoat) return; if (!t.psycho) { t.psycho = true; t.atk *= 2; } t.turncoat = true; }
const HACKS = {
  madness: (cs, side) => { const e = cs.allies(1 - side).filter(x => !x.turncoat); if (e.length) turncoat(cs, e.reduce((a, b) => b.atk > a.atk ? b : a)); },
  glitch: (cs, side) => { const e = cs.allies(1 - side); if (e.length) { const t = e.reduce((a, b) => b.atk > a.atk ? b : a); t.atk = Math.min(t.atk, 1); } },
  malfunction: (cs, side) => cs.allies(1 - side).forEach(t => t.ware && t.ware.length && cs.damage(t, 4, null)),
  overheat: (cs, side) => cs.allies(1 - side).forEach(t => cs.damage(t, 2, null)),
  tower: (cs, side) => { const n = (cs.sides[side].p.tier || 1) + 3; cs.allies(1 - side).forEach(t => cs.damage(t, n, null)); },
  burnout: (cs, side) => { const e = cs.allies(1 - side); if (e.length) cs.damage(e.reduce((a, b) => b.atk > a.atk ? b : a), 8, null); },
};

// ---------------- PERKS (hero trinkets, offered turn 6 and 9) ----------------
const PERKS = {}; const PERK_LIST = [];
function P(id, name, greater, cost, text, o) { const t = Object.assign({ id, name, greater, cost, text }, o); PERKS[id] = t; PERK_LIST.push(t); }
P('pk_cred', 'Street Cred', false, 3, 'Your Tavern offers 1 more minion.');
P('pk_blade', 'Bladerunner', false, 2, 'Start of Combat: Give your left-most minion +4 Attack.', { soc: (cs, side) => { const a = cs.allies(side)[0]; if (a) cs.buff(a, 4, 0); } });
P('pk_jugg', 'Juggernaut', false, 2, 'Start of Combat: Give your Bodyguard minions +2/+2.', { soc: (cs, side) => cs.allies(side).forEach(x => x.taunt && cs.buff(x, 2, 2)) });
P('pk_painkiller', 'Painkiller', false, 0, 'Gain 6 Armor.', { acquire: p => { p.armor += 6; } });
P('pk_contacts', 'Fixer Contacts', false, 2, 'Your first Refresh each turn costs 0.', { sot: p => { p.freeRefresh += 1; } });
P('pk_deadeye', 'Deadeye', false, 2, 'Start of Combat: Deal 3 damage to two random enemy minions.', { soc: (cs, side) => shuffle(cs.allies(1 - side)).slice(0, 2).forEach(t => cs.damage(t, 3, null)) });
P('pk_dealer', 'Ripperdoc Discount', false, 1, 'Your Cyberware costs (1) less €$.');
P('pk_stash', 'Eddie Stash', false, 1, 'Gain 1 extra €$ at the start of your next 3 turns.', { acquire: p => { p.stash = 3; }, sot: p => { if (p.stash > 0) { p.stash--; p.gold++; } } });
P('pk_tolerance', 'Chrome Tolerance', false, 2, 'Your minions have +2 Humanity.');
P('pk_ram', 'Upgraded Deck', false, 1, 'You have +2 maximum RAM.');
P('pk_adrenaline', 'Adrenaline Rush', true, 4, 'Start of Combat: Give your minions +2 Attack.', { soc: (cs, side) => cs.allies(side).forEach(x => cs.buff(x, 2, 0)) });
P('pk_secondwind', 'Second Wind', true, 3, 'The first time your hero would die, survive with 10 Health.');
P('pk_bulletproof', 'Bulletproof', true, 4, 'Start of Combat: Give your Barrier minions +4 Attack.', { soc: (cs, side) => cs.allies(side).forEach(x => x.shield && cs.buff(x, 4, 0)) });
P('pk_edgerunner', 'Edgerunner', true, 5, 'Start of Combat: Give your left-most minion Overclock and +5 Attack.', { soc: (cs, side) => { const a = cs.allies(side)[0]; if (a) { a.windfury = true; cs.buff(a, 5, 0); } } });
P('pk_regen', 'Regeneration', true, 3, 'End of Turn: Give your minions +0/+1.', { eot: p => p.board.forEach(x => buff(x, 0, 1)) });
P('pk_toxic', 'Toxicology', true, 4, 'Start of Combat: Give two random friendly minions Neurotoxin.', { soc: (cs, side) => shuffle(cs.allies(side)).slice(0, 2).forEach(x => x.venom = true) });
P('pk_ghost', 'Ghost Protocol', true, 5, 'Start of Combat: Give your 3 left-most minions Barrier.', { soc: (cs, side) => cs.allies(side).slice(0, 3).forEach(x => x.shield = true) });
P('pk_deck', 'Overclocked Deck', true, 3, 'Your Quickhacks cost (1) less RAM.');
P('pk_tactician', 'Tactician', true, 5, 'Your minions\' Start of Combat effects trigger twice.');
P('pk_legend', 'Afterlife Legend', true, 5, 'Make your left-most minion Golden.', { acquire: p => { if (p.board[0]) makeGolden(p.board[0]); } });
// faction perks: each helps one faction and shows up more often when you play it
P('pk_mil1', 'Militech Requisition', false, 2, 'Your Cyberware costs (1) less €$, and every install counts as 2 Arsenal.', { tribe: 'MIL' });
P('pk_mil2', 'Militech Black Ops', true, 4, 'Start of Combat: Give your Militech +1/+1 for every 2 Arsenal.', { tribe: 'MIL', soc: (cs, side) => { const n = Math.floor(arsenalOf(cs.sides[side].p) / 2); cs.allies(side).forEach(x => x.tribe === 'MIL' && cs.buff(x, n, n)); } });
P('pk_mae1', 'Chrome Fever', false, 2, 'After a friendly minion becomes a Cyberpsycho, give it +3/+3.', { tribe: 'MAE' });
P('pk_mae2', 'Maelstrom Broadcast', true, 4, 'Max-Tac never hunts your Cyberpsychos.', { tribe: 'MAE' });
P('pk_tyg1', 'Bushido', false, 2, 'Gain 3 Honor now. Start of Combat: Your Tyger Claws gain +1 Attack for every 4 Honor.', { tribe: 'TYG', acquire: p => { p.honor = (p.honor || 0) + 3; }, soc: (cs, side) => { const n = Math.floor((cs.sides[side].p.honor || 0) / 4); cs.allies(side).forEach(x => x.tribe === 'TYG' && cs.buff(x, n, 0)); } });
P('pk_tyg2', 'Blood Oath', true, 4, 'Whenever a friendly Tyger Claws destroys a minion, it gains +2/+2 permanently.', { tribe: 'TYG' });
P('pk_ald1', 'Open Road', false, 2, 'End of Turn: Give your left-most and right-most minions +1/+1 for each Aldecaldo you control.', { tribe: 'ALD', eot: p => { const n = boardOf(p, 'ALD').length; if (!n || !p.board.length) return; new Set([p.board[0], p.board[p.board.length - 1]]).forEach(x => buff(x, n, n)); } });
P('pk_ald2', 'Nomad Family', true, 4, 'Your Aldecaldos’ End of Turn effects trigger one extra time.', { tribe: 'ALD' });
P('pk_ara1', 'Corporate Uplink', false, 2, 'Upload +2/+2 to your Engram now. End of Turn: Upload +1/+1.', { tribe: 'ARA', acquire: p => addEngram(p, 2, 2), eot: p => addEngram(p, 1, 1) });
P('pk_ara2', 'Relic Protocol', true, 5, 'Your Engram bonus is increased by 50%.', { tribe: 'ARA' });
P('pk_val1', 'Familia Ties', false, 2, 'Minions you play start with 2 Loyalty.', { tribe: 'VAL' });
P('pk_val2', 'Heywood Pride', true, 4, 'Start of Combat: Your Valentinos gain +1/+1 for each Loyalty they have.', { tribe: 'VAL', soc: (cs, side) => cs.allies(side).forEach(x => x.tribe === 'VAL' && cs.buff(x, x.loy || 0, x.loy || 0)) });
P('pk_vdb1', 'Netrunner Rig', false, 1, 'You have +3 maximum RAM.', { tribe: 'VDB' });
P('pk_vdb2', 'Voodoo Loa', true, 4, 'Your first Quickhack each turn is cast twice.', { tribe: 'VDB' });
P('pk_ani1', 'Protein Shake', false, 2, 'End of Turn: Give your Animals +0/+2.', { tribe: 'ANI', eot: p => boardOf(p, 'ANI').forEach(x => buff(x, 0, 2)) });
P('pk_ani2', 'Juice Overdose', true, 4, 'Start of Combat: Your Animals gain Attack equal to a third of their Health.', { tribe: 'ANI', soc: (cs, side) => cs.allies(side).forEach(x => x.tribe === 'ANI' && cs.buff(x, Math.ceil(x.hp / 3), 0)) });
P('pk_bio1', 'Growth Medium', false, 2, 'Gain 2 Mutation now. Every other End of Turn: Gain 1 Mutation.', { tribe: 'BIO', acquire: p => { p.mutation = (p.mutation || 0) + 2; }, eot: p => { if (G.turn % 2 === 0) p.mutation = (p.mutation || 0) + 1; } });
P('pk_bio2', 'Clone Army', true, 4, 'Start of Combat: Summon 3 Clones.', { tribe: 'BIO', soc: (cs, side) => { for (let i = 0; i < 3; i++) cs.spawnClone(side, cs.sides[side].b.length); } });
P('pk_mox1', 'Lizzie’s Tab', false, 2, 'End of Turn: Give a random minion of each faction you control +1/+1.', { tribe: 'MOX', eot: p => { const by = {}; p.board.forEach(x => { if (x.tribe) (by[x.tribe] = by[x.tribe] || []).push(x); }); for (const t in by) buff(pick(by[t]), 1, 1); } });
P('pk_mox2', 'Sisters in Arms', true, 4, 'Whenever a friendly minion dies in combat, give a random friendly minion of a different faction +2/+2.', { tribe: 'MOX' });

// ---------------- HEROES ----------------
// faction stat boosts (by win-rate gap)
const TRIBE_STAT_BOOST = { MOX: .90, VAL: .85, ALD: .75, MAE: .45, VDB: .45, MIL: .60 };
for (const c of Object.values(CARDS)) { const k = TRIBE_STAT_BOOST[c.tribe]; if (k && !c.token) { c.atk = Math.ceil(c.atk * (1 + k)); c.hp = Math.ceil(c.hp * (1 + k)); } }
const HEROES = {}; const HERO_LIST = [];
function Hh(id, name, armor, power) { const h = { id, name, armor, power }; HEROES[id] = h; HERO_LIST.push(h); }
Hh('johnny', 'Johnny Silverhand', 11, { name: 'Burn the Tower', cost: 1, text: 'Next combat: Deal damage equal to your Tavern Tier +3 to all enemy minions. Usable every other turn.', use: p => { p.hdata.cd = 2; p.hacks.push('tower'); } });
Hh('v', 'V', 10, { name: 'The Relic', passive: true, text: 'At the start of every other turn, Discover a minion of your Tavern Tier. The Relic is killing you: each time, take 4 damage.', sot: p => { if (G.turn % 2 === 0) { discoverMinion(p, p.tier); selfDamage(p, 4); } } });
Hh('judy', 'Judy Alvarez', 8, { name: 'Braindance Recording', cost: 1, target: 'board', text: 'Record a friendly minion as it is now. At the start of your next combat, a copy of it with +5/+5 and Barrier is summoned.', use: (p, t) => { p.bd = Object.assign({}, t, { ware: (t.ware || []).slice(), atk: t.atk + 5, hp: t.hp + 5, shield: true }); } });
Hh('panam', 'Panam Palmer', 9, { name: 'Nomad Convoy', passive: true, text: 'Start of Combat: Summon a Mackinaw with Bodyguard and stats equal to four times your Tavern Tier.',
  soc: (cs, side, p) => { const m = cs.summon(side, 'tok_mackinaw', cs.sides[side].b.length, false); if (m) { m.atk = 4 * p.tier; m.hp = 4 * p.tier; } } });
Hh('jackie', 'Jackie Welles', 9, { name: 'The Big Score', passive: true, text: 'After you win a combat, gain 3 extra €$ next turn.' });
Hh('rogue', 'Rogue Amendiares', 7, { name: 'Afterlife Booking', cost: 1, text: 'Discover a minion from one Tier above your Tavern. Usable every third turn.', use: p => { p.hdata.cd = 3; discoverMinion(p, Math.min(6, p.tier + 1)); } });
Hh('goro', 'Goro Takemura', 9, { name: 'Bodyguard Protocol', passive: true, text: 'Start of Combat: Your left-most minion gains Bodyguard, Barrier and +7/+7.', soc: (cs, side) => { const a = cs.allies(side)[0]; if (a) { a.taunt = true; a.shield = true; cs.buff(a, 7, 7); } } });
Hh('smasher', 'Adam Smasher', 6, { name: 'Full Borg', passive: true, text: 'At the start of every third turn, get a random Cyberware. Start of Combat: Each friendly minion gains +3/+3 for each piece of Cyberware it has.',
  sot: p => { if (G.turn % 3 === 1 && p.hand.length < HAND_MAX - 2) giveWare(p, randomWareId(p)); },
  soc: (cs, side) => cs.allies(side).forEach(x => { const n = (x.ware || []).length; if (n) cs.buff(x, 3 * n, 3 * n); }) });
Hh('yorinobu', 'Yorinobu Arasaka', 7, { name: 'Hostile Takeover', cost: 1, text: 'Get a copy of a random minion from your next opponent\'s board. Usable every third turn.',
  use: p => { p.hdata.cd = 3; if (p.hand.length >= HAND_MAX) return; const o = G.players.find(x => x.id === p.nextOpp); const b = o ? o.board : ((G.pairs || []).flat().find(x => x.isGhost) || {}).board || []; const t = randOf(b.filter(x => CARDS[x.id] && !CARDS[x.id].token)); if (t) { const c = Object.assign({}, t, { uid: UID++, ware: (t.ware || []).slice(), attached: [], noPool: true, loy: 0 }); giveCard(p, c); } } });
Hh('saburo', 'Saburo Arasaka', 7, { name: 'Soul Engram', passive: true, text: 'Your other minions get half your Engram bonus. Every other turn, upload +1/+1 to your Engram.', eot: p => { if (G.turn % 2 === 0) addEngram(p, 1, 1); } });
Hh('alt', 'Alt Cunningham', 8, { name: 'Beyond the Blackwall', cost: 1, target: 'board', tfilter: t => !t.reborn, text: 'Turn a friendly minion into a digital ghost: it gains Reboot, Optical Camo and +3/+3.', use: (p, t) => { t.reborn = true; t.stealth = true; buff(t, 3, 3); } });
Hh('kerry', 'Kerry Eurodyne', 8, { name: 'Encore', cost: 1, text: 'Give three random friendly minions +1/+1 for each different faction you control.',
  use: p => { const n = new Set(p.board.map(x => x.tribe || 'N')).size; shuffle(p.board.slice()).slice(0, 3).forEach(t => buff(t, n, n)); } });
Hh('river', 'River Ward', 8, { name: 'Detective Work', cost: 0, target: 'board', text: 'Scan your next opponent\'s board, and give a friendly minion +3/+3.', use: (p, t) => { buff(t, 3, 3); emit('scan', p); } });
Hh('viktor', 'Viktor Vektor', 9, { name: 'Ripperdoc', cost: 0, target: 'board', text: 'Give a friendly minion +2/+2 and install a random Cyberware on it, choosing one that fits its remaining Humanity if possible.',
  use: (p, t) => { buff(t, 2, 2); const free = humMax(t, p) - humUsed(t); const fit = WARE_LIST.filter(w => w.tier <= p.tier && w.hum <= free); installWare(p, t, (fit.length ? pick(fit) : WARE[randomWareId(p)]).id); } });
Hh('dexter', 'Dexter DeShawn', 8, { name: 'Fixer', passive: true, text: 'The first minion you buy each turn costs 2 €$.' });
Hh('evelyn', 'Evelyn Parker', 9, { name: 'Doll House', cost: 0, target: 'shop', text: 'Take a minion from the Tavern into your hand as a Doll that keeps its effect, with stats equal to its Tier.',
  use: (p, t) => { const i = p.shop.indexOf(t); if (i < 0 || p.hand.length >= HAND_MAX) return; p.shop.splice(i, 1); t.atk = t.tier * (t.golden ? 3 : 1); t.hp = t.tier * (t.golden ? 3 : 1); t.doll = true; p.hand.push(t); checkTriple(p); } });
Hh('meredith', 'Meredith Stout', 7, { name: 'Militech Contract', passive: true, text: 'Your Cyberware costs (1) less €$. Start of Combat: Your left-most minion with Cyberware gains Barrier and +3/+3.',
  soc: (cs, side) => { const a = cs.allies(side).find(x => (x.ware || []).length); if (a) { a.shield = true; cs.buff(a, 3, 3); } } });
Hh('placide', 'Placide', 8, { name: 'Data Ritual', passive: true, text: 'After you cast a Quickhack, give a random friendly minion +3/+3. You have +1 maximum RAM.' });
Hh('hanako', 'Hanako Arasaka', 7, { name: 'Heiress', passive: true, text: 'After you upgrade your Tavern to Tier 3 or higher, get a random minion of your new Tier.',
  onUpgrade: p => { if (p.tier < 3) return; const l = CARD_LIST.filter(c => c.tier === p.tier && inLobby(c) && G.pool[c.id] > 0); if (l.length) { const c = pick(l); G.pool[c.id]--; giveCard(p, makeMinion(c.id)); } } });
Hh('songbird', 'Songbird', 9, { name: 'Blackwall Gateway', cost: 0, text: 'Take 1 damage. Get a random Quickhack (already paid for).', use: p => { selfDamage(p, 1); giveSpell(p, randomSpellId(p)); } });
Hh('reed', 'Solomon Reed', 12, { name: 'Sleeper Agent', passive: true, text: 'Start of Combat: Halve the Attack of the four enemy minions with the highest Attack. Your Quickhacks cost (1) less RAM.',
  soc: (cs, side) => cs.allies(1 - side).sort((a, b) => b.atk - a.atk).slice(0, 4).forEach(t => { t.atk = Math.ceil(t.atk / 2); }) });
Hh('hands', 'Mr. Hands', 8, { name: 'Information Broker', passive: true, text: 'Your Tavern offers 2 more minions, and minions in it have +1/+1. Your first Refresh each turn is free.', sot: p => { p.freeRefresh += 1; } });
Hh('brigitte', 'Brigitte', 7, { name: 'Loa\'s Blessing', passive: true, text: 'Start of Combat: Give three random friendly minions stats equal to your Tavern Tier +2.',
  soc: (cs, side, p) => shuffle(cs.allies(side)).slice(0, 3).forEach(t => cs.buff(t, p.tier + 2, p.tier + 2)) });
Hh('royce', 'Royce', 6, { name: 'Chrome Harvest', cost: 1, target: 'shop', text: 'Destroy a minion in the Tavern. Give its stats to a random friendly minion.',
  use: (p, t) => { const i = p.shop.indexOf(t); if (i < 0) return; p.shop.splice(i, 1); returnToPool(t); const f = randOf(p.board); if (f) buff(f, t.atk, t.hp); } });
Hh('wakako', 'Wakako Okada', 8, { name: 'Westbrook Fixer', cost: 1, target: 'board', text: 'Give a friendly minion Kerenzikov and +2/+1. Gain 1 Honor.', use: (p, t) => { t.first = true; buff(t, 2, 1); p.honor = (p.honor || 0) + 1; } });
Hh('sasquatch', 'Sasquatch', 7, { name: 'Mall Queen', cost: 1, target: 'board', text: 'Double a friendly minion’s Health. Usable every other turn.', use: (p, t) => { p.hdata.cd = 2; buff(t, 0, t.hp); } });
Hh('rhino', 'Rhino', 8, { name: 'Iron Gym', passive: true, text: 'End of Turn: Give your minion with the most Health +2/+3.', eot: p => { if (p.board.length) buff(p.board.reduce((a, b) => b.hp > a.hp ? b : a), 2, 3); } });
Hh('lena', 'Dr. Lena Marsh', 8, { name: 'Gene Therapy', passive: true, text: 'Every other End of Turn: Grow a Clone on your board.', eot: p => { if (G.turn % 2 === 0) addClone(p); } });
Hh('kade', 'Kade Ortega', 8, { name: 'Biotech Venture', cost: 1, text: 'Gain 1 Mutation and grow a Clone.', use: p => { p.mutation = (p.mutation || 0) + 1; addClone(p); } });

// ---------------- shop ----------------
const HERO_CLANS = { hanako: 'ARA', yorinobu: 'ARA', saburo: 'ARA', goro: 'TYG', wakako: 'TYG', royce: 'MAE', smasher: 'MAE', meredith: 'MIL', reed: 'MIL', panam: 'ALD', river: 'ALD', jackie: 'VAL', v: 'VAL', placide: 'VDB', brigitte: 'VDB', alt: 'VDB', judy: 'MOX', evelyn: 'MOX', sasquatch: 'ANI', rhino: 'ANI', lena: 'BIO', kade: 'BIO' };
for (const id in HERO_CLANS) { const h = HEROES[id]; if (!h) continue; h.clan = HERO_CLANS[id]; }
function drawMinion(p) {
  const cands = CARD_LIST.filter(c => c.tier <= p.tier && inLobby(c) && G.pool[c.id] > 0);
  const clan = p.hero && p.hero.clan; const w = c => G.pool[c.id];
  let total = 0; for (const c of cands) total += w(c);
  if (!total) return null;
  let r = Math.random() * total;
  for (const c of cands) { r -= w(c); if (r < 0) { G.pool[c.id]--; const m = makeMinion(c.id); const tb = Math.floor(1.5 * (p.tier - 1)) + (p.hero.id === 'hands' ? 1 : 0); buff(m, p.tavBuff.a + tb, p.tavBuff.h + tb); return m; } }
  return null;
}
function rollOffers(mk) { const r = Math.random(); const n = r < .1 ? 3 : r < .35 ? 2 : 1; return Array.from({ length: n }, mk); }
function refreshShop(p, extra) {
  for (const m of p.shop) returnToPool(m);
  p.shop = [];
  const n = shopSize(p) + (extra || 0);
  for (let i = 0; i < n; i++) { const m = drawMinion(p); if (m) p.shop.push(m); }
  p.shopSpells = rollOffers(() => makeSpell(randomSpellId(p)));
  p.shopWares = rollOffers(() => makeWare(randomWareId(p)));
  p.frozen = false;
}

// ---------------- actions ----------------
function actRefresh(p) {
  if (p.freeRefresh > 0) { p.freeRefresh--; refreshShop(p); return true; }
  if (p.gold < 1) return false; p.gold -= 1; p.spent += 1; refreshShop(p); return true;
}
function actFreeze(p) { p.frozen = !p.frozen; return true; }
function actUpgrade(p) {
  if (p.tier >= 6) return false; const c = upgradeCost(p); if (p.gold < c) return false;
  p.gold -= c; p.spent += c; p.tier++; p.upCost = UPC[p.tier + 1] || 0;
  if (!p.frozen) refreshShop(p);
  const nm = ramMax(p); p.ram += Math.max(0, nm - p.ramCap); p.ramCap = nm;
  if (p.hero.power.onUpgrade) p.hero.power.onUpgrade(p);
  return true;
}
function actBuy(p, idx) {
  const price = buyCost(p);
  const m = p.shop[idx]; if (!m || p.gold < price || p.hand.length >= HAND_MAX) return false;
  p.gold -= price; p.spent += price; p.boughtThisTurn = true; p.shop.splice(idx, 1); p.hand.push(m);
  for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onBuyFriendly) c.onBuyFriendly(p, x, m); }
  checkTriple(p);
  return true;
}
function actBuySpell(p, i) {
  i = i || 0; const s = p.shopSpells[i]; if (!s || p.hand.length >= HAND_MAX) return false;
  const cost = spellCost(p, s); if (p.ram < cost) return false;
  p.ram -= cost; p.shopSpells.splice(i, 1); p.hand.push(s); return true;
}
function actBuyWare(p, i) {
  i = i || 0; const w = p.shopWares[i]; if (!w || p.hand.length >= HAND_MAX) return false;
  const cost = wareCost(p, w); if (p.gold < cost) return false;
  p.gold -= cost; p.spent += cost; p.shopWares.splice(i, 1); p.hand.push(w); return true;
}
function actSell(p, idx) {
  const m = p.board[idx]; if (!m) return false;
  p.board.splice(idx, 1); returnToPool(m); syncRam(p);
  if (m.id !== 'tok_clone') p.gold = Math.min(p.gold + 3, 99);
  if (p.hero.power.onSell) p.hero.power.onSell(p, m);
  for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onSellFriendly) c.onSellFriendly(p, x, m); }
  return true;
}
function validTargets(p, filter, self) { return p.board.filter(x => x !== self && filter(x)); }
function bcFilter(c) { if (!c.target) return null; return c.target === 'friendly' ? (() => true) : (x => x.tribe === c.target); }
function needsTarget(p, card) {
  if (card.kind === 'ware') return p.board.length ? 'board' : 'none';
  if (card.kind === 'spell') { const s = SPELLS[card.id]; if (!s.target) return false; return validTargets(p, s.tfilter || (() => true)).length > 0 ? 'board' : 'none'; }
  const c = CARDS[card.id]; const f = bcFilter(c); if (!f) return false; return validTargets(p, f, card).length > 0 ? 'board' : false;
}
function absorbEngram(p, m) { }
function actPlay(p, hIdx, pos, target) {
  const m = p.hand[hIdx]; if (!m) return false;
  if (m.kind === 'spell') return actCast(p, hIdx, target);
  if (m.kind === 'ware') return actInstall(p, hIdx, target);
  const c = CARDS[m.id]; const f = bcFilter(c);
  if (f && target && (!p.board.includes(target) || !f(target))) target = null;
  if (f && !target) { const v = validTargets(p, f, m); if (v.length) target = pick(v); }
  p.hand.splice(hIdx, 1);
  pos = Math.max(0, Math.min(pos == null ? p.board.length : pos, p.board.length));
  p.board.splice(pos, 0, m);
  absorbEngram(p, m);
  if (hasPerk(p, 'pk_val1')) m.loy = Math.max(m.loy || 0, 2);
  if (c.bc) { const n = bcMult(p); for (let i = 0; i < n; i++) { if (target && !p.board.includes(target)) target = null; c.bc(p, m, target); } }
  for (const x of p.board.slice()) { if (x === m) continue; const cx = CARDS[x.id]; if (cx.onPlayFriendly) cx.onPlayFriendly(p, x, m); }
  for (const pk of p.perks) if (PERKS[pk.id].onPlay) PERKS[pk.id].onPlay(p, m);
  if (m.tripleReward) { m.tripleReward = false; discoverMinion(p, Math.min(6, p.tier + 1)); }
  syncRam(p);
  return true;
}
function syncRam(p) { const nm = ramMax(p); if (nm > p.ramCap) { p.ram += nm - p.ramCap; p.ramCap = nm; } else if (nm < p.ramCap) { p.ramCap = nm; p.ram = Math.min(p.ram, nm); } }
function actInstall(p, hIdx, target) {
  const w = p.hand[hIdx]; if (!w || w.kind !== 'ware') return false;
  if (!target || !p.board.includes(target)) return false;
  p.hand.splice(hIdx, 1);
  installWare(p, target, w.id);
  return true;
}
function actCast(p, hIdx, target) {
  const sp = p.hand[hIdx]; if (!sp || sp.kind !== 'spell') return false;
  const s = SPELLS[sp.id];
  if (s.target) {
    const f = s.tfilter || (() => true);
    if (!target || !p.board.includes(target) || !f(target)) { const v = validTargets(p, f); if (!v.length) return false; target = pick(v); }
  }
  p.hand.splice(hIdx, 1); p.hacksCast = (p.hacksCast || 0) + 1;
  const n = spellMult(p); p.loaUsed = true;
  for (let i = 0; i < n; i++) { if (s.target && !p.board.includes(target)) break; s.cast(p, target); }
  for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.onSpell) c.onSpell(p, x, s); }
  if (p.hero.id === 'placide') { const t = randOf(p.board); if (t) buff(t, 3, 3); }
  return true;
}
function heroPowerUsable(p) {
  const hp = p.hero.power; if (hp.passive || p.hpUsed) return false;
  if (hp.once && p.hdata.used) return false;
  if (p.hdata.cd > 0) return false;
  if (hp.target === 'shop' && p.hero.id === 'evelyn' && p.hand.length >= HAND_MAX) return false;
  if (p.gold < hp.cost) return false;
  if (hp.target === 'board' && !p.board.filter(hp.tfilter || (() => true)).length) return false;
  if (hp.target === 'shop' && !p.shop.length) return false;
  if (p.hero.id === 'yorinobu') { if (p.hand.length >= HAND_MAX) return false; const o = G.players.find(x => x.id === p.nextOpp); const b = o ? o.board : (((G.pairs || []).flat().find(x => x.isGhost)) || {}).board || []; if (!b.some(x => CARDS[x.id] && !CARDS[x.id].token)) return false; }
  if (p.hero.id === 'songbird' && p.hand.length >= HAND_MAX) return false;
  return true;
}
function actHeroPower(p, target) {
  if (!heroPowerUsable(p)) return false; const hp = p.hero.power;
  if (hp.target === 'board' && (!target || !p.board.includes(target) || (hp.tfilter && !hp.tfilter(target)))) return false;
  if (hp.target === 'shop' && (!target || !p.shop.includes(target))) return false;
  p.gold -= hp.cost; p.spent += hp.cost; p.hpUsed = 1; hp.use(p, target); return true;
}
function actPickPerk(p, id) {
  const im = PERKS[id]; if (p.gold < im.cost) return false;
  p.gold -= im.cost; p.spent += im.cost; p.perks.push({ id }); if (im.acquire) im.acquire(p);
  if (id === 'pk_ram') { p.ramCap = ramMax(p); p.ram += 2; }
  return true;
}
function actReorder(p, from, to) {
  const m = p.board.splice(from, 1)[0]; if (!m) return false;
  to = Math.max(0, Math.min(to, p.board.length)); p.board.splice(to, 0, m); return true;
}
function checkTriple(p) {
  let found = true;
  while (found) {
    found = false;
    const groups = {};
    for (const m of p.board.concat(p.hand)) if (m.kind === 'minion' && !m.golden && !CARDS[m.id].token) (groups[m.id] = groups[m.id] || []).push(m);
    for (const id in groups) {
      const g = groups[id]; if (g.length < 3) continue;
      const three = g.slice(0, 3); const c = CARDS[id];
      const gm2 = makeMinion(id, true);
      gm2.atk = three.reduce((s, x) => s + x.atk, 0);
      gm2.hp = three.reduce((s, x) => s + x.hp, 0);
      for (const x of three) { for (const k of Object.keys(KW)) if (x[k]) gm2[k] = true; gm2.ware.push(...(x.ware || [])); gm2.humMod += (x.humMod || 0); }
      { const wasPsy = three.some(x => isPsycho(x, p)); if (!wasPsy) gm2.humMod += Math.max(0, humUsed(gm2) - humMax(gm2, p)); }
      gm2.tripleReward = true;
      for (const x of three) { let i = p.board.indexOf(x); if (i >= 0) p.board.splice(i, 1); else { i = p.hand.indexOf(x); if (i >= 0) p.hand.splice(i, 1); } }
      p.hand.push(gm2); p.triples++;
      emit('triple', { p, m: gm2 });
      found = true; break;
    }
  }
}

// ---------------- COMBAT ----------------
function psyMult(p, m) { return (m && m.tribe === 'MAE' ? 4 : 2) + cntId(p.board || [], 'mae_frenzy'); }
function snap(m) { return { uid: m.uid, id: m.id, atk: m.atk, hp: m.hp, golden: m.golden, taunt: !!m.taunt, shield: !!m.shield, reborn: !!m.reborn, venom: !!m.venom, windfury: !!m.windfury, cleave: !!m.cleave, stealth: !!m.stealth, first: !!m.first, smash: !!m.smash, psycho: !!m.psycho, ware: (m.ware || []).slice(), humMod: m.humMod || 0, loy: m.loy || 0 }; }
function hooksOf(m) { const l = [CARDS[m.id]]; for (const w of (m.ware || [])) l.push(WARE[w]); for (const w of (m.tware || [])) l.push(WARE[w]); return l; }
class Combat {
  constructor(pa, pb, record) {
    this.record = record; this.frames = []; this.hits = []; this.permLog = []; this.engramLog = [0, 0].map(() => ({ a: 0, h: 0 }));
    this.gain = [0, 1].map(() => ({ honor: 0, mut: 0 }));
    this.sides = [pa, pb].map((p, i) => ({ p, i, b: p.board.map(m => this.clone(m, i, p)), ptr: 0, deaths: 0, noFF: false }));
  }
  clone(m, side, p) {
    const c = Object.assign({}, m); c.src = m.uid; c.uid = UID++; c.side = side; c.dead = false; c.ware = (m.ware || []).slice(); c.tware = [];
    c.psycho = !p.isGhost ? isPsycho(m, p) : !!m.psycho;
    const [ea, eh] = engBonus(p, m); c.atk += ea; c.hp += eh;
    if (c.psycho) { c.atk *= psyMult(p, c); if (c.tribe === 'MAE') c.hp *= 4; }
    c.ma = c.atk; c.mx = c.hp;
    return c;
  }
  allies(side) { return this.sides[side].b.filter(x => x.hp > 0 && !x.dead); }
  adj(m, side) { const b = this.allies(side); const i = b.indexOf(m); return [b[i - 1], b[i + 1]].filter(Boolean); }
  buff(m, a, h) { a = Math.ceil(a); h = Math.ceil(h); m.atk = Math.max(0, m.atk + a); m.hp += h; if (h > 0 && m.mx != null) m.mx += h; if (a > 0 && m.ma != null) m.ma += a; }
  perm(m, a, h) { this.buff(m, a, h); if (m.src) this.permLog.push([m.side, m.src, a, h]); }
  engram(side, a, h) { this.engramLog[side].a += a; this.engramLog[side].h += h; }
  tempWare(m, wid) { const w = WARE[wid]; this.buff(m, w.atk || 0, w.hp || 0); for (const k of (w.kw || [])) m[k] = true; m.tware.push(wid); }
  hit(m, n, kind) { if (this.record) this.hits.push({ uid: m.uid, n, kind }); }
  frame(type, extra) {
    if (!this.record) return;
    this.frames.push(Object.assign({ type, L: this.sides[0].b.filter(x => !x.dead).map(snap), R: this.sides[1].b.filter(x => !x.dead).map(snap), hits: this.hits }, extra || {}));
    this.hits = [];
  }
  call(m, hook, ...args) { for (const h of hooksOf(m)) if (h[hook]) h[hook](this, m, ...args); }
  spawnClone(side, pos) {
    const p = this.sides[side].p; const st = cloneStat(p); const m = this.summon(side, 'tok_clone', pos, false); if (!m) return null;
    m.atk = st; m.hp = st;
    const k = this.allies(side).reduce((s, x) => s + (x.id === 'bio_splicer' ? gm(x) : 0), 0); if (k && !p.isGhost && p.splTurn !== G.turn && !(this.splDone || (this.splDone = {}))[side]) { this.splDone[side] = true; this.gain[side].mut += k; }
    return m;
  }
  summon(side, id, pos, golden) {
    const s = this.sides[side]; if (s.b.length >= COMBAT_CAP) return null;
    const m = makeMinion(id, golden); m.side = side; m.src = null; m.tware = []; m.ma = m.atk; m.mx = m.hp;
    pos = Math.max(0, Math.min(pos == null ? s.b.length : pos, s.b.length));
    s.b.splice(pos, 0, m);
    return m;
  }
  damage(t, n, src) {
    if (!t || t.dead || n <= 0) return 0;
    if (t.shield) {
      t.shield = false; this.hit(t, 0, 'shield');
      for (const x of this.sides[t.side].b.slice()) { if (x.dead) continue; this.call(x, 'onShieldLostC', t.side, t); }
      return 0;
    }
    const before = t.hp;
    t.hp -= n; this.hit(t, n, 'dmg');
    if (src && src.venom && t.hp > 0) { t.hp = 0; src.venom = false; }
    else if (src && src.venom) src.venom = false;
    if (t.hp > 0) { this.call(t, 'onDamagedC', t.side); for (const x of this.sides[t.side].b) if (x !== t && !x.dead && x.hp > 0 && CARDS[x.id].onFriendlyDamagedC) CARDS[x.id].onFriendlyDamagedC(this, x, t.side, t); }
    else if (src && src.side != null && src.side !== t.side && src.hp > 0 && !t._killed) {
      t._killed = true;
      if (src.tribe === 'TYG') { this.gain[src.side].honor += 1 + cntId(this.allies(src.side), 'tyg_wraith'); if (hasPerk(this.sides[src.side].p, 'pk_tyg2')) this.perm(src, 2, 2); }
      this.call(src, 'onKillC', src.side, t);
      this.call(src, 'onKillFriendlyC', src.side, src, t);
      for (const x of this.allies(src.side)) if (x !== src) this.call(x, 'onKillFriendlyC', src.side, src, t);
    }
    return Math.max(0, n - Math.max(0, before));
  }
  resolveDeaths() {
    let guard = 0;
    while (guard++ < 500) {
      let any = false;
      for (const side of [0, 1]) {
        const s = this.sides[side];
        while (true) {
          const pos = s.b.findIndex(x => x.hp <= 0 && !x.dead);
          if (pos < 0) break;
          any = true;
          const m = s.b[pos]; m.dead = true; s.b.splice(pos, 1); s.deaths++;
          for (const h of hooksOf(m)) if (h.dr) h.dr(this, m, side, pos);
          if (m.reborn) { const r = this.summon(side, m.id, pos, m.golden); if (r) { r.hp = 1; r.reborn = false; } }
          for (const x of s.b.slice()) { if (x.dead || x.hp <= 0) continue; this.call(x, 'onFriendlyDeathC', side, m); }
          if (!s.p.isGhost && hasPerk(s.p, 'pk_mox2')) { const t = randOf(this.allies(side).filter(x => x.tribe !== m.tribe)); if (t) this.buff(t, 2, 2); }
        }
      }
      if (!any) break;
    }
  }
  canAttack(side) { return this.allies(side).some(x => x.atk > 0) && this.allies(1 - side).length > 0; }
  attackStep(side) {
    const s = this.sides[side]; const b = s.b; const n = b.length;
    let att = null, ai = -1;
    for (let i = 0; i < n; i++) { const j = (s.ptr + i) % n; if (b[j].atk > 0 && b[j].hp > 0) { att = b[j]; ai = j; break; } }
    if (!att) return false;
    const leftSet = new Set(b.slice(0, ai).map(x => x.uid));
    att._again = false;
    let times = att.windfury ? 2 : 1;
    for (let t = 0; t < times; t++) {
      if (att.dead || att.hp <= 0 || !this.allies(1 - side).length) break;
      this.doAttack(att, side);
    }
    const nb = s.b;
    if (!att.dead) s.ptr = nb.indexOf(att) + 1;
    else s.ptr = nb.filter(x => leftSet.has(x.uid)).length;
    if (s.ptr >= nb.length) s.ptr = 0;
    return true;
  }
  extraAttack(m, side) { this._extra = this._extra || []; this._extra.push([m, side]); }
  pickTarget(a, side) {
    const enemies = this.allies(1 - side);
    if (a.turncoat) { const fr = this.allies(side).filter(x => x !== a); if (fr.length) return pick(fr); }
    if (a.psycho) {
      const gl = cntId(this.allies(side), 'mae_glitch');
      const friends = this.allies(side).filter(x => x !== a);
      const ff = PSYCHO_FRIENDLY_FIRE / (gl ? 2 * gl : 1);
      if (friends.length && Math.random() < ff) return pick(friends);
      return pick(enemies);
    }
    if (CARDS[a.id].attackLowest) { const mn = Math.min(...enemies.map(x => x.atk)); return pick(enemies.filter(x => x.atk === mn)); }
    const vis = enemies.filter(x => !x.stealth); const base = vis.length ? vis : enemies;
    const taunts = base.filter(x => x.taunt);
    return pick(taunts.length ? taunts : base);
  }
  doAttack(a, side) {
    const t = this.pickTarget(a, side);
    if (!t) return;
    const ff = t.side === side;
    if (this.record) this.frame('atk', { a: a.uid, t: t.uid, ff });
    a.stealth = false;
    this.call(a, 'beforeAttackC', side, t);
    const tb = this.sides[t.side].b; const ti = tb.indexOf(t);
    const nbs = a.cleave ? [tb[ti - 1], tb[ti + 1]].filter(x => x && !x.dead && x !== a) : [];
    const venom = a.venom;
    const da = CARDS[a.id].hpAttack ? a.hp : a.atk;
    let excess = 0;
    if (a.first) {
      excess = this.damage(t, da, a);
      for (const x of nbs) { if (venom) a.venom = a.venom || venom; this.damage(x, da, a); }
      if (t.hp > 0) this.damage(a, t.atk, t);
    } else {
      const dt = t.atk;
      excess = this.damage(t, da, a);
      for (const x of nbs) { if (venom) a.venom = a.venom || venom; this.damage(x, da, a); }
      this.damage(a, dt, t);
    }
    if (a.smash && excess > 0 && !ff) { const nx = this.allies(1 - side).filter(x => x !== t && x.hp > 0); const i = tb.indexOf(t); const next = tb.slice(i + 1).find(x => !x.dead && x.hp > 0) || nx[0]; if (next) this.damage(next, excess, a); }
    if (a.hp > 0 && !a.dead) this.call(a, 'afterAttackC', side);
    for (const x of this.allies(side)) if (x !== a) this.call(x, 'onFriendlyAttackC', side, a);
    this.resolveDeaths();
    this.frame('state');
    if (this._extra && this._extra.length) {
      const [m, s2] = this._extra.shift();
      if (!m.dead && m.hp > 0 && this.allies(1 - s2).length) this.doAttack(m, s2);
    }
  }
  run() {
    const sa = this.sides[0], sb = this.sides[1];
    let first = sa.b.length > sb.b.length ? 0 : sb.b.length > sa.b.length ? 1 : rnd(2);
    this.frame('state');
    const order = [first, 1 - first];
    for (const side of order) {
      const p = this.sides[side].p;
      if (p.hero && p.hero.power.soc && !p.isGhost) p.hero.power.soc(this, side, p);
      for (const pk of (p.perks || [])) { const d = PERKS[pk.id]; if (d.soc) d.soc(this, side); }
      for (const h of (p.hacks || [])) HACKS[h](this, side);
      if (p.bd && !p.isGhost) { const c = this.summon(side, p.bd.id, this.sides[side].b.length, p.bd.golden); if (c) { const keep = { uid: c.uid, side, src: null, tware: [] }; Object.assign(c, p.bd, keep); c.dead = false; c.psycho = isPsycho(p.bd, p); if (c.psycho) { c.atk *= psyMult(p, c); if (c.tribe === 'MAE') c.hp *= 4; } c.ma = c.atk; c.mx = c.hp; } }
    }
    this.resolveDeaths();
    for (const side of order) {
      const p = this.sides[side].p;
      const times = (p.perks || []).some(i => i.id === 'pk_tactician') ? 2 : 1;
      for (const m of this.sides[side].b.slice()) {
        for (const h of hooksOf(m)) if (h.soc) for (let k = 0; k < times; k++) if (!m.dead && m.hp > 0) h.soc(this, m, side);
      }
    }
    this.resolveDeaths();
    this.frame('state');
    let turn = first, guard = 0;
    while (this.allies(0).length && this.allies(1).length && guard++ < 3000) {
      if (this.canAttack(turn)) this.attackStep(turn);
      else if (!this.canAttack(1 - turn)) break;
      turn = 1 - turn;
    }
    const la = this.allies(0), lb = this.allies(1);
    let winner = -1;
    if (la.length && !lb.length) winner = 0; else if (lb.length && !la.length) winner = 1;
    let dmg = 0;
    if (winner >= 0) { const w = this.sides[winner]; dmg = w.p.tier + this.allies(winner).reduce((s, x) => s + CARDS[x.id].tier, 0); }
    return { winner, dmg, frames: this.frames, permLog: this.permLog, engramLog: this.engramLog, gain: this.gain };
  }
}

// ---------------- game flow ----------------
function pickTribes() { return shuffle(Object.keys(TRIBES).slice()).slice(0, 5); }
function newGame(humanHeroId, humanName, aiHeroIds, tribes, strategies, diff) {
  const tribeKeys = tribes || pickTribes();
  G = { turn: 0, players: [], pool: {}, tribes: tribeKeys, dead: [], over: false, diff: diff || 0 };
  for (const c of CARD_LIST) if (inLobby(c)) G.pool[c.id] = POOL_COUNT[c.tier];
  const heroes = [humanHeroId].concat(aiHeroIds);
  heroes.forEach((hid, i) => {
    const h = HEROES[hid];
    G.players.push({ id: i, name: i === 0 ? (humanName || 'You') : h.name, isAI: i !== 0, hero: h, hp: 40, armor: h.armor, tier: 1, upCost: UPC[2], gold: 0,
      ram: 0, ramCap: 3, ramBonus: 0, hacks: [], engram: { a: 0, h: 0 },
      board: [], hand: [], shop: [], shopSpells: [], shopWares: [], frozen: false, hpUsed: 0, perks: [], tavBuff: { a: 0, h: 0 }, freeRefresh: 0, nextGold: 0,
      spent: 0, arsenal: 0, honor: 0, mutation: 0, hacksCast: 0, ramCarry: 0, maxtacLost: 0, alive: true, lastOpp: null, nextOpp: null, placement: 0, pending: [], hdata: {}, triples: 0, lastSeen: [], heartUsed: false, lastResult: null, stash: 0,
      ai: Object.assign({ lvlBias: rnd(3) - 1, fav: null }, STRATS[(strategies && strategies[i]) || pick(Object.keys(STRATS))]) });
  });
  return G;
}
// a faction's heroes only appear when that faction is in the game
function heroChoices(n, exclude, tribes) { return shuffle(HERO_LIST.filter(h => !(exclude || []).includes(h.id) && (!h.clan || !tribes || tribes.includes(h.clan))).slice()).slice(0, n); }
function alivePlayers() { return G.players.filter(p => p.alive); }
function pairUp() {
  const alive = alivePlayers();
  let list = alive.slice();
  if (list.length % 2 === 1) { const d = G.dead[G.dead.length - 1]; list.push({ isGhost: true, id: 'ghost', name: d ? d.name : 'Ghost', hero: d ? d.hero : HERO_LIST[0], tier: d ? d.tier : 1, board: d ? d.lastBoard : [], perks: [], ghostOf: d ? d.id : null }); }
  let best = null, bestScore = 1e9;
  for (let t = 0; t < 60; t++) {
    const sh = shuffle(list.slice()); let sc = 0; const pairs = [];
    for (let i = 0; i < sh.length; i += 2) {
      const a = sh[i], b = sh[i + 1];
      if (a.lastOpp === b.id || b.lastOpp === a.id) sc += 10;
      pairs.push([a, b]);
    }
    if (sc < bestScore) { bestScore = sc; best = pairs; if (sc === 0) break; }
  }
  G.pairs = best;
  for (const [a, b] of best) { a.nextOpp = b.id; b.nextOpp = a.id; }
}
function startTurnFor(p) {
    p.gold = Math.min(10, G.turn + 2) + p.nextGold; p.nextGold = 0;
    if (G.turn > 1 && p.tier < 6) p.upCost = Math.max(0, p.upCost - 1);
    p.hpUsed = 0; p.freeRefresh = 0; p.hacks = []; p.boughtThisTurn = false;
    if (p.hdata.cd > 0) p.hdata.cd--;
    if (p.winBonus) { p.gold += p.winBonus; p.winBonus = 0; }
    p.spent = 0; p.loaUsed = false;
    if (G.turn > 1) maxTacSweep(p);
    { const ch = cntId(p.board, 'val_chapel'); for (const x of p.board) x.loy = (x.loy || 0) + 1 + ch; }
    p.ramCap = ramMax(p); p.ram = p.ramCap + (p.ramCarry || 0); p.ramCarry = 0;
    for (const pk of p.perks) { const d = PERKS[pk.id]; if (d.sot) d.sot(p); }
    for (const x of p.board.slice()) { const c = CARDS[x.id]; if (c.sot) c.sot(p, x); }
    if (p.hero.power.sot) p.hero.power.sot(p);
    if (p.frozen) { p.frozen = false; if (!p.shopSpells.length) p.shopSpells = rollOffers(() => makeSpell(randomSpellId(p))); if (!p.shopWares.length) p.shopWares = rollOffers(() => makeWare(randomWareId(p))); }
    else refreshShop(p);
    if (G.turn === 6 || G.turn === 9) {
      const greater = G.turn === 9;
      const pool = PERK_LIST.filter(i => i.greater === greater && !p.perks.some(x => x.id === i.id) && (!i.tribe || G.tribes.includes(i.tribe)));
      const wt = i => i.tribe ? .7 + 1.6 * Math.min(5, boardOf(p, i.tribe).length) : 1.2;
      const opts = [];
      while (opts.length < 4 && pool.length) { let tot = pool.reduce((a, i) => a + wt(i), 0), r = Math.random() * tot, k = 0; for (; k < pool.length - 1; k++) { r -= wt(pool[k]); if (r < 0) break; } opts.push(pool.splice(k, 1)[0]); }
      queue(p, { type: 'perk', opts: opts.map(o => o.id) });
    }

}
function aiTakeTurn(p) { const d = p.diff != null ? p.diff : G.diff; if (d) aiSearchTurn(p, d); else aiTurn(p); }
// defer: bots think later, one at a time (aiStep), so the interface never freezes; endTurnAll finishes any that are left
function startTurn(defer) {
  G.turn++;
  for (const p of alivePlayers()) startTurnFor(p);
  pairUp();
  G.aiQueue = alivePlayers().filter(p => p.isAI);
  if (!defer) while (G.aiQueue.length) aiTakeTurn(G.aiQueue.shift());
}
function aiStep() { const p = G.aiQueue && G.aiQueue.shift(); if (p) aiTakeTurn(p); return !!(G.aiQueue && G.aiQueue.length); }
function endOfTurnFor(p) {
    while (p.pending.length) aiResolvePendingOne(p);
    const cap = cntId(p.board, 'ald_captain') + (hasPerk(p, 'pk_ald2') ? 1 : 0);
    for (const x of p.board.slice()) { const c = CARDS[x.id]; if (!c.eot || !p.board.includes(x)) continue; const n = cap && x.tribe === 'ALD' && (x.id !== 'ald_captain' || hasPerk(p, 'pk_ald2')) ? cap + 1 : 1; for (let k = 0; k < n; k++) c.eot(p, x); }
    for (const x of p.board.slice()) for (const wid of (x.ware || []).slice()) { const w = WARE[wid]; if (w && w.eot) w.eot(p, x); }
    for (const pk of p.perks) { const d = PERKS[pk.id]; if (d.eot) d.eot(p); }
    if (p.hero.power.eot) p.hero.power.eot(p);

}
function endTurnAll() {
  while (G.aiQueue && G.aiQueue.length) aiTakeTurn(G.aiQueue.shift());
  for (const p of alivePlayers()) endOfTurnFor(p);
  const results = [];
  const human = G.players[0];
  for (const [a, b] of G.pairs) {
    const rec = G.multi ? !!(a.human || b.human) : (a === human || b === human);
    const [x, y] = (G.multi ? (b.human && !a.human) : b === human) ? [b, a] : [a, b];
    const cs = new Combat(x, y, rec);
    const r = cs.run();
    results.push({ a: x, b: y, r, rec });
    for (const [side, src, at, h] of r.permLog) { const pl = side === 0 ? x : y; if (pl.isGhost) continue; const m = pl.board.find(mm => mm.uid === src); if (m) buff(m, at, h); }
    [x, y].forEach((pl, s) => { if (!pl.isGhost) { addEngram(pl, r.engramLog[s].a, r.engramLog[s].h); pl.honor = (pl.honor || 0) + r.gain[s].honor; pl.mutation = (pl.mutation || 0) + r.gain[s].mut; pl.bd = null; } });
  }
  return results;
}
function damageCap() { return G.turn <= 3 ? 5 : G.turn <= 7 ? 10 : (alivePlayers().length > 4 ? 15 : 999); }
function applyResults(results) {
  const capT = damageCap();
  for (const { a, b, r } of results) {
    for (const [p, o, s] of [[a, b, 0], [b, a, 1]]) {
      if (p.isGhost) continue;
      p.lastOpp = o.id;
      p.lastResult = r.winner === -1 ? 'T' : r.winner === s ? 'W' : 'L';
      p.lastOppName = o.name;
      if (r.winner === 1 - s) {
        const d = Math.min(capT, r.dmg); p.lastDmg = d;
        let n = d; const ar = Math.min(p.armor, n); p.armor -= ar; n -= ar; p.hp -= n;
        if (p.hp <= 0 && hasPerk(p, 'pk_secondwind') && !p.heartUsed) { p.heartUsed = true; p.hp = 10; }
      } else p.lastDmg = 0;
      if (r.winner === s && p.hero.id === 'jackie') p.winBonus = (p.winBonus || 0) + 3;
    }
  }
  for (const p of G.players) p.lastSeen = p.board.map(snap);
  const dying = alivePlayers().filter(p => p.hp <= 0).sort((x, y) => (x.hp + x.armor) - (y.hp + y.armor));
  let place = alivePlayers().length;
  for (const p of dying) {
    p.alive = false; p.placement = place--;
    p.lastBoard = p.board.map(m => { const e = effStats(m, p); return Object.assign({}, m, { psycho: isPsycho(m, p), atk: e.atk, hp: e.hp }); });
    for (const m of p.board) returnToPool(m); for (const m of p.shop) returnToPool(m); p.shop = [];
    G.dead.push(p);
  }
  const alive = alivePlayers();
  if (alive.length <= 1) { if (alive[0]) alive[0].placement = 1; G.over = true; }
  if (G.multi) { if (!G.players.some(p => p.human && p.alive)) G.over = true; }
  else if (!G.players[0].alive) G.over = true;
}

// ---------------- AI ----------------
// Strategy profiles used by AI players and the balance simulator
const STRATS = {
  balanced: { name: 'balanced', lvl: 0, buyBias: 0, ware: 1, hacks: 1, tribeFocus: 1.3, psycho: 0 },
  fastlevel: { name: 'fastlevel', lvl: -1, buyBias: 0, ware: .6, hacks: .6, tribeFocus: 1.0, psycho: 0 },
  tempo: { name: 'tempo', lvl: 2, buyBias: -2, ware: 1, hacks: 1, tribeFocus: 1.0, psycho: 0 },
  tribal: { name: 'tribal', lvl: 0, buyBias: 0, ware: .8, hacks: .8, tribeFocus: 3.0, psycho: 0 },
  chrome: { name: 'chrome', lvl: 0, buyBias: 0, ware: 2.5, hacks: .5, tribeFocus: 1.2, psycho: 1 },
  netrunner: { name: 'netrunner', lvl: 0, buyBias: 0, ware: .5, hacks: 2.5, tribeFocus: 1.2, psycho: 0 },
  psycho: { name: 'psycho', lvl: 0, buyBias: 0, ware: 3, hacks: .5, tribeFocus: 1.2, psycho: 2 },
  fullram: { name: 'fullram', lvl: 0, buyBias: 0, ware: .4, hacks: .6, tribeFocus: 1.2, psycho: 0, hoard: true },
  mono: { name: 'mono', lvl: 0, buyBias: -1, ware: .8, hacks: .8, tribeFocus: 6, psycho: 0 },
};
function aiScoreCard(p, c, m) {
  const st = p.ai;
  let s = c.tier * 3 + ((m ? m.atk + m.hp : c.atk + c.hp)) * 0.45;
  for (const k of c.kw) s += { shield: 2.5, taunt: 1, reborn: 2, venom: 3, windfury: 2, cleave: 2, first: 1.5, smash: 1.5, stealth: .5 }[k] || 0;
  if (c.tribe) { const cnt = p.board.filter(x => x.tribe === c.tribe).length + p.hand.filter(x => x.kind === 'minion' && x.tribe === c.tribe).length; s += cnt * st.tribeFocus; if (p.ai.fav === c.tribe) s += 1.5 * st.tribeFocus; }
  const copies = p.board.concat(p.hand).filter(x => x.id === c.id && !x.golden).length;
  s += copies * 5;
  if (c.id === 'n_delamain' || c.id === 'vdb_rache' || c.id === 'mil_behemoth') s += 3;
  if (st.psycho && c.tribe === 'MAE') s += 2 * st.psycho;
  if (st.hoard && ['vdb_netrunner', 'vdb_cache', 'vdb_overflow', 'vdb_coder', 'vdb_blackwall'].includes(c.id)) s += 6;
  if (st.forceTribe) s += c.tribe === st.forceTribe ? 8 : -3;
  if (st.lean) s += c.tribe === st.lean ? 4 : 0;
  if (st.ware > 1.5 && c.tribe === 'MIL') s += 2;
  if (st.hacks > 1.5 && c.tribe === 'VDB') s += 2;
  return s;
}
function aiFav(p) {
  const cnt = {}; for (const x of p.board) if (x.tribe) cnt[x.tribe] = (cnt[x.tribe] || 0) + 1;
  let best = null, bv = 0; for (const k in cnt) if (cnt[k] > bv) { bv = cnt[k]; best = k; }
  if (p.ai.lean) { p.ai.fav = p.ai.lean; return; }
  if (bv >= 3) p.ai.fav = best;
}
function aiBestTarget(p, list) { if (!list.length) return null; return list.reduce((a, b) => (b.atk * 1.2 + b.hp) > (a.atk * 1.2 + a.hp) ? b : a); }
function aiResolvePendingOne(p) {
  const it = p.pending.shift(); if (!it) return;
  if (it.type === 'discover') {
    let best = it.opts[0];
    if (it.kind === 'minion') { let bv = -1; for (const id of it.opts) { const v = aiScoreCard(p, CARDS[id]); if (v > bv) { bv = v; best = id; } } }
    else best = pick(it.opts);
    it.onPick(best);
  } else if (it.type === 'perk') {
    const aff = it.opts.filter(id => PERKS[id].cost <= p.gold);
    const choice = aff.length ? aff.reduce((a, b) => PERKS[b].cost > PERKS[a].cost ? b : a) : it.opts.reduce((a, b) => PERKS[b].cost < PERKS[a].cost ? b : a);
    if (!actPickPerk(p, choice)) { const cheap = it.opts.filter(id => PERKS[id].cost <= p.gold); if (cheap.length) actPickPerk(p, cheap[0]); }
  }
}
function aiResolvePending(p) { while (p.pending.length) aiResolvePendingOne(p); }
const LEVEL_TURN = { 2: 2, 3: 4, 4: 6, 5: 8, 6: 10 };
function aiWareTarget(p, wid) {
  const w = WARE[wid];
  const ok = p.board.filter(m => {
    if ((w.kw || []).some(k => m[k])) return false;
    const after = humUsed(m) + w.hum;
    const loves = m.tribe === 'MAE' || (p.ai.psycho && m.atk >= (p.ai.psycho > 1 ? 3 : 6));
    return loves || after <= humMax(m, p);
  });
  if (!ok.length && (p.hand.length >= 5 || p.hero.id === 'smasher')) return aiBestTarget(p, p.board.filter(m => !(w.kw || []).some(k => m[k])));
  return aiBestTarget(p, ok.length ? ok : []);
}
function aiPlayHand(p) {
  let guard = 0;
  while (p.hand.length && guard++ < 40) {
    const card = p.hand[0];
    if (card.kind === 'ware') {
      const t = aiWareTarget(p, card.id);
      if (!t) { if (p.hand.every(x => x.kind === 'ware')) break; p.hand.push(p.hand.shift()); continue; }
      actInstall(p, 0, t); continue;
    }
    if (card.kind === 'spell') {
      const s = SPELLS[card.id]; let t = null;
      if (s.target) {
        const f = s.tfilter || (() => true);
        let v = validTargets(p, f);
        if (s.id === 'sp_contagion') v = v.filter(x => !x.venom); if (s.id === 'sp_sonic') v = v.filter(x => !x.shield); if (s.id === 'sp_reset') v = v.filter(x => !x.reborn);
        if (s.id === 'sp_wipe') v = v.filter(x => isPsycho(x, p) && x.tribe !== 'MAE');
        if (s.id === 'sp_psychosis') v = v.filter(x => x.tribe === 'MAE' || x.atk >= 4);
        t = aiBestTarget(p, v); if (!t) t = aiBestTarget(p, validTargets(p, f));
        if (!t) { p.hand.shift(); continue; }
      }
      if (!actCast(p, 0, t)) p.hand.shift();
      continue;
    }
    const c = CARDS[card.id];
    const f = bcFilter(c); let t = null;
    if (f) t = aiBestTarget(p, validTargets(p, f, card));
    actPlay(p, 0, p.board.length, t);
  }
}
function aiArrange(p) {
  const key = m => {
    const c = CARDS[m.id]; let k = 0;
    if (c.dr || m.reborn) k -= 10;
    if (m.cleave || c.attackLowest || m.first) k -= 5;
    if (m.taunt) k += 2;
    if (c.onFriendlyDeathC || c.id === 'mae_glitch') k += 20;
    return k - m.atk * 0.01;
  };
  p.board.sort((a, b) => key(a) - key(b));
  // keep convoy minions together
  const ald = p.board.filter(x => x.tribe === 'ALD'); if (ald.length >= 2) { const rest = p.board.filter(x => x.tribe !== 'ALD'); const mid = Math.floor(rest.length / 2); p.board = rest.slice(0, mid).concat(ald, rest.slice(mid)); }
}
function aiUsePower(p) {
  if (!heroPowerUsable(p)) return;
  if (p.hero.id === 'songbird' && p.hp < 8) return;
  const hp = p.hero.power;
  let t = null;
  if (hp.target === 'board') t = aiBestTarget(p, p.board.filter(hp.tfilter || (() => true)));
  if (hp.target === 'shop') t = p.shop.reduce((a, b) => (b.tier * 10 + b.atk + b.hp) > (a.tier * 10 + a.atk + a.hp) ? b : a);
  if (p.hero.id === 'evelyn' && t && t.atk >= t.hp) return;
  if (p.hero.id === 'evelyn' && t && t.tier < p.tier) return;
  actHeroPower(p, t);
  aiPlayHand(p);
}
function aiTurn(p) {
  aiResolvePending(p);
  const st = p.ai;
  let guard = 0;
  while (guard++ < 60) {
    aiPlayHand(p); aiResolvePending(p); aiPlayHand(p);
    const lvTurn = LEVEL_TURN[p.tier + 1] + p.ai.lvlBias + st.lvl;
    const uc = upgradeCost(p);
    if (p.tier < 6 && p.gold >= uc && (uc <= 1 || G.turn >= lvTurn || (uc <= 3 && p.gold - uc >= 3)) && !(p.hp < 10 && p.gold - uc < 3 && uc > 0)) { actUpgrade(p); aiResolvePending(p); continue; }
    // quickhacks use RAM, so buy whenever RAM allows
    const hoarding = st.hoard && p.board.some(x => ['vdb_cache', 'vdb_overflow', 'vdb_coder'].includes(x.id));
    let bought = false;
    if (!hoarding && p.hand.length < HAND_MAX) for (let i = 0; i < p.shopSpells.length && !bought; i++) {
      const o = p.shopSpells[i]; if (spellCost(p, o) > p.ram || Math.random() >= Math.min(1, .5 * st.hacks + .2)) continue;
      const s = SPELLS[o.id]; if (!s.target || p.board.length) bought = actBuySpell(p, i);
    }
    if (bought) continue;
    if (p.hand.length < HAND_MAX && p.board.length) for (let i = 0; i < p.shopWares.length && !bought; i++) {
      const o = p.shopWares[i]; const cost = wareCost(p, o);
      if (WARE[o.id].malicious && !(p.ai.psycho > 1)) continue;
      const t = aiWareTarget(p, o.id);
      if (t && cost <= p.gold && (p.gold - cost >= 3 || p.gold < 3) && Math.random() < Math.min(1, .45 * st.ware)) bought = actBuyWare(p, i);
    }
    if (bought) continue;
    if (p.gold >= buyCost(p) && p.shop.length && p.hand.length < HAND_MAX) {
      let bi = -1, bv = -1;
      p.shop.forEach((m, i) => { const v = aiScoreCard(p, CARDS[m.id], m); if (v > bv) { bv = v; bi = i; } });
      const thresh = 2 + p.tier * 2.2 + st.buyBias;
      if (bv >= thresh || p.gold < 4 || p.freeRefresh === 0 && p.gold === 3) { actBuy(p, bi); aiResolvePending(p); continue; }
    }
    if (heroPowerUsable(p) && p.gold < 3 + p.hero.power.cost) { aiUsePower(p); if (p.hpUsed) continue; }
    if (p.freeRefresh > 0 || p.gold >= 4) { actRefresh(p); continue; }
    if (heroPowerUsable(p)) { aiUsePower(p); if (p.hpUsed) continue; }
    { const pi = p.shopSpells.findIndex(o => o.id === 'sp_ping' && spellCost(p, o) <= p.ram); if (!hoarding && pi >= 0 && actBuySpell(p, pi)) continue; }
    break;
  }
  aiPlayHand(p);
  if (p.gold < 3 && p.shop.some(m => p.board.concat(p.hand).filter(x => x.id === m.id && !x.golden).length >= 2)) p.frozen = true;
  aiFav(p);
  aiArrange(p);
}

// ================= SEARCH AI (Hard / Very Hard) =================
// The bot plays out many complete turn plans on copies of its own state, fights each result
// against likely opponents, and keeps the plan that did best. Same rules and luck as everyone.
const DIFF = {
  1: { plans: 10, fights: 4, others: 2, lookahead: 0, orders: 2, adopt: .35 },
  2: { plans: 12, fights: 4, others: 2, lookahead: 1, orders: 3, adopt: 1 },
};
const snapP = p => JSON.stringify(p, (k, v) => (k === 'hero' || k === 'ai') ? undefined : v);
function restoreP(p, snap) { const o = JSON.parse(snap); for (const k of Object.keys(p)) if (k !== 'hero' && k !== 'ai' && !(k in o)) delete p[k]; Object.assign(p, o); }
function fightScore(p, cfg, others) {
  const opp = G.players.find(x => x.id === p.nextOpp && x.alive);
  const pool = [];
  if (opp) for (let i = 0; i < cfg.fights; i++) pool.push(opp);
  for (let i = 0; i < others * cfg.fights / 2; i++) { const o = randOf(alivePlayers().filter(x => x !== p)); if (o) pool.push(o); }
  if (!pool.length) return 0;
  let s = 0;
  for (const o of pool) {
    const r = new Combat(Object.assign({}, p, { hacks: p.hacks.slice() }), Object.assign({}, o, { hacks: [] }), false).run();
    const w = r.winner === 0 ? 1 : r.winner === 1 ? -1 : 0;
    s += w * (1 + Math.min(r.dmg, 20) / 12);
  }
  return s / pool.length;
}
function planValue(p, cfg) {
  // value of the board right after the turn, including its End of Turn effects
  const keep = snapP(p), pool0 = Object.assign({}, G.pool);
  endOfTurnFor(p);
  let v = fightScore(p, cfg, cfg.others) * (p.hp + p.armor < 15 ? 1.6 : 1);
  v += .22 * p.tier + .05 * p.hand.length + .02 * (p.engram.a + p.engram.h) + .03 * (p.arsenal || 0) + .03 * (p.honor || 0) + .03 * (p.mutation || 0);
  if (cfg.lookahead) {
    // play the following turn too, with the same plan style, and judge that board as well
    G.turn++;
    try { startTurnFor(p); aiTurn(p); endOfTurnFor(p); v = .55 * v + .45 * (fightScore(p, cfg, cfg.others) + .22 * p.tier); }
    finally { G.turn--; }
  }
  restoreP(p, keep); G.pool = pool0;
  return v;
}
function planProfile(p, k) {
  if (k === 0) return p.ai;
  const base = k % 2 === 1 ? p.ai : STRATS[pick(Object.keys(STRATS))];
  const jit = x => x * (.7 + Math.random() * .6);
  return Object.assign({}, base, { lvlBias: p.ai.lvlBias + (rnd(3) - 1), fav: p.ai.fav, lean: p.ai.lean, buyBias: (base.buyBias || 0) + (Math.random() - .5) * 2, ware: jit(base.ware || 0), hacks: jit(base.hacks || 0), lvl: (base.lvl || 0) + (rnd(3) - 1) });
}
function aiSearchTurn(p, d) {
  const cfg = DIFF[d || G.diff] || DIFF[1];
  const start = snapP(p), pool0 = Object.assign({}, G.pool), ai0 = p.ai;
  let best = null;
  for (let k = 0; k < cfg.plans; k++) {
    restoreP(p, start); G.pool = Object.assign({}, pool0);
    const prof = planProfile(p, k); p.ai = prof;
    aiTurn(p);
    // try a few board orders for the finished plan
    let bestOrder = p.board.slice(), bestV = planValue(p, cfg);
    for (let o = 1; o < cfg.orders && p.board.length > 1; o++) {
      const ord = o === 1 ? p.board.slice().sort((a, b) => (b.taunt ? 1 : 0) - (a.taunt ? 1 : 0) || b.hp - a.hp) : shuffle(p.board.slice());
      p.board = ord; const v = planValue(p, cfg); if (v > bestV) { bestV = v; bestOrder = ord; }
    }
    p.board = bestOrder;
    if (!best || bestV > best.v) best = { v: bestV, snap: snapP(p), pool: Object.assign({}, G.pool), prof };
    p.ai = ai0;
  }
  restoreP(p, best.snap); G.pool = best.pool;
  p.ai = (best.prof !== ai0 && Math.random() < cfg.adopt) ? Object.assign({}, best.prof) : ai0;
}

root.BG = {
  TRIBES, KW, KW_DESC, CARDS, CARD_LIST, SPELLS, SPELL_LIST, PERKS, PERK_LIST, WARE, WARE_LIST, HEROES, HERO_LIST, HAND_MAX, STRATS,
  get G() { return G; }, setG(g) { G = g; }, hooks, newGame, pickTribes, heroChoices, startTurn, endTurnAll, applyResults, alivePlayers, damageCap,
  actRefresh, actFreeze, actUpgrade, actBuy, actBuySpell, actBuyWare, actSell, actPlay, actInstall, actCast, actHeroPower, heroPowerUsable, actPickPerk, actReorder,
  effStats, maxTacChance, aiSearchTurn, aiStep, aiTakeTurn, DIFF, rally, cloneStat, buyCost, needsTarget, bcFilter, validTargets, upgradeCost, spellCost, wareCost, cardText, makeMinion, aiResolvePendingOne, gm, humMax, humUsed, isPsycho, ramMax, Combat,
};
})(typeof window !== 'undefined' ? window : globalThis);
