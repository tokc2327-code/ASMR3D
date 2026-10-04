"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Windows system processes that expose an audio session but are never a
// meaningful capture target for the user.
const SYSTEM_PROCESS_DENYLIST = new Set([
  "audiodg",
  "svchost",
  "nvcontainer",
  "system",
  "idle",
  "registry",
  "csrss",
  "dwm",
  "winlogon",
  "services",
  "lsass",
  "fontdrvhost",
  "sihost",
  "taskhostw",
  "runtimebroker",
  "conhost",
  "securityhealthservice",
  "startmenuexperiencehost",
  "textinputhost",
  "shellexperiencehost",
  "wmiprvse",
  "dllhost",
  "searchindexer",
  "searchapp",
  "applicationframehost",
  "backgroundtaskhost",
  "memorycompression",
  "msmpeng",
]);

const CAPTURE_FORMAT = {
  channels: 2,
  sampleRate: 48000,
  bytesPerSample: 4,
  bytesPerFrame: 8,
  encoding: "f32le",
};

let cachedPowerShell = null;

function resolveProbeScript() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "probe_process_audio.ps1"));
  }
  candidates.push(path.join(__dirname, "probe_process_audio.ps1"));
  candidates.push(
    path.join(__dirname, "..", "tools", "probe_process_audio.ps1"),
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("找不到 probe_process_audio.ps1，无法启动直播捕获。");
}

function findOnPath(executable) {
  if (process.platform !== "win32") return null;
  try {
    const result = spawnSync("where.exe", [executable], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (result.status !== 0) return null;
    const first = String(result.stdout || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)[0];
    return first || null;
  } catch {
    return null;
  }
}

// Per-application capture uses Windows process loopback and needs PowerShell 7:
// Windows PowerShell 5.1 runs on .NET Framework, where
// ActivateAudioInterfaceAsync rejects the process-loopback activation.
// Bundled with the packaged app (see tools/bundle_powershell.mjs) so live
// capture works without a separate PowerShell installation. It wins over
// whatever happens to be on PATH, so the tested version is the one used.
function bundledPwshPath() {
  if (!process.resourcesPath) return null;
  const candidate = path.join(process.resourcesPath, "pwsh", "pwsh.exe");
  return fs.existsSync(candidate) ? candidate : null;
}

const PWSH_CANDIDATES = [
  () => path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
  () => path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7-preview", "pwsh.exe"),
  () => path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "PowerShell", "7", "pwsh.exe"),
  () => path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "pwsh.exe"),
  () => path.join(process.env.LOCALAPPDATA || "", "Programs", "PowerShell", "7", "pwsh.exe"),
];

function resolvePowerShell() {
  if (cachedPowerShell) return cachedPowerShell;
  const override = process.env.ASMR3D_POWERSHELL;
  if (override) {
    cachedPowerShell = { path: override, kind: "custom" };
    return cachedPowerShell;
  }
  const bundled = bundledPwshPath();
  if (bundled) {
    cachedPowerShell = { path: bundled, kind: "bundled" };
    return cachedPowerShell;
  }
  const pwsh = findOnPath("pwsh.exe");
  if (pwsh) {
    cachedPowerShell = { path: pwsh, kind: "pwsh" };
    return cachedPowerShell;
  }
  for (const candidate of PWSH_CANDIDATES) {
    const resolved = candidate();
    if (resolved && fs.existsSync(resolved)) {
      cachedPowerShell = { path: resolved, kind: "pwsh" };
      return cachedPowerShell;
    }
  }
  cachedPowerShell = { path: "powershell.exe", kind: "windows-powershell" };
  return cachedPowerShell;
}

function baseArgs(scriptPath) {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ];
}

function listLiveAudioTargets({ timeoutMs = 20000, excludeProcessIds = [] } = {}) {
  return new Promise((resolve, reject) => {
    const excluded = new Set(
      (excludeProcessIds || []).map((value) => Number(value)).filter(Boolean),
    );
    let scriptPath;
    try {
      scriptPath = resolveProbeScript();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(
      resolvePowerShell().path,
      [...baseArgs(scriptPath), "-ListJson"],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      reject(new Error("枚举音频会话超时。"));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `音频会话枚举失败（退出码 ${code}）。`),
        );
        return;
      }
      const line = stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .pop();
      if (!line) {
        reject(new Error("音频会话枚举没有返回数据。"));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        reject(new Error("无法解析音频会话列表。"));
        return;
      }
      const targets = (parsed.targets || [])
        .filter((target) => {
          const name = String(target.processName || "").toLowerCase();
          // Never offer asmr3d itself: capturing our own output would create a
          // feedback loop.
          if (!name || name.includes("asmr3d")) return false;
          if (excluded.has(Number(target.processId))) return false;
          return !SYSTEM_PROCESS_DENYLIST.has(name);
        })
        .sort((left, right) => (right.peak || 0) - (left.peak || 0));
      resolve({
        processLoopback: Boolean(parsed.processLoopback),
        runtime: String(parsed.runtime || ""),
        targets,
      });
    });
  });
}

