// Captures a screenshot of the running app over the DevTools protocol.
//
//   node tools/app_screenshot.mjs <out.png> [width] [height] [--full]
//
// The app must be running with --remote-debugging-port (ASMR3D_CDP_PORT).

import fs from "node:fs";

const PORT = Number(process.env.ASMR3D_CDP_PORT || 9222);
const args = process.argv.slice(2);
const full = args.includes("--full");
const positional = args.filter((entry) => !entry.startsWith("--"));
const OUT = positional[0] || "app-screenshot.png";
const WIDTH = Number(positional[1] || 0);
const HEIGHT = Number(positional[2] || 0);

const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = pages.find((entry) => entry.type === "page");
if (!page) {
  console.error("找不到可调试页面，请用 --remote-debugging-port 启动应用。");
  process.exit(1);
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let nextId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

if (WIDTH && HEIGHT) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
await send("Page.enable");
await new Promise((resolve) => setTimeout(resolve, 1500));
const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: full,
});
fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log("saved:", OUT);
socket.close();
