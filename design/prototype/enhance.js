/* ==========================================================================
 * enhance.js — UI 附加交互层（v2 原型新增，可整体删除，不影响 app.js 语义）
 *
 * 原则：只读 app.js 的 DOM 输出（文本、属性），只做三件事——
 *   1) 视觉同步（滑杆填充、徽章语义色、播放态）
 *   2) 可发现性（Toast、抽屉、快捷键、拖放导入、暂停/停止可用性）
 *   3) 精确输入（读数点击输入、双击复位、Shift+方向键 ×10）
 * 不写入任何 app.js 依赖的元素状态；不改变功能语义。
 * ========================================================================== */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const body = document.body;

  const el = {
    play: $("playButton"),
    pause: $("pauseButton"),
    stop: $("stopButton"),
    skipBack: $("skipBackButton"),
    skipForward: $("skipForwardButton"),
    azimuth: $("azimuth"),
    elevation: $("elevation"),
    distance: $("distance"),
    volume: $("volume"),
    azimuthOutput: $("azimuthOutput"),
    elevationOutput: $("elevationOutput"),
    distanceOutput: $("distanceOutput"),
    volumeOutput: $("volumeOutput"),
    statusText: $("statusText"),
    sourceBadge: $("sourceBadge"),
    templateBadge: $("templateBadge"),
    convertBadge: $("convertBadge"),
    recordBadge: $("recordBadge"),
    liveModeBadge: $("liveModeBadge"),
    exportStatus: $("exportStatus"),
    recordStatus: $("recordStatus"),
    fileInput: $("fileInput"),
    convertFileInput: $("convertFileInput"),
    outDirButton: $("outDirButton"),
    methodsToggle: $("methodsToggle"),
    methodDrawer: $("methodDrawer"),
    methodCloseBtn: $("methodCloseBtn"),
    toastRegion: $("toastRegion"),
  };

  const desktop = window.asmr3dDesktop || null;

  /* ---------- 1. 滑杆填充同步（含程序化赋值，如复位/模板导入/播放进度） ---------- */

  const ranges = ["azimuth", "elevation", "distance", "volume", "progressRange"]
    .map($)
    .filter(Boolean);

  function syncFills() {
    for (const range of ranges) {
      const min = Number(range.min) || 0;
      const max = Number(range.max) || 100;
      const value = Number(range.value) || 0;
      const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
      range.style.setProperty("--fill", `${pct}%`);
    }
  }

  window.setInterval(syncFills, 120);
  syncFills();

  /* ---------- 2. 播放态（body[data-transport]） ---------- */

  function setTransport(mode) {
    body.dataset.transport = mode;
  }

  if (el.play) el.play.addEventListener("click", () => setTransport("playing"));
  if (el.pause) el.pause.addEventListener("click", () => setTransport("paused"));
  if (el.stop) el.stop.addEventListener("click", () => setTransport("paused"));

  /* ---------- 3. Toast ---------- */

  const TOAST_ICONS = { error: "i-x-circle", ok: "i-check", info: "i-info" };
  let lastToast = { text: "", at: 0 };

  function toast(kind, text) {
    const now = Date.now();
    if (text === lastToast.text && now - lastToast.at < 1500) return;
    lastToast = { text, at: now };

    const region = el.toastRegion;
    if (!region) return;
    while (region.children.length >= 4) region.firstElementChild.remove();

    const node = document.createElement("div");
    node.className = `toast toast-${kind}`;
    node.innerHTML =
      `<svg class="icon" aria-hidden="true"><use href="#${TOAST_ICONS[kind] || "i-info"}"/></svg>` +
      `<span></span>` +
      `<button class="toast-close" type="button" aria-label="关闭提示">` +
      `<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>`;
    node.querySelector("span").textContent = text;
    const close = () => node.remove();
    node.querySelector(".toast-close").addEventListener("click", close);
    region.append(node);
    window.setTimeout(close, kind === "error" ? 8000 : 5000);
  }

  const RE_ERROR = /失败|错误|无法|请先|不可用|超出|超过|不足|损坏|不支持|仅支持|权限|拒绝|缺少|未连接|超长|PowerShell/;
  const RE_OK = /完成|已保存|已导出|已套用|已载入/;
  const RE_RUNNING = /正在|导出中|离线渲染|录制中|合并中|扫描|转换|启动|渲染/;

  function classify(text) {
    if (RE_ERROR.test(text)) return "error";
    if (RE_OK.test(text)) return "ok";
    return null;
  }

  function observeStatus(id, { state = false, toastIt = true } = {}) {
    const node = $(id);
    if (!node) return;
    const handle = () => {
      const text = node.textContent.trim();
      if (!text) return;
      if (state) {
        if (RE_ERROR.test(text)) node.dataset.state = "error";
        else if (RE_OK.test(text)) node.dataset.state = "done";
        else if (RE_RUNNING.test(text)) node.dataset.state = "running";
        else node.dataset.state = "idle";
      }
      if (!toastIt) return;
      const kind = classify(text);
      if (kind === "error") toast("error", text);
      else if (kind === "ok") toast("ok", text);
    };
    new MutationObserver(handle).observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // app.js 已为 templateStatus / convertStatus / liveStatus 标注 data-state，
  // 这里只补充三个没有状态标注的节点；toast 对全部状态节点生效。
  observeStatus("exportStatus", { state: true });
  observeStatus("recordStatus", { state: true });
  observeStatus("statusText", { state: false, toastIt: false });
  observeStatus("convertStatus", { state: false });
  observeStatus("liveStatus", { state: false });
  observeStatus("templateStatus", { state: false });

  // statusText 驱动播放态纠偏（app.js 会写"正在播放…/已暂停/已停止"）
  if (el.statusText) {
    new MutationObserver(() => {
      const text = el.statusText.textContent;
      if (/正在播放/.test(text)) setTransport("playing");
      else if (/已暂停|已停止/.test(text)) setTransport("paused");
    }).observe(el.statusText, { childList: true, characterData: true, subtree: true });
  }

  // engineState 进入 error 态时，把状态栏文本升级为 Toast
  const engineStateNode = $("engineState");
  if (engineStateNode) {
    new MutationObserver(() => {
      if (engineStateNode.classList.contains("error")) {
        toast("error", el.statusText ? el.statusText.textContent.trim() : "发生错误。");
      }
    }).observe(engineStateNode, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- 4. 徽章语义色 ---------- */

  const BADGE_RULES = [
    [/需要 PowerShell/, "warn"],
    [/失败|错误|不可用|超长|扫描失败/, "danger"],
    [/处理中|录制中|合并中|导出中|转换中|扫描中|就绪|启动/, "busy"],
    [/完成|已载入|已导出|按应用|运行中/, "ok"],
  ];

  function toneBadge(node) {
    if (!node) return;
    const text = node.textContent.trim();
    for (const [pattern, tone] of BADGE_RULES) {
      if (pattern.test(text)) {
        node.dataset.tone = tone;
        return;
      }
    }
    delete node.dataset.tone;
  }

  for (const id of ["sourceBadge", "templateBadge", "convertBadge", "recordBadge", "liveModeBadge"]) {
    const node = $(id);
    if (!node) continue;
    toneBadge(node);
    new MutationObserver(() => toneBadge(node)).observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // modeNote 一行截断后的 tooltip 同步（app.js 会重写文本）
  const modeNote = $("modeNote");
  if (modeNote) {
    const syncNoteTitle = () => {
      modeNote.title = modeNote.textContent.trim();
    };
    syncNoteTitle();
    new MutationObserver(syncNoteTitle).observe(modeNote, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  /* ---------- 5. 暂停/停止在无源时禁用 ---------- */

  function syncSourceButtons() {
    if (!el.sourceBadge || !el.pause || !el.stop) return;
    const text = el.sourceBadge.textContent.trim();
    const hasSource = text !== "" && text !== "未加载";
    el.pause.disabled = !hasSource;
    el.stop.disabled = !hasSource;
  }

  if (el.sourceBadge) {
    syncSourceButtons();
    new MutationObserver(syncSourceButtons).observe(el.sourceBadge, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  /* ---------- 6. 快捷键 ---------- */

  function isTypingTarget(target) {
    const tag = target && target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || (target && target.isContentEditable)) return true;
    if (tag === "INPUT") {
      const type = target.type;
      return type !== "range" && type !== "checkbox" && type !== "file" && type !== "button";
    }
    return false;
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === " ") {
        // 焦点在按钮/复选框/文件框上时交给浏览器原生激活，避免双重触发
        const tag = event.target ? event.target.tagName : "";
        const nativeSpace =
          tag === "BUTTON" ||
          (tag === "INPUT" && ["checkbox", "file", "button"].includes(event.target.type));
        if (nativeSpace) return;
        event.preventDefault();
        const playing = body.dataset.transport === "playing";
        (playing ? el.pause : el.play)?.click();
        return;
      }
      if (event.target && event.target.tagName === "INPUT") return;
      if (event.key === "ArrowLeft") {
        el.skipBack?.click();
      } else if (event.key === "ArrowRight") {
        el.skipForward?.click();
      }
    },
    true,
  );

  /* ---------- 7. 精确输入：读数编辑 / 单项复位 / 双击复位 / Shift+方向 ×10 ---------- */

  const DIST_MIN = 0.2;
  const DIST_MAX = 10;
  const sliderToDistance = (v) => DIST_MIN * (DIST_MAX / DIST_MIN) ** (v / 1000);
  const distanceToSlider = (d) => 1000 * (Math.log(d / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN));

  const PARAM_DEFAULTS = { azimuth: "0", elevation: "0", volume: "80", distance: 0.4 };
  const PARAM_DEFS = {
    azimuthOutput: { slider: "azimuth", min: -90, max: 90, step: 0.1, unit: "°", toSlider: null, label: "方位角" },
    elevationOutput: { slider: "elevation", min: -30, max: 30, step: 0.1, unit: "°", toSlider: null, label: "仰角" },
    distanceOutput: { slider: "distance", min: DIST_MIN, max: DIST_MAX, step: 0.05, unit: " m", toSlider: distanceToSlider, label: "距离" },
    volumeOutput: { slider: "volume", min: 0, max: 100, step: 1, unit: "%", toSlider: null, label: "输出音量" },
  };

  function dispatchInput(slider) {
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function resetParam(sliderId) {
    const slider = $(sliderId);
    if (!slider) return;
    const fallback = PARAM_DEFAULTS[sliderId];
    slider.value =
      typeof fallback === "number" && sliderId === "distance"
        ? String(distanceToSlider(fallback))
        : String(fallback);
    dispatchInput(slider);
    syncFills();
  }

  for (const btn of document.querySelectorAll("[data-param-reset]")) {
    btn.addEventListener("click", () => resetParam(btn.dataset.paramReset));
  }

  for (const [outputId, def] of Object.entries(PARAM_DEFS)) {
    const output = $(outputId);
    const slider = $(def.slider);
    if (!output || !slider) continue;

    output.addEventListener("click", () => {
      if (output.querySelector("input")) return;
      const current = def.toSlider ? sliderToDistance(Number(slider.value)) : Number(slider.value);

      const editor = document.createElement("input");
      editor.type = "number";
      editor.className = "output-editor";
      editor.min = String(def.min);
      editor.max = String(def.max);
      editor.step = String(def.step);
      editor.value = current.toFixed(def.step < 0.5 ? 2 : def.step < 1 ? 1 : 0);
      editor.setAttribute("aria-label", `${def.label}（精确输入，${def.min}～${def.max}${def.unit}）`);

      const commit = () => {
        let parsed = Number.parseFloat(editor.value);
        if (Number.isFinite(parsed)) {
          parsed = clamp(parsed, def.min, def.max);
          slider.value = def.toSlider ? String(distanceToSlider(parsed)) : String(parsed);
          dispatchInput(slider);
        }
        editor.replaceWith(output);
        syncFills();
      };
      const cancel = () => editor.replaceWith(output);

      editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") cancel();
        event.stopPropagation();
      });
      editor.addEventListener("blur", commit);
      editor.addEventListener("click", (event) => event.stopPropagation());
      output.replaceWith(editor);
      editor.focus();
      editor.select();
    });

    // 双击滑杆 = 单项复位（与行内复位图标一致）
    slider.addEventListener("dblclick", () => {
      resetParam(def.slider);
    });

    // Shift + 方向键 = ×10 步进
    slider.addEventListener("keydown", (event) => {
      if (!event.shiftKey) return;
      const delta = Number(slider.step) * 10;
      const min = Number(slider.min);
      const max = Number(slider.max);
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        slider.value = String(clamp(Number(slider.value) + delta, min, max));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        slider.value = String(clamp(Number(slider.value) - delta, min, max));
      } else {
        return;
      }
      event.preventDefault();
      dispatchInput(slider);
    });
  }

  /* ---------- 8. 折叠章节 ---------- */

  for (const btn of document.querySelectorAll(".fold-btn")) {
    btn.addEventListener("click", () => {
      const sect = btn.closest(".sect-fold");
      if (!sect) return;
      const folded = sect.classList.toggle("folded");
      btn.setAttribute("aria-expanded", String(!folded));
    });
  }

  /* ---------- 9. 方法说明抽屉 ---------- */

  function setDrawer(open) {
    if (!el.methodDrawer || !el.methodsToggle) return;
    el.methodDrawer.hidden = !open;
    el.methodsToggle.setAttribute("aria-expanded", String(open));
    if (open) el.methodCloseBtn?.focus();
    else el.methodsToggle.focus();
  }

  el.methodsToggle?.addEventListener("click", () => {
    setDrawer(el.methodDrawer.hidden);
  });
  el.methodCloseBtn?.addEventListener("click", () => setDrawer(false));

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.methodDrawer && !el.methodDrawer.hidden) setDrawer(false);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!el.methodDrawer || el.methodDrawer.hidden) return;
    if (el.methodDrawer.contains(event.target) || el.methodsToggle?.contains(event.target)) return;
    setDrawer(false);
  });

  /* ---------- 10. 全局输出文件夹入口 ---------- */

  if (el.outDirButton) {
    if (!desktop?.openOutputFolder) {
      el.outDirButton.disabled = true;
      el.outDirButton.title = "打开输出文件夹仅在 Windows 桌面版可用";
    } else {
      el.outDirButton.addEventListener("click", () => {
        desktop.openOutputFolder("").catch(() => {});
      });
    }
  }

  /* ---------- 11. 拖放导入 ---------- */

  const AUDIO_EXT = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i;

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    body.dataset.dragging = "1";
  });

  window.addEventListener("dragleave", (event) => {
    if (event.relatedTarget === null) delete body.dataset.dragging;
  });

  window.addEventListener("drop", (event) => {
    event.preventDefault();
    delete body.dataset.dragging;
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length === 0) return;
    const audio =
      files.find((file) => file.type.startsWith("audio/") || AUDIO_EXT.test(file.name)) ||
      files.find((file) => file.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(file.name));
    if (!audio) {
      toast("error", "拖入的文件不是可识别的音频或视频。");
      return;
    }
    const isVideo = audio.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|m4v)$/i.test(audio.name);
    const target = isVideo && el.convertFileInput ? el.convertFileInput : el.fileInput;
    if (!target) return;
    try {
      target.files = event.dataTransfer.files;
      target.dispatchEvent(new Event("change", { bubbles: true }));
      toast("info", `已导入：${audio.name}`);
    } catch {
      toast("error", "当前环境不支持拖放导入，请使用选择文件按钮。");
    }
  });
})();
