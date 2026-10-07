import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "dist", "context");
const OUTPUT_MD = path.join(OUTPUT_DIR, "asmr3d-project-context.md");
const OUTPUT_ZIP = path.join(ROOT, "dist", "asmr3d-project-context.zip");

const ignoredSegments = new Set([
  ".git",
  ".gradle",
  ".kotlin",
  "android-build",
  "build",
  "dist",
  "electron-runtime",
  "node_modules",
]);

const ignoredFiles = new Set([
  "keystore.properties",
  "local.properties",
  "server.err",
  "server.log",
  "server.pid",
]);

const binaryExtensions = new Set([
  ".apk",
  ".exe",
  ".ico",
  ".jpg",
  ".jpeg",
  ".ogg",
  ".png",
  ".wav",
  ".zip",
]);

const textExtensions = new Set([
  "",
  ".css",
  ".gradle",
  ".html",
  ".java",
  ".js",
  ".json",
  ".kt",
  ".md",
  ".mjs",
  ".properties",
  ".ps1",
  ".svg",
  ".txt",
  ".xml",
]);

function relative(absolutePath) {
  return path.relative(ROOT, absolutePath).replaceAll("\\", "/");
}

function shouldIgnore(absolutePath) {
  const rel = relative(absolutePath);
  const parts = rel.split("/");
  if (parts.some((part) => ignoredSegments.has(part))) return true;
  if (path.extname(absolutePath).toLowerCase() === ".keystore") return true;
  return ignoredFiles.has(path.basename(absolutePath));
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (shouldIgnore(absolute)) continue;
    if (entry.isDirectory()) {
      walk(absolute, output);
    } else if (entry.isFile()) {
      output.push(absolute);
    }
  }
  return output;
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")
    .toUpperCase();
}

function fenceFor(content) {
  const runs = content.match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function languageFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "css",
      ".gradle": "groovy",
      ".html": "html",
      ".java": "java",
      ".js": "javascript",
      ".json": "json",
      ".kt": "kotlin",
      ".md": "markdown",
      ".mjs": "javascript",
      ".properties": "properties",
      ".ps1": "powershell",
      ".svg": "xml",
      ".txt": "text",
      ".xml": "xml",
    }[extension] || "text"
  );
}

function codeBlock(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
  const fence = fenceFor(content);
  return `${fence}${languageFor(filePath)}\n${content}\n${fence}`;
}

function treeLines(directory, prefix = "") {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !shouldIgnore(path.join(directory, entry.name)))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  const lines = [];
  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    lines.push(`${prefix}${last ? "└── " : "├── "}${entry.name}`);
    if (entry.isDirectory()) {
      lines.push(
        ...treeLines(
          path.join(directory, entry.name),
          `${prefix}${last ? "    " : "│   "}`,
        ),
      );
    }
  });
  return lines;
}

