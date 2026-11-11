# AutoRadar

Praćenje novih oglasa na Willhabenu (privatni prodavci, do 10.000 €, cela Austrija)
sa brzim obaveštenjem, prepoznavanjem trgovaca, pozivom/porukom na jedan dodir,
i sistemom pretplata (odobravanje korisnika, probni period, daljinsko isključivanje).

## Šta je u projektu

```
server/        Server za licencu + tvoj admin panel   (GOTOVO, testirano)
  server.js      Express: /api/register, /api/license, /api/admin/*
  store.js       Baza korisnika (JSON fajl)
  public/        Admin panel (otvara se na /admin)
worker/        Willhaben jezgro                        (GOTOVO, testirano na primeru)
  willhaben.js   Čitanje i parsiranje oglasa
  dealer.js      Prepoznavanje privatni / trgovac
  notify.js      Telegram obaveštenja
  run.js         Petlja: proveri na par sekundi -> javi nove
  test.mjs       Testovi (node worker/test.mjs)
app-license.js Deo za aplikaciju: registracija, licenca, probna traka, zaključavanje
```

## Šta je gotovo i provereno
- Server za licencu: registracija, probni period, aktivacija, produženje, isključivanje.
- Admin panel sa prijavom, pregledom korisnika po statusu i svim dugmadima.
- Parsiranje oglasa i prepoznavanje trgovaca (17/17 testova prolazi na primeru).
- Telegram poruka sa slikama, cenom, km, godištem, lokacijom i telefonom.

## Šta se radi na tvojoj strani (ne može odavde)
1. **Podesiti Willhaben čitanje na živoj stranici.** Willhaben nema zvaničan API;
   `worker/willhaben.js` je napisan po uobičajenom formatu i mora da se uskladi sa
   pravom stranicom: otvori rezultat pretrage, nađi `__NEXT_DATA__` i proveri imena
   polja (PRICE, MILEAGE, ISPRIVATE...). Tamo gde piše „PODESI“ je mesto za to.
2. **Android aplikacija.** Web UI (demo) se pakuje u aplikaciju (Capacitor) i dobija
   pozadinski servis koji proverava na par sekundi i šalje obaveštenja.
3. **Server na tvom domenu** za licencu i admin.

---

## Pokretanje servera (licenca + admin)

```bash
cd server
npm install            # iz korena: npm install (express je već u package.json)
ADMIN_PASSWORD=tvojajakalozinka node server.js
# otvori http://localhost:8787/admin
```
Na pravom domenu stavi iza HTTPS-a (Caddy/Nginx). Postavi `ADMIN_PASSWORD` i po želji
`GRACE_DAYS` (koliko dana app radi bez veze sa serverom; podrazumevano 4).

API:
- `POST /api/register {deviceId, name}` — uređaj se javi, ulazi kao „na čekanju“.
- `GET  /api/license?deviceId=...` — aplikacija pita sme li da radi.
- `GET/POST /api/admin/*` — samo sa zaglavljem `x-admin-password`.

## Pokretanje workera (test uživo)

```bash
node worker/test.mjs                               # testovi na primeru (bez mreže)
WH_INTERVAL=6 TG_TOKEN=xxx TG_CHAT=-100123 node worker/run.js
```
Napomena: Willhaben zabranjuje automatsko preuzimanje podataka. Moguće su privremene
blokade. Worker to prepoznaje (403/429) i usporava; na telefonu se tada uključi/isključi
avion-režim za novu mobilnu adresu.

---

## Koraci koje ti treba da odradiš

1. **Domen i hosting za server.** Iskoristi poddomen (npr. `radar.nexdesign.rs`) sa HTTPS-om.
   Server je mali, može i najjeftiniji hosting. Sve na tvoje ime.
2. **Postavi `ADMIN_PASSWORD`** i zapamti je — to je tvoj ulaz u admin.
3. **U `app-license.js` upiši svoj domen** u `SERVER_URL`.
4. **Android telefon za klijenta** koji je stalno upaljen i na internetu (najbolje stari
   telefon na punjaču), sa neograničenim internetom ili Wi-Fi.
5. **Telegram (opciono):** napravi bota (@BotFather), grupu sa temama, dodaj bota kao admina,
   uzmi token i ID grupe.
6. **Willhaben nalog klijenta** (samo ako će da šalje poruke iz aplikacije).
7. **Pisana potvrda klijenta** da zna da Willhaben zabranjuje automatsko praćenje i da
   postoji rizik od blokade.

## Pakovanje u Android aplikaciju (skica)

```bash
npm create @capacitor/app         # ili dodaj Capacitor u postojeći web projekat
# ubaci web UI (demo) u www/, dodaj app-license.js
npx cap add android
npx cap open android              # build APK u Android Studiju
```
Za rad na par sekundi u pozadini treba „foreground service“ (stalno obaveštenje „Radar radi“)
i dozvola za obaveštenja. To je native deo koji se dodaje u Android projekat.

## Tok licence (kako radi kontrola)
- Klijent instalira app → uređaj se registruje → kod tebe se pojavi „na čekanju“.
- Ti ga **odobriš** (daš npr. 7 dana probe) ili **aktiviraš** (plaćeno N meseci).
- App na vrhu pokazuje koliko je ostalo probnog perioda.
- Kad rok prođe ili ga **isključiš**, app se zaključa dok ne produžiš.
- Ako server privremeno nije dostupan, app radi još nekoliko dana (grejs period), pa tek onda staje.
