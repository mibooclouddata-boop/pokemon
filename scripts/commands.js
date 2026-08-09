const { sendMessage, getUpdates, setMyCommands } = require("./telegram");
const { checkOnce, getLastResult, buildMessage } = require("./check-stock");

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const COMMANDS = [
  { command: "status", description: "마지막 체크 상태 조회" },
  { command: "check", description: "즉시 재고 확인" },
  { command: "list", description: "현재 판매중 상품 목록" },
  { command: "help", description: "명령어 안내" },
];

const HELP_TEXT =
  "사용 가능한 명령어\n" +
  "/status - 마지막 체크 시각과 현재 판매중 개수\n" +
  "/check - 즉시 재고 확인\n" +
  "/list - 현재 판매중 상품 목록\n" +
  "/help - 이 안내 메시지";

function formatTimestamp(date) {
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function handleCommand(chatId, text) {
  const command = text.split(/\s+/)[0].replace(/@\w+$/, "");

  switch (command) {
    case "/status": {
      const last = getLastResult();
      if (!last) {
        await sendMessage(chatId, "아직 체크 기록이 없습니다.");
        return;
      }
      await sendMessage(
        chatId,
        `마지막 체크: ${formatTimestamp(last.checkedAt)}\n현재 판매중: ${last.total}개`
      );
      return;
    }

    case "/check": {
      await sendMessage(chatId, "재고 확인 중...");
      const result = await checkOnce({ testMode: false });
      if (result.skipped) {
        await sendMessage(chatId, "이미 진행 중인 체크가 있어 건너뛰었습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      await sendMessage(
        chatId,
        `확인 완료. 현재 판매중: ${result.total}개, 신규: ${result.newItems.length}개`
      );
      return;
    }

    case "/list": {
      const last = getLastResult();
      if (!last || last.items.length === 0) {
        await sendMessage(chatId, "현재 판매중인 상품이 없습니다.");
        return;
      }
      const message = buildMessage(last.items, last.total, "📦 현재 판매중 상품 목록");
      await sendMessage(chatId, message);
      return;
    }

    case "/start":
    case "/help":
    default: {
      await sendMessage(chatId, HELP_TEXT);
      return;
    }
  }
}

async function startCommandListener() {
  if (!ADMIN_CHAT_ID) {
    console.log("TELEGRAM_ADMIN_CHAT_ID not set - command listener disabled.");
    return;
  }

  await setMyCommands(COMMANDS);

  let offset;
  try {
    const initial = await getUpdates(undefined, 0);
    if (initial.result.length > 0) {
      offset = initial.result[initial.result.length - 1].update_id + 1;
    }
  } catch (err) {
    console.error("Initial getUpdates failed:", err);
  }

  console.log("Command listener started.");

  while (true) {
    let updates;
    try {
      updates = await getUpdates(offset);
    } catch (err) {
      console.error("getUpdates failed:", err);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of updates.result) {
      offset = update.update_id + 1;

      const message = update.message;
      if (!message || !message.text) continue;

      const chatId = String(message.chat.id);
      if (chatId !== String(ADMIN_CHAT_ID)) continue;
      if (!message.text.startsWith("/")) continue;

      try {
        await handleCommand(chatId, message.text);
      } catch (err) {
        console.error("handleCommand failed:", err);
        await sendMessage(chatId, "명령어 처리 중 오류가 발생했습니다.").catch(() => {});
      }
    }
  }
}

module.exports = { startCommandListener };
