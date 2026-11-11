// Prepoznavanje privatnih prodavaca i trgovaca.
// Radi nad normalizovanim oglasom (vidi willhaben.js -> normalize()).
// Vraća { suspect: bool, signals: [razlozi] }.

const DEALER_PATTERNS = [
  [/\bfinanzierung\b/i, 'pominje finansiranje (Finanzierung)'],
  [/\bgarantie\b/i, 'nudi garanciju (Garantie)'],
  [/\binzahlungnahme\b/i, 'prihvata staro vozilo (Inzahlungnahme)'],
  [/\bh[äa]ndler\b/i, 'piše Händler'],
  [/\bgmbh\b|\bg\.m\.b\.h\b|\bk\.?g\b|\be\.?u\.?\b|\bo\.?g\b/i, 'oblik firme u tekstu'],
  [/\buid[\s-]?(nr|nummer)?\b|\batu\d/i, 'UID / poreski broj'],
  [/\bnetto\b|exkl\.?\s*(mwst|ust)|zzgl\.?\s*(mwst|ust)/i, 'cena bez PDV-a'],
  [/\bexport\b/i, 'nudi izvoz'],
  [/auf lager|weitere (fahrzeuge|autos)|fahrzeuge? (auf|in)|lagerfahrzeug/i, 'pominje druga vozila na stanju'],
  [/\bprobefahrt\b|\bleasing\b/i, 'probna vožnja / lizing'],
  [/öffnungszeiten|montag.*freitag|mo\.?\s*-\s*fr/i, 'radno vreme u oglasu'],
  [/www\.|\.at\b|\.de\b|@/i, 'sajt ili mejl firme u tekstu']
];

export function classifySeller(ad, opts = {}) {
  const maxPrivateAds = opts.maxPrivateAds ?? 4; // više od ovoga = sumnja na trgovca
  const signals = [];

  // 1) Willhaben sam kaže da je komercijalni prodavac
  if (ad.sellerIsDealer === true) signals.push('Willhaben ga vodi kao firmu/trgovca');

  // 2) Broj aktivnih oglasa istog prodavca
  if (typeof ad.sellerAdCount === 'number' && ad.sellerAdCount > maxPrivateAds)
    signals.push(`${ad.sellerAdCount} aktivnih oglasa kod istog prodavca`);

  // 3) Ime prodavca liči na firmu
  if (ad.sellerName && /\b(gmbh|kg|e\.?u|og|kfz|auto|cars?|automobile|handel|motors)\b/i.test(ad.sellerName))
    signals.push('ime prodavca liči na firmu');

  // 4) Ključne reči u naslovu i opisu
  const text = `${ad.title || ''}\n${ad.description || ''}`;
  for (const [re, label] of DEALER_PATTERNS)
    if (re.test(text) && !signals.includes(label)) signals.push(label);

  // 5) Isti telefon kao kod već viđenog trgovca (opciono, preko opts.knownDealerPhones)
  if (ad.phone && opts.knownDealerPhones?.has(normalizePhone(ad.phone)))
    signals.push('telefon se već pojavio kod trgovca');

  return { suspect: signals.length > 0, signals };
}

export function normalizePhone(p) {
  return String(p || '').replace(/[^\d+]/g, '').replace(/^0043/, '+43').replace(/^0/, '+43');
}

export { DEALER_PATTERNS };
