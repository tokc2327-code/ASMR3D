// Verifies the native process-loopback streaming path used by the Electron app.
//
//   node tools/live_capture_smoketest.mjs [processName] [seconds] [--list]
//
// Prints the active audio sessions, captures the chosen target, reports
// peak/RMS, and optionally writes a float32 WAV for manual listening.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { listLiveAudioTargets, startLiveCapture, CAPTURE_FORMAT } = require(
  "../desktop/live-capture.cjs",
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist", "live-capture-validation");

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const positional = args.filter((entry) => !entry.startsWith("--"));
const wantedName = positional[0] || "";
const seconds = Number(positional[1] || 10);

function formatTargets(targets) {
  if (targets.length === 0) {
    console.log("没有检测到活跃的音频会话。");
    return;
  }
  console.log("活跃音频会话：");
  for (const target of targets) {
    console.log(
      `  ${target.processName.padEnd(24)} pid=${String(target.processId).padEnd(8)} peak=${target.peak}`,
    );
  }
}

function writeFloatWav(filePath, samples, channels, sampleRate) {
  const dataSize = samples.length * 4;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const body = Buffer.from(samples.buffer, samples.byteOffset, dataSize);
  fs.writeFileSync(filePath, Buffer.concat([header, body]));
}

const capability = await listLiveAudioTargets();
console.log(
  `PowerShell ${capability.runtime} · 进程回环=${capability.processLoopback ? "可用" : "不可用"}`,
);
const targets = capability.targets;
formatTargets(targets);
if (listOnly) process.exit(0);

const selected = wantedName
  ? targets.find(
      (target) =>
        target.processName.toLowerCase() === wantedName.toLowerCase(),
    )
  : targets[0];

if (!selected) {
  console.error(`找不到目标进程：${wantedName || "(峰值最高的会话)"}`);
  process.exit(1);
}

console.log(
  `\n开始捕获 ${selected.processName} (pid=${selected.processId}) ${seconds} 秒……`,
);

const frames = [];
let totalFrames = 0;
let peak = 0;
let sumSquares = 0;
let sampleCount = 0;

const session = startLiveCapture({
  processId: selected.processId,
  onHeader: (header) => {
    console.log(
      `头信息：${header.processName} · ${header.sampleRate} Hz · ${header.channels} ch · ${header.format}`,
    );
  },
  onAudio: (chunk) => {
    const samples = new Float32Array(
      chunk.buffer,
      chunk.byteOffset,
      chunk.length / 4,
    );
    frames.push(Float32Array.from(samples));
    totalFrames += samples.length / CAPTURE_FORMAT.channels;
    for (const value of samples) {
      const absolute = Math.abs(value);
      if (absolute > peak) peak = absolute;
      sumSquares += value * value;
      sampleCount += 1;
    }
  },
  onError: (error) => console.error("捕获错误：", error.message),
  onEnd: (payload) => console.log(`捕获结束：${payload.reason}`),
});

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
session.stop();
await new Promise((resolve) => setTimeout(resolve, 800));

const merged = new Float32Array(frames.reduce((sum, f) => sum + f.length, 0));
let offset = 0;
for (const frame of frames) {
  merged.set(frame, offset);
  offset += frame.length;
}

const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const wavPath = path.join(
  OUT_DIR,
  `${selected.processName}-stream-${stamp}.wav`,
);
writeFloatWav(
  wavPath,
  merged,
  CAPTURE_FORMAT.channels,
  CAPTURE_FORMAT.sampleRate,
);

console.log("\n===== 结果 =====");
console.log(`目标进程        : ${selected.processName} (${selected.processId})`);
console.log(`捕获帧数        : ${totalFrames}`);
console.log(`峰值            : ${peakDb.toFixed(2)} dBFS`);
console.log(`RMS             : ${rmsDb.toFixed(2)} dBFS`);
console.log(`有声音          : ${peak > 0.001 ? "是" : "否"}`);
console.log(`输出文件        : ${wavPath}`);
