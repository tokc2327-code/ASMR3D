import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RENDERER_DIR = path.join(ROOT, "renderer");
const MATERIALS_DIR = path.join(ROOT, "materials");
const DIST_ROOT = path.join(ROOT, "dist");
const OUTPUT_DIR = path.join(DIST_ROOT, "asmr3d-v0.2-mobile");
const ZIP_PATH = path.join(DIST_ROOT, "asmr3d-v0.2-mobile.zip");

const sampleIds = [171335, 169373, 169329, 565204];

if (!OUTPUT_DIR.startsWith(DIST_ROOT)) {
  throw new Error("Refusing to clean outside the dist directory");
}
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(OUTPUT_DIR, "samples"), { recursive: true });

const manifest = JSON.parse(
  fs.readFileSync(path.join(MATERIALS_DIR, "manifest.json"), "utf8"),
);
const selectedItems = sampleIds.map((id) => {
  const item = manifest.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing sample ${id}`);
  return item;
});

for (const item of selectedItems) {
  const source = path.join(ROOT, item.file);
  const destination = path.join(OUTPUT_DIR, "samples", path.basename(item.file));
  fs.copyFileSync(source, destination);
}

for (const file of [
  "styles.css",
  "app.js",
  "enhance.js",
  "live-capture-worklet.js",
  "background.jpg",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
]) {
  fs.copyFileSync(path.join(RENDERER_DIR, file), path.join(OUTPUT_DIR, file));
}

const mobileMaterials = selectedItems.map((item) => ({
  ...item,
  file: `samples/${path.basename(item.file)}`,
  mediaUrl: `./samples/${path.basename(item.file)}`,
}));
fs.writeFileSync(
  path.join(OUTPUT_DIR, "mobile-materials.js"),
  `window.MOBILE_MATERIALS = ${JSON.stringify(mobileMaterials, null, 2)};\n`,
);

let html = fs.readFileSync(path.join(RENDERER_DIR, "index.html"), "utf8");
html = html
  .replace(
    '<link rel="stylesheet" href="./styles.css" />',
    '<link rel="manifest" href="./manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />\n    <link rel="stylesheet" href="./styles.css" />',
  )
  .replace(
    '<script type="module" src="./app.js"></script>',
    '<script src="./mobile-materials.js"></script>\n    <script defer src="./app.js"></script>\n    <script>\n      if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {\n        navigator.serviceWorker.register("./service-worker.js");\n      }\n    </script>',
  );
fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html);

const pwaManifest = {
  name: "asmr3d空间渲染器",
  short_name: "asmr3d",
  version: "0.1",
  start_url: "./index.html",
  scope: "./",
  display: "standalone",
  background_color: "#111416",
  theme_color: "#111416",
  icons: [
    {
      src: "./icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "./icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
};
fs.writeFileSync(
  path.join(OUTPUT_DIR, "manifest.webmanifest"),
  `${JSON.stringify(pwaManifest, null, 2)}\n`,
);

const cacheAssets = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./enhance.js",
  "./mobile-materials.js",
  "./background.jpg",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  ...mobileMaterials.map((item) => `./${item.file}`),
];
fs.writeFileSync(
  path.join(OUTPUT_DIR, "service-worker.js"),
  `const CACHE_NAME = "asmr3d-v0.2-mobile";
const ASSETS = ${JSON.stringify(cacheAssets, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`,
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, "README.md"),
  `# asmr3d空间渲染器 v0.2 公测版（手机版）

## 推荐运行方式

1. 确保手机和电脑连接同一个 Wi-Fi。
2. 在电脑上运行 \`renderer/server.mjs\`。
3. 手机浏览器打开电脑输出的局域网地址，例如：

\`\`\`text
http://电脑局域网IP:4173/mobile/
\`\`\`

4. 页面加载后，可直接使用内置示例，也可以点击“选择文件”载入手机中的音频。

## 添加到手机桌面

通过局域网或 HTTPS 打开后：

1. 打开浏览器菜单。
2. 选择“添加到主屏幕”或“安装应用”。
3. 安装后可以从桌面直接启动。

## 播放测试流程

1. 选择“软件内置素材库”或“导入本地文件”。
2. 选择渲染方式：

   - 双耳兼容（推荐！）：用于 KU100、假人头录音和普通双耳/立体声成品。
   - 浏览器 HRTF：用于快速试听单声道对象。
   - 参数化 HRTF：用于检查 ILD、ITD、头部阴影和仰角滤波。
   - Bypass：保留原始左右声道，用于 A/B 对照。

3. 点击“播放”。
4. 调整方位角、仰角、距离和输出音量。
5. 使用音频进度条拖动跳转，或点击前进/后退 10 秒。

## 导出流程

1. 先设置好渲染模式和所有空间参数。
2. 在“导出成品音频”中选择 WAV 位深：

   - 16-bit PCM：文件更小，适合手机和分享。
   - 24-bit PCM：文件更大，动态精度更高。

3. 选择导出范围：

   - 完整文件（离线渲染）：一次性编译整段音频，可在后台运行，不能取消。
   - 指定片段（实时捕获）：按播放速度捕获 5～120 秒，可取消。

4. 点击“开始导出”。
5. 导出完成后，浏览器会把 WAV 文件保存到“下载”目录。

## 注意事项

- Web Audio 必须由用户点击后才能启动。
- 建议使用 Android Chrome 或 Edge，兼容性通常最好。
- 完整导出长音频会占用较多内存，建议先使用 16-bit WAV。
- 实时片段导出期间不要锁屏或切走太久。
- 直接打开本地 \`index.html\` 时，部分手机浏览器会限制本地文件读取，因此局域网或 HTTPS 方式更可靠。
- 如果手机打不开局域网地址，请检查两台设备是否在同一 Wi-Fi，并允许 Node.js 通过 Windows 专用网络防火墙。

## 已包含

- 双耳兼容（推荐）默认模式。
- 浏览器 HRTF、参数化 HRTF 和 Bypass。
- 方位、仰角、距离、音量控制。
- 完整文件离线导出和片段实时导出。
- 4 条内置示例素材。
- 本地音频文件上传。

## 说明

- 手机端完整导出长文件需要大量内存。
- Web Audio 必须由用户点击后启动。
- 部分手机浏览器打开本地 HTML 时可能限制本地文件读取，此时请使用本地服务器或 HTTPS 部署。
`,
);

if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH, { force: true });
execFileSync("tar.exe", ["-a", "-c", "-f", ZIP_PATH, "-C", OUTPUT_DIR, "."], {
  stdio: "inherit",
});

console.log(`Mobile build: ${OUTPUT_DIR}`);
console.log(`Archive: ${ZIP_PATH}`);
