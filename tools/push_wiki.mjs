// Publishes the local wiki/ folder to the repository's GitHub Wiki.
//
//   node tools/push_wiki.mjs
//
// Requires the wiki to be initialised once through the web UI
// (Repository → Wiki → "Create the first page"), otherwise the .wiki.git
// repository does not exist yet.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI_DIR = path.join(ROOT, "wiki");
const OWNER = "tokc2327-code";
const REPO = "ASMR3D";

function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  for (const name of [".github-token", ".github-token.txt"]) {
    const tokenFile = path.join(__dirname, name);
    if (!fs.existsSync(tokenFile)) continue;
    const value = fs.readFileSync(tokenFile, "utf8").trim();
    if (value) return value;
  }
  return "";
}

const TOKEN = readToken();
if (!TOKEN) {
  throw new Error(
    "缺少 GitHub 令牌：设置 GITHUB_TOKEN，或把令牌写入 tools/.github-token(.txt)。",
  );
}
if (!fs.existsSync(WIKI_DIR)) {
  throw new Error(`找不到 wiki 源目录：${WIKI_DIR}`);
}

// GitHub 的 git 端点用 HTTP Basic（用户名 x-access-token）；令牌放在 http 头里，
// 不出现在 URL 与错误信息中。
const basicAuth = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
const gitAuth = ["-c", `http.extraheader=AUTHORIZATION: basic ${basicAuth}`];
const remoteUrl = `https://github.com/${OWNER}/${REPO}.wiki.git`;
const workDir = path.join(os.tmpdir(), `asmr3d-wiki-${Date.now()}`);

function git(args, options = {}) {
  return execFileSync("git", [...gitAuth, ...args], {
    cwd: options.cwd || workDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    windowsHide: true,
  });
}

try {
  console.log(`克隆 ${remoteUrl} …`);
  try {
    git(["clone", "--depth", "1", remoteUrl, workDir], { cwd: ROOT });
  } catch {
    throw new Error(
      "克隆 Wiki 失败。请先在网页上创建第一页以初始化 Wiki：" +
        `https://github.com/${OWNER}/${REPO}/wiki`,
    );
  }

  const pages = fs
    .readdirSync(WIKI_DIR)
    .filter((name) => name.endsWith(".md"));
  for (const page of pages) {
    fs.copyFileSync(path.join(WIKI_DIR, page), path.join(workDir, page));
  }
  console.log(`复制 ${pages.length} 个页面：${pages.join("、")}`);

  git(["add", "-A"]);
  const status = git(["status", "--porcelain"], { capture: true }).trim();
  if (!status) {
    console.log("Wiki 内容没有变化，无需提交。");
  } else {
    git([
      "-c",
      "user.name=asmr3d",
      "-c",
      "user.email=asmr3d@users.noreply.github.com",
      "commit",
      "-m",
      "Update wiki for v0.3.1 公测版",
    ]);
    git(["push", "origin", "HEAD"]);
    console.log("已推送。");
  }
  console.log(`Wiki: https://github.com/${OWNER}/${REPO}/wiki`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
