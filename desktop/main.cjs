const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const {
  listLiveAudioTargets,
  setProcessSessionVolume,
  startLiveCapture,
} = require("./live-capture.cjs");
const {
  SegmentedRecorder,
  ensureWritableDirectory,
} = require("./segment-recorder.cjs");

app.setName("asmr3d空间渲染器");
app.setAppUserModelId("com.asmr3d.renderer");

const LIVE_CAPTURE = {
  session: null,
  window: null,
};

const RECORDING = {
  recorder: null,
  directory: null,
  startedAt: null,
  lastError: null,
};

// Remembers the original session volume so the source app can be made
// inaudible during capture and restored afterwards.
const SOURCE_VOLUME = {
  processId: 0,
  previous: null,
  processName: "",
};

function sourceVolumeStatePath() {
  return path.join(app.getPath("userData"), "source-volume-state.json");
}

function persistSourceVolumeState() {
  try {
    if (!SOURCE_VOLUME.processId || SOURCE_VOLUME.previous === null) {
      fs.rmSync(sourceVolumeStatePath(), { force: true });
      return;
    }
    fs.writeFileSync(
      sourceVolumeStatePath(),
      JSON.stringify({
        processId: SOURCE_VOLUME.processId,
        processName: SOURCE_VOLUME.processName,
        previous: SOURCE_VOLUME.previous,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Diagnostics only.
  }
}

async function restoreSourceVolume() {
  if (SOURCE_VOLUME.processId && SOURCE_VOLUME.previous !== null) {
    const { processId, previous } = SOURCE_VOLUME;
    SOURCE_VOLUME.processId = 0;
    SOURCE_VOLUME.previous = null;
    SOURCE_VOLUME.processName = "";
    try {
      fs.rmSync(sourceVolumeStatePath(), { force: true });
    } catch {
      // Ignore.
    }
    try {
      await setProcessSessionVolume(processId, previous);
    } catch {
      // The app may have closed; nothing else to restore.
    }
  }
}

// If the app was killed while the source volume was lowered, fix it on the
// next launch. The stored process name guards against PID reuse.
async function recoverStaleSourceVolume() {
  try {
    const statePath = sourceVolumeStatePath();
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    fs.rmSync(statePath, { force: true });
    if (!state?.processId || !(state.previous > 0)) return;
    const { setProcessSessionVolume: setVolume } = require("./live-capture.cjs");
    await setVolume(Number(state.processId), Number(state.previous));
    console.log(
      `[asmr3d] 已恢复上次未正常结束的会话音量：${state.processName || state.processId}`,
    );
  } catch {
    // Best effort only.
  }
}

function defaultRecordingDirectory() {
  return resolveOutputDirectory();
}

const OUTPUT_FOLDER_NAME = "输出";
let cachedOutputDirectory = null;
const LAST_EXPORT = { path: "" };

// All finished audio (live recordings, exports) goes into one folder next to
// the executable. Development runs use the project's dist folder instead.
function outputDirectoryCandidates() {
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), OUTPUT_FOLDER_NAME));
  } else {
    candidates.push(path.join(__dirname, "..", "dist", OUTPUT_FOLDER_NAME));
  }
  const music = app.getPath("music");
  if (music) candidates.push(path.join(music, "asmr3d输出"));
  candidates.push(path.join(app.getPath("temp"), "asmr3d输出"));
  return candidates;
}

