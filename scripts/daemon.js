require("dotenv").config();

const { checkOnce } = require("./check-stock");

const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 20000);

let running = false;

async function tick() {
  if (running) {
    console.log(`[${new Date().toISOString()}] previous check still running, skipping tick`);
    return;
  }
  running = true;
  try {
    await checkOnce({ testMode: false });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] check failed:`, err);
  } finally {
    running = false;
  }
}

console.log(`Starting stock check daemon, interval=${INTERVAL_MS}ms`);
tick();
setInterval(tick, INTERVAL_MS);
