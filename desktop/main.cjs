const { app, BrowserWindow, session, shell } = require("electron");
const path = require("node:path");

app.setName("asmr3d空间渲染器");
app.setAppUserModelId("com.asmr3d.renderer");

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 390,
    minHeight: 700,
    show: false,
    backgroundColor: "#111416",
    title: "asmr3d空间渲染器 v0.1测试版",
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
  window.loadFile(path.join(__dirname, "web", "index.html"));
  window.once("ready-to-show", () => window.show());
}

app.whenReady().then(() => {
  session.defaultSession.on("will-download", (_event, item) => {
    const testDownloadDirectory = process.env.ASMR3D_TEST_DOWNLOAD_DIR;
    if (testDownloadDirectory) {
      item.setSavePath(path.join(testDownloadDirectory, item.getFilename()));
      return;
    }
    item.setSaveDialogOptions({
      title: "保存导出的 WAV",
      defaultPath: item.getFilename(),
      filters: [{ name: "WAV 音频", extensions: ["wav"] }],
    });
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
