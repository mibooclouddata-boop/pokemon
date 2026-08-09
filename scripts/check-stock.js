const fs = require("fs");
const path = require("path");
const { sendMessage } = require("./telegram");

const STATE_FILE = path.join(__dirname, "..", "state", "last_stock.json");
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_MODE = process.env.TEST_MODE === "true";
const MAX_ITEMS_IN_MESSAGE = 30;

let busy = false;
let lastResult = null;

function getLastResult() {
  return lastResult;
}

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
    const body = await res.text().catch(() => "");
    const err = new Error(`Stock API request failed: ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
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

function buildMessage(items, total, title) {
  const shown = items.slice(0, MAX_ITEMS_IN_MESSAGE);
  const lines = shown.map((p) => {
    const price = (p.salePrice ?? 0).toLocaleString("ko-KR");
    const link = `https://www.pokemonstore.co.kr/pages/product/product-detail.html?productNo=${p.productNo}`;
    return `• <a href="${link}">${escapeHtml(p.productName)}</a> - ${price}원`;
  });

  let message = `${title}\n\n${lines.join("\n")}`;

  if (items.length > MAX_ITEMS_IN_MESSAGE) {
    message += `\n... 외 ${items.length - MAX_ITEMS_IN_MESSAGE}개`;
  }

  message += `\n\n현재 총 구매 가능: ${total}개`;
  return message;
}

async function sendTelegram(text) {
  await sendMessage(TELEGRAM_CHAT_ID, text);
}

async function checkOnce({ testMode = TEST_MODE } = {}) {
  if (busy) {
    console.log("Check already in progress, skipping.");
    return { skipped: true };
  }
  busy = true;

  try {
    const { total, items } = await loadItems();
    lastResult = { checkedAt: new Date(), total, items };

    if (testMode) {
      const sample = items.slice(0, 3);
      if (sample.length === 0) {
        console.log("Test mode - no items currently on sale to sample.");
        return { skipped: false, total, newItems: [] };
      }
      const message = buildMessage(
        sample,
        total,
        `🧪 [테스트] 알림 동작 확인용 메시지입니다 (실제 재입고 아님)`
      );
      await sendTelegram(message);
      console.log("Test mode - sent sample notification, state not changed.");
      return { skipped: false, total, newItems: [] };
    }

    const prevIds = loadPrevIds();
    const currentIds = items.map((p) => p.productNo);

    if (prevIds === null) {
      console.log(
        `Initial run - saved ${currentIds.length} items as baseline, no notification sent.`
      );
      saveState(currentIds);
      return { skipped: false, total, newItems: [] };
    }

    const prevSet = new Set(prevIds);
    const newItems = items.filter((p) => !prevSet.has(p.productNo));

    if (newItems.length > 0) {
      const message = buildMessage(
        newItems,
        total,
        `🎉 새로 구매 가능한 상품 ${newItems.length}개!`
      );
      await sendTelegram(message);
      console.log(`Notified about ${newItems.length} new items.`);
    } else {
      console.log("No new items.");
    }

    saveState(currentIds);
    return { skipped: false, total, newItems };
  } finally {
    busy = false;
  }
}

module.exports = { checkOnce, getLastResult, buildMessage };

if (require.main === module) {
  checkOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
