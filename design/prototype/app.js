const $ = (selector) => document.querySelector(selector);

const elements = {
  sampleSelect: $("#sampleSelect"),
  fileInput: $("#fileInput"),
  playButton: $("#playButton"),
  pauseButton: $("#pauseButton"),
  stopButton: $("#stopButton"),
  resetPlaybackButton: $("#resetPlaybackButton"),
  loopToggle: $("#loopToggle"),
  azimuth: $("#azimuth"),
  azimuthOutput: $("#azimuthOutput"),
  elevation: $("#elevation"),
  elevationOutput: $("#elevationOutput"),
  distance: $("#distance"),
  distanceOutput: $("#distanceOutput"),
  volume: $("#volume"),
  volumeOutput: $("#volumeOutput"),
  resetButton: $("#resetButton"),
  modeControl: $("#modeControl"),
  modeNote: $("#modeNote"),
  engineState: $("#engineState"),
  audioStatus: $("#audioStatus"),
  statusText: $("#statusText"),
  sourceBadge: $("#sourceBadge"),
  metaFile: $("#metaFile"),
  metaCategory: $("#metaCategory"),
  metaChannels: $("#metaChannels"),
  metaSampleRate: $("#metaSampleRate"),
  metaDuration: $("#metaDuration"),
  metaLicense: $("#metaLicense"),
  progressRange: $("#progressRange"),
  currentTime: $("#currentTime"),
  totalTime: $("#totalTime"),
  progressPercent: $("#progressPercent"),
  progressHint: $("#progressHint"),
  transportStatus: $("#transportStatus"),
  skipBackButton: $("#skipBackButton"),
  skipForwardButton: $("#skipForwardButton"),
  exportScopeSelect: $("#exportScopeSelect"),
  exportStartSelect: $("#exportStartSelect"),
  exportDurationSelect: $("#exportDurationSelect"),
  exportCustomDurationField: $("#exportCustomDurationField"),
  exportCustomDuration: $("#exportCustomDuration"),
  exportBitDepth: $("#exportBitDepth"),
  exportQuality: $("#exportQuality"),
  exportButton: $("#exportButton"),
  cancelExportButton: $("#cancelExportButton"),
  exportProgress: $("#exportProgress"),
  exportStatus: $("#exportStatus"),
  metricDistanceGain: $("#metricDistanceGain"),
  metricIld: $("#metricIld"),
  metricItd: $("#metricItd"),
  metricAir: $("#metricAir"),
  metricNear: $("#metricNear"),
  metricLatency: $("#metricLatency"),
  signalChain: $("#signalChain"),
  methodCount: $("#methodCount"),
  liveSection: $("#liveSection"),
  liveModeBadge: $("#liveModeBadge"),
  liveTargetSelect: $("#liveTargetSelect"),
  liveRefreshButton: $("#liveRefreshButton"),
  liveStartButton: $("#liveStartButton"),
  liveStopButton: $("#liveStopButton"),
  liveLevelBar: $("#liveLevelBar"),
  liveLevelText: $("#liveLevelText"),
  liveStatus: $("#liveStatus"),
  liveSilenceSelect: $("#liveSilenceSelect"),
  sourceModeSelect: $("#sourceModeSelect"),
  recordToggle: $("#recordToggle"),
  recordBadge: $("#recordBadge"),
  recordSegmentSelect: $("#recordSegmentSelect"),
  recordBitDepthSelect: $("#recordBitDepthSelect"),
  recordDirButton: $("#recordDirButton"),
  recordRevealButton: $("#recordRevealButton"),
  recordDirText: $("#recordDirText"),
  recordStatus: $("#recordStatus"),
  exportDirText: $("#exportDirText"),
  convertFileInput: $("#convertFileInput"),
  convertBitDepth: $("#convertBitDepth"),
  convertButton: $("#convertButton"),
  convertProgress: $("#convertProgress"),
  convertStatus: $("#convertStatus"),
  convertBadge: $("#convertBadge"),
  templateImportButton: $("#templateImportButton"),
  templateExportButton: $("#templateExportButton"),
  templateFileInput: $("#templateFileInput"),
  templateStatus: $("#templateStatus"),
  templateBadge: $("#templateBadge"),
};

const state = {
  audio: null,
  audioContext: null,
  mediaSource: null,
  monoInput: null,
  master: null,
  limiter: null,
  captureTap: null,
  hrtfPath: null,
  parametricPath: null,
  compatibilityPath: null,
  bypassPath: null,
  panner: null,
  parametric: null,
  compatibility: null,
  materialItems: [],
  activeSource: null,
  mode: "binaural",
  ready: false,
  isSeeking: false,
  progressFrame: null,
  exportCapture: null,
  modeSwitchId: 0,
  objectUrl: null,
  lastSeekAt: 0,
  convertContext: null,
  inputSource: "media",
  liveGain: null,
  liveNode: null,
  liveFallback: null,
  liveQueue: { left: [], right: [], length: 0 },
  liveResamplerL: null,
  liveResamplerR: null,
  liveChannels: 2,
  livePendingChunks: [],
  liveLevelPeak: 0,
  liveMeterTimer: null,
  liveTargets: [],
  liveCapability: { processLoopback: false, runtime: "" },
  liveActive: false,
  liveCompensation: 1,
  sourceAttenuation: 0,
  recordTap: null,
  recording: false,
  recordingDirectory: "",
  recordingPollTimer: null,
  lastRecordingFile: null,
};

const constants = {
  refDistance: 0.2,
  maxDistance: 10,
  nearFieldGuardDistance: 0.35,
  nearFieldStartDistance: 0.6,
  nearFieldMaxGainDb: 3,
  reverbWetFloor: 0.12,
  reverbWetScale: 0.18,
  maxIldDb: 8,
  maxItdSeconds: 0.00065,
  minDistanceGainDb: 20 * Math.log10(0.2 / 10),
};

