// Parsiranje Willhaben oglasa i prepoznavanje trgovaca (verzija za aplikaciju).
// Isto jezgro kao u worker/, bez mrežnog dela — zahtev radi app.js preko CapacitorHttp.
// PODESI imena polja prema pravoj stranici (otvori __NEXT_DATA__ u pregledaču).

const DEALER_PATTERNS = [
  [/\bfinanzierung\b/i, 'Finanzierung'],
  [/\bgarantie\b/i, 'Garantie'],
  [/\binzahlungnahme\b/i, 'Inzahlungnahme'],
  [/\bh[äa]ndler\b/i, 'Händler'],
  [/\bgmbh\b|\bk\.?g\b|\be\.?u\.?\b|\bo\.?g\b/i, 'oblik firme'],
  [/\buid\b|\batu\d/i, 'UID broj'],
  [/\bnetto\b|exkl\.?\s*(mwst|ust)/i, 'cena bez PDV-a'],
  [/\bexport\b/i, 'izvoz'],
  [/auf lager|weitere (fahrzeuge|autos)|lagerfahrzeug/i, 'druga vozila na stanju'],
  [/öffnungszeiten|mo\.?\s*-\s*fr/i, 'radno vreme']
];

export function classifySeller(ad, maxPrivateAds = 4) {
  const signals = [];
  if (ad.sellerIsDealer === true) signals.push('firma/trgovac na Willhabenu');
  if (typeof ad.sellerAdCount === 'number' && ad.sellerAdCount > maxPrivateAds) signals.push(ad.sellerAdCount + ' oglasa');
  if (ad.sellerName && /\b(gmbh|kg|e\.?u|og|kfz|auto|cars?|automobile|handel|motors)\b/i.test(ad.sellerName)) signals.push('ime liči na firmu');
  const text = (ad.title || '') + '\n' + (ad.description || '');
  for (const [re, label] of DEALER_PATTERNS) if (re.test(text) && !signals.includes(label)) signals.push(label);
  return { suspect: signals.length > 0, signals };
}

export function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Nema __NEXT_DATA__ (blokada ili promenjen format).');
  return JSON.parse(m[1]);
}

export function findAdverts(nextData) {
  let found = null;
  (function walk(o) {
    if (found || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      if (o.length && o.some(x => x && x.attributes)) { found = o; return; }
      o.forEach(walk); return;
    }
    for (const k of Object.keys(o)) walk(o[k]);
  })(nextData);
  return found || [];
}

const first = v => Array.isArray(v) ? v[0] : v;
const toInt = v => { const n = parseInt(String(first(v) ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
function attrMap(advert) {
  const map = {}; const list = advert?.attributes?.attribute || advert?.attributes || [];
  for (const a of list) if (a && a.name) map[a.name] = a.values || a.value || [];
  return map;
}

export function normalize(advert) {
  const A = attrMap(advert);
  const images = (A.ALL_IMAGE_URLS?.[0] || A.IMAGE?.[0] || '').split(/[;,]/).filter(Boolean)
    .map(s => s.startsWith('http') ? s : 'https://cache.willhaben.at/mmo/' + s);
  const ad = {
    id: String(advert.id ?? first(A.AD_ID) ?? ''),
    title: first(A.HEADING) || (first(A.MAKE) || '') + ' ' + (first(A.MODEL) || ''),
    make: first(A.MAKE) || null, model: first(A.MODEL) || null,
    price: toInt(A.PRICE) ?? toInt(A.PRICE_FOR_DISPLAY),
    mileage: toInt(A.MILEAGE), year: toInt(A.YEAR_MODEL) || toInt(A.REGISTRATION_DATE),
    fuel: first(A.FUEL) || first(A.ENGINE_FUEL) || null,
    gearbox: first(A.TRANSMISSION) || first(A.GEARBOX) || null,
    power: toInt(A.POWER) ?? toInt(A.ENGINE_EFFECT),
    postcode: first(A.POSTCODE) || null, city: first(A.LOCATION) || first(A.CITY) || null, state: first(A.STATE) || null,
    description: first(A.DESCRIPTION) || first(A.BODY_DYN) || '',
    phone: first(A.PHONE) || first(A.CONTACT_PHONE) || null,
    images,
    sellerName: first(A.SELLER_NAME) || first(A.ORG_NAME) || null,
    sellerIsDealer: (first(A.ISPRIVATE) === '0') || !!first(A.ORGID) || !!advert?.orgId,
    sellerAdCount: toInt(A.SELLER_AD_COUNT),
    url: advert.seoUrl ? 'https://www.willhaben.at/iad/' + advert.seoUrl : null
  };
  const { suspect, signals } = classifySeller(ad);
  ad.suspect = suspect; ad.signals = signals;
  return ad;
}

export function matchesFilter(ad, f) {
  if (f.priceTo && ad.price != null && ad.price > f.priceTo) return false;
  if (f.brands?.length && !f.brands.includes(ad.make)) return false;
  if (f.yearFrom && ad.year && ad.year < f.yearFrom) return false;
  if (f.kmTo && ad.mileage && ad.mileage > f.kmTo) return false;
  if (f.fuel && ad.fuel && ad.fuel !== f.fuel) return false;
  if (f.state && ad.state && ad.state !== f.state) return false;
  return true;
}

export function searchUrl(opts = {}) {
  const p = new URLSearchParams({ rows: String(opts.rows || 50), PRICE_TO: String(opts.priceTo || 10000), sort: '1', PRIVATE: '1' });
  return 'https://www.willhaben.at/iad/gebrauchtwagen/auto/gebrauchtwagenboerse?' + p.toString();
}