function resolveOutputDirectory() {
  if (cachedOutputDirectory) return cachedOutputDirectory;
  for (const candidate of outputDirectoryCandidates()) {
    try {
      ensureWritableDirectory(candidate);
      cachedOutputDirectory = candidate;
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("找不到可写的输出文件夹。");
}

function uniqueFilePath(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function registerIpc() {
  ipcMain.handle("asmr3d:list-live-targets", async () => {
    try {
      // Exclude every process of this app so it can never capture itself.
      const ownProcessIds = app
        .getAppMetrics()
        .map((metric) => metric.pid)
        .filter(Boolean);
      const result = await listLiveAudioTargets({
        excludeProcessIds: ownProcessIds,
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message, targets: [] };
    }
  });

  ipcMain.handle("asmr3d:start-live-capture", async (event, options = {}) => {
    if (LIVE_CAPTURE.session) {
      return { ok: false, error: "已有直播截获在运行。" };
    }
    const ownPids = app.getAppMetrics().map((metric) => metric.pid);
    if (ownPids.includes(Number(options.processId))) {
      return { ok: false, error: "不能截获 asmr3d 自身的输出。" };
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    return await new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const session = startLiveCapture({
          processId: Number(options.processId) || 0,
          silenceTimeoutSeconds: Number(options.silenceTimeoutSeconds) || 0,
          restoreVolumeOnExit:
            options.restoreVolumeOnExit === null ||
            options.restoreVolumeOnExit === undefined
              ? null
              : Number(options.restoreVolumeOnExit),
          parentProcessId: process.pid,
          chunkFrames: 1024,
          onHeader: (header) => {
            LIVE_CAPTURE.session = session;
            LIVE_CAPTURE.window = window;
            settle({ ok: true, header });
          },
          onAudio: (chunk) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send("asmr3d:live-audio-chunk", chunk);
            }
          },
          onError: (error) => {
            settle({ ok: false, error: error.message });
          },
          onEnd: (payload) => {
            LIVE_CAPTURE.session = null;
            LIVE_CAPTURE.window = null;
            settle({ ok: false, error: payload.message || "直播截获已结束。" });
            if (window && !window.isDestroyed()) {
              window.webContents.send("asmr3d:live-capture-ended", payload);
            }
          },
        });
        LIVE_CAPTURE.session = session;
        LIVE_CAPTURE.window = window;
        // Safety net: never leave the renderer waiting forever.
        setTimeout(() => settle({ ok: false, error: "启动直播截获超时。" }), 20000);
      } catch (error) {
        settle({ ok: false, error: error.message });
      }
    });
  });

  ipcMain.handle("asmr3d:stop-live-capture", () => {
    if (LIVE_CAPTURE.session) {
      LIVE_CAPTURE.session.stop();
      LIVE_CAPTURE.session = null;
    }
    restoreSourceVolume();
    return { ok: true };
  });

  ipcMain.handle("asmr3d:attenuate-source", async (_event, options = {}) => {
    const processId = Number(options.processId) || 0;
    const volume = Number(options.volume);
    if (!processId || !(volume >= 0 && volume <= 1)) {
      return { ok: false, error: "参数无效。" };
    }
    try {
      const previous = await setProcessSessionVolume(processId, volume);
      if (previous < 0) {
        return { ok: false, error: "找不到该应用的音频会话。" };
      }
      SOURCE_VOLUME.processId = processId;
      SOURCE_VOLUME.previous = previous;
      SOURCE_VOLUME.processName = String(options.processName || "");
      persistSourceVolumeState();
      return { ok: true, previous };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("asmr3d:restore-source-volume", async () => {
    await restoreSourceVolume();
    return { ok: true };
  });

  ipcMain.handle("asmr3d:default-recording-directory", () => {
    return resolveOutputDirectory();
  });

  ipcMain.handle("asmr3d:open-output-folder", async (_event, target) => {
    try {
      const directory = resolveOutputDirectory();
      if (target && fs.existsSync(target)) {
        shell.showItemInFolder(target);
        return { ok: true, directory };
      }
      const error = await shell.openPath(directory);
      return { ok: !error, directory, error: error || undefined };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("asmr3d:last-export-path", () => LAST_EXPORT.path);

  ipcMain.handle("asmr3d:system-memory", () => ({
    total: os.totalmem(),
    free: os.freemem(),
  }));

  ipcMain.handle("asmr3d:choose-recording-directory", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "选择录音保存文件夹",
      defaultPath: RECORDING.directory || defaultRecordingDirectory(),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const picked = result.filePaths[0];
    try {
      ensureWritableDirectory(picked);
    } catch (error) {
      return { ok: false, error: error.message, directory: picked };
    }
    RECORDING.directory = picked;
    return { ok: true, directory: picked };
  });

  ipcMain.handle("asmr3d:start-recording", (_event, options = {}) => {
    if (RECORDING.recorder) {
      return { ok: false, error: "录音已在进行中。" };
    }
    const directory = options.directory || defaultRecordingDirectory();
    try {
      ensureWritableDirectory(directory);
      const recorder = new SegmentedRecorder({
        directory,
        sampleRate: Number(options.sampleRate) || 48000,
        channels: Number(options.channels) || 2,
        bitDepth: Number(options.bitDepth) || 24,
        segmentSeconds: Number(options.segmentSeconds) || 600,
      });
      recorder.start();
      RECORDING.recorder = recorder;
      RECORDING.directory = directory;
      RECORDING.startedAt = Date.now();
      RECORDING.lastError = null;
      return {
        ok: true,
        directory,
        baseName: recorder.baseName,
        segmentSeconds: recorder.segmentSeconds,
        bitDepth: recorder.bitDepth,
      };
    } catch (error) {
      RECORDING.recorder = null;
      return { ok: false, error: error.message };
    }
  });

  ipcMain.on("asmr3d:record-chunk", (_event, buffer) => {
    const recorder = RECORDING.recorder;
    if (!recorder || !buffer) return;
    try {
      const view =
        buffer instanceof Float32Array
          ? buffer
          : new Float32Array(
              buffer.buffer || buffer,
              buffer.byteOffset || 0,
              Math.floor((buffer.byteLength ?? buffer.length) / 4),
            );
      recorder.push(view);
    } catch (error) {
      RECORDING.lastError = error.message;
    }
  });

  ipcMain.handle("asmr3d:stop-recording", async () => {
    const recorder = RECORDING.recorder;
    if (!recorder) return { ok: false, error: "当前没有进行中的录音。" };
    RECORDING.recorder = null;
    try {
      const result = await recorder.finalize();
      return {
        ok: true,
        ...result,
        error: RECORDING.lastError,
        seconds: RECORDING.startedAt
          ? (Date.now() - RECORDING.startedAt) / 1000
          : 0,
      };
    } catch (error) {
      return { ok: false, error: error.message };
    } finally {
      RECORDING.startedAt = null;
    }
  });

  ipcMain.handle("asmr3d:recording-stats", () => {
    const recorder = RECORDING.recorder;
    return {
      active: Boolean(recorder),
      frames: recorder ? recorder.totalFrames : 0,
      bytes: recorder ? recorder.bytesWritten : 0,
      segments: recorder ? recorder.segments.length + (recorder.fd !== null ? 1 : 0) : 0,
      error: RECORDING.lastError,
    };
  });

  ipcMain.handle("asmr3d:reveal-file", (_event, filePath) => {
    if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
    return { ok: true };
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 390,
    minHeight: 700,
    show: false,
    backgroundColor: "#111416",
    title: "asmr3d空间渲染器 v0.3公测版",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  const packagedWeb = path.join(__dirname, "web", "index.html");
  if (fs.existsSync(packagedWeb)) {
    window.loadFile(packagedWeb);
  } else {
    // Development: use the renderer dev server so absolute asset paths resolve.
    window.loadURL(process.env.ASMR3D_DEV_URL || "http://127.0.0.1:4173/");
  }
  window.once("ready-to-show", () => window.show());
}

app.whenReady().then(() => {
  registerIpc();
  recoverStaleSourceVolume();

  session.defaultSession.on("will-download", (_event, item) => {
    // Exports land in the shared output folder instead of asking every time.
    try {
      const override = process.env.ASMR3D_TEST_DOWNLOAD_DIR;
      const directory = override || resolveOutputDirectory();
      ensureWritableDirectory(directory);
      const target = uniqueFilePath(directory, item.getFilename());
      item.setSavePath(target);
      LAST_EXPORT.path = target;
    } catch {
      item.setSaveDialogOptions({
        title: "保存导出的 WAV",
        defaultPath: item.getFilename(),
        filters: [{ name: "WAV 音频", extensions: ["wav"] }],
      });
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (LIVE_CAPTURE.session) {
    LIVE_CAPTURE.session.stop();
    LIVE_CAPTURE.session = null;
  }
  await restoreSourceVolume();
  if (RECORDING.recorder) {
    RECORDING.recorder.abort();
    RECORDING.recorder = null;
  }
  if (process.platform !== "darwin") app.quit();
});

// Last-resort guard: never leave the captured app stuck at a lowered volume.
app.on("before-quit", () => {
  restoreSourceVolume();
});