function dbToGain(db) {
  return 10 ** (db / 20);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function spatialDistance(distance) {
  return Math.max(distance, constants.nearFieldGuardDistance);
}

function nearFieldGainDb(distance) {
  const progress =
    1 -
    smoothstep(
      constants.nearFieldGuardDistance,
      constants.nearFieldStartDistance,
      spatialDistance(distance),
    );
  return constants.nearFieldMaxGainDb * progress;
}

function reverbWetGain(distance) {
  const guardedDistance = spatialDistance(distance);
  return (
    constants.reverbWetFloor +
    constants.reverbWetScale *
      (Math.log(guardedDistance / constants.refDistance) /
        Math.log(constants.maxDistance / constants.refDistance))
  );
}

function hrtfDistanceCompensation(distance) {
  const guardedDistance = spatialDistance(distance);
  return guardedDistance > distance ? guardedDistance / distance : 1;
}

function sliderToDistance(value) {
  const normalized = Number(value) / 1000;
  return constants.refDistance * (constants.maxDistance / constants.refDistance) ** normalized;
}

function distanceToSlider(distance) {
  return (
    1000 *
    (Math.log(distance / constants.refDistance) /
      Math.log(constants.maxDistance / constants.refDistance))
  );
}

function configuredDefaults() {
  const fallback = {
    mode: "binaural",
    azimuth: 0,
    elevation: 0,
    distance: 0.4,
    volume: 80,
    exportBitDepth: "16",
    convertBitDepth: "24",
    recordSegment: "600",
    recordBitDepth: "24",
    silenceTimeout: "30",
  };
  return {
    ...fallback,
    ...(window.asmr3dSettings?.get?.().defaults || {}),
  };
}

function applyConfiguredDefaults({ applyOptions = true } = {}) {
  const defaults = configuredDefaults();
  elements.azimuth.value = String(defaults.azimuth);
  elements.elevation.value = String(defaults.elevation);
  elements.distance.value = String(distanceToSlider(defaults.distance));
  elements.volume.value = String(defaults.volume);
  for (const button of elements.modeControl.querySelectorAll("button[data-mode]")) {
    button.classList.toggle("active", button.dataset.mode === defaults.mode);
  }
  if (applyOptions) {
    elements.exportBitDepth.value = String(defaults.exportBitDepth);
    elements.convertBitDepth.value = String(defaults.convertBitDepth);
    elements.recordSegmentSelect.value = String(defaults.recordSegment);
    elements.recordBitDepthSelect.value = String(defaults.recordBitDepth);
    elements.liveSilenceSelect.value = String(defaults.silenceTimeout);
  }
  if (state.ready) {
    changeMode(defaults.mode);
    updateAudioGraph(true);
  } else {
    state.mode = defaults.mode;
    updateReadouts(currentParameters());
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// Chromium 的 decodeAudioData 一次最多解出约 2 GiB PCM（2^31 字节），
// 超过时只抛出一句 "Unable to decode audio data"。48 kHz 立体声 float32
// 换算下来约 93 分钟，所以这里留一点余量提前拦截。
const DECODE_PCM_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
const DECODE_PCM_SAFE_BYTES = DECODE_PCM_LIMIT_BYTES * 0.97;
const WAV_SIZE_LIMIT_BYTES = 3.8 * 1024 * 1024 * 1024; // RIFF 的 4 GB 长度字段上限

function decodedPcmBytes(durationSeconds, sampleRate) {
  return durationSeconds * sampleRate * 2 * 4;
}

function decodeLimitMinutes(sampleRate) {
  return DECODE_PCM_SAFE_BYTES / (sampleRate * 2 * 4) / 60;
}

function formatDurationCn(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${total % 60} 秒`;
}

// 在真正调用 decodeAudioData 之前拦住必然失败的超长文件。
function assertDecodableLength(durationSeconds, sampleRate, hint) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
  const bytes = decodedPcmBytes(durationSeconds, sampleRate);
  if (bytes <= DECODE_PCM_SAFE_BYTES) return;
  throw new Error(
    `时长 ${formatDurationCn(durationSeconds)}，超过单次解码上限（当前采样率下约 ${decodeLimitMinutes(
      sampleRate,
    ).toFixed(0)} 分钟）。浏览器一次最多解出约 2 GB PCM 数据，${hint}`,
  );
}

// ---------------------------------------------------------------------------
// 超长文件的分段离线导出
//
// 浏览器一次只能解出约 2 GiB PCM（48 kHz 立体声约 93 分钟），超过就报
// "Unable to decode audio data"。能救的办法是按字节把源文件切开分别解码再拼接，
// 但这要求容器允许从中间开始解码——实测只有 MP3 可以：
//
//   MP3          中段/尾部切片都能解（帧自包含，解码器会自动找同步字）
//   FLAC         中段切片失败（解码器需要开头的 STREAMINFO）
//   OGG / Opus   中段切片失败（需要开头的 codec setup）
//   MP4 / M4A    中段切片失败（需要开头的 moov）
// ---------------------------------------------------------------------------

const SLICEABLE_MEDIA_EXTENSIONS = [".mp3", ".mp2", ".mpga", ".mpa"];
// 每段目标解码时长：30 分钟（48 kHz 立体声 float32 约 0.69 GiB），
// 渲染时还会再产生一份同样大小的输出，峰值约 1.4 GB，留足余量。
const SEGMENT_TARGET_SECONDS = 30 * 60;
const MIN_SEGMENT_BYTES = 2 * 1024 * 1024;

function activeSourceExtension() {
  const name = state.activeSource?.file || state.activeSource?.title || "";
  const match = /(\.[a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function isSliceableSource() {
  return SLICEABLE_MEDIA_EXTENSIONS.includes(activeSourceExtension());
}

// 让切片从一个完整的 MP3 帧开始，避免开头出现解码垃圾。
function alignToFrameStart(bytes, offset) {
  if (offset <= 0) return 0;
  const limit = Math.min(offset + 128 * 1024, bytes.length - 1);
  for (let index = offset; index < limit; index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
      return index;
    }
  }
  return offset;
}

async function startSegmentedOfflineExport({
  parameters,
  bitDepth,
  durationSeconds,
  quality = "precise",
}) {
  const timing = { read: 0, decode: 0, render: 0, encode: 0, save: 0 };
  const readStartedAt = performance.now();
  const mediaUrl = state.activeSource.mediaUrl;
  elements.exportStatus.textContent = "正在读取完整源文件……";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error(`源文件读取失败：${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  timing.read = performance.now() - readStartedAt;

  // 预估段长：优先用已知时长换算，拿不到时长就按最低码率保守取。
  const bytesPerSecond =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? bytes.length / durationSeconds
      : 4000; // ≈32 kbps，保证任何码率下单段都不超过 30 分钟
  const segmentBytes = Math.max(
    MIN_SEGMENT_BYTES,
    Math.floor(bytesPerSecond * SEGMENT_TARGET_SECONDS),
  );
  const estimatedSegments = Math.max(1, Math.ceil(bytes.length / segmentBytes));

  const builder = createWavBuilder(state.audioContext.sampleRate, bitDepth);
  // 先按计划把文件切成若干段；后面万一某段仍然解不动，再靠失败拆分兜底。
  const queue = [];
  for (let offset = 0; offset < bytes.length; offset += segmentBytes) {
    queue.push([offset, Math.min(offset + segmentBytes, bytes.length)]);
  }
  let done = 0;
  let segments = 0;

  elements.exportProgress.value = 0;
  elements.exportStatus.textContent = `文件较长：${(
    bytes.length / 1048576
  ).toFixed(0)} MB，将分 ${queue.length} 段渲染（每段约 ${(
    segmentBytes /
    bytesPerSecond /
    60
  ).toFixed(0)} 分钟）……`;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  while (queue.length > 0) {
    const [start, end] = queue.shift();
    const sliceStart = start === 0 ? 0 : alignToFrameStart(bytes, start);
    let decoded = null;
    try {
      const decodeStartedAt = performance.now();
      decoded = await state.audioContext.decodeAudioData(
        bytes.slice(sliceStart, end).buffer,
      );
      timing.decode += performance.now() - decodeStartedAt;
    } catch (error) {
      // 单段仍然太大就一分为二继续试；到最小粒度还失败才算真的失败。
      if (end - start <= MIN_SEGMENT_BYTES) {
        throw new Error(
          `第 ${segments + 1} 段解码失败，文件可能在中间损坏。可以先用音频工具重新导出成标准 MP3 再试。`,
        );
      }
      const middle = alignToFrameStart(bytes, Math.floor((start + end) / 2));
      if (middle <= start || middle >= end) throw error;
      queue.unshift([middle, end], [start, middle]);
      continue;
    }

    const offlineContext = new OfflineAudioContext(
      2,
      decoded.length,
      decoded.sampleRate,
    );
    buildOfflineGraph(offlineContext, decoded, parameters, quality);
    const renderStartedAt = performance.now();
    const rendered = await offlineContext.startRendering();
    timing.render += performance.now() - renderStartedAt;
    const encodeStartedAt = performance.now();
    await builder.add(
      rendered.getChannelData(0),
      rendered.numberOfChannels > 1
        ? rendered.getChannelData(1)
        : rendered.getChannelData(0),
    );
    timing.encode += performance.now() - encodeStartedAt;

    segments += 1;
    done = end;
    elements.exportProgress.value = done / bytes.length;
    elements.exportStatus.textContent = `分段离线渲染 ${Math.round(
      (done / bytes.length) * 100,
    )}%（已完成 ${segments} 段，累计 ${(
      builder.frames / state.audioContext.sampleRate
    ).toFixed(0)} 秒）`;
    // 让出主线程，界面保持响应，同时释放上一段的解码缓冲。
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  elements.exportStatus.textContent = "正在编码完整 WAV……";
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const saveStartedAt = performance.now();
  const wav = builder.toBlob();
  await downloadExport(wav, parameters);
  timing.save = performance.now() - saveStartedAt;
  elements.exportProgress.value = 1;
  elements.exportStatus.textContent = `分段导出完成：${(
    builder.frames / state.audioContext.sampleRate
  ).toFixed(1)} 秒 · ${segments} 段合并 · ${bitDepth}-bit WAV（读取 ${(
    timing.read / 1000
  ).toFixed(1)}s / 解码 ${(timing.decode / 1000).toFixed(1)}s / 渲染 ${(
    timing.render / 1000
  ).toFixed(1)}s / 编码 ${(timing.encode / 1000).toFixed(1)}s / 写盘 ${(
    timing.save / 1000
  ).toFixed(1)}s）`;
}

function isOverDecodeLimit(durationSeconds, sampleRate) {
  return (
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    decodedPcmBytes(durationSeconds, sampleRate) > DECODE_PCM_SAFE_BYTES
  );
}

// decodeAudioData 的报错只有一句英文，这里换成能指导操作的说明。
// 覆盖"时长未知"的情况（无 Xing 头的 VBR MP3 会报 Infinity）。
async function decodeAudioBufferFriendly(context, arrayBuffer, hint) {
  try {
    return await context.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error(
      `音频解码失败：文件可能过长、损坏，或使用了不支持的编码。` +
        `浏览器单次最多解出约 2 GB PCM 数据（48 kHz 立体声约 90 分钟）。${hint}`,
    );
  }
}

function updateProgressUI({ enabled } = {}) {
  const duration = state.audio && Number.isFinite(state.audio.duration)
    ? state.audio.duration
    : 0;
  const current = state.audio ? state.audio.currentTime || 0 : 0;
  const hasDuration = duration > 0;

  elements.progressRange.disabled = enabled ?? !hasDuration;
  elements.skipBackButton.disabled = !hasDuration;
  elements.skipForwardButton.disabled = !hasDuration;
  elements.currentTime.textContent = formatTime(current);
  elements.totalTime.textContent = hasDuration ? formatTime(duration) : "--:--";
  elements.progressHint.textContent = hasDuration
    ? "拖动进度条可实时跳转，加减按钮可前后移动 10 秒"
    : "载入音频后可拖动调整进度";

  if (hasDuration) {
    // Assigning max (even to the same value) cancels an in-progress pointer
    // drag in Chromium, so only touch it when the duration really changed.
    const max = String(duration);
    if (elements.progressRange.max !== max) {
      elements.progressRange.max = max;
    }
    if (!state.isSeeking) {
      const value = String(Math.min(current, duration));
      if (elements.progressRange.value !== value) {
        elements.progressRange.value = value;
      }
    }
    elements.progressPercent.textContent = `${Math.round(
      (current / duration) * 100,
    )}%`;
  } else {
    if (elements.progressRange.max !== "1") {
      elements.progressRange.max = "1";
    }
    if (elements.progressRange.value !== "0") {
      elements.progressRange.value = "0";
    }
    elements.progressPercent.textContent = "0%";
  }
}

function attachProgressEvents(audio) {
  for (const eventName of ["loadedmetadata", "durationchange", "timeupdate", "seeked"]) {
    audio.addEventListener(eventName, () => updateProgressUI());
  }
  audio.addEventListener("play", () => {
    if (state.progressFrame) cancelAnimationFrame(state.progressFrame);
    const tick = () => {
      updateProgressUI();
      if (state.audio && !state.audio.paused) {
        state.progressFrame = requestAnimationFrame(tick);
      }
    };
    state.progressFrame = requestAnimationFrame(tick);
  });
  audio.addEventListener("pause", () => {
    if (state.progressFrame) {
      cancelAnimationFrame(state.progressFrame);
      state.progressFrame = null;
    }
    updateProgressUI();
  });
}

function seekBy(seconds) {
  if (!state.audio || !Number.isFinite(state.audio.duration)) return;
  const target = clamp(
    state.audio.currentTime + seconds,
    0,
    state.audio.duration,
  );
  state.audio.currentTime = target;
  updateProgressUI();
}

function setExportControlsDisabled(disabled) {
  for (const control of [
    elements.sampleSelect,
    elements.fileInput,
    elements.playButton,
    elements.pauseButton,
    elements.stopButton,
    elements.loopToggle,
    elements.azimuth,
    elements.elevation,
    elements.distance,
    elements.volume,
    elements.exportScopeSelect,
    elements.exportStartSelect,
    elements.exportDurationSelect,
    elements.exportCustomDuration,
    elements.exportBitDepth,
    elements.exportQuality,
  ]) {
    control.disabled = disabled;
  }
  for (const button of elements.modeControl.querySelectorAll("button")) {
    button.disabled = disabled;
  }
  elements.exportButton.disabled = disabled;
  elements.cancelExportButton.disabled = !disabled;
  if (!disabled) {
    const fullExport = elements.exportScopeSelect.value === "full";
    elements.exportStartSelect.disabled = fullExport;
    elements.exportDurationSelect.disabled = fullExport;
    elements.exportCustomDuration.disabled =
      fullExport || elements.exportDurationSelect.value !== "custom";
  }
}

function syncExportDurationCustom() {
  const custom = elements.exportDurationSelect.value === "custom";
  const fullExport = elements.exportScopeSelect.value === "full";
  elements.exportCustomDurationField.hidden = !custom;
  elements.exportCustomDuration.disabled = !custom || fullExport;
}

function updateExportScopeControls() {
  const fullExport = elements.exportScopeSelect.value === "full";
  if (!state.exportCapture) {
    elements.exportStartSelect.disabled = fullExport;
    elements.exportDurationSelect.disabled = fullExport;
  }
  syncExportDurationCustom();
  elements.exportStatus.textContent = fullExport
    ? "完整离线渲染，耗时取决于文件长度和 CPU，可在后台运行。"
    : "实时捕获指定片段，导出耗时与片段长度相同。";
}

function concatenateChannels(chunks, frameCount) {
  const output = new Float32Array(frameCount);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function writeWavHeader(view, dataSize, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  let offset = 0;

  const writeString = (value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  };
  const writeUint16 = (value) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const writeUint32 = (value) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };

  writeString("RIFF");
  writeUint32(36 + dataSize);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(2);
  writeUint32(sampleRate);
  writeUint32(sampleRate * 2 * bytesPerSample);
  writeUint16(2 * bytesPerSample);
  writeUint16(bitDepth);
  writeString("data");
  writeUint32(dataSize);
}

// 把一段 PCM 编成若干小块，交给外层的 Blob 组装；每若干块让出一次主线程。
async function encodePcmParts(left, right, bitDepth, parts, onProgress) {
  const frameCount = Math.min(left.length, right.length);
  const bytesPerSample = bitDepth / 8;
  const chunkFrames = 1 << 16;
  for (let start = 0; start < frameCount; start += chunkFrames) {
    const frames = Math.min(chunkFrames, frameCount - start);
    const chunk = new ArrayBuffer(frames * 2 * bytesPerSample);
    const view = new DataView(chunk);
    let offset = 0;
    for (let frame = start; frame < start + frames; frame += 1) {
      for (let channel = 0; channel < 2; channel += 1) {
        const sample = clamp(channel === 0 ? left[frame] : right[frame], -1, 1);
        if (bitDepth === 16) {
          const value = Math.round(
            sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          );
          view.setInt16(offset, value, true);
          offset += 2;
        } else {
          let value = Math.round(
            sample < 0 ? sample * 0x800000 : sample * 0x7fffff,
          );
          if (value < 0) value += 0x1000000;
          view.setUint8(offset, value & 0xff);
          view.setUint8(offset + 1, (value >> 8) & 0xff);
          view.setUint8(offset + 2, (value >> 16) & 0xff);
          offset += 3;
        }
      }
    }
    parts.push(chunk);
    if (onProgress && start % (chunkFrames * 8) === 0) {
      onProgress((start + frames) / frameCount);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  return frameCount;
}

// 边渲染边追加的 WAV 组装器：分段导出时用它把多段结果拼成一个成品，
// 全程不需要把整段音频的 PCM 同时放进内存。
function createWavBuilder(sampleRate, bitDepth) {
  const parts = [];
  let frameCount = 0;
  return {
    async add(left, right, onProgress) {
      frameCount += await encodePcmParts(left, right, bitDepth, parts, onProgress);
    },
    get frames() {
      return frameCount;
    },
    toBlob() {
      const bytesPerSample = bitDepth / 8;
      const header = new ArrayBuffer(44);
      writeWavHeader(
        new DataView(header),
        frameCount * 2 * bytesPerSample,
        sampleRate,
        bitDepth,
      );
      return new Blob([header, ...parts], { type: "audio/wav" });
    },
  };
}

// Encoded in chunks and assembled as a Blob so long files do not require one
// giant ArrayBuffer on top of the decoded audio. Yields to the event loop
// periodically so the window keeps responding during long encodes.
async function encodeWav(left, right, sampleRate, bitDepth, onProgress) {
  const builder = createWavBuilder(sampleRate, bitDepth);
  await builder.add(left, right, onProgress);
  if (onProgress) onProgress(1);
  return builder.toBlob();
}

function getExportFileName(parameters) {
  const sourceName =
    state.activeSource?.file?.split("/").pop()?.replace(/\.[^.]+$/, "") ||
    "spatial-audio";
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return `${sourceName}_${state.mode}_a${parameters.azimuth.toFixed(
    1,
  )}_e${parameters.elevation.toFixed(1)}_d${parameters.distance.toFixed(
    2,
  )}_${stamp}.wav`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)),
    );
  }
  return btoa(binary);
}

async function saveExportNative(blob, fileName) {
  const plugins = window.Capacitor?.Plugins;
  const filesystem = plugins?.Filesystem;
  const share = plugins?.Share;
  if (!filesystem) return false;

  const directory = "DOCUMENTS";
  const relativePath = `asmr3d/${fileName}`;
  const chunkSize = 2 * 1024 * 1024;

  await filesystem.requestPermissions?.().catch(() => undefined);
  let offset = 0;
  const firstChunk = await blob.slice(0, chunkSize).arrayBuffer();
  await filesystem.writeFile({
    path: relativePath,
    data: arrayBufferToBase64(firstChunk),
    directory,
    recursive: true,
  });
  offset += firstChunk.byteLength;

  while (offset < blob.size) {
    const chunk = await blob.slice(offset, offset + chunkSize).arrayBuffer();
    await filesystem.appendFile({
      path: relativePath,
      data: arrayBufferToBase64(chunk),
      directory,
    });
    offset += chunk.byteLength;
    elements.exportStatus.textContent = `正在保存到手机 ${Math.round(
      (offset / blob.size) * 100,
    )}%`;
  }

  const { uri } = await filesystem.getUri({ path: relativePath, directory });
  elements.exportStatus.textContent = `已保存到 Documents/asmr3d/${fileName}`;
  if (share) {
    await share
      .share({
        title: fileName,
        text: "asmr3d空间渲染器导出文件",
        files: [uri],
        dialogTitle: "保存或分享 WAV",
      })
      .catch(() => undefined);
  }
  return true;
}

async function saveBlobAsFile(blob, fileName) {
  if (await saveExportNative(blob, fileName)) return true;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

async function downloadExport(blob, parameters) {
  await saveBlobAsFile(blob, getExportFileName(parameters));
}

function processExportCapture(event) {
  const input = event.inputBuffer;
  const output = event.outputBuffer;
  const channels = Math.min(input.numberOfChannels, output.numberOfChannels);

  for (let channel = 0; channel < channels; channel += 1) {
    output.getChannelData(channel).set(input.getChannelData(channel));
  }

  const capture = state.exportCapture;
  if (!capture?.active) return;

  const remaining = capture.targetFrames - capture.frames;
  const length = Math.min(remaining, input.length);
  if (length <= 0) return;

  const left = input.getChannelData(0).slice(0, length);
  const right = (
    input.numberOfChannels > 1 ? input.getChannelData(1) : input.getChannelData(0)
  ).slice(0, length);
  capture.left.push(left);
  capture.right.push(right);
  capture.frames += length;
  elements.exportProgress.value = capture.frames / capture.targetFrames;
  elements.exportStatus.textContent = `导出中 ${(
    capture.frames / capture.sampleRate
  ).toFixed(1)} / ${capture.duration.toFixed(1)} 秒`;

  if (capture.frames >= capture.targetFrames) {
    capture.active = false;
    window.setTimeout(() => finishExport(false), 0);
  }
}

async function finishExport(cancelled) {
  const capture = state.exportCapture;
  if (!capture) return;
  state.exportCapture = null;
  if (state.audio) {
    state.audio.pause();
    state.audio.loop = capture.previousLoop;
  }
  if (state.captureTap) {
    state.limiter.disconnect(state.captureTap);
    state.captureTap.disconnect();
    state.captureTap.onaudioprocess = null;
    state.limiter.connect(state.monitorGain);
    state.captureTap = null;
  }
  setExportControlsDisabled(false);

  if (cancelled) {
    elements.exportProgress.value = 0;
    elements.exportStatus.textContent = "导出已取消。";
    return;
  }

  const left = concatenateChannels(capture.left, capture.frames);
  const right = concatenateChannels(capture.right, capture.frames);
  const wav = await encodeWav(
    left,
    right,
    capture.sampleRate,
    capture.bitDepth,
  );
  await downloadExport(wav, capture.parameters);
  elements.exportProgress.value = 1;
  elements.exportStatus.textContent = `导出完成：${(
    capture.duration
  ).toFixed(1)} 秒，${capture.bitDepth}-bit WAV。`;
}

async function startSegmentExport() {
  if (state.exportCapture?.active) return;
  if (state.recordTap) {
    elements.exportStatus.textContent = "直播录制进行中，请先停止直播截获。";
    return;
  }
  ensureAudioGraph();
  if (!state.activeSource) {
    elements.exportStatus.textContent = "请先选择音频。";
    return;
  }

  if (state.audio.currentSrc !== state.activeSource.mediaUrl) {
    state.audio.src = state.activeSource.mediaUrl;
  }
  if (state.audio.readyState < 1) {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 5000);
      state.audio.addEventListener(
        "loadedmetadata",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  if (!Number.isFinite(state.audio.duration)) {
    elements.exportStatus.textContent = "音频时长不可用，暂时无法导出。";
    return;
  }

  const parameters = currentParameters();
  const startAt =
    elements.exportStartSelect.value === "zero" ? 0 : state.audio.currentTime;
  const requestedDuration =
    elements.exportDurationSelect.value === "custom"
      ? Math.min(
          3600,
          Math.max(1, Number(elements.exportCustomDuration.value) || 30),
        )
      : Number(elements.exportDurationSelect.value);
  const duration = Math.min(
    requestedDuration,
    Math.max(0, state.audio.duration - startAt),
  );
  if (duration < 0.5) {
    elements.exportStatus.textContent = "当前位置距离文件结尾不足 0.5 秒。";
    return;
  }

  state.audio.pause();
  state.audio.currentTime = Math.min(startAt, Math.max(0, state.audio.duration - 0.05));
  state.audio.loop = false;
  await state.audioContext.resume();

  const captureTap = state.audioContext.createScriptProcessor(4096, 2, 2);
  captureTap.onaudioprocess = processExportCapture;
  state.limiter.disconnect();
  state.limiter.connect(captureTap);
  captureTap.connect(state.monitorGain);
  state.captureTap = captureTap;

  state.exportCapture = {
    active: false,
    left: [],
    right: [],
    frames: 0,
    targetFrames: Math.round(duration * state.audioContext.sampleRate),
    sampleRate: state.audioContext.sampleRate,
    duration,
    bitDepth: Number(elements.exportBitDepth.value),
    parameters,
    previousLoop: elements.loopToggle.checked,
  };

  setExportControlsDisabled(true);
  elements.exportProgress.value = 0;
  elements.exportStatus.textContent = `准备导出 ${duration.toFixed(1)} 秒……`;

  try {
    await state.audio.play();
    state.exportCapture.active = true;
    elements.exportStatus.textContent = `导出中 0.0 / ${duration.toFixed(1)} 秒`;
  } catch (error) {
    if (state.captureTap) {
      state.limiter.disconnect(state.captureTap);
      state.captureTap.disconnect();
      state.captureTap.onaudioprocess = null;
      state.limiter.connect(state.monitorGain);
      state.captureTap = null;
    }
    state.exportCapture = null;
    setExportControlsDisabled(false);
    throw error;
  }
}

function buildOfflineGraph(
  offlineContext,
  audioBuffer,
  parameters,
  quality = "precise",
) {
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;

  const master = offlineContext.createGain();
  master.gain.value = Number(elements.volume.value) / 100;
  const limiter = offlineContext.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  if (state.mode === "hrtf") {
    const monoInput = offlineContext.createGain();
    monoInput.channelCount = 1;
    monoInput.channelCountMode = "explicit";
    monoInput.channelInterpretation = "speakers";

    const panner = offlineContext.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = constants.refDistance;
    panner.maxDistance = constants.maxDistance;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;

    const hrtfDistanceGain = offlineContext.createGain();
    hrtfDistanceGain.gain.value = hrtfDistanceCompensation(parameters.distance);
    const position = cartesianPosition(parameters);
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    source.connect(monoInput);
    monoInput.connect(panner);
    panner.connect(hrtfDistanceGain);
    hrtfDistanceGain.connect(master);
  } else if (state.mode === "parametric") {
    const monoInput = offlineContext.createGain();
    monoInput.channelCount = 1;
    monoInput.channelCountMode = "explicit";
    monoInput.channelInterpretation = "speakers";
    source.connect(monoInput);
    const path = createParametricPath(offlineContext, monoInput, {
      fast: quality === "fast",
    });
    applyParametricSettings(path, offlineContext, parameters, true);
    path.output.connect(master);
  } else if (state.mode === "binaural") {
    const stereoInput = offlineContext.createGain();
    source.connect(stereoInput);
    const path = createCompatibilityPath(offlineContext, stereoInput, {
      fast: quality === "fast",
    });
    applyCompatibilitySettings(path, offlineContext, parameters, true);
    path.output.connect(master);
  } else {
    source.connect(master);
  }

  master.connect(limiter);
  limiter.connect(offlineContext.destination);
  source.start(0);
  return source;
}

function scheduleOfflineProgress(offlineContext, durationSeconds) {
  const steps = Math.min(120, Math.max(10, Math.ceil(durationSeconds / 15)));
  for (let index = 1; index <= steps; index += 1) {
    const seconds = (durationSeconds * index) / steps;
    const frame = Math.max(128, Math.ceil((seconds * offlineContext.sampleRate) / 128) * 128);
    if (frame >= offlineContext.length) continue;
    offlineContext.suspend(frame / offlineContext.sampleRate).then(() => {
      elements.exportProgress.value = index / steps;
      elements.exportStatus.textContent = `离线渲染 ${seconds.toFixed(
        1,
      )} / ${durationSeconds.toFixed(1)} 秒`;
      return offlineContext.resume();
    });
  }
}

async function startOfflineExport() {
  ensureAudioGraph();
  if (!state.activeSource) {
    elements.exportStatus.textContent = "请先选择音频。";
    return;
  }

  const parameters = currentParameters();
  state.audio.pause();
  // 用户可能选完文件就直接导出，此时音频元素还没挂上源文件。
  if (state.audio.currentSrc !== state.activeSource.mediaUrl) {
    state.audio.src = state.activeSource.mediaUrl;
    state.audio.load();
  }
  // 时长是前置检查的依据，元数据还没读完就先等它。
  if (state.audio.readyState < 1) {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 5000);
      state.audio.addEventListener(
        "loadedmetadata",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  setExportControlsDisabled(true);
  elements.cancelExportButton.disabled = true;
  elements.exportProgress.removeAttribute("value");

  const duration = state.audio.duration;
  const bitDepth = Number(elements.exportBitDepth.value);
  const quality = elements.exportQuality?.value || "precise";
  if (isOverDecodeLimit(duration, state.audioContext.sampleRate)) {
    // 超长文件：MP3 可以按字节切段处理，其它格式只能给明确建议。
    if (!isSliceableSource()) {
      const extension = activeSourceExtension() || "该格式";
      throw new Error(
        `时长 ${formatDurationCn(duration)}，超过单次解码上限（当前采样率下约 ${decodeLimitMinutes(
          state.audioContext.sampleRate,
        ).toFixed(0)} 分钟）。浏览器一次最多解出约 2 GB PCM 数据，` +
          `而 ${extension} 不支持分段解码（解码器需要文件开头的容器信息）。` +
          `请改用「指定片段（实时捕获）」导出，或把源文件重新导出成 MP3、或切成小于 90 分钟的几段。`,
      );
    }
    const estimatedBytes =
      duration * state.audioContext.sampleRate * 2 * (bitDepth / 8);
    if (estimatedBytes > WAV_SIZE_LIMIT_BYTES) {
      throw new Error(
        `分段渲染可行，但预计成品 ${formatBytes(estimatedBytes)} 超过 WAV 单片 4 GB 上限，请改用 16-bit 或分成两段导出。`,
      );
    }
    await startSegmentedOfflineExport({
      parameters,
      bitDepth,
      durationSeconds: duration,
      quality,
    });
    setExportControlsDisabled(false);
    return;
  }

  elements.exportStatus.textContent = "正在读取完整源文件……";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const readStartedAt = performance.now();
  const response = await fetch(state.activeSource.mediaUrl);
  if (!response.ok) {
    throw new Error(`源文件读取失败：${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const readMs = performance.now() - readStartedAt;
  elements.exportStatus.textContent = "正在解码完整音频……";
  const decodeStartedAt = performance.now();
  const audioBuffer = await decodeAudioBufferFriendly(
    state.audioContext,
    arrayBuffer,
    "请改用「指定片段（实时捕获）」导出，或先用音频工具把文件切成小于 90 分钟的几段。",
  );
  const decodeMs = performance.now() - decodeStartedAt;
  const durationSeconds = audioBuffer.duration;
  const offlineContext = new OfflineAudioContext(
    2,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  buildOfflineGraph(offlineContext, audioBuffer, parameters, quality);
  scheduleOfflineProgress(offlineContext, durationSeconds);
  elements.exportStatus.textContent = `离线渲染 0.0 / ${durationSeconds.toFixed(
    1,
  )} 秒`;
  const renderStartedAt = performance.now();
  const rendered = await offlineContext.startRendering();
  const renderMs = performance.now() - renderStartedAt;
  elements.exportStatus.textContent = "正在编码完整 WAV……";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const left = rendered.getChannelData(0);
  const right =
    rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : rendered.getChannelData(0);
  const encodeStartedAt = performance.now();
  const wav = await encodeWav(
    left,
    right,
    rendered.sampleRate,
    Number(elements.exportBitDepth.value),
    (ratio) => {
      elements.exportProgress.value = ratio;
      elements.exportStatus.textContent = `正在编码完整 WAV…… ${Math.round(
        ratio * 100,
      )}%`;
    },
  );
  const encodeMs = performance.now() - encodeStartedAt;
  const saveStartedAt = performance.now();
  await downloadExport(wav, parameters);
  const saveMs = performance.now() - saveStartedAt;
  setExportControlsDisabled(false);
  elements.exportProgress.value = 1;
  elements.exportStatus.textContent = `完整导出完成：${durationSeconds.toFixed(
    1,
  )} 秒，${elements.exportBitDepth.value}-bit WAV（读取 ${(
    readMs / 1000
  ).toFixed(1)}s / 解码 ${(decodeMs / 1000).toFixed(1)}s / 渲染 ${(
    renderMs / 1000
  ).toFixed(1)}s / 编码 ${(encodeMs / 1000).toFixed(1)}s / 写盘 ${(
    saveMs / 1000
  ).toFixed(1)}s）。`;
}

async function startExport() {
  if (state.exportCapture?.active) return;
  if (elements.exportScopeSelect.value === "full") {
    await startOfflineExport();
  } else {
    await startSegmentExport();
  }
}

function currentParameters() {
  const azimuth = Number(elements.azimuth.value);
  const elevation = Number(elements.elevation.value);
  const distance = sliderToDistance(elements.distance.value);
  return { azimuth, elevation, distance };
}

// ---------------------------------------------------------------------------
// 空间参数模板：导出/导入可读的 TXT，导入后立即套用
// ---------------------------------------------------------------------------

const TEMPLATE_FIELDS = new Map([
  ["azimuth", "azimuth"],
  ["azimuthdeg", "azimuth"],
  ["方位角", "azimuth"],
  ["方位", "azimuth"],
  ["水平角", "azimuth"],
  ["elevation", "elevation"],
  ["elevationdeg", "elevation"],
  ["仰角", "elevation"],
  ["高度角", "elevation"],
  ["distance", "distance"],
  ["distancem", "distance"],
  ["距离", "distance"],
  ["volume", "volume"],
  ["gain", "volume"],
  ["输出音量", "volume"],
  ["音量", "volume"],
  ["mode", "mode"],
  ["rendermode", "mode"],
  ["渲染方式", "mode"],
  ["模式", "mode"],
  ["name", "name"],
  ["模板名称", "name"],
]);

const TEMPLATE_MODES = new Map([
  ["binaural", "binaural"],
  ["双耳兼容", "binaural"],
  ["双耳", "binaural"],
  ["compatibility", "binaural"],
  ["hrtf", "hrtf"],
  ["浏览器hrtf", "hrtf"],
  ["browserhrtf", "hrtf"],
  ["parametric", "parametric"],
  ["参数化hrtf", "parametric"],
  ["参数hrtf", "parametric"],
  ["bypass", "bypass"],
  ["直通", "bypass"],
  ["跳过", "bypass"],
]);

const TEMPLATE_MODE_LABELS = {
  binaural: "双耳兼容",
  hrtf: "浏览器 HRTF",
  parametric: "参数化 HRTF",
  bypass: "Bypass",
};

function normalizeTemplateKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g, "");
}

function parseTemplateNumber(raw) {
  const cleaned = String(raw).replace(/[^0-9.+-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseSpatialTemplate(text) {
  const values = {};
  const ignored = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) {
      continue;
    }
    const match = /^([^=:：]+)[=:：]\s*(.*)$/.exec(line);
    if (!match) {
      ignored.push(line);
      continue;
    }
    const field = TEMPLATE_FIELDS.get(normalizeTemplateKey(match[1]));
    if (!field) {
      ignored.push(line);
      continue;
    }
    values[field] = match[2].trim();
  }
  return { values, ignored };
}

function setModeFromTemplate(mode) {
  for (const candidate of elements.modeControl.querySelectorAll("button")) {
    candidate.classList.toggle("active", candidate.dataset.mode === mode);
  }
  changeMode(mode);
}

function applySpatialTemplate(values) {
  const applied = [];
  const notes = [];

  const applyRange = (
    field,
    label,
    slider,
    min,
    max,
    toSlider,
    format,
    formatValue,
  ) => {
    if (values[field] === undefined) return;
    const parsed = parseTemplateNumber(values[field]);
    if (parsed === null) return;
    const clamped = clamp(parsed, min, max);
    slider.value = String(toSlider ? toSlider(clamped) : clamped);
    applied.push(format(clamped));
    if (clamped !== parsed) {
      notes.push(`${label}已限幅到 ${formatValue(clamped)}`);
    }
  };

  applyRange("azimuth", "方位角", elements.azimuth, -90, 90, null, (v) => `方位角 ${v.toFixed(1)}°`, (v) => `${v.toFixed(1)}°`);
  applyRange("elevation", "仰角", elements.elevation, -30, 30, null, (v) => `仰角 ${v.toFixed(1)}°`, (v) => `${v.toFixed(1)}°`);
  applyRange("distance", "距离", elements.distance, 0.2, 10, distanceToSlider, (v) => `距离 ${v.toFixed(2)} m`, (v) => `${v.toFixed(2)} m`);
  applyRange("volume", "音量", elements.volume, 0, 100, null, (v) => `音量 ${Math.round(v)}%`, (v) => `${Math.round(v)}%`);

  if (values.mode !== undefined) {
    const mode = TEMPLATE_MODES.get(normalizeTemplateKey(values.mode));
    if (mode) {
      setModeFromTemplate(mode);
      applied.push(`渲染方式 ${TEMPLATE_MODE_LABELS[mode]}`);
    } else {
      notes.push(`无法识别渲染方式“${values.mode}”`);
    }
  }

  if (applied.length === 0) {
    return { ok: false, message: "没有识别到有效的参数行。" };
  }

  updateReadouts(currentParameters());
  updateAudioGraph(true);
  return { ok: true, applied, notes, name: values.name };
}

function buildSpatialTemplateText() {
  const parameters = currentParameters();
  return [
    "# asmr3d空间渲染器 · 空间参数模板 v1",
    "# 每行一个参数，用 = 或 : 分隔；# // ; 开头的行是注释",
    "# 数值可带单位，例如 0.4 m、80%、-12.5°",
    "",
    `模板名称 = ${state.activeSource?.title || "自定义参数"}`,
    `方位角 = ${parameters.azimuth.toFixed(1)}`,
    `仰角 = ${parameters.elevation.toFixed(1)}`,
    `距离 = ${parameters.distance.toFixed(2)}`,
    `输出音量 = ${Number(elements.volume.value).toFixed(0)}`,
    `渲染方式 = ${state.mode}`,
    `# 渲染方式可选：binaural / hrtf / parametric / bypass（当前 ${
      TEMPLATE_MODE_LABELS[state.mode] || state.mode
    }）`,
    "",
  ].join("\r\n");
}

function setTemplateStatus(message, stateName = "idle") {
  elements.templateStatus.textContent = message;
  elements.templateStatus.dataset.state = stateName;
}

function setTemplateBadge(text) {
  elements.templateBadge.textContent = text;
}

async function exportSpatialTemplate() {
  const text = buildSpatialTemplateText();
  const base =
    state.activeSource?.file?.split("/").pop()?.replace(/\.[^.]+$/, "") ||
    "asmr3d";
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-").slice(0, 19);
  const fileName = `${base}_空间参数_${stamp}.txt`;
  await saveBlobAsFile(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    fileName,
  );
  setTemplateBadge("已导出");
  setTemplateStatus(`已导出 ${fileName}（输出文件夹）`, "done");
}

async function importSpatialTemplate(file) {
  if (!file) return;
  try {
    const { values, ignored } = parseSpatialTemplate(await file.text());
    const result = applySpatialTemplate(values);
    if (!result.ok) {
      setTemplateBadge("失败");
      setTemplateStatus(`导入失败：${result.message}`, "error");
      return;
    }
    setTemplateBadge("已载入");
    setTemplateStatus(
      `已套用 ${result.applied.join(" · ")}${
        result.notes.length > 0 ? `（${result.notes.join("；")}）` : ""
      }${ignored.length > 0 ? ` · 忽略 ${ignored.length} 行无法识别的内容` : ""}`,
      "done",
    );
  } catch (error) {
    console.error(error);
    setTemplateBadge("失败");
    setTemplateStatus(`导入失败：${error.message}`, "error");
  }
}

function cartesianPosition({ azimuth, elevation, distance }) {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  const guardedDistance = spatialDistance(distance);
  const horizontal = guardedDistance * Math.cos(el);
  return {
    x: horizontal * Math.sin(az),
    y: guardedDistance * Math.sin(el),
    z: -horizontal * Math.cos(az),
  };
}

function setAudioParam(param, value) {
  param.setTargetAtTime(value, state.audioContext.currentTime, 0.025);
}

const impulseDataCache = new Map();

function createImpulseResponse(audioContext, duration = 1.15, decay = 2.8) {
  const length = Math.floor(audioContext.sampleRate * duration);
  const key = `${audioContext.sampleRate}:${length}:${decay}`;
  let channels = impulseDataCache.get(key);
  if (!channels) {
    const random = (() => {
      let state = 0x9e3779b9;
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    })();
    channels = [0, 1].map(() => {
      const data = new Float32Array(length);
      for (let index = 0; index < length; index += 1) {
        const envelope = (1 - index / length) ** decay;
        data[index] = (random() * 2 - 1) * envelope * 0.45;
      }
      return data;
    });
    impulseDataCache.set(key, channels);
  }
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  impulse.copyToChannel(channels[0], 0);
  impulse.copyToChannel(channels[1], 1);
  return impulse;
}

function createParametricPath(audioContext, monoInput, { fast = false } = {}) {
  const leftGain = audioContext.createGain();
  const rightGain = audioContext.createGain();
  const leftDelay = audioContext.createDelay(0.01);
  const rightDelay = audioContext.createDelay(0.01);
  const leftShadow = audioContext.createBiquadFilter();
  const rightShadow = audioContext.createBiquadFilter();
  const leftElevationLow = audioContext.createBiquadFilter();
  const rightElevationLow = audioContext.createBiquadFilter();
  const leftElevationHigh = audioContext.createBiquadFilter();
  const rightElevationHigh = audioContext.createBiquadFilter();
  const leftAir = audioContext.createBiquadFilter();
  const rightAir = audioContext.createBiquadFilter();
  const leftNear = audioContext.createBiquadFilter();
  const rightNear = audioContext.createBiquadFilter();
  const merger = audioContext.createChannelMerger(2);
  const dryGain = audioContext.createGain();
  const reverbSend = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const wetGain = audioContext.createGain();
  const output = audioContext.createGain();

  [leftShadow, rightShadow].forEach((filter) => {
    filter.type = "lowpass";
    filter.Q.value = 0.35;
  });

  [
    [leftElevationLow, 7800, 1.1],
    [rightElevationLow, 7800, 1.1],
    [leftElevationHigh, 10600, 1.3],
    [rightElevationHigh, 10600, 1.3],
  ].forEach(([filter, frequency, q]) => {
    filter.type = "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = q;
  });

  [leftAir, rightAir].forEach((filter) => {
    filter.type = "lowpass";
    filter.Q.value = 0.2;
  });

  [leftNear, rightNear].forEach((filter) => {
    filter.type = "lowshelf";
    filter.frequency.value = 180;
  });

  monoInput.connect(leftGain);
  monoInput.connect(rightGain);

  leftGain.connect(leftDelay);
  leftDelay.connect(leftShadow);
  leftShadow.connect(leftElevationLow);
  leftElevationLow.connect(leftElevationHigh);
  leftElevationHigh.connect(leftAir);
  leftAir.connect(leftNear);
  leftNear.connect(merger, 0, 0);
  leftNear.connect(reverbSend);

  rightGain.connect(rightDelay);
  rightDelay.connect(rightShadow);
  rightShadow.connect(rightElevationLow);
  rightElevationLow.connect(rightElevationHigh);
  rightElevationHigh.connect(rightAir);
  rightAir.connect(rightNear);
  rightNear.connect(merger, 0, 1);
  rightNear.connect(reverbSend);

  merger.connect(dryGain);
  dryGain.connect(output);

  convolver.buffer = createImpulseResponse(
    audioContext,
    fast ? 0.35 : 1.15,
    fast ? 1.8 : 2.8,
  );
  reverbSend.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input: monoInput,
    output,
    leftGain,
    rightGain,
    leftDelay,
    rightDelay,
    leftShadow,
    rightShadow,
    leftElevationLow,
    rightElevationLow,
    leftElevationHigh,
    rightElevationHigh,
    leftAir,
    rightAir,
    leftNear,
    rightNear,
    dryGain,
    reverbSend,
    wetGain,
  };
}

function createCompatibilityPath(audioContext, stereoInput, { fast = false } = {}) {
  const panner = audioContext.createStereoPanner();
  const elevationLow = audioContext.createBiquadFilter();
  const elevationHigh = audioContext.createBiquadFilter();
  const air = audioContext.createBiquadFilter();
  const near = audioContext.createBiquadFilter();
  const distanceGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const reverbSend = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const wetGain = audioContext.createGain();
  const output = audioContext.createGain();

  elevationLow.type = "highshelf";
  elevationLow.frequency.value = 6500;
  elevationHigh.type = "peaking";
  elevationHigh.frequency.value = 10500;
  elevationHigh.Q.value = 1.2;

  air.type = "lowpass";
  air.Q.value = 0.2;
  near.type = "lowshelf";
  near.frequency.value = 180;

  stereoInput.connect(panner);
  panner.connect(elevationLow);
  elevationLow.connect(elevationHigh);
  elevationHigh.connect(air);
  air.connect(near);
  near.connect(distanceGain);
  distanceGain.connect(dryGain);
  dryGain.connect(output);

  convolver.buffer = createImpulseResponse(
    audioContext,
    fast ? 0.35 : 1.15,
    fast ? 1.8 : 2.8,
  );
  distanceGain.connect(reverbSend);
  reverbSend.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input: stereoInput,
    output,
    panner,
    elevationLow,
    elevationHigh,
    air,
    near,
    distanceGain,
    dryGain,
    reverbSend,
    wetGain,
  };
}

function ensureAudioGraph() {
  if (state.ready) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass({ latencyHint: "interactive" });
  const audio = new Audio();
  audio.loop = elements.loopToggle.checked;
  audio.crossOrigin = "anonymous";
  attachProgressEvents(audio);

  const mediaSource = audioContext.createMediaElementSource(audio);
  const monoInput = audioContext.createGain();
  monoInput.channelCount = 1;
  monoInput.channelCountMode = "explicit";
  monoInput.channelInterpretation = "speakers";

  const liveGain = audioContext.createGain();
  liveGain.channelCount = 2;
  liveGain.channelCountMode = "explicit";
  liveGain.channelInterpretation = "speakers";
  liveGain.gain.value = 1;

  const hrtfPath = audioContext.createGain();
  const hrtfOutput = audioContext.createGain();
  const hrtfDistanceGain = audioContext.createGain();
  const panner = audioContext.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = constants.refDistance;
  panner.maxDistance = constants.maxDistance;
  panner.rolloffFactor = 1;
  panner.coneInnerAngle = 360;

  const parametricPath = audioContext.createGain();
  const parametric = createParametricPath(audioContext, parametricPath);
  const parametricOutput = audioContext.createGain();

  const compatibilityPath = audioContext.createGain();
  const compatibility = createCompatibilityPath(
    audioContext,
    compatibilityPath,
  );
  const compatibilityOutput = audioContext.createGain();

  const bypassPath = audioContext.createGain();
  const bypassOutput = audioContext.createGain();

  const master = audioContext.createGain();
  const monitorGain = audioContext.createGain();
  monitorGain.gain.value = 1;
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  hrtfPath.connect(panner);
  panner.connect(hrtfDistanceGain);
  hrtfDistanceGain.connect(hrtfOutput);
  hrtfOutput.connect(master);

  parametric.output.connect(parametricOutput);
  parametricOutput.connect(master);

  compatibility.output.connect(compatibilityOutput);
  compatibilityOutput.connect(master);

  bypassPath.connect(bypassOutput);
  bypassOutput.connect(master);

  master.connect(limiter);
  limiter.connect(monitorGain);
  monitorGain.connect(audioContext.destination);

  Object.assign(state, {
    audio,
    audioContext,
    mediaSource,
    liveGain,
    monoInput,
    master,
    monitorGain,
    limiter,
    hrtfPath,
    hrtfDistanceGain,
    parametricPath,
    compatibilityPath,
    bypassPath,
    panner,
    parametric,
    compatibility,
    ready: true,
  });

  connectModeInput(state.mode);
  setAudioParam(hrtfPath.gain, 0);
  setAudioParam(parametricPath.gain, 0);
  setAudioParam(compatibilityPath.gain, 1);
  setAudioParam(bypassPath.gain, 0);
  updateAudioGraph(true);
}

function updateModeCrossfade() {
  const time = state.audioContext.currentTime;
  const hrtf = state.mode === "hrtf" ? 1 : 0;
  const parametric = state.mode === "parametric" ? 1 : 0;
  const compatibility = state.mode === "binaural" ? 1 : 0;
  const bypass = state.mode === "bypass" ? 1 : 0;
  state.hrtfPath.gain.setTargetAtTime(hrtf, time, 0.02);
  state.parametricPath.gain.setTargetAtTime(parametric, time, 0.02);
  state.compatibilityPath.gain.setTargetAtTime(compatibility, time, 0.02);
  state.bypassPath.gain.setTargetAtTime(bypass, time, 0.02);

  elements.modeNote.textContent = {
    hrtf: "PannerNode 调用浏览器内建 HRTF，适合快速主观测试。",
    parametric: "以 ILD、ITD、头部阴影和耳廓滤波近似 HRTF，便于观察各线索。",
    binaural: "保留原始左右声道，只做整体声场横向移动、高度音色、距离与混响处理；不是真实声源旋转。",
    bypass: "保留原始左右声道并跳过空间处理，仅保留音量与限幅，作为 A/B 对照。",
  }[state.mode];
}

function disconnectModeInputs() {
  const inputs = [state.mediaSource, state.liveGain].filter(Boolean);
  const pairs = [];
  for (const input of inputs) {
    pairs.push([input, state.monoInput]);
    pairs.push([input, state.compatibilityPath]);
    pairs.push([input, state.bypassPath]);
  }
  pairs.push([state.monoInput, state.hrtfPath]);
  pairs.push([state.monoInput, state.parametricPath]);
  for (const [source, target] of pairs) {
    if (!source || !target) continue;
    try {
      source.disconnect(target);
    } catch {
      // The requested connection was not active.
    }
  }
}

function activeInputNode() {
  if (state.inputSource === "live" && state.liveGain) return state.liveGain;
  return state.mediaSource;
}

function connectModeInput(mode) {
  const input = activeInputNode();
  if (!input) return;
  if (mode === "hrtf") {
    input.connect(state.monoInput);
    state.monoInput.connect(state.hrtfPath);
  } else if (mode === "parametric") {
    input.connect(state.monoInput);
    state.monoInput.connect(state.parametricPath);
  } else if (mode === "binaural") {
    input.connect(state.compatibilityPath);
  } else {
    input.connect(state.bypassPath);
  }
}

function switchInputSource(source) {
  if (state.inputSource === source) return;
  if (!state.ready) {
    state.inputSource = source;
    return;
  }
  const now = state.audioContext.currentTime;
  state.master.gain.setTargetAtTime(0, now, 0.01);
  window.setTimeout(() => {
    disconnectModeInputs();
    state.inputSource = source;
    connectModeInput(state.mode);
    state.master.gain.setTargetAtTime(
      Number(elements.volume.value) / 100,
      state.audioContext.currentTime,
      0.015,
    );
  }, 40);
}

function changeMode(mode) {
  if (mode === state.mode && state.ready) return;
  const switchId = state.modeSwitchId + 1;
  state.modeSwitchId = switchId;

  if (!state.ready) {
    state.mode = mode;
    return;
  }

  const now = state.audioContext.currentTime;
  state.master.gain.setTargetAtTime(0, now, 0.008);
  window.setTimeout(() => {
    if (switchId !== state.modeSwitchId) return;
    disconnectModeInputs();
    state.mode = mode;
    connectModeInput(mode);
    state.master.gain.setTargetAtTime(
      Number(elements.volume.value) / 100,
      state.audioContext.currentTime,
      0.01,
    );
    updateAudioGraph();
  }, 24);
}

function setNodeParam(param, value, timeConstant, immediate = false, context = null) {
  if (immediate) {
    param.value = value;
  } else {
    param.setTargetAtTime(value, context.currentTime, timeConstant);
  }
}

function applyParametricSettings(path, audioContext, parameters, immediate = false) {
  const pan = Math.sin((parameters.azimuth * Math.PI) / 180);
  const distance = parameters.distance;
  const guardedDistance = spatialDistance(distance);
  const elevation = parameters.elevation / 30;
  const distanceGain = constants.refDistance / distance;
  const airCutoff = 20000 * Math.exp(-0.1 * (guardedDistance - constants.refDistance));
  const nearGain = nearFieldGainDb(distance);
  const leftGain = dbToGain(-Math.max(0, pan) * constants.maxIldDb);
  const rightGain = dbToGain(-Math.max(0, -pan) * constants.maxIldDb);
  const itd = constants.maxItdSeconds * pan;
  const leftCutoff = 20000 - 16000 * Math.max(0, pan);
  const rightCutoff = 20000 - 16000 * Math.max(0, -pan);
  const elevationPeak = elevation * 3.5;
  const elevationShelf = elevation * 2.2;

  setNodeParam(path.leftGain.gain, leftGain * distanceGain, 0.025, immediate, audioContext);
  setNodeParam(path.rightGain.gain, rightGain * distanceGain, 0.025, immediate, audioContext);
  setNodeParam(
    path.leftDelay.delayTime,
    Math.max(0, itd),
    0.025,
    immediate,
    audioContext,
  );
  setNodeParam(
    path.rightDelay.delayTime,
    Math.max(0, -itd),
    0.025,
    immediate,
    audioContext,
  );
  setNodeParam(path.leftShadow.frequency, leftCutoff, 0.03, immediate, audioContext);
  setNodeParam(path.rightShadow.frequency, rightCutoff, 0.03, immediate, audioContext);
  [
    path.leftElevationLow,
    path.rightElevationLow,
  ].forEach((filter) =>
    setNodeParam(filter.gain, elevationShelf, 0.03, immediate, audioContext),
  );
  [
    path.leftElevationHigh,
    path.rightElevationHigh,
  ].forEach((filter) =>
    setNodeParam(filter.gain, elevationPeak, 0.03, immediate, audioContext),
  );
  setNodeParam(path.leftAir.frequency, airCutoff, 0.03, immediate, audioContext);
  setNodeParam(path.rightAir.frequency, airCutoff, 0.03, immediate, audioContext);
  setNodeParam(path.leftNear.gain, nearGain, 0.03, immediate, audioContext);
  setNodeParam(path.rightNear.gain, nearGain, 0.03, immediate, audioContext);
  setNodeParam(
    path.wetGain.gain,
    reverbWetGain(distance),
    0.04,
    immediate,
    audioContext,
  );
}

function applyCompatibilitySettings(path, audioContext, parameters, immediate = false) {
  const pannerValue = Math.sin((parameters.azimuth * Math.PI) / 180);
  const elevation = parameters.elevation / 30;
  const guardedDistance = spatialDistance(parameters.distance);
  const distanceGainValue = constants.refDistance / parameters.distance;
  const airCutoff = 20000 * Math.exp(-0.1 * (guardedDistance - constants.refDistance));
  const nearGain = nearFieldGainDb(parameters.distance);
  const wet = reverbWetGain(parameters.distance);

  setNodeParam(path.panner.pan, pannerValue * 0.92, 0.025, immediate, audioContext);
  setNodeParam(
    path.elevationLow.gain,
    elevation * 1.8,
    0.03,
    immediate,
    audioContext,
  );
  setNodeParam(
    path.elevationHigh.gain,
    elevation * 3.2,
    0.03,
    immediate,
    audioContext,
  );
  setNodeParam(path.air.frequency, airCutoff, 0.03, immediate, audioContext);
  setNodeParam(path.near.gain, nearGain, 0.03, immediate, audioContext);
  setNodeParam(
    path.distanceGain.gain,
    distanceGainValue,
    0.025,
    immediate,
    audioContext,
  );
  setNodeParam(path.wetGain.gain, wet, 0.04, immediate, audioContext);
}

function updateAudioGraph(force = false) {
  if (!state.ready) return;
  const parameters = currentParameters();
  const position = cartesianPosition(parameters);
  const time = state.audioContext.currentTime;

  if (state.panner) {
    state.panner.positionX.setTargetAtTime(position.x, time, 0.025);
    state.panner.positionY.setTargetAtTime(position.y, time, 0.025);
    state.panner.positionZ.setTargetAtTime(position.z, time, 0.025);
  }
  if (state.hrtfDistanceGain) {
    setAudioParam(
      state.hrtfDistanceGain.gain,
      hrtfDistanceCompensation(parameters.distance),
    );
  }
  if (state.parametric) {
    applyParametricSettings(
      state.parametric,
      state.audioContext,
      parameters,
      false,
    );
  }
  if (state.compatibility) {
    applyCompatibilitySettings(
      state.compatibility,
      state.audioContext,
      parameters,
      false,
    );
  }
  setAudioParam(state.master.gain, Number(elements.volume.value) / 100);
  updateModeCrossfade();
  updateReadouts(parameters);

  if (force) {
    const latency =
      (state.audioContext.baseLatency || 0) +
      (state.audioContext.outputLatency || 0);
    elements.metricLatency.textContent =
      latency > 0 ? `${(latency * 1000).toFixed(1)} ms` : "由系统决定";
  }
}

function updateReadouts(parameters) {
  const distanceGainDb = 20 * Math.log10(constants.refDistance / parameters.distance);
  const pan = Math.sin((parameters.azimuth * Math.PI) / 180);
  const ild = constants.maxIldDb * Math.abs(pan);
  const itd = constants.maxItdSeconds * Math.abs(pan);
  const airCutoff = 20000 * Math.exp(-0.1 * (spatialDistance(parameters.distance) - 0.2));
  const nearGain = nearFieldGainDb(parameters.distance);

  elements.azimuthOutput.value = `${parameters.azimuth.toFixed(1)}°`;
  elements.elevationOutput.value = `${parameters.elevation.toFixed(1)}°`;
  elements.distanceOutput.value = `${parameters.distance.toFixed(2)} m`;
  elements.volumeOutput.value = `${elements.volume.value}%`;
  elements.metricDistanceGain.textContent = `${distanceGainDb.toFixed(1)} dB`;
  elements.metricIld.textContent = `${ild.toFixed(1)} dB`;
  elements.metricItd.textContent = `${(itd * 1000).toFixed(2)} ms`;
  elements.metricAir.textContent = `${(airCutoff / 1000).toFixed(1)} kHz`;
  elements.metricNear.textContent = `${nearGain.toFixed(1)} dB`;
  elements.signalChain.dataset.mode = state.mode;
  const chainByMode = {
    hrtf: ["Mono", "HRTF", "Distance", "Limiter", "Headphones"],
    parametric: ["Mono", "ILD / ITD", "Elevation EQ", "Distance", "Limiter"],
    binaural: ["Stereo L/R", "Field pan", "Elevation EQ", "Distance", "Limiter"],
    bypass: ["Original L/R", "Volume", "Limiter", "Headphones"],
  };
  elements.signalChain.innerHTML = chainByMode[state.mode]
    .map((label, index) => `${index ? "<i></i>" : ""}<span>${label}</span>`)
    .join("");
}

function setStatus(message, stateName = "idle") {
  elements.statusText.textContent = message;
  elements.engineState.textContent = {
    idle: "待机",
    running: "运行中",
    error: "错误",
  }[stateName];
  elements.engineState.className = `engine-state ${stateName === "running" ? "running" : ""} ${
    stateName === "error" ? "error" : ""
  }`;
}

function setTransportStatus(message) {
  if (elements.transportStatus) elements.transportStatus.textContent = message;
}

function selectMaterial(item) {
  state.activeSource = item;
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  elements.metaFile.textContent = item.file.split("/").pop();
  elements.metaCategory.textContent = item.category;
  elements.metaChannels.textContent = `${item.sourceMetadata.channels} ch`;
  elements.metaSampleRate.textContent = `${item.sourceMetadata.sampleRate} Hz`;
  elements.metaDuration.textContent = `${item.fileMetadata.decodedDuration.toFixed(1)} s`;
  elements.metaLicense.textContent = item.license;
  elements.sourceBadge.textContent = item.title;
  if (state.audio) {
    state.audio.src = item.mediaUrl;
    state.audio.load();
  }
  setStatus(`已选择：${item.title}`, "idle");
}

function loadMaterialList(items) {
  state.materialItems = items;
  elements.sampleSelect.replaceChildren();
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  }
  for (const [category, categoryItems] of grouped) {
    const group = document.createElement("optgroup");
    group.label = category;
    for (const item of categoryItems) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.title} · ${item.fileMetadata.decodedDuration.toFixed(1)}s`;
      group.append(option);
    }
    elements.sampleSelect.append(group);
  }
  const firstMono = items.find((item) => item.sourceMetadata.channels === 1) || items[0];
  if (firstMono) {
    elements.sampleSelect.value = firstMono.id;
    selectMaterial(firstMono);
  }
}

async function loadManifest() {
  if (Array.isArray(window.MOBILE_MATERIALS) && window.MOBILE_MATERIALS.length) {
    loadMaterialList(window.MOBILE_MATERIALS);
    return;
  }
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error(`素材清单读取失败：${response.status}`);
  const manifest = await response.json();
  loadMaterialList(manifest.items);
}

function markMethods() {
  const methods = document.querySelectorAll(".method-list li");
  methods.forEach((method) => method.classList.add("active"));
  elements.methodCount.textContent = `${methods.length} / ${methods.length}`;
}

async function togglePlayback() {
  ensureAudioGraph();
  if (!state.activeSource) return;
  switchInputSource("media");
  if (state.audio.currentSrc !== state.activeSource.mediaUrl) {
    state.audio.src = state.activeSource.mediaUrl;
  }
  if (state.audio.readyState < 1) {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 5000);
      state.audio.addEventListener(
        "loadedmetadata",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
  await state.audio.play();
  if (Number.isFinite(state.audio.duration)) {
    elements.metaDuration.textContent = `${state.audio.duration.toFixed(1)} s`;
  }
  updateProgressUI();
  setTransportStatus("正在播放空间化对象。");
  const latency =
    (state.audioContext.baseLatency || 0) + (state.audioContext.outputLatency || 0);
  elements.audioStatus.textContent = `AudioContext：${state.audioContext.state} · ${
    state.audioContext.sampleRate
  } Hz${latency > 0 ? ` · ${(latency * 1000).toFixed(1)} ms` : ""}`;
}

// ---------------------------------------------------------------------------
// 视频转音频：用浏览器内置解码器抽出音轨并编码 WAV
// ---------------------------------------------------------------------------

// decodeAudioData keeps the whole decoded track in memory as float32 PCM, so
// the practical ceiling is available RAM rather than a fixed duration.
const CONVERT_ASSUMED_RATE = 48000;
const CONVERT_ASSUMED_CHANNELS = 2;
const CONVERT_MAX_HOURS = 6;

function estimateConvertFootprint(duration, bitDepth, fileSize) {
  const decoded =
    duration * CONVERT_ASSUMED_RATE * CONVERT_ASSUMED_CHANNELS * 4;
  const wav =
    duration * CONVERT_ASSUMED_RATE * CONVERT_ASSUMED_CHANNELS * (bitDepth / 8);
  return {
    decoded,
    wav,
    // Source buffer + decoded PCM; decodeAudioData detaches the source buffer,
    // so both only coexist briefly.
    peak: decoded + fileSize,
  };
}

function setConvertStatus(message, stateName = "idle") {
  elements.convertStatus.textContent = message;
  elements.convertStatus.dataset.state = stateName;
}

function setConvertBadge(text) {
  elements.convertBadge.textContent = text;
}

// Reads only the container metadata, so this stays fast even for large files.
function probeMediaDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement("video");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    media.preload = "metadata";
    media.addEventListener(
      "loadedmetadata",
      () => finish(Number.isFinite(media.duration) ? media.duration : null),
      { once: true },
    );
    media.addEventListener("error", () => finish(null), { once: true });
    window.setTimeout(() => finish(null), 8000);
    media.src = url;
  });
}

function getConvertContext() {
  if (!state.convertContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.convertContext = new AudioContextClass();
  }
  return state.convertContext;
}

// Shows duration, predicted WAV size and memory need before converting.
async function describeConvertFile() {
  const [file] = elements.convertFileInput.files || [];
  elements.convertProgress.value = 0;
  if (!file) {
    elements.convertButton.disabled = true;
    setConvertBadge("待机");
    setConvertStatus("选择视频或音频文件，抽取音轨写入输出文件夹。");
    return;
  }
  setConvertBadge("就绪");
  elements.convertButton.disabled = false;
  setConvertStatus(`正在读取 ${file.name} 的信息……`);
  const duration = await probeMediaDuration(file);
  const bitDepth = Number(elements.convertBitDepth.value) || 24;
  if (!duration) {
    setConvertStatus(
      `${file.name} · ${formatBytes(file.size)}（读不到时长，将直接尝试解码）`,
    );
    return;
  }
  const footprint = estimateConvertFootprint(duration, bitDepth, file.size);
  const base =
    `${file.name} · ${formatTime(duration)} · 源文件 ${formatBytes(
      file.size,
    )} → 预计输出 ${formatBytes(footprint.wav)}（${bitDepth}-bit），转换需要约 ${formatBytes(
      footprint.peak,
    )} 内存`;
  if (isOverDecodeLimit(duration, CONVERT_ASSUMED_RATE)) {
    setConvertBadge("超长");
    setConvertStatus(
      `${base} · ⚠ 时长超过单次解码上限（约 ${decodeLimitMinutes(
        CONVERT_ASSUMED_RATE,
      ).toFixed(0)} 分钟），请先切成几段再转换`,
      "error",
    );
    return;
  }
  setConvertStatus(base);
}

async function convertMediaToWav() {
  const [file] = elements.convertFileInput.files || [];
  if (!file) {
    setConvertStatus("请先选择要转换的文件。", "error");
    return;
  }
  const bitDepth = Number(elements.convertBitDepth.value) || 16;
  elements.convertButton.disabled = true;
  elements.convertFileInput.disabled = true;
  elements.convertProgress.value = 0;
  setConvertBadge("处理中");
  setConvertStatus(`正在读取 ${file.name}……`, "running");

  try {
    const duration = await probeMediaDuration(file);
    if (duration) {
      assertDecodableLength(
        duration,
        CONVERT_ASSUMED_RATE,
        "请先用音频工具把文件切成小于 90 分钟的几段再转换。",
      );
      if (duration > CONVERT_MAX_HOURS * 3600) {
        throw new Error(
          `时长约 ${(duration / 3600).toFixed(1)} 小时，超过 ${CONVERT_MAX_HOURS} 小时上限。`,
        );
      }
      const footprint = estimateConvertFootprint(duration, bitDepth, file.size);
      if (footprint.wav > WAV_SIZE_LIMIT_BYTES) {
        throw new Error(
          `预计输出 ${formatBytes(footprint.wav)}，超过 WAV 单文件 4 GB 上限，请改用 16-bit 或分段处理。`,
        );
      }
      const memory = await state.desktop?.systemMemory?.().catch(() => null);
      if (memory?.free && footprint.peak > memory.free * 0.85) {
        throw new Error(
          `预计需要约 ${formatBytes(footprint.peak)} 内存，当前可用 ${formatBytes(
            memory.free,
          )}。请先关闭一些程序再重试。`,
        );
      }
    }

    elements.convertProgress.value = 0.15;
    setConvertStatus("正在解码音频轨道……", "running");
    const decoded = await decodeAudioBufferFriendly(
      getConvertContext(),
      await file.arrayBuffer(),
      "请先用音频工具把文件切成小于 90 分钟的几段再转换。",
    );

    elements.convertProgress.value = 0.6;
    setConvertStatus("正在编码 WAV……", "running");
    const left = decoded.getChannelData(0);
    const right =
      decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
    const wav = await encodeWav(
      left,
      right,
      decoded.sampleRate,
      bitDepth,
      (ratio) => {
        elements.convertProgress.value = 0.6 + ratio * 0.3;
        setConvertStatus(
          `正在编码 WAV…… ${Math.round(ratio * 100)}%（${
            decoded.numberOfChannels
          } ch · ${decoded.sampleRate} Hz）`,
          "running",
        );
      },
    );

    elements.convertProgress.value = 0.9;
    const fileName = `${file.name.replace(/\.[^.]+$/, "")}.wav`;
    await saveBlobAsFile(wav, fileName);
    elements.convertProgress.value = 1;
    setConvertBadge("完成");
    setConvertStatus(
      `已保存 ${fileName} · ${formatTime(decoded.duration)} · ${
        decoded.numberOfChannels
      } ch · ${decoded.sampleRate} Hz · ${bitDepth}-bit · ${(
        wav.size /
        (1024 * 1024)
      ).toFixed(1)} MB（已写入输出文件夹）`,
    );
  } catch (error) {
    console.error(error);
    elements.convertProgress.value = 0;
    setConvertBadge("失败");
    setConvertStatus(
      `转换失败：${error.message || "该文件的音轨无法解码"}`,
      "error",
    );
  } finally {
    elements.convertButton.disabled = false;
    elements.convertFileInput.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// 直播截获：按应用进程回环 → 现有空间渲染链
// ---------------------------------------------------------------------------

class StreamingResampler {
  constructor(ratio) {
    this.ratio = ratio > 0 ? ratio : 1;
    this.carry = new Float32Array(0);
    this.position = 0;
  }

  process(input) {
    const buffer = new Float32Array(this.carry.length + input.length);
    buffer.set(this.carry, 0);
    buffer.set(input, this.carry.length);
    const estimated = Math.max(
      0,
      Math.floor((buffer.length - 1 - this.position) / this.ratio) + 1,
    );
    const output = new Float32Array(estimated);
    let written = 0;
    let position = this.position;
    while (position + 1 < buffer.length && written < output.length) {
      const index = Math.floor(position);
      const fraction = position - index;
      const a = buffer[index];
      output[written] = a + (buffer[index + 1] - a) * fraction;
      written += 1;
      position += this.ratio;
    }
    const base = Math.floor(position);
    this.carry = buffer.slice(base);
    this.position = position - base;
    return output.subarray(0, written);
  }
}

function setLiveStatus(message, stateName = "idle") {
  elements.liveStatus.textContent = message;
  elements.liveStatus.dataset.state = stateName;
}

// Session volume scales the process-loopback capture proportionally, so the
// original can be pushed far below audibility while the renderer applies the
// matching digital gain. That keeps live monitoring (and live parameter
// changes) while removing the double-audio echo.
const SOURCE_ATTENUATION_VOLUME = 0.001; // -60 dB
const MAX_COMPENSATION_GAIN = 2000; // +66 dB of headroom

// The monitor bus sits after the recording tap, so muting it removes what you
// hear without affecting the recording.
function applyMonitorMute() {
  if (!state.monitorGain || !state.audioContext) return;
  const muted =
    state.liveActive && elements.sourceModeSelect.value === "monitor-mute";
  state.monitorGain.gain.setTargetAtTime(
    muted ? 0 : 1,
    state.audioContext.currentTime,
    0.02,
  );
}

async function releaseSourceHandling() {
  state.liveCompensation = 1;
  if (state.desktop?.restoreSourceVolume) {
    try {
      await state.desktop.restoreSourceVolume();
    } catch {
      // Ignore: the volume is restored on quit as well.
    }
  }
}

function renderLiveTargets() {
  const select = elements.liveTargetSelect;
  select.textContent = "";
  if (state.liveTargets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "没有可用的截获来源";
    select.append(option);
    select.disabled = true;
    elements.liveStartButton.disabled = true;
    return;
  }
  state.liveTargets.forEach((target, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const peakDb =
      target.peak > 0.0005 ? `${(20 * Math.log10(target.peak)).toFixed(1)} dB` : "静音";
    option.textContent =
      `${target.processName} · PID ${target.processId} · ${peakDb}`;
    select.append(option);
  });
  select.disabled = false;
  elements.liveStartButton.disabled = false;
}

async function scanLiveTargets() {
  const desktop = state.desktop;
  if (!desktop?.listLiveTargets) {
    elements.liveModeBadge.textContent = "不可用";
    setLiveStatus("直播截获仅支持 Windows 桌面版。", "error");
    return;
  }
  elements.liveRefreshButton.disabled = true;
  setLiveStatus("正在扫描音频会话……");
  try {
    const result = await desktop.listLiveTargets();
    if (!result?.ok) throw new Error(result?.error || "扫描失败。");
    state.liveCapability = {
      processLoopback: Boolean(result.processLoopback),
      runtime: String(result.runtime || ""),
    };
    const targets = Array.isArray(result.targets) ? result.targets : [];
    state.liveTargets = targets;
    renderLiveTargets();
    if (!state.liveCapability.processLoopback) {
      elements.liveModeBadge.textContent = "需要 PowerShell 7";
      elements.liveModeBadge.className = "on-warn";
      setLiveStatus(
        "未检测到 PowerShell 7（pwsh）。直播截获需要它按应用取流，请先安装 PowerShell 7 后重新扫描。",
        "warn",
      );
      return;
    }
    elements.liveModeBadge.textContent = "按应用";
    elements.liveModeBadge.className = "on-process";
    setLiveStatus(`检测到 ${targets.length} 个音频会话，可选择任意应用截获。`);
  } catch (error) {
    console.error(error);
    elements.liveModeBadge.textContent = "扫描失败";
    setLiveStatus(error.message, "error");
  } finally {
    elements.liveRefreshButton.disabled = false;
  }
}

async function ensureLiveAudioNode() {
  if (state.liveNode || state.liveFallback) return;
  ensureAudioGraph();
  const context = state.audioContext;
  const moduleUrl = new URL("live-capture-worklet.js", document.baseURI).href;
  try {
    await context.audioWorklet.addModule(moduleUrl);
    const node = new AudioWorkletNode(context, "live-capture-source", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.postMessage({ type: "enable", value: true });
    node.connect(state.liveGain);
    state.liveNode = node;
  } catch (error) {
    console.warn("AudioWorklet 不可用，回退到 ScriptProcessor。", error);
    const processor = context.createScriptProcessor(2048, 0, 2);
    processor.onaudioprocess = (event) => {
      const left = event.outputBuffer.getChannelData(0);
      const right =
        event.outputBuffer.numberOfChannels > 1
          ? event.outputBuffer.getChannelData(1)
          : left;
      queuePull(left, right);
    };
    processor.connect(state.liveGain);
    state.liveFallback = processor;
  }
}

function queuePush(left, right) {
  const queue = state.liveQueue;
  queue.left.push(left);
  queue.right.push(right);
  queue.length += left.length;
  const limit = state.audioContext.sampleRate * 4;
  while (queue.length > limit && queue.left.length > 1) {
    const droppedLeft = queue.left.shift();
    queue.right.shift();
    queue.length -= droppedLeft.length;
  }
}

function queuePull(left, right) {
  const queue = state.liveQueue;
  const frames = left.length;
  let filled = 0;
  while (filled < frames && queue.left.length > 0) {
    const headLeft = queue.left[0];
    const headRight = queue.right[0];
    const take = Math.min(frames - filled, headLeft.length);
    left.set(headLeft.subarray(0, take), filled);
    right.set(headRight.subarray(0, take), filled);
    filled += take;
    queue.length -= take;
    if (take === headLeft.length) {
      queue.left.shift();
      queue.right.shift();
    } else {
      queue.left[0] = headLeft.subarray(take);
      queue.right[0] = headRight.subarray(take);
    }
  }
  if (filled < frames) {
    left.fill(0, filled);
    right.fill(0, filled);
  }
}

function pushLiveFrames(left, right) {
  if (state.liveNode) {
    const leftCopy = left.slice();
    const rightCopy = right.slice();
    state.liveNode.port.postMessage(
      { type: "push", left: leftCopy, right: rightCopy },
      [leftCopy.buffer, rightCopy.buffer],
    );
  } else {
    queuePush(left, right);
  }
}

function resetLivePipeline(header) {
  state.liveChannels = Number(header?.channels) || 2;
  const captureRate = Number(header?.sampleRate) || 48000;
  const ratio = captureRate / state.audioContext.sampleRate;
  state.liveResamplerL = new StreamingResampler(ratio);
  state.liveResamplerR = new StreamingResampler(ratio);
  state.liveQueue = { left: [], right: [], length: 0 };
  if (state.liveNode) state.liveNode.port.postMessage({ type: "reset" });
  const pending = state.livePendingChunks;
  state.livePendingChunks = [];
  for (const chunk of pending) handleLiveChunk(chunk);
}

function handleLiveChunk(payload) {
  if (!state.liveResamplerL || !state.liveResamplerR) {
    if (state.livePendingChunks.length < 64) state.livePendingChunks.push(payload);
    return;
  }
  const bytes = payload?.buffer ?? payload;
  const view =
    payload instanceof Float32Array
      ? payload
      : new Float32Array(
          bytes,
          payload.byteOffset || 0,
          Math.floor((payload.byteLength ?? bytes.byteLength) / 4),
        );
  const channels = state.liveChannels;
  const frames = Math.floor(view.length / channels);
  if (frames <= 0) return;

  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const gain = state.liveCompensation;
  if (channels === 1) {
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = view[frame] * gain;
      right[frame] = view[frame] * gain;
    }
  } else {
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = view[frame * channels] * gain;
      right[frame] = view[frame * channels + 1] * gain;
    }
  }

  const resampledLeft = state.liveResamplerL.process(left);
  const resampledRight = state.liveResamplerR.process(right);
  pushLiveFrames(resampledLeft, resampledRight);
  updateLiveMeter(resampledLeft, resampledRight);
}

function updateLiveMeter(left, right) {
  let peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    const value = Math.abs(left[index]);
    if (value > peak) peak = value;
    const other = Math.abs(right[index]);
    if (other > peak) peak = other;
  }
  if (peak > state.liveLevelPeak) state.liveLevelPeak = peak;
  updateLiveMeterUI();
}

function updateLiveMeterUI() {
  const peak = state.liveLevelPeak;
  elements.liveLevelBar.value = Math.min(1, peak);
  elements.liveLevelText.textContent =
    peak > 0.0002 ? `${(20 * Math.log10(peak)).toFixed(1)} dB` : "−∞ dB";
}

function startLiveMeterLoop() {
  if (state.liveMeterTimer) return;
  state.liveMeterTimer = window.setInterval(() => {
    state.liveLevelPeak *= 0.82;
    if (state.liveLevelPeak < 0.0002) state.liveLevelPeak = 0;
    updateLiveMeterUI();
  }, 100);
}

function stopLiveMeterLoop() {
  if (!state.liveMeterTimer) return;
  window.clearInterval(state.liveMeterTimer);
  state.liveMeterTimer = null;
  state.liveLevelPeak = 0;
  updateLiveMeterUI();
}

function liveSelectedTarget() {
  const index = Number(elements.liveTargetSelect.value);
  if (!Number.isInteger(index)) return null;
  return state.liveTargets[index] || null;
}

async function startLiveCapture() {
  const desktop = state.desktop;
  if (!desktop?.startLiveCapture) {
    setLiveStatus("直播截获仅支持 Windows 桌面版。", "error");
    return;
  }
  if (state.liveActive) return;
  const target = liveSelectedTarget();
  if (!target) {
    setLiveStatus("请先选择截获来源。", "error");
    return;
  }

  elements.liveStartButton.disabled = true;
  elements.liveRefreshButton.disabled = true;
  setLiveStatus(`正在启动截获：${target.processName}……`);

  try {
    ensureAudioGraph();
    if (state.audioContext.state === "suspended") {
      await state.audioContext.resume();
    }
    await ensureLiveAudioNode();
    if (state.audio) state.audio.pause();

    state.liveResamplerL = null;
    state.liveResamplerR = null;
    state.livePendingChunks = [];

    // Lower the source app first: session volume scales the process-loopback
    // capture, so the renderer can compensate and keep full-quality input.
    state.liveCompensation = 1;
    let previousVolume = null;
    let handling = "skipped";
    const sourceMode = elements.sourceModeSelect.value;
    if (sourceMode === "attenuate" && desktop.attenuateSource) {
      const attenuation = await desktop.attenuateSource({
        processId: target.processId,
        processName: target.processName,
        volume: SOURCE_ATTENUATION_VOLUME,
      });
      if (attenuation?.ok && Number(attenuation.previous) > 0) {
        previousVolume = Number(attenuation.previous);
        state.liveCompensation = Math.min(
          previousVolume / SOURCE_ATTENUATION_VOLUME,
          MAX_COMPENSATION_GAIN,
        );
        handling = "ok";
      } else {
        handling = attenuation?.error || "failed";
      }
    } else if (sourceMode === "attenuate") {
      handling = "unsupported";
    }

    const result = await desktop.startLiveCapture({
      processId: target.processId,
      silenceTimeoutSeconds: Number(elements.liveSilenceSelect.value) || 0,
      restoreVolumeOnExit: previousVolume,
    });
    if (!result?.ok) {
      if (previousVolume !== null && desktop.restoreSourceVolume) {
        try {
          await desktop.restoreSourceVolume();
        } catch {
          // Ignore.
        }
      }
      throw new Error(result?.error || "启动直播截获失败。");
    }

    resetLivePipeline(result.header);
    switchInputSource("live");
    state.liveActive = true;
    applyMonitorMute();
    const liveName = result.header.processName;
    elements.sourceBadge.textContent = `直播：${liveName}`;
    elements.liveStopButton.disabled = false;
    elements.liveTargetSelect.disabled = true;
    startLiveMeterLoop();
    const handlingNote =
      {
        ok: "已把原声压到 −60 dB 并在渲染链补偿，耳机里只会听到空间渲染结果。",
        silent: "该应用当前音量已接近静音，无法压低原声。",
        skipped: "未处理原声，可能出现叠加回声。",
        unsupported: "当前环境不支持压低原声。",
      }[handling] || `原声处理失败：${handling}`;
    setLiveStatus(
      `正在截获 ${liveName}（${result.header.sampleRate} Hz / ${result.header.channels} ch）。${handlingNote}`,
      "running",
    );

    if (elements.recordToggle.checked) {
      await beginRecording();
    }
  } catch (error) {
    console.error(error);
    setLiveStatus(error.message, "error");
    elements.liveStartButton.disabled = false;
    try {
      await desktop.stopLiveCapture();
    } catch {
      // Ignore.
    }
  } finally {
    elements.liveRefreshButton.disabled = false;
  }
}

async function stopLiveCapture(reason) {
  const desktop = state.desktop;
  state.liveActive = false;
  applyMonitorMute();
  await releaseSourceHandling();
  elements.liveStopButton.disabled = true;
  elements.liveStartButton.disabled = false;
  elements.liveTargetSelect.disabled = state.liveTargets.length === 0;
  stopLiveMeterLoop();
  if (state.liveNode) state.liveNode.port.postMessage({ type: "reset" });
  state.liveResamplerL = null;
  state.liveResamplerR = null;
  state.livePendingChunks = [];
  switchInputSource("media");
  elements.sourceBadge.textContent = state.activeSource?.title || "未加载";

  if (desktop?.stopLiveCapture) {
    try {
      await desktop.stopLiveCapture();
    } catch {
      // Ignore.
    }
  }

  if (state.recording) {
    await finishRecording();
  }
  setLiveStatus(reason || "已停止直播截获。");
}

// ---------------------------------------------------------------------------
// 同步录制：渲染输出分流 → 主进程分段写盘 → 结束后合并
// ---------------------------------------------------------------------------

function attachRecordTap() {
  if (state.recordTap || state.captureTap) return;
  const context = state.audioContext;
  const tap = context.createScriptProcessor(2048, 2, 2);
  tap.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    const output = event.outputBuffer;
    const left = input.getChannelData(0);
    const right =
      input.numberOfChannels > 1 ? input.getChannelData(1) : left;
    output.getChannelData(0).set(left);
    if (output.numberOfChannels > 1) output.getChannelData(1).set(right);
    if (!state.recording || !state.desktop?.sendRecordChunk) return;
    const frames = left.length;
    const interleaved = new Float32Array(frames * 2);
    for (let frame = 0; frame < frames; frame += 1) {
      interleaved[frame * 2] = left[frame];
      interleaved[frame * 2 + 1] = right[frame];
    }
    state.desktop.sendRecordChunk(interleaved.buffer);
  };
  state.limiter.disconnect();
  state.limiter.connect(tap);
  tap.connect(state.monitorGain);
  state.recordTap = tap;
}

function detachRecordTap() {
  const tap = state.recordTap;
  if (!tap) return;
  try {
    state.limiter.disconnect(tap);
  } catch {
    // Ignore.
  }
  tap.disconnect();
  tap.onaudioprocess = null;
  state.limiter.connect(state.monitorGain);
  state.recordTap = null;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function startRecordingPoll() {
  if (state.recordingPollTimer) return;
  state.recordingPollTimer = window.setInterval(async () => {
    if (!state.recording || !state.desktop?.recordingStats) return;
    const stats = await state.desktop.recordingStats();
    if (!stats) return;
    const seconds = stats.frames / state.audioContext.sampleRate;
    elements.recordStatus.textContent = `录制中 ${formatTime(seconds)} · ${formatBytes(
      stats.bytes,
    )} · 已写 ${stats.segments} 个分段${stats.error ? ` · ${stats.error}` : ""}`;
  }, 1000);
}

function stopRecordingPoll() {
  if (!state.recordingPollTimer) return;
  window.clearInterval(state.recordingPollTimer);
  state.recordingPollTimer = null;
}

async function beginRecording() {
  const desktop = state.desktop;
  if (!desktop?.startRecording) {
    elements.recordStatus.textContent = "当前环境不支持录制。";
    return;
  }
  if (state.recording) return;
  if (state.captureTap) {
    elements.recordStatus.textContent = "片段导出进行中，暂时无法开始录制。";
    return;
  }
  try {
    const directory =
      state.recordingDirectory ||
      (await desktop.defaultRecordingDirectory());
    state.recordingDirectory = directory;
    const result = await desktop.startRecording({
      directory,
      sampleRate: state.audioContext.sampleRate,
      channels: 2,
      bitDepth: Number(elements.recordBitDepthSelect.value),
      segmentSeconds: Number(elements.recordSegmentSelect.value),
    });
    if (!result?.ok) throw new Error(result?.error || "无法开始录制。");
    state.recording = true;
    attachRecordTap();
    startRecordingPoll();
    elements.recordBadge.textContent = "录制中";
    elements.recordToggle.disabled = true;
    elements.recordDirText.textContent = `保存位置：${result.directory}`;
    elements.recordStatus.textContent = `录制中 0:00 · 0 MB · 已写 1 个分段`;
  } catch (error) {
    console.error(error);
    state.recording = false;
    elements.recordStatus.textContent = `录制失败：${error.message}`;
  }
}

async function finishRecording() {
  if (!state.recording) return;
  const desktop = state.desktop;
  state.recording = false;
  stopRecordingPoll();
  detachRecordTap();
  elements.recordToggle.disabled = false;
  elements.recordBadge.textContent = "合并中";
  elements.recordStatus.textContent = "正在校验并合并分段……";
  try {
    const result = await desktop.stopRecording();
    if (!result?.ok) throw new Error(result?.error || "合并失败。");
    if (result.discarded || !result.filePath) {
      elements.recordBadge.textContent = "关闭";
      elements.recordStatus.textContent = "录制内容为空，未生成文件。";
      return;
    }
    state.lastRecordingFile = result.filePath;
    elements.recordBadge.textContent = "完成";
    elements.recordRevealButton.disabled = false;
    elements.recordStatus.textContent = `已保存：${result.filePath}（${formatBytes(
      result.bytes,
    )}，${formatTime(result.frames / state.audioContext.sampleRate)}，SHA-256 ${String(
      result.sha256,
    ).slice(0, 12)}…）`;
  } catch (error) {
    console.error(error);
    elements.recordBadge.textContent = "失败";
    elements.recordStatus.textContent = `合并失败，临时分段已保留：${error.message}`;
  }
}

function bindLiveControls() {
  state.desktop = window.asmr3dDesktop || null;
  elements.liveRefreshButton.addEventListener("click", () => {
    scanLiveTargets().catch((error) => setLiveStatus(error.message, "error"));
  });
  elements.liveStartButton.addEventListener("click", () => {
    startLiveCapture().catch((error) => setLiveStatus(error.message, "error"));
  });
  elements.liveStopButton.addEventListener("click", () => {
    stopLiveCapture("已手动停止直播截获。").catch((error) =>
      setLiveStatus(error.message, "error"),
    );
  });
  elements.sourceModeSelect.addEventListener("change", () => {
    applyMonitorMute();
  });
  elements.recordDirButton.addEventListener("click", async () => {
    if (!state.desktop?.chooseRecordingDirectory) return;
    const result = await state.desktop.chooseRecordingDirectory();
    if (!result) return;
    if (result.ok && result.directory) {
      state.recordingDirectory = result.directory;
      elements.recordDirText.textContent = `保存位置：${result.directory}`;
      elements.exportDirText.textContent = `成品保存位置：${result.directory}`;
      elements.recordStatus.textContent = "未录制。";
    } else if (result.error) {
      elements.recordDirText.textContent = `保存位置：${result.directory || "未选择"}`;
      elements.recordStatus.textContent = result.error;
    }
  });
  elements.recordRevealButton.addEventListener("click", () => {
    const target = state.lastRecordingFile;
    if (state.desktop?.openOutputFolder) {
      state.desktop.openOutputFolder(target || "");
    } else if (target && state.desktop?.revealFile) {
      state.desktop.revealFile(target);
    }
  });

  if (state.desktop?.onLiveAudioChunk) {
    state.desktop.onLiveAudioChunk((chunk) => {
      try {
        handleLiveChunk(chunk);
      } catch (error) {
        console.error(error);
      }
    });
  }
  if (state.desktop?.onLiveCaptureEnded) {
    state.desktop.onLiveCaptureEnded((payload) => {
      if (!state.liveActive) return;
      const reason =
        payload?.reason === "process-exited"
          ? "直播应用已退出，截获自动停止。"
          : payload?.reason === "silence"
            ? "持续静音达到设定时长，截获自动停止。"
            : "直播截获已结束。";
      stopLiveCapture(reason).catch((error) => setLiveStatus(error.message, "error"));
    });
  }

  if (state.desktop?.defaultRecordingDirectory) {
    state.desktop
      .defaultRecordingDirectory()
      .then((directory) => {
        state.recordingDirectory = directory;
        elements.recordDirText.textContent = `保存位置：${directory}`;
        elements.exportDirText.textContent = `成品保存位置：${directory}`;
        elements.recordRevealButton.disabled = false;
      })
      .catch(() => {});
  } else {
    elements.recordDirButton.disabled = true;
    elements.recordToggle.disabled = true;
    elements.liveModeBadge.textContent = "不可用";
    setLiveStatus("直播截获与录制仅在 Windows 桌面版可用。");
  }
}

function bindControls() {
  elements.playButton.addEventListener("click", () => {
    togglePlayback().catch((error) => {
      console.error(error);
      setStatus(error.message, "error");
    });
  });

  elements.pauseButton.addEventListener("click", () => {
    if (!state.audio) return;
    state.audio.pause();
    setTransportStatus("已暂停，播放位置已保留。");
  });

  elements.stopButton.addEventListener("click", () => {
    if (!state.audio) return;
    // Stop keeps the playback position so you can resume from where you were.
    // Use the progress slider (or 后退 10 秒) to go back.
    state.audio.pause();
    updateProgressUI({ enabled: true });
    setTransportStatus("已停止播放，播放位置已保留。");
  });

  elements.resetPlaybackButton.addEventListener("click", () => {
    if (!state.audio) return;
    state.audio.currentTime = 0;
    updateProgressUI({ enabled: true });
    setTransportStatus("已回到开头。");
  });

  elements.progressRange.addEventListener("pointerdown", () => {
    state.isSeeking = true;
    state.lastSeekAt = 0;
  });

  elements.progressRange.addEventListener("input", () => {
    if (!state.audio || !Number.isFinite(state.audio.duration)) return;
    state.isSeeking = true;
    const value = Number(elements.progressRange.value);
    const duration = state.audio.duration;
    // Update the readouts directly: calling updateProgressUI() here would
    // rewrite the slider attributes and break the drag.
    elements.currentTime.textContent = formatTime(value);
    elements.progressPercent.textContent = `${Math.round((value / duration) * 100)}%`;
    // Seek while scrubbing, but throttled so the audio does not stutter.
    const now = performance.now();
    if (now - (state.lastSeekAt || 0) > 80) {
      state.lastSeekAt = now;
      state.audio.currentTime = value;
    }
  });

  const commitSeek = () => {
    if (!state.audio || !Number.isFinite(state.audio.duration)) return;
    state.audio.currentTime = Number(elements.progressRange.value);
    state.isSeeking = false;
    state.lastSeekAt = 0;
    updateProgressUI({ enabled: true });
  };
  elements.progressRange.addEventListener("change", commitSeek);
  elements.progressRange.addEventListener("pointerup", commitSeek);
  elements.progressRange.addEventListener("pointercancel", () => {
    state.isSeeking = false;
    updateProgressUI();
  });

  elements.skipBackButton.addEventListener("click", () => seekBy(-10));
  elements.skipForwardButton.addEventListener("click", () => seekBy(10));

  elements.convertFileInput.addEventListener("change", () => {
    describeConvertFile().catch(() => {});
  });
  elements.convertBitDepth.addEventListener("change", () => {
    if ((elements.convertFileInput.files || []).length > 0) {
      describeConvertFile().catch(() => {});
    }
  });
  elements.convertButton.addEventListener("click", () => {
    convertMediaToWav().catch((error) => {
      setConvertStatus(`转换失败：${error.message}`, "error");
    });
  });

  elements.exportButton.addEventListener("click", () => {
    startExport().catch((error) => {
      console.error(error);
      elements.exportStatus.textContent = `导出失败：${error.message}`;
      elements.exportProgress.value = 0;
      setExportControlsDisabled(false);
    });
  });
  elements.cancelExportButton.addEventListener("click", () => finishExport(true));
  elements.exportScopeSelect.addEventListener("change", updateExportScopeControls);
  elements.exportDurationSelect.addEventListener("change", syncExportDurationCustom);

  elements.loopToggle.addEventListener("change", () => {
    if (state.audio) state.audio.loop = elements.loopToggle.checked;
  });

  elements.sampleSelect.addEventListener("change", () => {
    const item = state.materialItems.find(
      (candidate) => String(candidate.id) === elements.sampleSelect.value,
    );
    if (item) selectMaterial(item);
  });

  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    if (!file) return;
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.activeSource = {
      id: "local",
      title: file.name,
      file: file.name,
      category: "local-file",
      mediaUrl: state.objectUrl,
      license: "用户本地文件",
      sourceMetadata: {
        channels: "未知",
        sampleRate: "未知",
      },
      fileMetadata: {
        decodedDuration: 0,
      },
    };
    elements.sourceBadge.textContent = file.name;
    elements.metaFile.textContent = file.name;
    elements.metaCategory.textContent = "本地文件";
    elements.metaChannels.textContent = "对象模式下混 / 兼容模式保留";
    elements.metaSampleRate.textContent = "由浏览器重采样";
    elements.metaDuration.textContent = "读取中";
    elements.metaLicense.textContent = "用户本地文件";
    if (state.audio) {
      state.audio.src = state.objectUrl;
      state.audio.load();
      state.audio.addEventListener(
        "loadedmetadata",
        () => {
          elements.metaDuration.textContent = `${state.audio.duration.toFixed(1)} s`;
        },
        { once: true },
      );
    }
    setStatus(`已选择本地文件：${file.name}`, "idle");
  });

  for (const control of [
    elements.azimuth,
    elements.elevation,
    elements.distance,
    elements.volume,
  ]) {
    control.addEventListener("input", () => updateAudioGraph());
  }

  elements.resetButton.addEventListener("click", () => {
    applyConfiguredDefaults();
  });

  elements.templateImportButton.addEventListener("click", () => {
    elements.templateFileInput.value = "";
    elements.templateFileInput.click();
  });
  elements.templateFileInput.addEventListener("change", () => {
    const [file] = elements.templateFileInput.files || [];
    importSpatialTemplate(file).catch((error) => {
      setTemplateStatus(`导入失败：${error.message}`, "error");
    });
  });
  elements.templateExportButton.addEventListener("click", () => {
    exportSpatialTemplate().catch((error) => {
      setTemplateStatus(`导出失败：${error.message}`, "error");
    });
  });

  elements.modeControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    for (const candidate of elements.modeControl.querySelectorAll("button")) {
      candidate.classList.toggle("active", candidate === button);
    }
    changeMode(button.dataset.mode);
  });

}

async function initialize() {
  bindControls();
  bindLiveControls();
  markMethods();
  updateExportScopeControls();
  applyConfiguredDefaults();
  updateProgressUI();
  window.addEventListener("asmr3d:apply-defaults", () => {
    applyConfiguredDefaults();
  });
  try {
    await loadManifest();
    setStatus("素材库已载入，按播放开始测试。", "idle");
  } catch (error) {
    console.error(error);
    loadMaterialList([]);
    setStatus("未连接素材服务，可上传本地音频文件。", "idle");
  }
}

initialize();
