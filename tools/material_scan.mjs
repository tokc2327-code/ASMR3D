import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "D:/codex/Codex/resources/cua_node/bin/node_modules/playwright",
);

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const searches = [
  ["binaural-recording", "binaural recording"],
  ["dummy-head", "dummy head recording"],
  ["asmr-whisper", "asmr whisper"],
  ["asmr-tapping", "asmr tapping"],
  ["asmr-brushing", "asmr brushing"],
  ["mic-brushing", "microphone brushing"],
  ["hair-brushing", "hair brushing"],
  ["mouth-sounds", "asmr mouth sounds"],
  ["ear-cleaning", "ear cleaning"],
  ["crinkle", "crinkle close up"],
  ["water-bubbles", "water bubbles close"],
  ["keyboard-close", "keyboard close recording"],
  ["scissors-haircut", "scissors haircut stereo"],
  ["page-turning", "page turning close"],
  ["rain-close", "rain close stereo"],
  ["room-tone", "room tone stereo"],
  ["field-ambience", "field recording ambience stereo"],
  ["pink-noise", "pink noise stereo"],
  ["sine-sweep", "sine sweep stereo"],
  ["impulse", "impulse stereo"],
];

function buildSearchUrl(query, channels, sort = "") {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("f", `license:"Creative Commons 0" channels:${channels}`);
  if (sort) params.set("s", sort);
  return `https://freesound.org/search/?${params.toString()}`;
}

async function scanSearch(page, [category, query], channels) {
  await page.goto(buildSearchUrl(query, channels), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1200);

  return page.locator(".bw-search__result").evaluateAll((cards) => {
    return cards.map((card) => {
      const player = card.querySelector(".bw-player");
      const heading = card.querySelector("h5 a");
      const license = Array.from(card.querySelectorAll("a"))
        .map((anchor) => anchor.textContent?.trim() ?? "")
        .find((text) => text.startsWith("Creative Commons"));
      const text = card.innerText.replace(/\s+/g, " ").trim();
      const tags = Array.from(card.querySelectorAll('a[href^="/browse/tags/"]'))
        .map((anchor) => anchor.textContent?.trim())
        .filter(Boolean);

      return {
        id: Number(player?.getAttribute("data-sound-id")),
        username: player?.getAttribute("data-username"),
        title: player?.getAttribute("data-title"),
        duration: Number(player?.getAttribute("data-duration")),
        sampleRate: Number(player?.getAttribute("data-samplerate")),
        mp3: player?.getAttribute("data-mp3"),
        ogg: player?.getAttribute("data-ogg"),
        url: heading?.href,
        license,
        tags,
        text,
      };
    });
  });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: EDGE,
});

function compact(candidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    username: candidate.username,
    duration: candidate.duration,
    sampleRate: candidate.sampleRate,
    url: candidate.url,
    license: candidate.license,
    tags: candidate.tags.slice(0, 8),
    description: candidate.text.slice(0, 220),
  };
}

try {
  const page = await browser.newPage();
  for (const search of searches) {
    const stereo = await scanSearch(page, search, 2);
    const mono = await scanSearch(page, search, 1);
    console.log(
      JSON.stringify({
        category: search[0],
        query: search[1],
        stereo: stereo.slice(0, 3).map(compact),
        mono: mono.slice(0, 2).map(compact),
      }),
    );
  }
} finally {
  await browser.close();
}
