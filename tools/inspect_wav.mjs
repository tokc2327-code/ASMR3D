// Prints format, duration and level information for a PCM/float WAV file.
//
//   node tools/inspect_wav.mjs <file.wav>

import fs from "node:fs";
import path from "node:path";

const filePath = process.argv[2];
if (!filePath) {
  console.error("用法：node tools/inspect_wav.mjs <file.wav>");
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const isRf64 = buffer.toString("ascii", 0, 4) === "RF64";

function findChunk(id, start) {
  let offset = start;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (chunkId === id) return { offset: offset + 8, size };
    offset += 8 + size + (size % 2);
  }
  return null;
}

const startOffset = isRf64 ? 12 : 12;
const format = findChunk("fmt ", startOffset);
const data = findChunk("data", startOffset);

if (!format || !data) {
  console.error("无法解析 WAV 结构。");
  process.exit(1);
}

const formatTag = buffer.readUInt16LE(format.offset);
const channels = buffer.readUInt16LE(format.offset + 2);
const sampleRate = buffer.readUInt32LE(format.offset + 4);
const bitDepth = buffer.readUInt16LE(format.offset + 14);
let dataBytes = data.size;
if (isRf64) {
  dataBytes = Number(buffer.readBigUInt64LE(28));
}
const bytesPerSample = bitDepth / 8;
const frames = Math.floor(dataBytes / (channels * bytesPerSample));

function sampleAt(index) {
  const offset = data.offset + index * bytesPerSample;
  if (formatTag === 3) return buffer.readFloatLE(offset);
  if (bitDepth === 16) return buffer.readInt16LE(offset) / 32768;
  if (bitDepth === 24) {
    let value =
      buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
    if (value & 0x800000) value -= 0x1000000;
    return value / 8388608;
  }
  if (bitDepth === 32) return buffer.readInt32LE(offset) / 2147483648;
  return 0;
}

const totalSamples = Math.min(frames * channels, 20000000);
let peak = 0;
let sumSquares = 0;
let nonzero = 0;
for (let index = 0; index < totalSamples; index += 1) {
  const value = sampleAt(index);
  const absolute = Math.abs(value);
  if (absolute > peak) peak = absolute;
  if (absolute > 1e-5) nonzero += 1;
  sumSquares += value * value;
}
const rms = totalSamples > 0 ? Math.sqrt(sumSquares / totalSamples) : 0;
const toDb = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);

console.log(`文件            : ${path.basename(filePath)}`);
console.log(`容器            : ${isRf64 ? "RF64" : "RIFF/WAV"}`);
console.log(`声道 / 采样率   : ${channels} ch / ${sampleRate} Hz`);
console.log(`位深 / 格式     : ${bitDepth}-bit ${formatTag === 3 ? "float" : "PCM"}`);
console.log(`时长            : ${(frames / sampleRate).toFixed(2)} s（${frames} 帧）`);
console.log(`峰值            : ${toDb(peak).toFixed(2)} dBFS`);
console.log(`RMS             : ${toDb(rms).toFixed(2)} dBFS`);
console.log(`非零样本比例    : ${((nonzero / totalSamples) * 100).toFixed(1)} %`);
