const { sendMessage, getUpdates, setMyCommands } = require("./telegram");
const { checkOnce, getStatus, buildMessage } = require("./check-stock");

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const COMMANDS = [
  { command: "status", description: "마지막 체크 상태 조회" },
  { command: "check", description: "즉시 재고 확인" },
  { command: "list", description: "현재 판매중 상품 목록" },
  { command: "help", description: "명령어 안내" },
];

const HELP_TEXT =
  "사용 가능한 명령어\n" +
  "/status - 가동 상태, 마지막 체크 시각, 현재 판매중 개수\n" +
  "/check - 즉시 재고 확인\n" +
  "/list - 현재 판매중 상품 목록\n" +
  "/help - 이 안내 메시지";

function formatTimestamp(date) {
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

async function handleCommand(chatId, text) {
  const command = text.split(/\s+/)[0].replace(/@\w+$/, "");

  switch (command) {
    case "/status": {
      const status = getStatus();
      const uptime = formatDuration(Date.now() - status.startedAt.getTime());
      const lines = [];

      if (status.consecutiveFailures > 0) {
        const reason = status.lastError?.status
          ? `HTTP ${status.lastError.status}`
          : status.lastError?.message ?? "알 수 없는 오류";
        lines.push(`🔴 연속 실패 ${status.consecutiveFailures}회 (${reason})`);
      } else {
        lines.push("🟢 정상 작동 중");
      }

      lines.push(`가동 시간: ${uptime}`);

      if (status.lastResult) {
        lines.push(`마지막 성공 체크: ${formatTimestamp(status.lastResult.checkedAt)}`);
        lines.push(`현재 판매중: ${status.lastResult.total}개`);
      } else {
        lines.push("아직 성공한 체크 기록이 없습니다.");
      }

      await sendMessage(chatId, lines.join("\n"));
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
      const { lastResult } = getStatus();
      if (!lastResult || lastResult.items.length === 0) {
        await sendMessage(chatId, "현재 판매중인 상품이 없습니다.");
        return;
      }
      const message = buildMessage(lastResult.items, lastResult.total, "📦 현재 판매중 상품 목록", {
        showHint: false,
      });
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
