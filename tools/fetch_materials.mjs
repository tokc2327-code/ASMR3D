import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "D:/codex/Codex/resources/cua_node/bin/node_modules/playwright",
);

const ROOT = "D:/codex/asmr3d";
const MATERIALS_DIR = path.join(ROOT, "materials");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const selected = [
  { id: 171335, category: "01_binaural_reference", slug: "music_box_horizontal" },
  { id: 169373, category: "01_binaural_reference", slug: "music_box_vertical" },
  { id: 169329, category: "01_binaural_reference", slug: "matchbox_dropped" },
  { id: 634100, category: "01_binaural_reference", slug: "binaural_train" },
  { id: 434059, category: "01_binaural_reference", slug: "dummy_head_insects" },
  { id: 471614, category: "01_binaural_reference", slug: "portland_backyard" },
  { id: 869494, category: "01_binaural_reference", slug: "binaural_shower_sweep" },

  { id: 513411, category: "02_asmr_nearfield", slug: "woman_whisper" },
  { id: 690082, category: "02_asmr_nearfield", slug: "fingernail_tap" },
  { id: 419727, category: "02_asmr_nearfield", slug: "asmr_tapping" },
  { id: 475701, category: "02_asmr_nearfield", slug: "hair_brushing" },
  { id: 803595, category: "02_asmr_nearfield", slug: "mic_foam_brushing" },
  { id: 530346, category: "02_asmr_nearfield", slug: "mouth_sounds" },
  { id: 690078, category: "02_asmr_nearfield", slug: "ear_cleaning" },
  { id: 559764, category: "02_asmr_nearfield", slug: "breadbag_crinkle" },
  { id: 543479, category: "02_asmr_nearfield", slug: "haircut_scissors" },
  { id: 425467, category: "02_asmr_nearfield", slug: "turning_pages" },
  { id: 830496, category: "02_asmr_nearfield", slug: "mechanical_keyboard" },

  { id: 485043, category: "03_environment_distance", slug: "outside_birds" },
  { id: 535870, category: "03_environment_distance", slug: "rain_inside_car" },
  { id: 268579, category: "03_environment_distance", slug: "tap_water" },
  { id: 137288, category: "03_environment_distance", slug: "rain_old_theater" },

  { id: 349312, category: "04_test_signals", slug: "pink_noise_delayed_stereo" },
  { id: 215691, category: "04_test_signals", slug: "acoustic_measurement_suite" },
  { id: 192337, category: "04_test_signals", slug: "shower_clap_impulse" },
  { id: 724024, category: "04_test_signals", slug: "underpass_impulse" },

  { id: 807393, category: "05_mono_controls", slug: "apple_eating_mono" },
  { id: 565204, category: "05_mono_controls", slug: "keyboard_mono" },
  { id: 705058, category: "05_mono_controls", slug: "underwater_bubbles_mono" },
  { id: 350814, category: "05_mono_controls", slug: "rhythmic_brush_mono" },
];

const blockedWords = [
  "18+",
  "cum",
  "erotic",
  "explicit",
  "fuck",
  "hentai",
  "incest",
  "sex",
  "sexual",
];

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

async function probeAudio(page, filePath) {
  await page.goto(pathToFileURL(filePath).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => {
      const media = document.querySelector("audio,video");
      return media && (media.readyState >= 1 || media.error);
    },
    null,
    { timeout: 30_000 },
  );
  const decoded = await page.evaluate(() => {
    const media = document.querySelector("audio,video");
    if (!media) throw new Error("Browser did not expose a media element");
    if (media.error) throw new Error(media.error.message);
    return {
      duration: media.duration,
      readyState: media.readyState,
    };
  });

  return {
    browserDecoded: true,
    decodedDuration: decoded.duration,
    readyState: decoded.readyState,
    size: fs.statSync(filePath).size,
  };
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll(/\s+/g, " ").trim();
}

