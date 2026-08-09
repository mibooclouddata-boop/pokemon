require("dotenv").config();

const { checkOnce } = require("./check-stock");
const { startCommandListener } = require("./commands");
const { sendMessage } = require("./telegram");

const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 20000);
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const FAILURE_ALERT_THRESHOLD = 3; // consecutive failures before first alert
const FAILURE_ALERT_REPEAT_EVERY = 15; // re-alert every N further failures

let consecutiveFailures = 0;
let alerted = false;

function describeError(err) {
  if (err.status === 403 || err.status === 429) {
    return `🚫 차단(밴) 의심 - HTTP ${err.status}`;
  }
  if (err.status) {
    return `⚠️ API 오류 - HTTP ${err.status}`;
  }
  return `⚠️ 재고 확인 실패 - ${err.message}`;
}

async function notifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return;
  try {
    await sendMessage(ADMIN_CHAT_ID, text);
  } catch (err) {
    console.error("Failed to notify admin:", err);
  }
}

async function tick() {
  try {
    await checkOnce({ testMode: false });

    if (alerted) {
      await notifyAdmin(`✅ 재고 확인 복구됨 (연속 실패 ${consecutiveFailures}회 후)`);
      alerted = false;
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures += 1;
    console.error(`[${new Date().toISOString()}] check failed:`, err);

    const shouldAlert =
      consecutiveFailures === FAILURE_ALERT_THRESHOLD ||
      (alerted &&
        (consecutiveFailures - FAILURE_ALERT_THRESHOLD) % FAILURE_ALERT_REPEAT_EVERY === 0);

    if (shouldAlert) {
      alerted = true;
      await notifyAdmin(
        `${describeError(err)}\n연속 실패 ${consecutiveFailures}회\n${err.message}`
      );
    }
  }
}

console.log(`Starting stock check daemon, interval=${INTERVAL_MS}ms`);
tick();
setInterval(tick, INTERVAL_MS);

startCommandListener().catch((err) => {
  console.error("Command listener crashed:", err);
  process.exit(1);
});
