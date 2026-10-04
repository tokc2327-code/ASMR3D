// Copies a trimmed, self-contained PowerShell 7 next to the packaged app so
// the Windows build never needs a separate PowerShell installation.
//
//   node tools/bundle_powershell.mjs [targetDir]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The capture helper is a console-only workload, so the WPF/WinForms UI stacks
// and their native helpers can go. Everything else (including `ref\`, which
// Add-Type needs as reference assemblies, and the Roslyn compiler) is required.
export const PWSH_TRIM_FILES = [
  "PresentationFramework.dll",
  "PresentationCore.dll",
  "System.Windows.Forms.dll",
  "System.Windows.Forms.Design.dll",
  "System.Windows.Forms.Primitives.dll",
  "System.Windows.Forms.Design.Editors.dll",
  "WindowsBase.dll",
  "UIAutomationClient.dll",
  "UIAutomationClientsideProviders.dll",
  "UIAutomationProvider.dll",
  "UIAutomationTypes.dll",
  "D3DCompiler_47_cor3.dll",
];

export function findPwsh() {
  const direct = [
    process.env.ASMR3D_POWERSHELL,
    path.join(process.env.LOCALAPPDATA || "", "Programs", "PowerShell", "7", "pwsh.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7-preview", "pwsh.exe"),
  ].filter(Boolean);
  for (const candidate of direct) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const found = execFileSync("where.exe", ["pwsh.exe"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
    if (found && fs.existsSync(found)) return found;
  } catch {
    // Not on PATH.
  }
  return null;
}

export function bundlePowerShell(targetDir) {
  const source = findPwsh();
  if (!source) {
    console.warn("未找到 pwsh.exe，跳过内置 PowerShell（直播截获将依赖系统安装）。");
    return null;
  }
  const sourceDir = path.dirname(source);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  let skipped = 0;
  const walk = (relative) => {
    const from = path.join(sourceDir, relative);
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const nextRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (!relative && entry.isFile() && PWSH_TRIM_FILES.includes(entry.name)) {
        skipped += 1;
        continue;
      }
      const to = path.join(targetDir, nextRelative);
      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(nextRelative);
      } else {
        fs.copyFileSync(path.join(sourceDir, nextRelative), to);
        copied += 1;
      }
    }
  };
  walk("");

  const sizeMb = (dir) => {
    let total = 0;
    const walkSize = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walkSize(full);
        else total += fs.statSync(full).size;
      }
    };
    walkSize(dir);
    return Math.round((total / (1024 * 1024)) * 10) / 10;
  };

  console.log(
    `内置 PowerShell: ${source} → ${targetDir}\n` +
      `  版本 ${execFileSync(source, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim()} · 复制 ${copied} 个文件 · 精简 ${skipped} 个 WPF/WinForms 文件 · ${sizeMb(targetDir)} MB`,
  );
  return targetDir;
}

if (process.argv[1] && process.argv[1].endsWith("bundle_powershell.mjs")) {
  bundlePowerShell(process.argv[2] || path.join(ROOT, "dist", "pwsh-bundle"));
}
