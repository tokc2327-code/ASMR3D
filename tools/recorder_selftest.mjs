// Self-test for the segmented live recorder: writes several short segments,
// merges them, and verifies the resulting WAV and cleanup behaviour.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { SegmentedRecorder, readWavInfo } = require("../desktop/segment-recorder.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "dist", "recorder-selftest");

fs.rmSync(OUT_DIR, { recursive: true, force: true });

const sampleRate = 48000;
const channels = 2;
const totalFrames = 20000;

const recorder = new SegmentedRecorder({
  directory: OUT_DIR,
  baseName: "selftest",
  sampleRate,
  channels,
  bitDepth: 24,
  segmentSeconds: 4800 / sampleRate, // 4800 frames per segment
});
recorder.start();

const blockFrames = 1024;
let written = 0;
while (written < totalFrames) {
  const frames = Math.min(blockFrames, totalFrames - written);
  const block = new Float32Array(frames * channels);
  for (let frame = 0; frame < frames; frame += 1) {
    const value = 0.5 * Math.sin((2 * Math.PI * 440 * (written + frame)) / sampleRate);
    block[frame * channels] = value;
    block[frame * channels + 1] = -value;
  }
  recorder.push(block);
  written += frames;
}

console.log("segments:", recorder.segments);
for (const segment of recorder.segments) {
  const info = readWavInfo(segment.path);
  console.log("segment file:", path.basename(segment.path), fs.statSync(segment.path).size, info);
}

const result = await recorder.finalize();
console.log("finalize:", result);

const info = readWavInfo(result.filePath);
console.log("merged wav:", {
  channels: info.channels,
  sampleRate: info.sampleRate,
  bitDepth: info.bitDepth,
  frames: info.frames,
  fileBytes: info.fileBytes,
});

const remaining = fs.readdirSync(OUT_DIR);
console.log("remaining files:", remaining);

const checks = [
  ["frames", info.frames === totalFrames],
  ["channels", info.channels === channels],
  ["sampleRate", info.sampleRate === sampleRate],
  ["bitDepth", info.bitDepth === 24],
  ["dataSize", info.dataBytes === totalFrames * channels * 3],
  ["segments removed", !remaining.some((name) => name.includes(".part"))],
  ["metadata removed", !remaining.some((name) => name.endsWith(".segments.json"))],
  ["hash file", remaining.some((name) => name.endsWith(".sha256"))],
  ["hash present", typeof result.sha256 === "string" && result.sha256.length === 64],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll recorder self-test checks passed.");
