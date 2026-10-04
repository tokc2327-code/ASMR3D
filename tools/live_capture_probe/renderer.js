const $ = (selector) => document.querySelector(selector);
const requestedLoopbackMode =
  new URLSearchParams(window.location.search).get("loopbackMode") ||
  "loopbackWithMute";

const ui = {
  state: $("#state"),
  start: $("#startButton"),
  testTone: $("#testToneButton"),
  stop: $("#stopButton"),
  feedback: $("#feedbackButton"),
  inputPeak: $("#inputPeak"),
  inputRms: $("#inputRms"),
  outputRms: $("#outputRms"),
  frames: $("#frames"),
  outputDevice: $("#outputDevice"),
  monitorGain: $("#monitorGain"),
  monitorGainValue: $("#monitorGainValue"),
  applyOutput: $("#applyOutput"),
  diagnostics: $("#diagnostics"),
  result: $("#resultStatus"),
};

const state = {
  stream: null,
  context: null,
  source: null,
  inputAnalyser: null,
  outputAnalyser: null,
  monitorGain: null,
  timer: null,
  frames: 0,
  maxInputPeak: 0,
  firstAudioAt: null,
  startedAt: null,
  feedbackRunning: false,
};

function db(value) {
  return value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY;
}

function formatDb(value) {
  const valueDb = db(value);
  return Number.isFinite(valueDb) ? `${valueDb.toFixed(1)} dBFS` : "-∞ dBFS";
}

function rms(analyser) {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  let peak = 0;
  for (const sample of samples) {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return {
    rms: Math.sqrt(sum / samples.length),
    peak,
    samples: samples.length,
  };
}

function setState(text, kind = "") {
  ui.state.textContent = text;
  ui.state.className = kind;
}

function setResult(text, kind = "pending") {
  ui.result.textContent = text;
  ui.result.className = kind;
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  ui.diagnostics.textContent += `\n[${timestamp}] ${message}`;
  ui.diagnostics.scrollTop = ui.diagnostics.scrollHeight;
}

async function loadOutputDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  ui.outputDevice.replaceChildren();

  if (outputs.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未检测到独立输出设备";
    ui.outputDevice.append(option);
    return;
  }

  for (const device of outputs) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent =
      device.label || `音频输出 ${ui.outputDevice.options.length + 1}`;
    ui.outputDevice.append(option);
  }
}

function updateMeters() {
  if (!state.inputAnalyser) return;
  const input = rms(state.inputAnalyser);
  const output = rms(state.outputAnalyser);
  state.maxInputPeak = Math.max(state.maxInputPeak, input.peak);

  if (input.peak > 0.001 && state.firstAudioAt == null) {
    state.frames += input.samples;
    state.firstAudioAt = performance.now();
    log(`首次检测到音频，延迟约 ${(state.firstAudioAt - state.startedAt).toFixed(0)} ms`);
  } else if (input.peak > 0.001) {
    state.frames += input.samples;
  }

  ui.inputPeak.textContent = formatDb(input.peak);
  ui.inputRms.textContent = formatDb(input.rms);
  ui.outputRms.textContent = formatDb(output.rms);
  ui.frames.textContent = String(state.frames);

  if (input.peak > 0.001) {
    setResult(
      `捕获链正在接收音频。输入峰值 ${formatDb(input.peak)}。`,
      "pass",
    );
  } else {
    setResult("当前没有检测到输入音频，请检查 Twitch 是否正在播放且未静音。", "warn");
  }
}

async function startCapture() {
  ui.diagnostics.textContent = "正在请求系统音频捕获……";
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor",
        suppressLocalAudioPlayback: true,
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
      systemAudio: "include",
    });
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("系统没有返回音频轨。");
    }

    const context = new AudioContext({ latencyHint: "interactive" });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const inputAnalyser = context.createAnalyser();
    const outputAnalyser = context.createAnalyser();
    const monitorGain = context.createGain();
    inputAnalyser.fftSize = 2048;
    outputAnalyser.fftSize = 2048;
    monitorGain.gain.value = Number(ui.monitorGain.value) / 100;

    source.connect(inputAnalyser);
    source.connect(monitorGain);
    monitorGain.connect(outputAnalyser);
    outputAnalyser.connect(context.destination);

    Object.assign(state, {
      stream,
      context,
      source,
      inputAnalyser,
      outputAnalyser,
      monitorGain,
      frames: 0,
      maxInputPeak: 0,
      firstAudioAt: null,
      startedAt: performance.now(),
    });

    const audioSettings = audioTracks[0].getSettings();
    const videoSettings = stream.getVideoTracks()[0]?.getSettings() || {};
    log(
      `Audio track: ${audioTracks[0].label || "system audio"}\n` +
        `Audio settings: ${JSON.stringify(audioSettings)}\n` +
        `Video suppressLocalAudioPlayback: ${String(
          videoSettings.suppressLocalAudioPlayback,
        )}\n` +
        `Requested Electron loopback mode: ${requestedLoopbackMode}`,
    );

    ui.start.disabled = true;
    ui.stop.disabled = false;
    ui.feedback.disabled = false;
    ui.applyOutput.disabled = false;
    setState("运行中", "running");
    setResult("等待输入音频……", "pending");
    state.timer = window.setInterval(updateMeters, 250);
  } catch (error) {
    setState("错误", "error");
    setResult(`启动失败：${error.message}`, "fail");
    log(error.stack || error.message);
  }
}

