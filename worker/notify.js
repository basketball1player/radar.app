// Slanje oglasa u Telegram i obaveštenja na telefon.
// U pravoj aplikaciji na telefonu, umesto Telegrama se koristi lokalno
// obaveštenje (Capacitor LocalNotifications). Telegram je dodatna opcija.

export function formatMessage(ad) {
  const L = [];
  L.push(`🚗 *${esc(ad.title)}*${ad.suspect ? ' ⚠️' : ''}`);
  L.push(`💶 € ${num(ad.price)}${ad.year ? `  ·  ${ad.year}` : ''}${ad.mileage != null ? `  ·  ${num(ad.mileage)} km` : ''}`);
  if (ad.fuel || ad.gearbox) L.push(`${[ad.fuel, ad.gearbox].filter(Boolean).join(' · ')}`);
  if (ad.postcode || ad.city) L.push(`📍 ${[ad.postcode, ad.city].filter(Boolean).join(' ')}`);
  L.push(ad.suspect ? `⚠️ Moguć trgovac: ${ad.signals.slice(0, 2).join(', ')}` : `✅ Deluje privatno`);
  if (ad.phone) L.push(`📞 ${ad.phone}`);
  return L.join('\n');
}

// Telegram. Treba bot token (@BotFather) i chat/grupa ID.
export async function sendTelegram({ token, chatId, threadId }, ad) {
  const text = formatMessage(ad);
  const base = `https://api.telegram.org/bot${token}`;
  const imgs = (ad.images || []).slice(0, 10);

  if (imgs.length >= 2) {
    const media = imgs.map((url, i) => ({ type: 'photo', media: url, ...(i === 0 ? { caption: text, parse_mode: 'Markdown' } : {}) }));
    return post(`${base}/sendMediaGroup`, { chat_id: chatId, message_thread_id: threadId, media });
  }
  if (imgs.length === 1)
    return post(`${base}/sendPhoto`, { chat_id: chatId, message_thread_id: threadId, photo: imgs[0], caption: text, parse_mode: 'Markdown' });

  return post(`${base}/sendMessage`, {
    chat_id: chatId, message_thread_id: threadId, text, parse_mode: 'Markdown',
    reply_markup: ad.url ? { inline_keyboard: [[{ text: 'Otvori na Willhabenu', url: ad.url }]] } : undefined
  });
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error('Telegram: ' + (data.description || res.status));
  return data;
}

const esc = s => String(s || '').replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
const num = n => (n == null ? '?' : new Intl.NumberFormat('de-DE').format(n));
