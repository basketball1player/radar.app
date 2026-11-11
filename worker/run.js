// Glavna petlja: proverava Willhaben na par sekundi, prepoznaje NOVE oglase,
// filtrira trgovce i šalje obaveštenja. Radi 24/7.
//
// Pokretanje (primer):
//   WH_INTERVAL=6 TG_TOKEN=... TG_CHAT=... node worker/run.js
//
// Na telefonu (Capacitor) ista logika radi u pozadinskom servisu; notify se
// menja lokalnim obaveštenjem umesto Telegrama.

import { fetchAds, matchesFilter } from './willhaben.js';
import { sendTelegram } from './notify.js';

const INTERVAL = Number(process.env.WH_INTERVAL || 6) * 1000;   // podesi po potrebi
const GRACE_EMPTY_MIN = 10;                                     // koliko bez novih oglasa pre upozorenja

// Klijentovi filteri (u pravoj app-u stižu iz podešavanja).
const FILTERS = [
  { name: 'Sve do 10.000', priceTo: 10000 }
];

const seen = new Set();          // ID-jevi već viđenih oglasa
let firstRun = true;
let lastNewAt = Date.now();
let blockedStreak = 0;

const tg = { token: process.env.TG_TOKEN, chatId: process.env.TG_CHAT, threadId: process.env.TG_THREAD };

async function tick() {
  try {
    const ads = await fetchAds({ priceTo: 10000, rows: 50 });
    blockedStreak = 0;
    let fresh = 0;

    for (const ad of ads) {
      if (seen.has(ad.id)) continue;
      seen.add(ad.id);
      if (firstRun) continue;               // prvi prolaz samo puni "viđene", bez spama
      if (ad.suspect) { log('warn', `preskočen (trgovac): ${ad.title} — ${ad.signals[0]}`); continue; }
      const hit = FILTERS.find(f => matchesFilter(ad, f));
      if (!hit) continue;
      fresh++; lastNewAt = Date.now();
      log('ok', `NOV: ${ad.title} · €${ad.price ?? '?'} · ${ad.city ?? ''}`);
      if (tg.token && tg.chatId) await sendTelegram(tg, ad).catch(e => log('bad', 'Telegram: ' + e.message));
    }

    if (firstRun) { log('ok', `start: učitano ${ads.length} oglasa kao baza`); firstRun = false; }
    // Heartbeat: dugo bez ijednog oglasa obično znači blokadu ili promenu formata
    if ((Date.now() - lastNewAt) > GRACE_EMPTY_MIN * 60000) {
      log('warn', `${GRACE_EMPTY_MIN} min bez novih oglasa — proveri blokadu/format`);
      lastNewAt = Date.now();
    }
  } catch (e) {
    if (e.blocked) {
      blockedStreak++;
      log('bad', `blokada (${e.status}), pokušaj ${blockedStreak} — menjam IP / čekam`);
      // Na telefonu: uključi/isključi avion-režim za novu mobilnu adresu.
      // Na serveru: rotiraj proxy. Posle više uzastopnih blokada, uspori.
      if (blockedStreak >= 3) await sleep(30000);
    } else {
      log('bad', 'greška: ' + e.message);
    }
  } finally {
    setTimeout(tick, INTERVAL + Math.random() * 1500);   // mali razmak da ne bude pravilno kao robot
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(level, msg) {
  const t = new Date().toLocaleTimeString('de-DE');
  console.log(`[${t}] ${level.toUpperCase().padEnd(4)} ${msg}`);
}

log('ok', `AutoRadar worker start · interval ${INTERVAL / 1000}s`);
tick();
