// Test parsiranja i prepoznavanja trgovaca na primeru (worker/sample.json).
import { readFileSync } from 'node:fs';
import { findAdverts, normalize, matchesFilter } from './willhaben.js';
import { classifySeller } from './dealer.js';
import { formatMessage } from './notify.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const data = JSON.parse(readFileSync(new URL('./sample.json', import.meta.url)));
const ads = findAdverts(data).map(normalize);

console.log(`\nParsirano ${ads.length} oglasa iz primera:`);
console.log('--- Parsiranje polja ---');
const golf = ads.find(a => a.id === '1001');
ok(ads.length === 3, 'nađena sva 3 oglasa');
ok(golf.title === 'VW Golf VI 1.6 TDI', 'naslov');
ok(golf.price === 6900, 'cena 6900');
ok(golf.mileage === 168000, 'km 168000');
ok(golf.year === 2011, 'godište 2011');
ok(golf.state === 'Wien', 'region Wien');
ok(golf.phone === '0664 4821 093', 'telefon pročitan');
ok(golf.images.length === 2, 'dve slike');

console.log('--- Prepoznavanje prodavaca ---');
ok(golf.suspect === false, 'Golf: privatni (bez znakova trgovca)');
const focus = ads.find(a => a.id === '1002');
ok(focus.suspect === true, 'Ford Focus: prepoznat kao trgovac');
ok(focus.signals.length >= 3, `  razlozi: ${focus.signals.join(', ')}`);
const fabia = ads.find(a => a.id === '1003');
ok(fabia.suspect === true, 'Škoda Fabia: sumnja (6 oglasa + "weitere Autos")');

console.log('--- Filteri ---');
ok(matchesFilter(golf, { priceTo: 10000 }), 'Golf prolazi filter do 10.000');
ok(!matchesFilter(golf, { priceTo: 5000 }), 'Golf ne prolazi filter do 5.000');
ok(matchesFilter(golf, { brands: ['VW', 'Škoda'] }), 'Golf prolazi filter marki VW/Škoda');
ok(!matchesFilter(golf, { yearFrom: 2015 }), 'Golf (2011) ne prolazi godište od 2015');
ok(matchesFilter(golf, { state: 'Wien' }), 'Golf prolazi region Wien');

console.log('--- Telegram poruka (Golf) ---');
console.log(formatMessage(golf).split('\n').map(l => '    ' + l).join('\n'));

console.log(`\nREZULTAT: ${pass} prošlo, ${fail} palo\n`);
process.exit(fail ? 1 : 0);
