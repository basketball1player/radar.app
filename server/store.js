// Jednostavna baza u JSON fajlu. Za malu upotrebu je dovoljno; kasnije se lako
// zameni pravom bazom. Čuva korisnike (uređaje) i njihov status licence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = new URL('./data.json', import.meta.url);

function load() {
  if (!existsSync(FILE)) return { users: [] };
  try { return JSON.parse(readFileSync(FILE, 'utf8')); }
  catch { return { users: [] }; }
}
function save(db) { writeFileSync(FILE, JSON.stringify(db, null, 2)); }

export const db = load();
const persist = () => save(db);

export function listUsers() {
  // Osveži izvedeni status (probni/plaćeni istekao) pre vraćanja.
  const now = Date.now();
  for (const u of db.users) refreshStatus(u, now);
  persist();
  return db.users.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function getUser(deviceId) {
  return db.users.find(u => u.deviceId === deviceId) || null;
}

export function registerDevice(deviceId, name, info = {}) {
  let u = getUser(deviceId);
  if (u) return u; // već postoji, ne duplira
  u = {
    id: randomUUID().slice(0, 8),
    deviceId,
    name: (name || '').trim() || 'Bez imena',
    note: info.note || '',
    status: 'pending',       // pending | trial | active | disabled
    trialEndsAt: null,
    paidUntil: null,
    createdAt: Date.now(),
    lastSeen: Date.now()
  };
  db.users.push(u);
  persist();
  return u;
}

export function touch(deviceId) {
  const u = getUser(deviceId);
  if (u) { u.lastSeen = Date.now(); persist(); }
  return u;
}

export function approve(id, trialDays = 7) {
  const u = byId(id); if (!u) return null;
  u.status = 'trial';
  u.trialEndsAt = Date.now() + trialDays * 86400000;
  persist(); return u;
}

export function activate(id, months = 1) {
  const u = byId(id); if (!u) return null;
  const base = Math.max(Date.now(), u.paidUntil || 0);
  u.status = 'active';
  u.paidUntil = base + months * 30 * 86400000;
  persist(); return u;
}

export function extendDays(id, days = 30) {
  const u = byId(id); if (!u) return null;
  const base = Math.max(Date.now(), u.paidUntil || u.trialEndsAt || Date.now());
  u.paidUntil = base + days * 86400000;
  u.status = 'active';
  persist(); return u;
}

export function disable(id) {
  const u = byId(id); if (!u) return null;
  u.status = 'disabled';
  persist(); return u;
}

export function removeUser(id) {
  const i = db.users.findIndex(u => u.id === id);
  if (i < 0) return false;
  db.users.splice(i, 1); persist(); return true;
}

function byId(id) { return db.users.find(u => u.id === id) || null; }

// Izvedeni status: ako je probni ili plaćeni rok prošao, prebaci na 'expired'
// (ali ne diraj 'disabled' i 'pending').
export function refreshStatus(u, now = Date.now()) {
  if (u.status === 'disabled' || u.status === 'pending') return u;
  if (u.status === 'active') {
    if (u.paidUntil && u.paidUntil < now) u.status = 'expired';
  } else if (u.status === 'trial') {
    if (u.trialEndsAt && u.trialEndsAt < now) u.status = 'expired';
  }
  return u;
}

// Odluka za aplikaciju: sme li da radi + do kad + koliko je ostalo.
export function licenseFor(deviceId) {
  const u = getUser(deviceId);
  if (!u) return { known: false, allowed: false, status: 'unknown' };
  refreshStatus(u);
  const until = u.status === 'active' ? u.paidUntil
              : u.status === 'trial' ? u.trialEndsAt : null;
  const allowed = u.status === 'trial' || u.status === 'active';
  persist();
  return {
    known: true,
    allowed,
    status: u.status,                 // pending|trial|active|disabled|expired
    until,                            // ms timestamp ili null
    remainingMs: until ? Math.max(0, until - Date.now()) : 0,
    name: u.name
  };
}
