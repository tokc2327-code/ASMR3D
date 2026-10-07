(() => {
  "use strict";

  const STORAGE_KEY = "asmr3d.settings.v1";
  const DEFAULTS = {
    theme: "system",
    appearance: {
      backgroundVisibility: 80,
      backgroundBlur: 3,
      overlayStrength: 55,
      panelOpacity: 92,
    },
    defaults: {
      mode: "binaural",
      azimuth: 0,
      elevation: 0,
      distance: 0.4,
      volume: 80,
      exportBitDepth: "16",
      convertBitDepth: "24",
      recordSegment: "600",
      recordBitDepth: "24",
      silenceTimeout: "30",
    },
  };

  const listeners = new Set();
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(base, patch) {
    const result = clone(base);
    for (const [key, value] of Object.entries(patch || {})) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = merge(result[key], value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  function read() {
    try {
      return merge(DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return clone(DEFAULTS);
    }
  }

  function resolvedTheme(settings) {
    if (settings.theme === "light" || settings.theme === "dark") {
      return settings.theme;
    }
    return media?.matches ? "dark" : "light";
  }

  function apply(settings = read(), { notify = false } = {}) {
    const root = document.documentElement;
    const theme = resolvedTheme(settings);
    const appearance = settings.appearance || DEFAULTS.appearance;
    const isLight = theme === "light";
    const base = isLight ? "255, 255, 255" : "19, 22, 30";
    const base2 = isLight ? "248, 249, 251" : "26, 30, 40";
    const chrome = isLight ? "255, 255, 255" : "13, 16, 22";
    const alpha = Math.min(1, Math.max(0.7, Number(appearance.panelOpacity) / 100));

    root.dataset.theme = theme;
    root.dataset.themePreference = settings.theme;
    root.style.setProperty(
      "--bg-image-opacity",
      String(Math.min(1, Math.max(0, Number(appearance.backgroundVisibility) / 100))),
    );
    root.style.setProperty(
      "--bg-blur",
      `${Math.min(20, Math.max(0, Number(appearance.backgroundBlur) || 0))}px`,
    );
    const overlay = Math.min(1, Math.max(0, Number(appearance.overlayStrength) / 100));
    root.style.setProperty(
      "--page-overlay",
      `rgba(${isLight ? "246, 248, 251" : "7, 9, 13"}, ${overlay})`,
    );
    root.style.setProperty("--surface", `rgba(${base}, ${alpha})`);
    root.style.setProperty("--surface-2", `rgba(${base2}, ${Math.min(1, alpha + 0.04)})`);
    root.style.setProperty("--chrome", `rgba(${chrome}, ${Math.min(1, alpha + 0.03)})`);

    if (notify) {
      for (const listener of listeners) listener(clone(settings));
    }
    return settings;
  }

  function update(patch) {
    const next = merge(read(), patch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    apply(next, { notify: true });
    return next;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    const next = clone(DEFAULTS);
    apply(next, { notify: true });
    return next;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  media?.addEventListener?.("change", () => {
    const settings = read();
    if (settings.theme === "system") apply(settings, { notify: true });
  });

  window.asmr3dSettings = {
    defaults: clone(DEFAULTS),
    get: () => clone(read()),
    update,
    reset,
    subscribe,
    apply,
  };

  apply(read());
})();
