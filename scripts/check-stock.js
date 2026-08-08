const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "..", "state", "last_stock.json");
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_ITEMS_IN_MESSAGE = 30;

const headers = {
  clientid: "HJGfZ5jPHZk3/PEOkm+/Qw==",
  platform: "PC",
  Version: "1.0",
};

async function getPage(page) {
  const params = new URLSearchParams({
    "order.by": "SALE_CNT",
    "order.direction": "DESC",
    "filter.saleStatus": "ONSALE",
    "filter.soldout": "false",
    pageSize: "100",
    pageNumber: String(page),
  });

  const res = await fetch(
    `https://shop-api.e-ncp.com/products/search?${params}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Stock API request failed: ${res.status}`);
  }

  return res.json();
}

async function loadItems() {
  const first = await getPage(1);
  const totalPages = Math.ceil(first.totalCount / 100);
  let items = [...first.items];

  for (let i = 2; i <= totalPages; i++) {
    const d = await getPage(i);
    items = items.concat(d.items);
    await new Promise((r) => setTimeout(r, 150));
  }

  return { total: first.totalCount, items };
}

function loadPrevIds() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveState(productNos) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(productNos, null, 2));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${body}`);
  }
}

(async () => {
  const { total, items } = await loadItems();
  const prevIds = loadPrevIds();
  const currentIds = items.map((p) => p.productNo);

  if (prevIds === null) {
    console.log(
      `Initial run - saved ${currentIds.length} items as baseline, no notification sent.`
    );
    saveState(currentIds);
    return;
  }

  const prevSet = new Set(prevIds);
  const newItems = items.filter((p) => !prevSet.has(p.productNo));

  if (newItems.length > 0) {
    const shown = newItems.slice(0, MAX_ITEMS_IN_MESSAGE);
    const lines = shown.map((p) => {
      const price = (p.salePrice ?? 0).toLocaleString("ko-KR");
      const link = `https://www.pokemonstore.co.kr/pages/product/product-detail.html?productNo=${p.productNo}`;
      return `• <a href="${link}">${escapeHtml(p.productName)}</a> - ${price}원`;
    });

    let message = `🎉 새로 구매 가능한 상품 ${newItems.length}개!\n\n${lines.join("\n")}`;

    if (newItems.length > MAX_ITEMS_IN_MESSAGE) {
      message += `\n... 외 ${newItems.length - MAX_ITEMS_IN_MESSAGE}개`;
    }

    message += `\n\n현재 총 구매 가능: ${total}개`;

    await sendTelegram(message);
    console.log(`Notified about ${newItems.length} new items.`);
  } else {
    console.log("No new items.");
  }

  saveState(currentIds);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
