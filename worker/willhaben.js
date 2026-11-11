// Čitanje oglasa sa Willhabena.
//
// VAŽNO: Willhaben nema zvaničan API. Stranica je Next.js aplikacija koja u sebi
// nosi JSON (skripta id="__NEXT_DATA__"). Odatle se vadi lista oglasa. Tačna
// imena polja Willhaben povremeno menja, pa ovaj deo PODESI na pravoj stranici:
// otvori rezultat pretrage, pogledaj __NEXT_DATA__ i uskladi mapu atributa dole.
// Ovo je napisano po uobičajenoj strukturi i testirano na primeru (worker/sample.json).

import { classifySeller } from './dealer.js';

// URL pretrage: privatni prodavci, do 10.000 €, cela Austrija, najnoviji prvi.
// PRICE_TO i rows po potrebi; sort po datumu je kod Willhabena obično sort=1 ili
// dodatni parametar &sort=  — proveri na stranici i upiši tačno.
export function buildSearchUrl(opts = {}) {
  const p = new URLSearchParams({
    rows: String(opts.rows || 50),
    PRICE_TO: String(opts.priceTo || 10000),
    sort: String(opts.sort || 1),               // podesi: najnoviji prvi
    PRIVATE: '1'                                  // podesi: Willhaben Privat filter
  });
  // Baza pretrage polovnih automobila:
  return `https://www.willhaben.at/iad/gebrauchtwagen/auto/gebrauchtwagenboerse?${p.toString()}`;
}

// Uobičajeni zaglavlja da stranica odgovori kao pregledaču.
export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  'Accept-Language': 'de-AT,de;q=0.9',
  'Accept': 'text/html,application/xhtml+xml'
};

// Izvuci JSON iz <script id="__NEXT_DATA__">...</script>
export function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Nema __NEXT_DATA__ u stranici (možda je blokada ili promenjen format).');
  return JSON.parse(m[1]);
}

// Pronađi niz oglasa unutar __NEXT_DATA__. Putanja zna da se menja, pa tražimo
// prvi niz objekata koji imaju "attributes". PODESI ako Willhaben promeni strukturu.
export function findAdverts(nextData) {
  let found = null;
  (function walk(o) {
    if (found || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      if (o.length && o[0] && (o[0].attributes || o[0].id) ) {
        if (o.some(x => x && x.attributes)) { found = o; return; }
      }
      o.forEach(walk); return;
    }
    for (const k of Object.keys(o)) walk(o[k]);
  })(nextData);
  return found || [];
}

// Pomoćno: pročitaj atribut po imenu iz Willhaben formata
// attributes.attribute = [{name:'PRICE', values:['6900']}, ...]
function attrMap(advert) {
  const map = {};
  const list = advert?.attributes?.attribute || advert?.attributes || [];
  for (const a of list) if (a && a.name) map[a.name] = a.values || a.value || [];
  return map;
}
const first = v => Array.isArray(v) ? v[0] : v;
const toInt = v => { const n = parseInt(String(first(v) ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// Normalizuj jedan oglas u oblik koji aplikacija koristi.
export function normalize(advert) {
  const A = attrMap(advert);
  const images = (A.ALL_IMAGE_URLS?.[0] || A.IMAGE?.[0] || '')
    .split(/[;,]/).filter(Boolean)
    .map(s => s.startsWith('http') ? s : `https://cache.willhaben.at/mmo/${s}`);
  const yearRaw = first(A.YEAR_MODEL) || first(A.REGISTRATION_DATE) || first(A.MODEL_YEAR);
  const year = yearRaw ? toInt(yearRaw) : null;
  const sellerIsDealer = (first(A.ISPRIVATE) === '0') || !!first(A.ORGID) || !!advert?.orgId || /dealer|handler/i.test(first(A.SELLER_TYPE) || '');

  const ad = {
    id: String(advert.id ?? first(A.AD_ID) ?? ''),
    title: first(A.HEADING) || `${first(A.MAKE) || ''} ${first(A.MODEL) || ''}`.trim(),
    make: first(A.MAKE) || null,
    model: first(A.MODEL) || null,
    price: toInt(A.PRICE) ?? toInt(A.PRICE_FOR_DISPLAY),
    mileage: toInt(A.MILEAGE),
    year,
    fuel: first(A.FUEL) || first(A.ENGINE_FUEL) || null,
    gearbox: first(A.TRANSMISSION) || first(A.GEARBOX) || null,
    power: toInt(A.POWER) ?? toInt(A.ENGINE_EFFECT),
    postcode: first(A.POSTCODE) || null,
    city: first(A.LOCATION) || first(A.CITY) || null,
    state: first(A.STATE) || null,
    description: first(A.DESCRIPTION) || first(A.BODY_DYN) || '',
    phone: first(A.PHONE) || first(A.CONTACT_PHONE) || null,     // često skriven
    images,
    sellerName: first(A.SELLER_NAME) || first(A.ORG_NAME) || null,
    sellerIsDealer,
    sellerAdCount: toInt(A.SELLER_AD_COUNT),
    url: advert.seoUrl ? `https://www.willhaben.at/iad/${advert.seoUrl}` : null,
    postedAt: toInt(A.PUBLISHED) || Date.now()
  };
  const { suspect, signals } = classifySeller(ad);
  ad.suspect = suspect; ad.signals = signals;
  return ad;
}

// Povuci i parsiraj jednu pretragu -> niz normalizovanih oglasa.
export async function fetchAds(opts = {}) {
  const url = opts.url || buildSearchUrl(opts);
  const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) } });
  if (res.status === 403 || res.status === 429)
    throw Object.assign(new Error('Willhaben blokira zahteve (' + res.status + ')'), { blocked: true, status: res.status });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const data = extractNextData(html);
  return findAdverts(data).map(normalize).filter(a => a.id);
}

// Primeni klijentove filtere na jedan oglas.
export function matchesFilter(ad, f) {
  if (f.priceTo && ad.price != null && ad.price > f.priceTo) return false;
  if (f.brands?.length && !f.brands.includes(ad.make)) return false;
  if (f.yearFrom && ad.year && ad.year < f.yearFrom) return false;
  if (f.kmTo && ad.mileage && ad.mileage > f.kmTo) return false;
  if (f.fuel && ad.fuel && ad.fuel !== f.fuel) return false;
  if (f.state && ad.state && ad.state !== f.state) return false;
  return true;
}
