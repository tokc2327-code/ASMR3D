const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("asmr3dDesktop", {
  platform: process.platform,
  version: "0.2.0",
  versions: {
    electron: process.versions.electron || "",
    chromium: process.versions.chrome || "",
    node: process.versions.node || "",
    v8: process.versions.v8 || "",
  },

  // Live capture (Windows process / system loopback)
  listLiveTargets: () => ipcRenderer.invoke("asmr3d:list-live-targets"),
  startLiveCapture: (options) =>
    ipcRenderer.invoke("asmr3d:start-live-capture", options),
  stopLiveCapture: () => ipcRenderer.invoke("asmr3d:stop-live-capture"),
  attenuateSource: (options) =>
    ipcRenderer.invoke("asmr3d:attenuate-source", options),
  restoreSourceVolume: () =>
    ipcRenderer.invoke("asmr3d:restore-source-volume"),
  onLiveAudioChunk: (handler) =>
    subscribe("asmr3d:live-audio-chunk", handler),
  onLiveCaptureEnded: (handler) =>
    subscribe("asmr3d:live-capture-ended", handler),

  // Optional long recording
  defaultRecordingDirectory: () =>
    ipcRenderer.invoke("asmr3d:default-recording-directory"),
  openOutputFolder: (target) =>
    ipcRenderer.invoke("asmr3d:open-output-folder", target),
  lastExportPath: () => ipcRenderer.invoke("asmr3d:last-export-path"),
  systemMemory: () => ipcRenderer.invoke("asmr3d:system-memory"),
  chooseRecordingDirectory: () =>
    ipcRenderer.invoke("asmr3d:choose-recording-directory"),
  startRecording: (options) =>
    ipcRenderer.invoke("asmr3d:start-recording", options),
  sendRecordChunk: (buffer) => ipcRenderer.send("asmr3d:record-chunk", buffer),
  stopRecording: () => ipcRenderer.invoke("asmr3d:stop-recording"),
  recordingStats: () => ipcRenderer.invoke("asmr3d:recording-stats"),
  revealFile: (filePath) => ipcRenderer.invoke("asmr3d:reveal-file", filePath),
});
