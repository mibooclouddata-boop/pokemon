const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendMessage(chatId, text, { replyMarkup } = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

async function getUpdates(offset, timeout = 25) {
  const params = new URLSearchParams({ timeout: String(timeout) });
  if (offset !== undefined) params.set("offset", String(offset));

  const res = await fetch(`${API}/getUpdates?${params}`);
  if (!res.ok) {
    throw new Error(`Telegram getUpdates failed: ${res.status}`);
  }
  return res.json();
}

async function setMyCommands(commands) {
  const res = await fetch(`${API}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram setMyCommands failed: ${res.status} ${body}`);
  }
}

module.exports = { sendMessage, getUpdates, setMyCommands };
