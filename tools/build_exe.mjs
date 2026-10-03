import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
process.env.ELECTRON_MIRROR ||= "https://npmmirror.com/mirrors/electron/";
const DIST = path.join(ROOT, "dist");
const MOBILE_BUILD = path.join(DIST, "asmr3d-v0.1-mobile");
const STAGING = path.join(DIST, "electron-app");
const PACKAGED_APP = path.join(DIST, "asmr3d-win32-x64");
const FINAL_APP = path.join(DIST, "asmr3d-v0.1-win-x64");
const ZIP_PATH = path.join(DIST, "asmr3d-v0.1-win-x64.zip");
const ICON_PATH = path.join(ROOT, "renderer", "icon.ico");

execFileSync(process.execPath, [path.join(ROOT, "tools", "build_mobile.mjs")], {
  stdio: "inherit",
});

for (const target of [STAGING, PACKAGED_APP, FINAL_APP]) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(DIST)) {
    throw new Error(`Refusing to clean outside dist: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

const iconBuffer = await pngToIco([
  path.join(ROOT, "renderer", "icon-192.png"),
  path.join(ROOT, "renderer", "icon-512.png"),
]);
fs.writeFileSync(ICON_PATH, iconBuffer);

fs.mkdirSync(STAGING, { recursive: true });
fs.copyFileSync(path.join(ROOT, "desktop", "main.cjs"), path.join(STAGING, "main.cjs"));
fs.copyFileSync(
  path.join(ROOT, "desktop", "preload.cjs"),
  path.join(STAGING, "preload.cjs"),
);
fs.copyFileSync(ICON_PATH, path.join(STAGING, "icon.ico"));
fs.cpSync(MOBILE_BUILD, path.join(STAGING, "web"), { recursive: true });

fs.writeFileSync(
  path.join(STAGING, "package.json"),
  `${JSON.stringify(
    {
      name: "asmr3d-spatial-renderer",
      productName: "asmr3d空间渲染器",
      version: "0.1.0",
      description: "asmr3d空间渲染器 v0.1 测试版",
      main: "main.cjs",
      author: "asmr3d",
      license: "UNLICENSED",
    },
    null,
    2,
  )}\n`,
);

const paths = await packager({
  dir: STAGING,
  out: DIST,
  name: "asmr3d",
  executableName: "asmr3d空间渲染器",
  appVersion: "0.1.0",
  platform: "win32",
  arch: "x64",
  icon: ICON_PATH,
  asar: true,
  overwrite: true,
  prune: true,
});

if (!paths[0] || !fs.existsSync(paths[0])) {
  throw new Error("Electron Packager did not produce an application directory");
}
fs.renameSync(paths[0], FINAL_APP);
fs.rmSync(STAGING, { recursive: true, force: true });

if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH, { force: true });
execFileSync("tar.exe", ["-a", "-c", "-f", ZIP_PATH, "-C", FINAL_APP, "."], {
  stdio: "inherit",
});

const exe = path.join(FINAL_APP, "asmr3d空间渲染器.exe");
if (!fs.existsSync(exe)) {
  throw new Error(`Missing executable: ${exe}`);
}

console.log(`Windows app: ${FINAL_APP}`);
console.log(`Portable archive: ${ZIP_PATH}`);
