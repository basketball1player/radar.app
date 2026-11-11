// Deo koji ide U APLIKACIJU (web UI iz demoa / Capacitor).
// Brine o: registraciji uređaja, proveri licence, probnom odbrojavanju na vrhu,
// ekranu "čeka odobrenje" i zaključavanju kad pretplata istekne.
//
// SERVER_URL postavi na svoj domen (npr. https://radar.nexdesign.rs).

const SERVER_URL = 'https://radar.nexdesign.rs';   // <-- tvoj domen
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;         // proveri licencu na 6 h

// Stabilan ID uređaja (čuva se lokalno).
function deviceId() {
  let id = localStorage.getItem('ar_device');
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('ar_device', id); }
  return id;
}

async function registerIfNeeded(name) {
  await fetch(SERVER_URL + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId(), name })
  }).catch(() => {});
}

// Vrati stanje licence. Sa grejs periodom: ako server ne odgovara, koristi
// poslednje poznato stanje još "graceDays" dana pre zaključavanja.
async function checkLicense() {
  try {
    const r = await fetch(SERVER_URL + '/api/license?deviceId=' + encodeURIComponent(deviceId()));
    const lic = await r.json();
    localStorage.setItem('ar_lic', JSON.stringify({ ...lic, at: Date.now() }));
    return lic;
  } catch {
    // offline / server nedostupan -> grejs period
    const cached = JSON.parse(localStorage.getItem('ar_lic') || 'null');
    if (cached) {
      const graceMs = (cached.graceDays || 4) * 86400000;
      if (Date.now() - cached.at < graceMs) return { ...cached, fromCache: true };
    }
    return { allowed: false, status: 'offline' };
  }
}

// Primeni stanje na UI: traka sa odbrojavanjem, ekran čekanja ili zaključavanje.
function applyLicense(lic, ui) {
  // ui = { banner, lockScreen, startRadar, stopRadar } — tvoje funkcije
  if (lic.status === 'pending') { ui.stopRadar(); ui.lockScreen('pending'); return; }
  if (!lic.allowed) { ui.stopRadar(); ui.lockScreen(lic.status); return; }   // disabled / expired / offline
  ui.startRadar();
  if (lic.status === 'trial') {
    const days = Math.ceil(lic.remainingMs / 86400000);
    ui.banner(`Probni period: još ${days} ${days === 1 ? 'dan' : 'dana'}`);
  } else {
    ui.banner(null); // aktivan, bez trake
  }
}

// Pozovi na startu aplikacije:
//   await registerIfNeeded('Ime klijenta');
//   applyLicense(await checkLicense(), ui);
//   setInterval(async () => applyLicense(await checkLicense(), ui), CHECK_EVERY_MS);

export { deviceId, registerIfNeeded, checkLicense, applyLicense, SERVER_URL };
