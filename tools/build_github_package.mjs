import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const GITHUB_ROOT = path.join(DIST, "github-package");
const SOURCE_DIR = path.join(GITHUB_ROOT, "asmr3d-v0.3-source");
const SOURCE_ZIP = path.join(DIST, "asmr3d-v0.3-github-source.zip");
const RELEASE_DIR = path.join(GITHUB_ROOT, "release-assets");
const RELEASE_ZIP = path.join(DIST, "asmr3d-v0.3-release-assets.zip");

const ignored = [
  "node_modules",
  "tools\\android-build",
  "tools\\electron-runtime",
  "android\\.gradle",
  "android\\.kotlin",
  "android\\build",
  "android\\app\\build",
  "android\\capacitor-cordova-android-plugins",
  "android\\keystore.properties",
  "android\\asmr3d-release.keystore",
  "android\\local.properties",
  "renderer\\server.log",
  "renderer\\server.err",
  "renderer\\server.pid",
  // 凭据不进源码包
  "tools\\.github-token",
  "tools\\.github-token.txt",
];

function resetDirectory(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(DIST)) {
    throw new Error(`Refusing to reset outside dist: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function shouldIgnore(relativePath) {
  const normalized = relativePath.replaceAll("/", "\\");
  return ignored.some(
    (entry) => normalized === entry || normalized.startsWith(`${entry}\\`),
  );
}

function copyTree(source, destination, relative = "") {
  const stat = fs.statSync(source);
  const nextRelative = relative ? path.join(relative, path.basename(source)) : path.basename(source);

  if (shouldIgnore(nextRelative)) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyTree(path.join(source, entry), path.join(destination, entry), nextRelative);
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

resetDirectory(GITHUB_ROOT);

for (const file of [
  ".gitignore",
  "LICENSE",
  "README.md",
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
]) {
  copyTree(path.join(ROOT, file), path.join(SOURCE_DIR, file));
}

for (const directory of [
  "renderer",
  "desktop",
  "docs",
  "wiki",
  "design",
  "obsidian",
  "tools",
  "materials",
  "android",
]) {
  copyTree(path.join(ROOT, directory), path.join(SOURCE_DIR, directory));
}

for (const [source, destination] of [
  ["APK_使用教程.md", "docs/APK_使用教程.md"],
  ["ANDROID_INSTALL.md", "docs/ANDROID_INSTALL.md"],
  ["WINDOWS_INSTALL.md", "docs/WINDOWS_INSTALL.md"],
]) {
  const from = path.join(DIST, source);
  if (!fs.existsSync(from)) {
    console.warn(`跳过不存在的文档: ${source}`);
    continue;
  }
  fs.mkdirSync(path.dirname(path.join(SOURCE_DIR, destination)), {
    recursive: true,
  });
  fs.copyFileSync(from, path.join(SOURCE_DIR, destination));
}

fs.rmSync(SOURCE_ZIP, { force: true });
execFileSync("tar.exe", ["-a", "-c", "-f", SOURCE_ZIP, "-C", SOURCE_DIR, "."], {
  stdio: "inherit",
});

fs.mkdirSync(RELEASE_DIR, { recursive: true });
for (const file of [
  "asmr3d-v0.3-win-x64.zip",
  "asmr3d-v0.3-mobile.zip",
  "WINDOWS_INSTALL.md",
]) {
  const from = path.join(DIST, file);
  if (!fs.existsSync(from)) {
    console.warn(`跳过不存在的发布资源: ${file}`);
    continue;
  }
  fs.copyFileSync(from, path.join(RELEASE_DIR, file));
}

// 为随包发布的压缩包补一份 SHA-256（Windows 版自带 PowerShell，体积大，值得校验）。
for (const name of ["asmr3d-v0.3-win-x64.zip", "asmr3d-v0.3-mobile.zip"]) {
  const target = path.join(RELEASE_DIR, name);
  if (!fs.existsSync(target)) continue;
  const hash = createHash("sha256")
    .update(fs.readFileSync(target))
    .digest("hex")
    .toUpperCase();
  fs.writeFileSync(
    path.join(RELEASE_DIR, `${name}.sha256`),
    `${hash}  ${name}\n`,
  );
}

fs.rmSync(RELEASE_ZIP, { force: true });
execFileSync("tar.exe", ["-a", "-c", "-f", RELEASE_ZIP, "-C", RELEASE_DIR, "."], {
  stdio: "inherit",
});

for (const archive of [SOURCE_ZIP, RELEASE_ZIP]) {
  const hash = createHash("sha256")
    .update(fs.readFileSync(archive))
    .digest("hex")
    .toUpperCase();
  fs.writeFileSync(`${archive}.sha256`, `${hash}  ${path.basename(archive)}\n`);
  console.log(`${archive} (${(fs.statSync(archive).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`SHA256: ${hash}`);
}