function stopCapture() {
  if (state.timer) window.clearInterval(state.timer);
  for (const track of state.stream?.getTracks() || []) track.stop();
  state.context?.close();
  state.stream = null;
  state.context = null;
  state.source = null;
  state.inputAnalyser = null;
  state.outputAnalyser = null;
  state.monitorGain = null;
  state.timer = null;
  ui.start.disabled = false;
  ui.stop.disabled = true;
  ui.feedback.disabled = true;
  ui.applyOutput.disabled = true;
  setState("已停止");
  setResult(
    state.maxInputPeak > 0.001
      ? `捕获成功。最大输入峰值 ${formatDb(state.maxInputPeak)}。`
      : "未检测到音频数据。",
    state.maxInputPeak > 0.001 ? "pass" : "fail",
  );
}

async function runFeedbackCheck() {
  if (!state.monitorGain || state.feedbackRunning) return;
  state.feedbackRunning = true;
  ui.feedback.disabled = true;
  setResult("正在运行反馈检测……", "pending");

  const originalGain = state.monitorGain.gain.value;
  state.monitorGain.gain.value = 0;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const baseline = rms(state.inputAnalyser).rms;

  state.monitorGain.gain.value = 0.2;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const monitored = rms(state.inputAnalyser).rms;
  state.monitorGain.gain.value = originalGain;

  const deltaDb = db(monitored) - db(baseline);
  const likelyFeedback =
    monitored > 0.001 && Number.isFinite(deltaDb) && deltaDb > 6;
  log(
    `反馈检测：baseline=${formatDb(baseline)}, monitor=${formatDb(
      monitored,
    )}, delta=${Number.isFinite(deltaDb) ? deltaDb.toFixed(1) : "∞"} dB`,
  );
  setResult(
    likelyFeedback
      ? "检测到疑似反馈。请为处理后的输出选择与捕获端点不同的耳机设备。"
      : "未检测到明显的自反馈。仍建议使用独立输出设备监听。",
    likelyFeedback ? "fail" : "pass",
  );

  state.feedbackRunning = false;
  ui.feedback.disabled = false;
}

async function applyOutputDevice() {
  if (!state.context) return;
  const deviceId = ui.outputDevice.value;
  try {
    if (typeof state.context.setSinkId !== "function") {
      throw new Error("当前 Electron/Chromium 不支持 AudioContext.setSinkId。");
    }
    await state.context.setSinkId(deviceId);
    log(`处理结果输出设备设置为：${ui.outputDevice.selectedOptions[0]?.textContent}`);
    setResult("监听输出设备已切换。", "pass");
  } catch (error) {
    setResult(`切换输出设备失败：${error.message}`, "fail");
    log(error.stack || error.message);
  }
}

ui.start.addEventListener("click", startCapture);
ui.testTone.addEventListener("click", async () => {
  const context = new AudioContext({ latencyHint: "interactive" });
  await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 440;
  gain.gain.value = 0.05;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  log("已开始播放 440 Hz 测试音，持续 8 秒。");
  window.setTimeout(async () => {
    oscillator.stop();
    await context.close();
    log("测试音已停止。");
  }, 8000);
});
ui.stop.addEventListener("click", stopCapture);
ui.feedback.addEventListener("click", runFeedbackCheck);
ui.applyOutput.addEventListener("click", applyOutputDevice);
ui.monitorGain.addEventListener("input", () => {
  ui.monitorGainValue.value = `${ui.monitorGain.value}%`;
  if (state.monitorGain) {
    state.monitorGain.gain.value = Number(ui.monitorGain.value) / 100;
  }
});

loadOutputDevices().catch((error) => log(error.message));
