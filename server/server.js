// AutoRadar – server za licencu i admin panel.
// Radi na tvom domenu. Aplikacija kod klijenta ga pita da li sme da radi,
// a ti preko admin panela odobravaš korisnike, daješ probni period,
// aktiviraš plaćene i isključuješ one koji ne plate.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  listUsers, registerDevice, touch, licenseFor,
  approve, activate, extendDays, disable, removeUser
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Lozinka za admin panel. U produkciji je postavi kroz okruženje:
//   ADMIN_PASSWORD=nekajakalozinka node server.js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'promeni-me';
const GRACE_DAYS = Number(process.env.GRACE_DAYS || 4); // koliko dana app radi ako ne može da dobije server

// --- javni deo (aplikacija kod klijenta) ---

// Uređaj se registruje kad prvi put pokrene aplikaciju. Ulazi kao "na čekanju".
app.post('/api/register', (req, res) => {
  const { deviceId, name, note } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId obavezan' });
  const u = registerDevice(deviceId, name, { note });
  res.json({ status: u.status, id: u.id });
});

// Aplikacija ovo pita jednom dnevno (i pri pokretanju).
app.get('/api/license', (req, res) => {
  const deviceId = req.query.deviceId;
  if (!deviceId) return res.status(400).json({ error: 'deviceId obavezan' });
  touch(deviceId);
  const lic = licenseFor(deviceId);
  res.json({ ...lic, graceDays: GRACE_DAYS, serverTime: Date.now() });
});

// --- admin deo (ti) ---

function auth(req, res, next) {
  const given = req.get('x-admin-password') || req.query.pw;
  if (given !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Pogrešna lozinka' });
  next();
}

app.get('/api/admin/users', auth, (req, res) => res.json({ users: listUsers() }));
app.post('/api/admin/approve', auth, (req, res) => send(res, approve(req.body.id, num(req.body.trialDays, 7))));
app.post('/api/admin/activate', auth, (req, res) => send(res, activate(req.body.id, num(req.body.months, 1))));
app.post('/api/admin/extend', auth, (req, res) => send(res, extendDays(req.body.id, num(req.body.days, 30))));
app.post('/api/admin/disable', auth, (req, res) => send(res, disable(req.body.id)));
app.post('/api/admin/remove', auth, (req, res) => res.json({ ok: removeUser(req.body.id) }));

function send(res, u) { u ? res.json({ ok: true, user: u }) : res.status(404).json({ error: 'Nije nađen' }); }
function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }

// Admin panel (statička stranica).
app.use('/admin', express.static(join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/admin'));

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`AutoRadar server na http://localhost:${PORT}  (admin: /admin)`));
