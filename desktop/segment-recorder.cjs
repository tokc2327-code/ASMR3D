"use strict";

/**
 * Streaming, segmented WAV writer for the optional live recording feature.
 *
 * The renderer sends already spatially rendered stereo float32 PCM. Samples
 * are written to fixed-length temporary segments so a long recording never has
 * to live in memory. When the live capture ends the segments are validated and
 * merged into a single RIFF/WAV (or RF64 for >4 GB) file, and only then are the
 * temporary segments deleted.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const WAV_HEADER_BYTES = 44;
const RF64_HEADER_BYTES = 80;
const RF64_DATA_LIMIT = 0xffffffff;
const COPY_CHUNK_BYTES = 4 * 1024 * 1024;

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// Node throws EPERM when mkdirSync is called on a drive root such as "D:\\"
// even though the directory exists, so only create the path when it is
// actually missing.
function ensureDirectory(directory) {
  if (!directory || typeof directory !== "string") {
    throw new Error("保存位置无效。");
  }
  let stat = null;
  try {
    stat = fs.statSync(directory);
  } catch {
    stat = null;
  }
  if (stat) {
    if (!stat.isDirectory()) {
      throw new Error(`保存位置不是文件夹：${directory}`);
    }
    return;
  }
  fs.mkdirSync(directory, { recursive: true });
}

function ensureWritableDirectory(directory) {
  try {
    ensureDirectory(directory);
  } catch (error) {
    throw new Error(
      `无法使用所选位置：${directory}（${error.code || error.message}）。请换一个文件夹。`,
    );
  }
  const probePath = path.join(directory, `.asmr3d-write-test-${process.pid}`);
  try {
    fs.writeFileSync(probePath, "");
  } catch (error) {
    throw new Error(
      `无法写入所选位置：${directory}（${error.code || error.message}）。请换一个文件夹。`,
    );
  } finally {
    try {
      fs.rmSync(probePath, { force: true });
    } catch {
      // Ignore.
    }
  }
}

function writeWaveHeader(dataBytes, channels, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(
    Math.min(0xffffffff, 36 + dataBytes),
    4,
  );
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(Math.min(0xffffffff, dataBytes), 40);
  return header;
}

function writeRf64Header(dataBytes, sampleCount, channels, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const header = Buffer.alloc(RF64_HEADER_BYTES);
  header.write("RF64", 0, "ascii");
  header.writeUInt32LE(0xffffffff, 4);
  header.write("WAVE", 8, "ascii");
  header.write("ds64", 12, "ascii");
  header.writeUInt32LE(28, 16);
  header.writeBigUInt64LE(BigInt(RF64_HEADER_BYTES - 8 + dataBytes), 20);
  header.writeBigUInt64LE(BigInt(dataBytes), 28);
  header.writeBigUInt64LE(BigInt(sampleCount), 36);
  header.writeUInt32LE(0, 44);
  header.write("fmt ", 48, "ascii");
  header.writeUInt32LE(16, 52);
  header.writeUInt16LE(1, 56);
  header.writeUInt16LE(channels, 58);
  header.writeUInt32LE(sampleRate, 60);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 64);
  header.writeUInt16LE(channels * bytesPerSample, 68);
  header.writeUInt16LE(bitDepth, 70);
  header.write("data", 72, "ascii");
  header.writeUInt32LE(0xffffffff, 76);
  return header;
}

function encodePcm24(interleaved, frames, channels) {
  const total = frames * channels;
  const out = Buffer.allocUnsafe(total * 3);
  let offset = 0;
  for (let index = 0; index < total; index += 1) {
    let sample = interleaved[index];
    if (!(sample > -1)) sample = sample <= -1 ? -1 : 0;
    else if (sample > 1) sample = 1;
    let value = Math.round(sample * 8388607);
    if (value > 8388607) value = 8388607;
    else if (value < -8388608) value = -8388608;
    if (value < 0) value += 0x1000000;
    out[offset] = value & 0xff;
    out[offset + 1] = (value >>> 8) & 0xff;
    out[offset + 2] = (value >>> 16) & 0xff;
    offset += 3;
  }
  return out;
}

function readWavInfo(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(WAV_HEADER_BYTES);
    fs.readSync(fd, header, 0, WAV_HEADER_BYTES, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF") {
      throw new Error(`分段文件不是 RIFF/WAV：${filePath}`);
    }
    const channels = header.readUInt16LE(22);
    const sampleRate = header.readUInt32LE(24);
    const bitDepth = header.readUInt16LE(34);
    const dataBytes = header.readUInt32LE(40);
    const stat = fs.fstatSync(fd);
    return {
      channels,
      sampleRate,
      bitDepth,
      dataBytes,
      dataOffset: WAV_HEADER_BYTES,
      fileBytes: stat.size,
      frames: dataBytes / (channels * (bitDepth / 8)),
    };
  } finally {
    fs.closeSync(fd);
  }
}

class SegmentedRecorder {
  constructor(options) {
    this.directory = options.directory;
    this.baseName = options.baseName || `asmr3d_recording_${timestamp()}`;
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 2;
    this.bitDepth = options.bitDepth || 24;
    this.segmentSeconds = options.segmentSeconds || 600;

    this.segmentFrames = Math.max(
      Math.round(0.05 * this.sampleRate),
      Math.round(this.segmentSeconds * this.sampleRate),
    );

    this.segments = [];
    this.totalFrames = 0;
    this.running = false;
    this.fd = null;
    this.segmentIndex = 0;
    this.segmentFramesWritten = 0;
    this.segmentBytes = 0;
    this.segmentOffset = WAV_HEADER_BYTES;
    this.bytesWritten = 0;
    this.metaPath = path.join(this.directory, `${this.baseName}.segments.json`);
  }

  start() {
    if (this.running) return;
    ensureDirectory(this.directory);
    this.running = true;
    this.openSegment();
    this.writeMetadata();
  }

  segmentFileName(index) {
    return path.join(
      this.directory,
      `${this.baseName}.part${String(index).padStart(3, "0")}.wav`,
    );
  }

  openSegment() {
    this.segmentIndex += 1;
    this.segmentFramesWritten = 0;
    this.segmentBytes = 0;
    this.currentFile = this.segmentFileName(this.segmentIndex);
    this.fd = fs.openSync(this.currentFile, "w");
    fs.writeSync(
      this.fd,
      writeWaveHeader(0, this.channels, this.sampleRate, this.bitDepth),
      0,
      WAV_HEADER_BYTES,
      0,
    );
    this.segmentOffset = WAV_HEADER_BYTES;
    this.segmentStartSample = this.totalFrames;
  }

  closeSegment() {
    if (this.fd === null) return;
    fs.writeSync(
      this.fd,
      writeWaveHeader(this.segmentBytes, this.channels, this.sampleRate, this.bitDepth),
      0,
      WAV_HEADER_BYTES,
      0,
    );
    fs.closeSync(this.fd);
    this.fd = null;
    this.segments.push({
      index: this.segmentIndex,
      file: path.basename(this.currentFile),
      path: this.currentFile,
      startSample: this.segmentStartSample,
      frames: this.segmentFramesWritten,
      bytes: this.segmentBytes,
    });
  }

  /** @param {Float32Array} interleaved stereo interleaved float32 samples */
  push(interleaved) {
    if (!this.running) return;
    const frameCount = Math.floor(interleaved.length / this.channels);
    if (frameCount <= 0) return;

    let consumed = 0;
    while (consumed < frameCount) {
      const remaining = this.segmentFrames - this.segmentFramesWritten;
      const take = Math.min(remaining, frameCount - consumed);
      const slice = interleaved.subarray(
        consumed * this.channels,
        (consumed + take) * this.channels,
      );
      const buffer =
        this.bitDepth === 24
          ? encodePcm24(slice, take, this.channels)
          : Buffer.from(
              slice.buffer,
              slice.byteOffset,
              take * this.channels * 4,
            );
      // Explicit positions keep positional and sequential writes consistent;
      // a positional write does not advance the file offset.
      fs.writeSync(this.fd, buffer, 0, buffer.length, this.segmentOffset);
      this.segmentOffset += buffer.length;
      const bytes = take * this.channels * (this.bitDepth / 8);
      this.segmentBytes += bytes;
      this.segmentFramesWritten += take;
      this.totalFrames += take;
      this.bytesWritten += bytes;
      consumed += take;

      if (this.segmentFramesWritten >= this.segmentFrames) {
        this.closeSegment();
        this.openSegment();
        this.writeMetadata();
      }
    }
  }

  writeMetadata() {
    const payload = {
      sample_rate: this.sampleRate,
      channels: this.channels,
      bit_depth: this.bitDepth,
      segment_seconds: this.segmentSeconds,
      segments: this.segments.map((segment) => ({
        index: segment.index,
        file: segment.file,
        start_sample: segment.startSample,
        frames: segment.frames,
      })),
    };
    try {
      fs.writeFileSync(this.metaPath, `${JSON.stringify(payload, null, 2)}\n`);
    } catch {
      // The metadata file is a convenience, not a requirement.
    }
  }

  async finalize() {
    if (!this.running) return null;
    this.closeSegment();
    this.running = false;
    this.writeMetadata();

    const usable = this.segments.filter((segment) => segment.frames > 0);
    if (usable.length === 0) {
      return {
        filePath: null,
        frames: 0,
        bytes: 0,
        sha256: null,
        segments: this.segments,
        discarded: true,
      };
    }

    const totalDataBytes = usable.reduce((sum, segment) => sum + segment.bytes, 0);
    const totalFrames = usable.reduce((sum, segment) => sum + segment.frames, 0);
    const outputPath = path.join(this.directory, `${this.baseName}.wav`);

    const pointer = Buffer.alloc(
      Math.min(COPY_CHUNK_BYTES, Math.max(totalDataBytes + RF64_HEADER_BYTES, 64)),
    );
    const needsRf64 = totalDataBytes + RF64_HEADER_BYTES > RF64_DATA_LIMIT;
    const out = fs.openSync(outputPath, "w");
    try {
      let outOffset = needsRf64 ? RF64_HEADER_BYTES : WAV_HEADER_BYTES;
      fs.writeSync(
        out,
        needsRf64
          ? writeRf64Header(
              totalDataBytes,
              totalFrames,
              this.channels,
              this.sampleRate,
              this.bitDepth,
            )
          : writeWaveHeader(totalDataBytes, this.channels, this.sampleRate, this.bitDepth),
        0,
        needsRf64 ? RF64_HEADER_BYTES : WAV_HEADER_BYTES,
        0,
      );

      for (const segment of usable) {
        const info = readWavInfo(segment.path);
        if (
          info.channels !== this.channels ||
          info.sampleRate !== this.sampleRate ||
          info.bitDepth !== this.bitDepth
        ) {
          throw new Error(`分段格式不一致，无法安全合并：${segment.file}`);
        }
        if (info.frames !== segment.frames) {
          throw new Error(`分段长度校验失败，无法安全合并：${segment.file}`);
        }
        const input = fs.openSync(segment.path, "r");
        try {
          let offset = info.dataOffset;
          let remaining = info.dataBytes;
          while (remaining > 0) {
            const take = Math.min(pointer.length, remaining);
            const read = fs.readSync(input, pointer, 0, take, offset);
            if (read <= 0) throw new Error(`分段读取中断：${segment.file}`);
            fs.writeSync(out, pointer, 0, read, outOffset);
            outOffset += read;
            offset += read;
            remaining -= read;
          }
        } finally {
          fs.closeSync(input);
        }
      }
    } finally {
      fs.closeSync(out);
    }

    const stat = fs.statSync(outputPath);
    const expectedBytes =
      totalDataBytes + (needsRf64 ? RF64_HEADER_BYTES : WAV_HEADER_BYTES);
    if (stat.size !== expectedBytes) {
      throw new Error(
        `合并校验失败：预期 ${expectedBytes} 字节，实际 ${stat.size} 字节。`,
      );
    }

    const sha256 = await hashFile(outputPath);
    fs.writeFileSync(`${outputPath}.sha256`, `${sha256}  ${path.basename(outputPath)}\n`);

    // Only remove the temporary segments after the merged file is written and
    // its size and hash are confirmed.
    for (const segment of this.segments) {
      try {
        fs.rmSync(segment.path, { force: true });
      } catch {
        // Keep going; a stale segment is harmless.
      }
    }
    try {
      fs.rmSync(this.metaPath, { force: true });
    } catch {
      // Ignore.
    }

    return {
      filePath: outputPath,
      frames: totalFrames,
      bytes: stat.size,
      sha256,
      segments: usable.length,
      discarded: false,
    };
  }

  abort() {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // Ignore.
      }
      this.fd = null;
    }
    this.running = false;
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

module.exports = {
  SegmentedRecorder,
  ensureDirectory,
  ensureWritableDirectory,
  readWavInfo,
  writeWaveHeader,
  encodePcm24,
};