/**
 * Starts a native Windows process-loopback capture that streams raw
 * interleaved float32 little-endian PCM to stdout.
 */
// Session volume scales the process-loopback capture proportionally, so the
// renderer can lower the original to inaudible and compensate digitally.
function setProcessSessionVolume(processId, volume, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let scriptPath;
    try {
      scriptPath = resolveProbeScript();
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn(
      resolvePowerShell().path,
      [
        ...baseArgs(scriptPath),
        "-ProcessId",
        String(processId),
        "-SetVolume",
        String(volume),
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      reject(new Error("设置会话音量超时。"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `设置会话音量失败（${code}）。`));
        return;
      }
      const line = stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .pop();
      try {
        const parsed = JSON.parse(line);
        resolve(Number(parsed.previous));
      } catch {
        reject(new Error("无法解析会话音量结果。"));
      }
    });
  });
}

function startLiveCapture(options) {
  const {
    processId,
    silenceTimeoutSeconds = 0,
    restoreVolumeOnExit = null,
    parentProcessId = 0,
    chunkFrames = 1024,
    onHeader,
    onAudio,
    onError,
    onEnd,
  } = options;

  if (!processId) throw new Error("缺少目标进程 ID。");
  const scriptPath = resolveProbeScript();
  const args = [...baseArgs(scriptPath), "-ProcessId", String(processId)];
  args.push("-StreamToStdout");
  if (silenceTimeoutSeconds > 0) {
    args.push("-SilenceTimeoutSeconds", String(silenceTimeoutSeconds));
  }
  if (restoreVolumeOnExit !== null) {
    args.push("-RestoreVolumeOnExit", String(restoreVolumeOnExit));
  }
  if (parentProcessId) {
    args.push("-ParentProcessId", String(parentProcessId));
  }

  const child = spawn(resolvePowerShell().path, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (process.env.ASMR3D_CAPTURE_LOG) {
    try {
      fs.appendFileSync(
        process.env.ASMR3D_CAPTURE_LOG,
        `${new Date().toISOString()} spawn ${resolvePowerShell().path} ${args.join(" ")}\n`,
      );
    } catch {
      // Diagnostics only.
    }
  }

  const chunkBytes = chunkFrames * CAPTURE_FORMAT.bytesPerFrame;
  let pending = Buffer.alloc(0);
  let header = null;
  let stoppedByUser = false;
  let settled = false;
  let stderrTail = "";

  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (onEnd) onEnd(payload);
  };

  child.stdout.on("data", (data) => {
    pending = pending.length ? Buffer.concat([pending, data]) : data;

    if (!header) {
      const newline = pending.indexOf(0x0a);
      if (newline === -1) {
        if (pending.length > 262144) {
          if (onError) onError(new Error("捕获头信息异常。"));
          stop();
        }
        return;
      }
      const line = pending.subarray(0, newline).toString("utf8").trim();
      pending = pending.subarray(newline + 1);
      try {
        header = JSON.parse(line);
      } catch {
        if (onError) onError(new Error("无法解析捕获头信息。"));
        stop();
        return;
      }
      if (header.type !== "header") {
        if (onError) onError(new Error("捕获头信息类型不正确。"));
        stop();
        return;
      }
      if (onHeader) onHeader(header);
    }

    while (pending.length >= chunkBytes) {
      const view = pending.subarray(0, chunkBytes);
      pending = pending.subarray(chunkBytes);
      if (onAudio) onAudio(Buffer.from(view));
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-4096);
  });

  child.on("error", (error) => {
    if (onError) onError(error);
    finish({ reason: "error", message: error.message });
  });

  child.on("close", (code, signal) => {
    if (pending.length >= CAPTURE_FORMAT.bytesPerFrame && onAudio) {
      const usable = pending.length - (pending.length % CAPTURE_FORMAT.bytesPerFrame);
      if (usable > 0) onAudio(Buffer.from(pending.subarray(0, usable)));
      pending = Buffer.alloc(0);
    }

    let reason = "ended";
    if (stoppedByUser) reason = "stopped";
    else if (/capture-reason:\s*process-exited/.test(stderrTail)) {
      reason = "process-exited";
    } else if (/capture-reason:\s*silence/.test(stderrTail)) {
      reason = "silence";
    } else if (code !== 0) reason = "error";

    finish({
      reason,
      code,
      signal,
      stderr: stderrTail.trim(),
      message:
        reason === "error"
          ? stderrTail.trim() || `捕获进程退出（code ${code}）。`
          : undefined,
    });
  });

  function stop() {
    stoppedByUser = true;
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
    }
  }

  return {
    get processId() {
      return processId;
    },
    get active() {
      return child.exitCode === null && child.signalCode === null;
    },
    get header() {
      return header;
    },
    stop,
  };
}

module.exports = {
  CAPTURE_FORMAT,
  listLiveAudioTargets,
  setProcessSessionVolume,
  startLiveCapture,
  resolveProbeScript,
  resolvePowerShell,
};
