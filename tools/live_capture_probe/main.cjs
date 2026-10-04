const {
  app,
  BrowserWindow,
  desktopCapturer,
  session,
} = require("electron");
const path = require("node:path");

app.setName("asmr3d Live Capture Probe");

async function configureCapture(ses) {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(
      permission === "display-capture" ||
        permission === "media" ||
        permission === "audioCapture",
    );
  });

  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find((candidate) => candidate.display_id) || sources[0];
      if (!source) {
        callback(null);
        return;
      }
      callback({
        video: source,
        audio: process.env.ASMR3D_LOOPBACK_MODE || "loopbackWithMute",
      });
    },
    { useSystemPicker: false },
  );
}

function createWindow() {
  const loopbackMode = process.env.ASMR3D_LOOPBACK_MODE || "loopbackWithMute";
  const window = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 780,
    minHeight: 620,
    backgroundColor: "#111416",
    title: "asmr3d Live Capture Probe",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.loadFile(path.join(__dirname, "index.html"), {
    query: { loopbackMode },
  });
}

app.whenReady().then(async () => {
  await configureCapture(session.defaultSession);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
