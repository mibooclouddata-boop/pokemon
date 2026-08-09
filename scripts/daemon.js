require("dotenv").config();

const { checkOnce } = require("./check-stock");
const { startCommandListener } = require("./commands");

const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 20000);

async function tick() {
  try {
    await checkOnce({ testMode: false });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] check failed:`, err);
  }
}

console.log(`Starting stock check daemon, interval=${INTERVAL_MS}ms`);
tick();
setInterval(tick, INTERVAL_MS);

startCommandListener().catch((err) => {
  console.error("Command listener crashed:", err);
  process.exit(1);
});
