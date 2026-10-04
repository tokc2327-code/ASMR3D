// Rewrites the version everywhere in one shot.
//
//   node tools/bump_version.mjs 0.3.0
//   node tools/bump_version.mjs 0.3.0 公测版 v0.3-beta
//   node tools/bump_version.mjs 0.3.0 --dry-run
//
// The label defaults to 公测版 and the release tag to v<major.minor>-beta.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [newVersion, newLabel = "公测版", newTagArg] = positional;

if (!/^\d+\.\d+\.\d+$/.test(newVersion || "")) {
  throw new Error("用法: node tools/bump_version.mjs <major.minor.patch> [显示标签] [发布标签]");
}

const oldVersion = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;
const short = (v) => `v${v.split(".").slice(0, 2).join(".")}`;
const oldShort = short(oldVersion);
const newShort = short(newVersion);
const newTag = newTagArg || `${newShort}-beta`;

const currentLabel = (() => {
  const html = fs.readFileSync(path.join(ROOT, "renderer", "index.html"), "utf8");
  const match = /version-badge">v[\d.]+ ([^<]+)</.exec(html);
  return match ? match[1].trim() : "测试版";
})();
const oldTag = (() => {
  const script = fs.readFileSync(
    path.join(ROOT, "tools", "github_upload.mjs"),
    "utf8",
  );
  const match = /tag_name: "([^"]+)"/.exec(script);
  return match ? match[1] : `${oldShort}-test`;
})();

const FILES = [
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
  "README.md",
  "renderer/index.html",
  "renderer/README.md",
  "renderer/server.mjs",
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "tools/build_android.ps1",
  "tools/build_context_bundle.mjs",
  "tools/build_exe.mjs",
  "tools/build_github_package.mjs",
  "tools/build_mobile.mjs",
  "tools/github_upload.mjs",
  ...fs
    .readdirSync(path.join(ROOT, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join("docs", name)),
];

// Order matters: replace the most specific strings first.
const replacements = [
  [`${oldShort} ${currentLabel}`, `${newShort} ${newLabel}`],
  [`${oldShort}${currentLabel}`, `${newShort}${newLabel}`],
  [oldTag, newTag],
  [`${oldShort}-`, `${newShort}-`],
  [`release ${oldShort}`, `release ${newShort}`],
  [`"version": "${oldVersion}"`, `"version": "${newVersion}"`],
  [`version: "${oldVersion}"`, `version: "${newVersion}"`],
];

let changedFiles = 0;
let changedHits = 0;

for (const relative of FILES) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) continue;
  const original = fs.readFileSync(absolute, "utf8");
  let next = original;
  let hits = 0;
  for (const [from, to] of replacements) {
    if (from === to) continue;
    const before = next;
    next = next.split(from).join(to);
    if (next !== before) {
      hits += before.split(from).length - 1;
    }
  }
  if (next === original) continue;
  changedFiles += 1;
  changedHits += hits;
  console.log(`${dryRun ? "[dry-run] " : ""}${relative}  (${hits} 处)`);
  if (!dryRun) fs.writeFileSync(absolute, next, "utf8");
}

console.log(
  `\n${dryRun ? "将修改" : "已修改"} ${changedFiles} 个文件 / ${changedHits} 处：` +
    `${oldShort} ${currentLabel} → ${newShort} ${newLabel}，` +
    `标签 ${oldTag} → ${newTag}，版本号 ${oldVersion} → ${newVersion}`,
);

if (!dryRun) {
  // package-lock 的 dependency 版本不能手改，交给 npm。
  execFileSync("npm", ["version", newVersion, "--no-git-tag-version", "--allow-same-version"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log("\n下一步：");
  console.log("  node tools/build_exe.mjs");
  console.log("  node tools/build_github_package.mjs");
  console.log("  node tools/github_upload.mjs");
}
