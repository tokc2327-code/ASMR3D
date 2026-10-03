const $ = (selector) => document.querySelector(selector);

const elements = {
  sampleSelect: $("#sampleSelect"),
  fileInput: $("#fileInput"),
  playButton: $("#playButton"),
  pauseButton: $("#pauseButton"),
  stopButton: $("#stopButton"),
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
  skipBackButton: $("#skipBackButton"),
  skipForwardButton: $("#skipForwardButton"),
  exportScopeSelect: $("#exportScopeSelect"),
  exportStartSelect: $("#exportStartSelect"),
  exportDurationSelect: $("#exportDurationSelect"),
  exportBitDepth: $("#exportBitDepth"),
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
};

const state = {
  audio: null,
  audioContext: null,
  mediaSource: null,
  monoInput: null,
  master: null,
  limiter: null,
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
  objectUrl: null,
};

const constants = {
  refDistance: 0.2,
  maxDistance: 10,
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
    elements.progressRange.max = String(duration);
    if (!state.isSeeking) {
      elements.progressRange.value = String(Math.min(current, duration));
    }
    elements.progressPercent.textContent = `${Math.round(
      (current / duration) * 100,
    )}%`;
  } else {
    elements.progressRange.max = "1";
    elements.progressRange.value = "0";
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
    elements.exportBitDepth,
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
  }
}

