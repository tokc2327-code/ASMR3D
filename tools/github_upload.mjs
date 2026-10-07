import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(
  ROOT,
  "dist",
  "github-package",
  "asmr3d-v0.3.1-source",
);
const RELEASE_DIR = path.join(
  ROOT,
  "dist",
  "github-package",
  "release-assets",
);
const OWNER = "tokc2327-code";
const REPO = "ASMR3D";
// Token can come from the environment or from tools/.github-token (gitignored)
// so it never needs to be pasted anywhere permanent.
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
    "缺少 GitHub 令牌：请设置环境变量 GITHUB_TOKEN，或把令牌写入 tools/.github-token（或 tools/.github-token.txt）。",
  );
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${TOKEN}`,
  "User-Agent": "asmr3d-github-uploader",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} ${endpoint}: ${
        data?.message || response.statusText
      }`,
    );
  }
  return data;
}

function collectFiles(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextRelative = relative
      ? path.join(relative, entry.name)
      : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute, nextRelative));
    } else if (entry.isFile()) {
      files.push({
        absolute,
        relative: nextRelative.replaceAll("\\", "/"),
      });
    }
  }
  return files;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await callback(items[current], current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function getCurrentCommit() {
  try {
    const ref = await github(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    return await github(
      `/repos/${OWNER}/${REPO}/git/commits/${ref.object.sha}`,
    );
  } catch (error) {
    if (
      String(error.message).includes("404") ||
      String(error.message).includes("409")
    ) {
      return null;
    }
    throw error;
  }
}

async function uploadSource() {
  const files = collectFiles(SOURCE_DIR);
  console.log(`Uploading ${files.length} source files...`);
  let currentCommit = await getCurrentCommit();
  if (!currentCommit) {
    const readme = fs
      .readFileSync(path.join(SOURCE_DIR, "README.md"))
      .toString("base64");
    await github(`/repos/${OWNER}/${REPO}/contents/README.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Initialize repository",
        content: readme,
        branch: "main",
      }),
    });
    currentCommit = await getCurrentCommit();
  }

  const treeEntries = await mapLimit(files, 4, async (file, index) => {
    const content = fs.readFileSync(file.absolute).toString("base64");
    const blob = await github(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, encoding: "base64" }),
    });
    if ((index + 1) % 25 === 0 || index + 1 === files.length) {
      console.log(`  blobs ${index + 1}/${files.length}`);
    }
    return {
      path: file.relative,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    };
  });

  const tree = await github(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tree: treeEntries }),
  });
  const commit = await github(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: process.env.ASMR3D_COMMIT_MSG || "Release v0.3.1 公测版",
      tree: tree.sha,
      parents: currentCommit ? [currentCommit.sha] : [],
    }),
  });

  if (currentCommit) {
    await github(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await github(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
    });
  }
  console.log(`Source commit: ${commit.sha}`);
}

async function updateRepositoryMetadata() {
  const description =
    "asmr3d空间渲染器是一款面向ASMR、双耳音频与空间音频研究的本地渲染工具。项目支持单声道对象的HRTF与参数化HRTF渲染，也支持KU100、假人头和普通双耳录音的整体兼容处理。用户可实时调整方位角、仰角、距离与输出音量，查看和拖动播放进度，并将当前参数完整离线渲染为16-bit或24-bit WAV。工具完全离线运行，提供网页版、Android APK和Windows便携版，内置CC0示例素材，并采用Web Audio、Capacitor与Electron构建，适合听感测试、空间音频实验、教学演示和个人内容创作。项目不声称能从普通双耳录音中恢复独立声源或实现任意真实三维旋转，界面中已明确区分对象级HRTF与双耳兼容整体调节。代码以MIT许可证开放，音频测试素材均标注CC0来源。";
  await github(`/repos/${OWNER}/${REPO}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, has_issues: true, has_wiki: true }),
  });
  await github(`/repos/${OWNER}/${REPO}/topics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      names: [
        "asmr",
        "spatial-audio",
        "binaural",
        "hrtf",
        "web-audio",
        "capacitor",
        "electron",
        "android",
        "audio-processing",
      ],
    }),
  });
  console.log("Repository metadata and topics updated.");
}

async function getOrCreateRelease() {
  try {
    return await github(`/repos/${OWNER}/${REPO}/releases/tags/v0.3.1-beta`);
  } catch (error) {
    if (!String(error.message).includes("404")) throw error;
  }
  return github(`/repos/${OWNER}/${REPO}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: "v0.3.1-beta",
      target_commitish: "main",
      name: "asmr3d空间渲染器 v0.3.1 公测版",
      body:
        [
          "## v0.3.1 公测版",
          "",
          "### 修复",
          "- 修复直播截获在压低原声模式下被静音检测误判，约 30 秒后自动退出的问题",
          "- 静音自动停止默认关闭；需要时仍可手动选择 30 / 60 / 120 秒",
          "- 截获链路异常中断时自动重连，最多尝试 3 次，直播监听不中断",
          "",
          "### 新增",
          "- 文件管理器右键“打开方式”支持直接导入本地音频或视频",
          "- 支持单实例：软件已打开时再次打开文件，会送入当前窗口",
          "- 设置页/声音对象栏提供“注册到文件管理器打开方式”，写入当前用户设置，无需管理员权限",
          "- 检查更新发现新版本时提供“打开下载页”按钮，并使用软件实际版本进行比较",
          "",
          "### 说明",
          "- 便携版移动目录后，需要在设置中重新点击一次“注册到文件管理器打开方式”",
          "- 更新检查会读取 GitHub Releases 列表，可识别预发布版本",
          "- 代码 MIT，测试音频 CC0",
          "- Android APK 仍暂停维护，移动端请使用网页版 / PWA",
        ].join("\n"),
      draft: false,
      prerelease: true,
    }),
  });
}

async function uploadReleaseAssets(release) {
  const existing = await github(
    `/repos/${OWNER}/${REPO}/releases/${release.id}/assets?per_page=100`,
  );
  const existingNames = new Set(existing.map((asset) => asset.name));

  // 需要覆盖同名资源时（例如热修打包内容），先删掉旧的。
  if (process.env.ASMR3D_REPLACE_ASSETS === "1") {
    for (const asset of existing) {
      await github(
        `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`,
        { method: "DELETE" },
      );
      existingNames.delete(asset.name);
      console.log(`删除旧资源: ${asset.name}`);
    }
  }

  for (const entry of fs.readdirSync(RELEASE_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || existingNames.has(entry.name)) continue;
    const filePath = path.join(RELEASE_DIR, entry.name);
    const body = fs.readFileSync(filePath);
    const extension = path.extname(entry.name).toLowerCase();
    const contentType =
      extension === ".apk"
        ? "application/vnd.android.package-archive"
        : extension === ".zip"
          ? "application/zip"
          : extension === ".md"
            ? "text/markdown"
            : extension === ".sha256"
              ? "text/plain"
              : "application/octet-stream";

    const response = await fetch(
      `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(entry.name)}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": contentType,
        },
        body,
        signal: AbortSignal.timeout(60 * 60 * 1000),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Asset upload failed ${response.status} ${entry.name}: ${text}`,
      );
    }
    console.log(`Uploaded release asset: ${entry.name}`);
  }
}

if (process.env.ASMR3D_SKIP_SOURCE_UPLOAD === "1") {
  console.log("跳过 API 源码覆盖；使用 git push 保留提交历史。");
} else {
  await uploadSource();
}
await updateRepositoryMetadata();
const release = await getOrCreateRelease();
await uploadReleaseAssets(release);
console.log(`Release: ${release.html_url}`);
