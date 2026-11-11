// AutoRadar – glavna logika aplikacije.
import { extractNextData, findAdverts, normalize, matchesFilter, searchUrl } from './willhaben.js';

const Cap = window.Capacitor || {};
const Http = Cap.Plugins?.CapacitorHttp;
const Notif = Cap.Plugins?.LocalNotifications;

// ---- podešavanja (čuvaju se na telefonu) ----
const CFG = Object.assign({
  serverUrl: 'https://radar.nexdesign.rs',   // tvoj server za licencu
  intervalSec: 6,
  priceTo: 10000,
  filters: [{ name: 'Sve do 10.000', priceTo: 10000 }]
}, load('ar_cfg', {}));

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const $ = s => document.querySelector(s);

function deviceId() {
  let id = load('ar_device', null);
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); save('ar_device', id); }
  return id;
}

// ---- HTTP (native, zaobilazi CORS, šalje kao pregledač) ----
async function httpGet(url, headers) {
  if (Http) { const r = await Http.get({ url, headers }); return { status: r.status, data: r.data }; }
  const r = await fetch(url, { headers }); return { status: r.status, data: await r.text() };
}
async function httpJson(url) {
  if (Http) { const r = await Http.get({ url }); return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
  return (await fetch(url)).json();
}

// ---- licenca ----
async function registerDevice() {
  const body = { deviceId: deviceId(), name: load('ar_name', 'Telefon') };
  try {
    if (Http) await Http.post({ url: CFG.serverUrl + '/api/register', headers: { 'Content-Type': 'application/json' }, data: body });
    else await fetch(CFG.serverUrl + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {}
}
async function checkLicense() {
  try {
    const lic = await httpJson(CFG.serverUrl + '/api/license?deviceId=' + encodeURIComponent(deviceId()));
    save('ar_lic', { ...lic, at: Date.now() });
    return lic;
  } catch {
    const c = load('ar_lic', null);
    if (c && Date.now() - c.at < (c.graceDays || 4) * 86400000) return { ...c, fromCache: true };
    return { allowed: false, status: 'offline' };
  }
}

// ---- stanje ----
const seen = new Set(load('ar_seen', []));
let running = false, firstScan = true, timer = null, lic = null;
let found = [];          // prikazani oglasi
let stats = { checks: 0, newToday: 0, dropped: 0, lastDelay: null, lastCheck: 0, blocked: 0 };

// ---- petlja ----
async function scan() {
  if (!running) return;
  try {
    const { status, data } = await httpGet(searchUrl({ priceTo: CFG.priceTo }), {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12) Mobile Safari/537.36', 'Accept-Language': 'de-AT,de;q=0.9'
    });
    stats.checks++; stats.lastCheck = Date.now();
    if (status === 403 || status === 429) { stats.blocked++; log('warn', 'Blokada ' + status + ' – uspori/menjaj IP'); return schedule(true); }
    stats.blocked = 0;
    const ads = findAdverts(extractNextData(data)).map(normalize).filter(a => a.id);

    for (const ad of ads) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
      if (firstScan) continue;                       // prvi prolaz samo puni bazu
      if (ad.suspect) { stats.dropped++; continue; }
      const hit = CFG.filters.find(f => matchesFilter(ad, f));
      if (!hit) continue;
      stats.newToday++;
      found.unshift(ad); found = found.slice(0, 60);
      await notify(ad);
    }
    if (firstScan) { firstScan = false; log('ok', 'Start: baza ' + ads.length + ' oglasa'); }
    save('ar_seen', [...seen].slice(-800));
    render();
  } catch (e) {
    log('bad', 'Greška: ' + e.message);
  } finally {
    schedule();
  }
}
function schedule(slow) { clearTimeout(timer); timer = setTimeout(scan, (slow ? 30 : CFG.intervalSec) * 1000 + Math.random() * 1500); }

async function notify(ad) {
  const title = ad.title + ' · € ' + (ad.price ?? '?');
  const bodyTxt = [ad.year, (ad.mileage ? ad.mileage.toLocaleString('de-DE') + ' km' : null), ad.city].filter(Boolean).join(' · ');
  try {
    if (Notif) await Notif.schedule({ notifications: [{
      id: Date.now() % 2147483647, title, body: bodyTxt,
      smallIcon: 'ic_stat_icon', extra: { url: ad.url }
    }] });
  } catch {}
  log('ok', 'NOV: ' + title);
}

// ---- UI ----
function render() {
  const banner = $('#banner'), lock = $('#lock'), feed = $('#feed');
  if (!lic) return;
  if (lic.status === 'pending') { lock.hidden = false; lock.querySelector('.lk-t').textContent = 'Čeka se odobrenje'; lock.querySelector('.lk-s').textContent = 'Vaš pristup još nije odobren. Javite se da vas aktiviram.'; stop(); return; }
  if (!lic.allowed) { lock.hidden = false; lock.querySelector('.lk-t').textContent = 'Pristup zaključan'; lock.querySelector('.lk-s').textContent = lic.status === 'offline' ? 'Nema veze sa serverom.' : 'Pretplata je istekla ili je nalog isključen.'; stop(); return; }
  lock.hidden = true;
  if (lic.status === 'trial') {
    const d = Math.ceil(lic.remainingMs / 86400000);
    banner.hidden = false; banner.textContent = 'Probni period: još ' + d + (d === 1 ? ' dan' : ' dana');
  } else banner.hidden = true;

  $('#stChecks').textContent = stats.checks;
  $('#stNew').textContent = stats.newToday;
  $('#stDrop').textContent = stats.dropped;
  $('#dot').className = 'dot' + (running ? '' : ' off');
  $('#runTxt').textContent = running ? 'Radar radi' : 'Pauza';

  feed.innerHTML = found.length ? found.map(card).join('')
    : '<div class="empty">Čeka se prvi oglas…<br>Čim se pojavi, stiže ovde i kao obaveštenje.</div>';
}
function card(a) {
  const img = a.images?.[0];
  const contact = a.phone
    ? `<a class="btn call" href="tel:${a.phone.replace(/\s/g,'')}">Pozovi · ${esc(a.phone)}</a>`
    : (a.url ? `<a class="btn msg" href="${a.url}" target="_blank" rel="noopener">Poruka na Willhabenu</a>` : '');
  return `<article class="card">
    <div class="thumb">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}</div>
    <div class="info"><h3>${esc(a.title)}</h3><div class="price">€ ${a.price?.toLocaleString('de-DE') ?? '?'}</div>
      <div class="meta">${[a.year, a.mileage ? a.mileage.toLocaleString('de-DE') + ' km' : null, a.fuel].filter(Boolean).join(' · ')}</div>
      <div class="loc">${esc([a.postcode, a.city].filter(Boolean).join(' '))}</div></div>
    <div class="acts">${contact}${a.url ? `<a class="btn open" href="${a.url}" target="_blank" rel="noopener">Otvori</a>` : ''}</div>
  </article>`;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function log(level, msg) { const el = $('#log'); if (!el) return; const t = new Date().toLocaleTimeString('de-DE'); el.insertAdjacentHTML('afterbegin', `<div><span class="tm">${t}</span><span class="${level}">${esc(msg)}</span></div>`); while (el.children.length > 12) el.lastChild.remove(); }

function start() { if (running) return; running = true; schedule(true); render(); }
function stop() { running = false; clearTimeout(timer); render(); }

// ---- boot ----
async function boot() {
  try { if (Notif) await Notif.requestPermissions(); } catch {}
  $('#srv').value = CFG.serverUrl;
  $('#iv').value = CFG.intervalSec;
  await registerDevice();
  lic = await checkLicense();
  render();
  if (lic.allowed) start();
  // licencu proveravaj na 6h
  setInterval(async () => { lic = await checkLicense(); render(); if (lic.allowed && !running) start(); if (!lic.allowed) stop(); }, 6 * 3600 * 1000);
}

document.addEventListener('click', e => {
  if (e.target.id === 'saveCfg') {
    CFG.serverUrl = $('#srv').value.trim() || CFG.serverUrl;
    CFG.intervalSec = Math.max(3, parseInt($('#iv').value, 10) || 6);
    save('ar_cfg', CFG);
    log('ok', 'Podešavanja sačuvana');
  }
  if (e.target.id === 'toggleRun') { running ? stop() : (lic?.allowed && start()); }
});

document.addEventListener('DOMContentLoaded', boot);