function updateExportScopeControls() {
  const fullExport = elements.exportScopeSelect.value === "full";
  if (!state.exportCapture) {
    elements.exportStartSelect.disabled = fullExport;
    elements.exportDurationSelect.disabled = fullExport;
  }
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

function encodeWav(left, right, sampleRate, bitDepth) {
  const frameCount = Math.min(left.length, right.length);
  const bytesPerSample = bitDepth / 8;
  const dataSize = frameCount * 2 * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
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

  for (let frame = 0; frame < frameCount; frame += 1) {
    const channels = [left[frame], right[frame]];
    for (const rawSample of channels) {
      const sample = clamp(rawSample, -1, 1);
      if (bitDepth === 16) {
        const value = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
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

  return new Blob([buffer], { type: "audio/wav" });
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

async function downloadExport(blob, parameters) {
  const fileName = getExportFileName(parameters);
  if (await saveExportNative(blob, fileName)) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  setExportControlsDisabled(false);

  if (cancelled) {
    elements.exportProgress.value = 0;
    elements.exportStatus.textContent = "导出已取消。";
    return;
  }

  const left = concatenateChannels(capture.left, capture.frames);
  const right = concatenateChannels(capture.right, capture.frames);
  const wav = encodeWav(left, right, capture.sampleRate, capture.bitDepth);
  await downloadExport(wav, capture.parameters);
  elements.exportProgress.value = 1;
  elements.exportStatus.textContent = `导出完成：${(
    capture.duration
  ).toFixed(1)} 秒，${capture.bitDepth}-bit WAV。`;
}

async function startSegmentExport() {
  if (state.exportCapture?.active) return;
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
  const requestedDuration = Number(elements.exportDurationSelect.value);
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
    state.exportCapture = null;
    setExportControlsDisabled(false);
    throw error;
  }
}

function buildOfflineGraph(offlineContext, audioBuffer, parameters) {
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

    const position = cartesianPosition(parameters);
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    source.connect(monoInput);
    monoInput.connect(panner);
    panner.connect(master);
  } else if (state.mode === "parametric") {
    const monoInput = offlineContext.createGain();
    monoInput.channelCount = 1;
    monoInput.channelCountMode = "explicit";
    monoInput.channelInterpretation = "speakers";
    source.connect(monoInput);
    const path = createParametricPath(offlineContext, monoInput);
    applyParametricSettings(path, offlineContext, parameters, true);
    path.output.connect(master);
  } else if (state.mode === "binaural") {
    const stereoInput = offlineContext.createGain();
    source.connect(stereoInput);
    const path = createCompatibilityPath(offlineContext, stereoInput);
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
  setExportControlsDisabled(true);
  elements.cancelExportButton.disabled = true;
  elements.exportProgress.removeAttribute("value");
  elements.exportStatus.textContent = "正在读取完整源文件……";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const response = await fetch(state.activeSource.mediaUrl);
  if (!response.ok) {
    throw new Error(`源文件读取失败：${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  elements.exportStatus.textContent = "正在解码完整音频……";
  const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
  const durationSeconds = audioBuffer.duration;
  const offlineContext = new OfflineAudioContext(
    2,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  buildOfflineGraph(offlineContext, audioBuffer, parameters);
  scheduleOfflineProgress(offlineContext, durationSeconds);
  elements.exportStatus.textContent = `离线渲染 0.0 / ${durationSeconds.toFixed(
    1,
  )} 秒`;
  const rendered = await offlineContext.startRendering();
  elements.exportStatus.textContent = "正在编码完整 WAV……";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const left = rendered.getChannelData(0);
  const right =
    rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : rendered.getChannelData(0);
  const wav = encodeWav(
    left,
    right,
    rendered.sampleRate,
    Number(elements.exportBitDepth.value),
  );
  await downloadExport(wav, parameters);
  setExportControlsDisabled(false);
  elements.exportProgress.value = 1;
  elements.exportStatus.textContent = `完整导出完成：${durationSeconds.toFixed(
    1,
  )} 秒，${elements.exportBitDepth.value}-bit WAV。`;
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

function cartesianPosition({ azimuth, elevation, distance }) {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  const horizontal = distance * Math.cos(el);
  return {
    x: horizontal * Math.sin(az),
    y: distance * Math.sin(el),
    z: -horizontal * Math.cos(az),
  };
}

function setAudioParam(param, value) {
  param.setTargetAtTime(value, state.audioContext.currentTime, 0.025);
}

function createImpulseResponse(audioContext, duration = 1.15, decay = 2.8) {
  const length = Math.floor(audioContext.sampleRate * duration);
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = (1 - index / length) ** decay;
      data[index] = (Math.random() * 2 - 1) * envelope * 0.45;
    }
  }
  return impulse;
}

function createParametricPath(audioContext, monoInput) {
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

  convolver.buffer = createImpulseResponse(audioContext);
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

function createCompatibilityPath(audioContext, stereoInput) {
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

  convolver.buffer = createImpulseResponse(audioContext);
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

  const hrtfPath = audioContext.createGain();
  const hrtfOutput = audioContext.createGain();
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
  const limiter = audioContext.createDynamicsCompressor();
  const captureTap = audioContext.createScriptProcessor(4096, 2, 2);
  captureTap.onaudioprocess = processExportCapture;
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  mediaSource.connect(monoInput);
  monoInput.connect(hrtfPath);
  hrtfPath.connect(panner);
  panner.connect(hrtfOutput);
  hrtfOutput.connect(master);

  monoInput.connect(parametricPath);
  parametric.output.connect(parametricOutput);
  parametricOutput.connect(master);

  mediaSource.connect(compatibilityPath);
  compatibility.output.connect(compatibilityOutput);
  compatibilityOutput.connect(master);

  mediaSource.connect(bypassPath);
  bypassPath.connect(bypassOutput);
  bypassOutput.connect(master);

  master.connect(limiter);
  limiter.connect(captureTap);
  captureTap.connect(audioContext.destination);

  Object.assign(state, {
    audio,
    audioContext,
    mediaSource,
    monoInput,
    master,
    limiter,
    hrtfPath,
    parametricPath,
    compatibilityPath,
    bypassPath,
    panner,
    parametric,
    compatibility,
    ready: true,
  });

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
  const elevation = parameters.elevation / 30;
  const distanceGain = constants.refDistance / distance;
  const airCutoff = 20000 * Math.exp(-0.1 * (distance - constants.refDistance));
  const nearGain = 5 * Math.max(0, 1 - distance / 1);
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
    0.04 + 0.26 * ((Math.log(distance / 0.2) / Math.log(50)) || 0),
    0.04,
    immediate,
    audioContext,
  );
}

function applyCompatibilitySettings(path, audioContext, parameters, immediate = false) {
  const pannerValue = Math.sin((parameters.azimuth * Math.PI) / 180);
  const elevation = parameters.elevation / 30;
  const distanceGainValue = constants.refDistance / parameters.distance;
  const airCutoff = 20000 * Math.exp(-0.1 * (parameters.distance - constants.refDistance));
  const nearGain = 5 * Math.max(0, 1 - parameters.distance);
  const wet =
    0.04 + 0.26 * ((Math.log(parameters.distance / 0.2) / Math.log(50)) || 0);

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
  const airCutoff = 20000 * Math.exp(-0.1 * (parameters.distance - 0.2));
  const nearGain = 5 * Math.max(0, 1 - parameters.distance);

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
  setStatus("正在播放空间化对象。", "running");
  const latency =
    (state.audioContext.baseLatency || 0) + (state.audioContext.outputLatency || 0);
  elements.audioStatus.textContent = `AudioContext：${state.audioContext.state} · ${
    state.audioContext.sampleRate
  } Hz${latency > 0 ? ` · ${(latency * 1000).toFixed(1)} ms` : ""}`;
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
    setStatus("已暂停。", "idle");
  });

  elements.stopButton.addEventListener("click", () => {
    if (!state.audio) return;
    state.audio.pause();
    state.audio.currentTime = 0;
    updateProgressUI({ enabled: true });
    setStatus("已停止。", "idle");
  });

  elements.progressRange.addEventListener("pointerdown", () => {
    state.isSeeking = true;
  });

  elements.progressRange.addEventListener("input", () => {
    if (!state.audio || !Number.isFinite(state.audio.duration)) return;
    state.isSeeking = true;
    state.audio.currentTime = Number(elements.progressRange.value);
    updateProgressUI({ enabled: true });
  });

  const commitSeek = () => {
    if (!state.audio || !Number.isFinite(state.audio.duration)) return;
    state.audio.currentTime = Number(elements.progressRange.value);
    state.isSeeking = false;
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
    elements.azimuth.value = "0";
    elements.elevation.value = "0";
    elements.distance.value = String(distanceToSlider(0.4));
    elements.volume.value = "80";
    updateAudioGraph();
  });

  elements.modeControl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    for (const candidate of elements.modeControl.querySelectorAll("button")) {
      candidate.classList.toggle("active", candidate === button);
    }
    if (state.ready) updateModeCrossfade();
  });

}

async function initialize() {
  bindControls();
  markMethods();
  updateExportScopeControls();
  elements.distance.value = String(distanceToSlider(0.4));
  const parameters = currentParameters();
  updateReadouts(parameters);
  updateProgressUI();
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