async function getSoundMetadata(page, id) {
  await page.goto(`https://freesound.org/s/${id}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(500);

  return page.evaluate(() => {
    const player = document.querySelector(".bw-player");
    if (!player) throw new Error("No Freesound player found");

    const soundId = player.getAttribute("data-sound-id");
    const soundAnchor = Array.from(
      document.querySelectorAll('a[href*="/sounds/"]'),
    ).find((anchor) => new RegExp(`/sounds/${soundId}/?$`).test(anchor.href));
    const canonicalUrl =
      document.querySelector('link[rel="canonical"]')?.href ||
      soundAnchor?.href ||
      window.location.href;
    const usernameFromUrl = new URL(canonicalUrl).pathname
      .split("/")
      .filter(Boolean)[1];
    const licenseLink = Array.from(document.querySelectorAll("a")).find((anchor) =>
      /creativecommons\.org/.test(anchor.href),
    );
    const titleLink = document.querySelector("h1 a, h1");
    const description =
      document.querySelector(".sound_description")?.textContent?.trim() ||
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "";
    const tags = Array.from(document.querySelectorAll(".sound_tags a"))
      .map((anchor) => anchor.textContent?.trim())
      .filter(Boolean);

    return {
      id: Number(player.getAttribute("data-sound-id")),
      title: player.getAttribute("data-title"),
      username: player.getAttribute("data-username") || usernameFromUrl,
      userId: player.getAttribute("data-user-id"),
      duration: Number(player.getAttribute("data-duration")),
      sampleRate: Number(player.getAttribute("data-samplerate")),
      mp3: player.getAttribute("data-mp3"),
      ogg: player.getAttribute("data-ogg"),
      pageTitle: titleLink?.textContent?.trim() || document.title,
      pageUrl: canonicalUrl,
      licenseText: licenseLink?.textContent?.trim() || "",
      licenseUrl: licenseLink?.href || "",
      description,
      tags,
      pageText: document.body.innerText,
    };
  });
}

async function downloadPreview(context, metadata) {
  const hq = metadata.ogg?.replace("-lq.ogg", "-hq.ogg");
  let response = hq ? await context.request.get(hq, { timeout: 120_000 }) : null;
  let quality = "hq";

  if (!response?.ok()) {
    response = await context.request.get(metadata.ogg, { timeout: 120_000 });
    quality = "lq";
  }
  if (!response.ok()) {
    throw new Error(`Preview download failed: ${response.status()} ${response.url()}`);
  }

  return {
    body: await response.body(),
    quality,
    url: response.url(),
  };
}

ensureDir(MATERIALS_DIR);

const browser = await chromium.launch({
  headless: true,
  executablePath: EDGE,
});

const manifest = [];

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const probePage = await context.newPage();

  for (const item of selected) {
    const metadata = await getSoundMetadata(page, item.id);
    if (metadata.id !== item.id) {
      throw new Error(`Sound ID mismatch: expected ${item.id}, got ${metadata.id}`);
    }
    if (metadata.licenseText !== "Creative Commons 0") {
      throw new Error(
        `Refusing non-CC0 sound ${item.id}: ${metadata.licenseText || "unknown"}`,
      );
    }
    const searchable = `${metadata.title} ${metadata.description} ${metadata.tags.join(" ")}`;
    const blocked = blockedWords.find((word) =>
      searchable.toLowerCase().includes(word),
    );
    if (blocked) {
      throw new Error(`Refusing possibly explicit sound ${item.id}: ${blocked}`);
    }

    const categoryDir = path.join(MATERIALS_DIR, item.category);
    ensureDir(categoryDir);
    const fileName = `${String(item.id).padStart(7, "0")}_${item.slug}.ogg`;
    const filePath = path.join(categoryDir, fileName);

    if (!fs.existsSync(filePath)) {
      const preview = await downloadPreview(context, metadata);
      fs.writeFileSync(filePath, preview.body);
      metadata.previewUrl = preview.url;
      metadata.previewQuality = preview.quality;
    } else {
      metadata.previewUrl = metadata.ogg
        ?.replace("-lq.ogg", "-hq.ogg")
        .replace("-hq.ogg", "-hq.ogg");
      metadata.previewQuality = "hq";
    }

    const fileMetadata = await probeAudio(probePage, filePath);
    const sourceChannels = item.category === "05_mono_controls" ? 1 : 2;
    const record = {
      id: item.id,
      category: item.category,
      slug: item.slug,
      title: metadata.title,
      author: metadata.username,
      authorId: metadata.userId,
      originalPage: metadata.pageUrl,
      license: metadata.licenseText,
      licenseUrl: metadata.licenseUrl,
      previewUrl: metadata.previewUrl,
      previewQuality: metadata.previewQuality,
      sourceMetadata: {
        duration: metadata.duration,
        sampleRate: metadata.sampleRate,
        channels: sourceChannels,
        tags: metadata.tags,
      },
      file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
      fileMetadata,
    };
    manifest.push(record);
    console.log(
      `${item.id} ${record.title} -> ${record.file} ` +
        `(${sourceChannels}ch/${metadata.sampleRate}Hz/${fileMetadata.decodedDuration.toFixed(1)}s)`,
    );
  }
} finally {
  await browser.close();
}

const generatedAt = new Date().toISOString();
fs.writeFileSync(
  path.join(MATERIALS_DIR, "manifest.json"),
  `${JSON.stringify({ generatedAt, source: "Freesound CC0", items: manifest }, null, 2)}\n`,
);

const csvHeader = [
  "id",
  "category",
  "title",
  "author",
  "license",
  "original_page",
  "file",
  "channels",
  "sample_rate",
  "duration_sec",
  "size_bytes",
];
const csvRows = manifest.map((item) => [
  item.id,
  item.category,
  item.title,
  item.author,
  item.license,
  item.originalPage,
  item.file,
  item.sourceMetadata.channels,
  item.sourceMetadata.sampleRate,
  item.fileMetadata.decodedDuration.toFixed(3),
  item.fileMetadata.size,
]);
const csv = [csvHeader, ...csvRows]
  .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
  .join("\n");
fs.writeFileSync(path.join(MATERIALS_DIR, "manifest.csv"), `${csv}\n`);

const readme = `# ASMR 空间音频测试素材

本目录由 \`tools/fetch_materials.mjs\` 从 Freesound 自动收集，时间为 ${generatedAt}。

## 使用范围

- 所有素材均为 Freesound 标注的 **Creative Commons 0**。
- CC0 允许复制、修改、分发和商业使用，无需署名；本清单仍保留来源和作者，便于复核。
- 下载文件是 Freesound 的 **HQ OGG 预览**，不是作者上传的原始 WAV/FLAC。
- 预览适合交互和主观听感测试，不应替代母带用于最终客观指标验收。
- \`04_test_signals\` 中的测量信号可能包含高电平脉冲或扫频，测试前必须降低监听音量。

## 类别

| 目录 | 用途 |
|---|---|
| \`01_binaural_reference\` | 已知双耳/dummy-head 录音，用于方向、外部化和前后混淆检查 |
| \`02_asmr_nearfield\` | 耳语、敲击、刷麦克风、口腔声、耳部清洁、包装纸等近场素材 |
| \`03_environment_distance\` | 雨、鸟鸣、水声等环境声，用于距离、混响和声场宽度的内容差异测试 |
| \`04_test_signals\` | 粉红噪声、冲激和测量扫频，用于客观检查与稳健性测试 |
| \`05_mono_controls\` | 单声道对照，用于验证中心/单声道素材无法被中侧处理横向旋转 |

## 文件

- \`manifest.json\`：完整来源、许可证、页面、文件和分析元数据。
- \`manifest.csv\`：便于表格和批量脚本读取的简表。

## 复现

在项目根目录运行：

\`\`\`powershell
& 'D:\\codex\\Codex\\resources\\cua_node\\bin\\node.exe' '.\\tools\\fetch_materials.mjs'
\`\`\`

脚本会跳过已经存在的文件，并重建清单。
`;
fs.writeFileSync(path.join(MATERIALS_DIR, "README.md"), readme);

const sourceTable = manifest
  .map(
    (item) =>
      `| ${item.id} | ${markdownCell(item.title)} | ${markdownCell(item.author)} | ${markdownCell(item.category)} | ${markdownCell(item.license)} | [原始页面](${item.originalPage}) |`,
  )
  .join("\n");
fs.writeFileSync(
  path.join(MATERIALS_DIR, "SOURCES.md"),
  `# 素材来源与许可\n\n| ID | 标题 | 作者 | 类别 | 许可证 | 来源 |\n|---:|---|---|---|---|---|\n${sourceTable}\n`,
);

console.log(`Downloaded ${manifest.length} files into ${MATERIALS_DIR}`);