function importantArtifacts() {
  const files = [
    "dist/asmr3d-v0.3-test.apk",
    "dist/asmr3d-v0.3-android.zip",
    "dist/asmr3d-v0.3-win-x64.zip",
    "dist/asmr3d-v0.3-mobile.zip",
    "dist/asmr3d-v0.3-github-source.zip",
    "dist/asmr3d-v0.3-release-assets.zip",
  ];
  return files
    .filter((file) => fs.existsSync(path.join(ROOT, file)))
    .map((file) => {
      const absolute = path.join(ROOT, file);
      return `| \`${file}\` | ${fs.statSync(absolute).size} | \`${sha256(
        absolute,
      )}\` |`;
    })
    .join("\n");
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const allFiles = walk(ROOT);
const textFiles = allFiles.filter((file) =>
  textExtensions.has(path.extname(file).toLowerCase()),
);
const binaryFiles = allFiles.filter(
  (file) => !textFiles.includes(file) || binaryExtensions.has(path.extname(file).toLowerCase()),
);

const sections = [];
sections.push(`# asmr3d 项目上下文快照

生成时间：

\`\`\`text
${new Date().toISOString()}
\`\`\`

GitHub 仓库：

\`\`\`text
https://github.com/tokc2327-code/ASMR3D
\`\`\`

Release：

\`\`\`text
https://github.com/tokc2327-code/ASMR3D/releases/tag/v0.3-beta
\`\`\`

当前版本：

\`\`\`text
v0.3 公测版
\`\`\`

## 当前平台

- 网页版：Node 静态服务器 + Web Audio。
- Android：Capacitor 8 + 原生 WAV 保存和系统分享。
- Windows：Electron 44 便携版。
- 当前音频算法：单声道对象 HRTF、参数化 HRTF、双耳兼容、Bypass。
- 当前在线导出：完整文件离线渲染和 5～120 秒实时片段捕获。
- 当前已实现：按应用直播截获（Windows 进程回环）+ 同步分段录制，成品统一输出到 EXE 同级"输出"文件夹。
- 已移除：系统输出回环采集（会把自身输出抓回去，产生自激回声和啸叫）。

## 实时抓取直播音频的实现结论

- Windows 最终方案：应用级进程回环（\`ActivateAudioInterfaceAsync\` + \`VAD\\Process_Loopback\`），只抓取所选应用，需要 PowerShell 7。
- Electron \`desktopCapturer\` 的系统 loopback 实测抓不到 Edge 音频，已放弃。
- 系统输出回环已删除：它会把 asmr3d 自身输出一起采集，形成自激回路（多层回声/啸叫）。
- 回声处理：会话音量是线性的，把目标应用压到 1%（−40 dB）后在渲染链补偿等量增益，既能实时监听渲染结果又听不到原声。
- 录制方式：分流点放在渲染链末端（耳机之前），因此录制中途调整方位角/仰角/距离都会写进成品。

## 重要构建产物

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
${importantArtifacts()}

## 排除内容

- \`node_modules\`
- \`tools/android-build\`
- Android 签名密钥和 \`keystore.properties\`
- Gradle、Kotlin、Android 构建缓存
- 日志和 pid 文件
- APK、EXE、音频和图片二进制内容
`);

sections.push(`## 项目目录树

\`\`\`text
.
${treeLines(ROOT).join("\n")}
\`\`\`
`);

const priorityFiles = [
  "README.md",
  "LICENSE",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
];
const prioritySet = new Set(priorityFiles.map((file) => path.join(ROOT, file)));

for (const file of priorityFiles) {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) continue;
  sections.push(`## 文件：${file}\n\n${codeBlock(absolute)}`);
}

const grouped = new Map();
for (const file of textFiles) {
  if (prioritySet.has(file)) continue;
  const rel = relative(file);
  const top = rel.split("/")[0];
  if (!grouped.has(top)) grouped.set(top, []);
  grouped.get(top).push(rel);
}

for (const [group, files] of [...grouped.entries()].sort()) {
  sections.push(`# ${group}\n`);
  for (const file of files.sort()) {
    sections.push(`## 文件：${file}\n\n${codeBlock(path.join(ROOT, file))}`);
  }
}

sections.push(`## 二进制与媒体文件清单

以下文件不嵌入内容，只记录路径、大小和 SHA-256：

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
${binaryFiles
  .sort((left, right) => relative(left).localeCompare(relative(right)))
  .map((file) => {
    const rel = relative(file);
    return `| \`${rel}\` | ${fs.statSync(file).size} | \`${sha256(file)}\` |`;
  })
  .join("\n")}
`);

fs.writeFileSync(OUTPUT_MD, sections.join("\n\n"));
if (fs.existsSync(OUTPUT_ZIP)) fs.rmSync(OUTPUT_ZIP, { force: true });
const { execFileSync } = await import("node:child_process");
execFileSync("tar.exe", ["-a", "-c", "-f", OUTPUT_ZIP, "-C", OUTPUT_DIR, "."], {
  stdio: "inherit",
});

console.log(`Markdown: ${OUTPUT_MD}`);
console.log(`Archive: ${OUTPUT_ZIP}`);
console.log(`Files indexed: ${allFiles.length}`);
