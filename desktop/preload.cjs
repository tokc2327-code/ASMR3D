const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("asmr3dDesktop", {
  platform: process.platform,
  version: "0.1.0",
});
