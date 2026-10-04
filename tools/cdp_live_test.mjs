// Drives the running Electron app over the Chrome DevTools Protocol to verify
// the live capture + recording flow end to end.
//
//   node tools/cdp_live_test.mjs [seconds]

const PORT = Number(process.env.ASMR3D_CDP_PORT || 9222);
const HOLD_SECONDS = Number(process.argv[2] || 10);
const TARGET_NAME = process.env.ASMR3D_TARGET || "msedge";

const listResponse = await fetch(`http://127.0.0.1:${PORT}/json/list`);
const pages = await listResponse.json();
const page = pages.find((entry) => entry.type === "page");
if (!page) {
  console.error("找不到可调试页面，请确认 Electron 已用 --remote-debugging-port 启动。");
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = (event) => reject(new Error(`CDP 连接失败：${event.message || ""}`));
});

let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.consoleAPICalled") {
    const text = (message.params.args || [])
      .map((arg) => arg.value ?? arg.description ?? "")
      .join(" ");
    console.log(`  [console.${message.params.type}] ${text}`);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    console.log(
      `  [page-error] ${message.params.exceptionDetails?.exception?.description || ""}`,
    );
    return;
  }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 2500));

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expression, userGesture = false) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture,
  });
  const details = response.result?.exceptionDetails;
  if (details) {
    throw new Error(
      `页面脚本异常：${details.exception?.description || details.text}`,
    );
  }
  return response.result?.result?.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("== 页面环境 ==");
console.log(
  await evaluate(`JSON.stringify({
    desktop: typeof window.asmr3dDesktop,
    section: Boolean(document.querySelector('#liveSection')),
    startDisabled: document.querySelector('#liveStartButton').disabled,
    badge: document.querySelector('#liveModeBadge').textContent,
  })`),
);

console.log("\n== 扫描音频应用 ==");
await evaluate(`document.querySelector('#liveRefreshButton').click()`, true);
for (let attempt = 0; attempt < 40; attempt += 1) {
  await sleep(500);
  const badge = await evaluate(
    `document.querySelector('#liveModeBadge').textContent`,
  );
  if (badge !== "未扫描" && badge !== "扫描失败") break;
}
console.log(
  await evaluate(`JSON.stringify({
    badge: document.querySelector('#liveModeBadge').textContent,
    status: document.querySelector('#liveStatus').textContent,
    options: [...document.querySelectorAll('#liveTargetSelect option')]
      .map(option => option.textContent),
  })`),
);

const targetIndex = await evaluate(`(() => {
  const options = [...document.querySelectorAll('#liveTargetSelect option')];
  const index = options.findIndex(option =>
    option.textContent.toLowerCase().includes(${JSON.stringify(
      TARGET_NAME.toLowerCase(),
    )}));
  return index >= 0 ? index : 0;
})()`);
await evaluate(
  `(() => {
    const select = document.querySelector('#liveTargetSelect');
    select.value = ${JSON.stringify(String(targetIndex))};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`,
  true,
);
console.log(`选择来源索引：${targetIndex}`);

console.log("\n== 启用同步录制并开始截获 ==");
await evaluate(
  `(() => {
    const toggle = document.querySelector('#recordToggle');
    if (!toggle.checked) toggle.click();
    const sourceMode = document.querySelector('#sourceModeSelect');
    sourceMode.value = ${JSON.stringify(process.env.ASMR3D_SOURCE_MODE || "attenuate")};
    sourceMode.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#liveStartButton').click();
  })()`,
  true,
);

for (let attempt = 0; attempt < 40; attempt += 1) {
  await sleep(500);
  const active = await evaluate(
    `!document.querySelector('#liveStopButton').disabled`,
  );
  if (active) break;
  const status = await evaluate(`document.querySelector('#liveStatus').textContent`);
  if (status.includes("失败") || status.includes("不支持")) break;
}

await sleep(2500);

console.log(
  await evaluate(`JSON.stringify({
    status: document.querySelector('#liveStatus').textContent,
    source: document.querySelector('#sourceBadge').textContent,
    recordStatus: document.querySelector('#recordStatus').textContent,
    stopEnabled: !document.querySelector('#liveStopButton').disabled,
    sourceMode: document.querySelector('#sourceModeSelect').value,
  })`),
);

let peakDb = -Infinity;
for (let second = 0; second < HOLD_SECONDS; second += 1) {
  await sleep(1000);
  const text = await evaluate(
    `document.querySelector('#liveLevelText').textContent`,
  );
  const value = text.startsWith("−∞") ? -Infinity : Number.parseFloat(text);
  if (Number.isFinite(value)) peakDb = Math.max(peakDb, value);
  if ((second + 1) % 5 === 0) {
    console.log(
      `  ${second + 1}s · 电平 ${text} · ${await evaluate(
        `document.querySelector('#recordStatus').textContent`,
      )}`,
    );
  }
}

console.log("\n== 停止截获并合并 ==");
await evaluate(`document.querySelector('#liveStopButton').click()`, true);
for (let attempt = 0; attempt < 60; attempt += 1) {
  await sleep(1000);
  const badge = await evaluate(`document.querySelector('#recordBadge').textContent`);
  if (badge === "完成" || badge === "失败" || badge === "关闭") break;
}

console.log(
  await evaluate(`JSON.stringify({
    badge: document.querySelector('#recordBadge').textContent,
    status: document.querySelector('#recordStatus').textContent,
    live: document.querySelector('#liveStatus').textContent,
    revealEnabled: !document.querySelector('#recordRevealButton').disabled,
  })`),
);

console.log("\n===== 汇总 =====");
console.log(`捕获期间峰值输入电平：${Number.isFinite(peakDb) ? peakDb.toFixed(1) : "无"} dB`);

socket.close();
