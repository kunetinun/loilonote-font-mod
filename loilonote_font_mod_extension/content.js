/* LoiLoNote Font Selector MOD - content script */
(function () {
  "use strict";

  const MOD_ID = "loilo-font-mod";
  if (window.__loiloFontModLoaded) {
    // Already loaded: just re-expose toggle and return
    if (typeof window.__loiloFontModToggle === "function") {
      return;
    }
    window.__loiloFontModToggle = function () {};
    return;
  }
  window.__loiloFontModLoaded = true;
  console.log("[LoiLoNote Font MOD] loaded v1.3.10");

  const SYSTEM_FONTS = [
    { name: "システム (sans-serif)", value: "sans-serif" },
    { name: "システム (serif)", value: "serif" },
    { name: "システム (monospace)", value: "monospace" },
    { name: "システム (cursive)", value: "cursive" },
  ];

  const GOOGLE_FONTS = [
    "Noto Sans JP", "Noto Serif JP", "M PLUS 1p", "M PLUS Rounded 1c",
    "Kosugi", "Kosugi Maru", "Sawarabi Gothic", "Sawarabi Mincho",
    "Shippori Mincho", "Yusei Magic", "Dela Gothic One", "DotGothic16",
    "Hachi Maru Pop", "Reggae One", "RocknRoll One", "Stick",
    "Kaisei Decol", "Kaisei Opti", "Kaisei Tokumin", "New Tegomin",
    "Yomogi", "Zen Kaku Gothic New", "Zen Maru Gothic", "Zen Old Mincho",
  ];

  (function loadGoogleFonts() {
    if (document.getElementById(MOD_ID + "-gfonts")) return;
    const link = document.createElement("link");
    link.id = MOD_ID + "-gfonts";
    link.rel = "stylesheet";
    const families = GOOGLE_FONTS.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+")).join("&");
    link.href = "https://fonts.googleapis.com/css2?" + families + "&display=swap";
    const head = document.head || document.documentElement;
    if (head) head.appendChild(link);
  })();

  const STORAGE_KEY = MOD_ID + "-font";
  let currentFont = "Noto Sans JP";
  try { currentFont = localStorage.getItem(STORAGE_KEY) || currentFont; } catch (e) {}
  let globalMode = true;
  try { globalMode = localStorage.getItem(MOD_ID + "-global") !== "false"; } catch (e) {}
  // version-gated reset to clean defaults
  try {
    if (localStorage.getItem(MOD_ID + "-version") !== "1.3.10") {
      localStorage.setItem(MOD_ID + "-dark", "false");
      localStorage.setItem(MOD_ID + "-colorful", "false");
      localStorage.setItem(MOD_ID + "-version", "1.3.10");
    }
  } catch (e) {}
  let darkMode = false;
  try { darkMode = localStorage.getItem(MOD_ID + "-dark") === "true"; } catch (e) {}
  let colorfulMode = false;
  try { const v = localStorage.getItem(MOD_ID + "-colorful"); if (v !== null) colorfulMode = v === "true"; } catch (e) {}

  let panelVisible = false;
  let panelEl = null;
  let lastRange = null;
  let lastDarkUrl = location.href;
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      try { lastRange = sel.getRangeAt(0).cloneRange(); } catch (e) {}
    }
  });

  // Early style injection to avoid flash (document_start)
  try {
    if (globalMode) applyGlobalFont(currentFont);
  } catch (e) {}
  try {
    if (darkMode) syncDarkModeToView();
  } catch (e) {}

  function ensureStyleEl() {
    let el = document.getElementById(MOD_ID + "-style");
    if (!el) {
      el = document.createElement("style");
      el.id = MOD_ID + "-style";
      const head = document.head || document.documentElement;
      if (head) head.appendChild(el);
    }
    return el;
  }

  function isIconOrSvg(el) {
    if (!el || !el.getAttribute) return false;
    const cls = (el.className && String(el.className)) || "";
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "svg" || tag === "path" || tag === "use") return true;
    if (/icon|Icon|svg|Svg/i.test(cls)) return true;
    return false;
  }

  function applyInlineToAll(font) {
    let count = 0;
    document.querySelectorAll("*").forEach((e) => {
      if (isIconOrSvg(e)) return;
      try { e.style.setProperty("font-family", '"' + font + '", sans-serif', "important"); count++; } catch (err) {}
    });
    document.querySelectorAll("*").forEach((e) => {
      if (e.shadowRoot) {
        e.shadowRoot.querySelectorAll("*").forEach((se) => {
          if (isIconOrSvg(se)) return;
          try { se.style.setProperty("font-family", '"' + font + '", sans-serif', "important"); } catch (err) {}
        });
      }
    });
    return count;
  }

  function applyGlobalFont(font) {
    const el = ensureStyleEl();
    const safe = String(font).replace(/"/g, "");
    el.textContent = `
      *:not(svg):not(path):not(use):not([class*="icon"]):not([class*="Icon"]):not([class*="svg"]):not([class*="Svg"]) {
        font-family: "${safe}", sans-serif !important;
      }
    `;
    applyInlineToAll(safe);
  }

  function clearGlobalFont() {
    const el = document.getElementById(MOD_ID + "-style");
    if (el) el.textContent = "";
    document.querySelectorAll("*").forEach((e) => {
      if (isIconOrSvg(e)) return;
      try { e.style.removeProperty("font-family"); } catch (err) {}
    });
  }

  const darkOverrides = new Map();
  function parseColor(str) {
    const m = (str || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  function luminance(c) { return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255; }
  function isLightBg(str) {
    const c = parseColor(str);
    if (!c) return false;
    if (/rgba\([^)]*,\s*0(\.0+)?\)/.test(str)) return false;
    return luminance(c) > 0.78;
  }
  function isDarkText(str) {
    const c = parseColor(str);
    if (!c) return false;
    return luminance(c) < 0.45;
  }
  function skipDarken(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "html" || tag === "body" || tag === "main") return true;
    if (tag === "canvas" || tag === "svg" || tag === "img" || tag === "video" || tag === "picture") return true;
    const elCls = String(el.className || "");
    // Skip desktop/background/workspace/canvas elements
    if (/desktop|background|wallpaper|backdrop|workspace|canvas|stage/i.test(elCls)) return true;
    // Skip large background/container elements to avoid desktop background changes
    try {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      if (r.width * r.height > vw * vh * 0.15) return true;
    } catch (e) {}
    // Skip elements whose parent is already dark (avoid cascading)
    try {
      let parent = el.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        const pcbg = getComputedStyle(parent).backgroundColor;
        if (pcbg && /rgb\(31,\s*31,\s*46\)/.test(pcbg)) return true;
        parent = parent.parentElement;
      }
    } catch (e) {}
    if (tag === "img" || tag === "svg" || tag === "canvas" || tag === "video" || tag === "picture") return true;
    const cls = String(el.className || "");
    if (/desktop|background|wallpaper|backdrop/i.test(cls)) return true;
    try {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "absolute" || pos === "sticky") return true;
    } catch (e) {}
    try {
      const w = el.offsetWidth || el.getBoundingClientRect().width || 0;
      const h = el.offsetHeight || el.getBoundingClientRect().height || 0;
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      if (w * h > vw * vh * 0.4) return true;
    } catch (e) {}
    const re = /editor|pen|drawing|canvas|toolbar|popover|dropdown|dialog|modal|tooltip|picker|overlay|backdrop|mask|scrim/i;
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      const cls = String(node.className || "");
      if (re.test(cls) && !/materialBox/i.test(cls)) return true;
      node = node.parentElement;
    }
    return false;
  }
  function darkenNarrowNavs() {
    if (!darkMode) return;
    document.querySelectorAll("nav, .nav, [class*='nav' i]").forEach((el) => {
      try {
        if (isIconOrSvg(el)) return;
        const cls = String(el.className || "");
        if (/icon|Icon|svg|Svg/i.test(cls)) return;
        const cs = getComputedStyle(el);
        if (!isLightBg(cs.backgroundColor)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 700) return;
        el.style.setProperty("background-color", "#1f1f2e", "important");
        el.style.setProperty("color", "#e6e6e6", "important");
      } catch (e) {}
    });
  }
  function forceDarkPanels() {
    if (!darkMode || !isNoteListView()) return;
    document.querySelectorAll(".courseNav, .focusScope, .coruseMenuNav, .courseListItem, .roundListItem, .timelinePanelNav, .courseMenuTabList, [class*='timelinePanel'], .materialBox, .searchBox, [class*='searchBox'], .materialBoxDialogDocumentCell, [class*='materialBoxDialogDocumentCell'], .submissionListItemDisabled, [class*='submissionListItem'], .timelineBalloonContent, [class*='timelineBalloon'], .documentDetailContent, [class*='documentDetail'], .navBody, [class*='navBody']").forEach((el) => {
      try { el.style.setProperty("background-color", "#1f1f2e", "important"); } catch (e) {}
      try { el.style.setProperty("color", "#e6e6e6", "important"); } catch (e) {}
    });
    document.querySelectorAll(".courseListItem, .roundListItem").forEach((el) => {
      try { el.style.setProperty("border", "1px solid #555", "important"); } catch (e) {}
      try { el.style.setProperty("border-radius", "8px", "important"); } catch (e) {}
    });
    document.querySelectorAll(".roundListSectionHeader, .ellipsisTextLineClamp, .ellipsisText, .materialBoxDialogDocumentCell, [class*='materialBoxDialogDocumentCell'], .documentDetailContent, [class*='documentDetail']").forEach((el) => {
      try { el.style.setProperty("color", "#e6e6e6", "important"); } catch (e) {}
    });
    document.querySelectorAll(".navCloseButton").forEach((el) => {
      try { el.style.setProperty("color", "#007aff", "important"); } catch (e) {}
    });
    document.querySelectorAll(".uiIcon").forEach((el) => {
      const cls = String(el.className || "");
      if (!/close/i.test(cls)) return;
      try { el.style.setProperty("background-color", "#007aff", "important"); } catch (e) {}
      try { el.style.setProperty("color", "#007aff", "important"); } catch (e) {}
      try { el.style.setProperty("fill", "#007aff", "important"); } catch (e) {}
      try { el.style.setProperty("stroke", "#007aff", "important"); } catch (e) {}
      try { el.style.setProperty("filter", "none", "important"); } catch (e) {}
      try { el.style.removeProperty("opacity"); } catch (e) {}
    });
    document.querySelectorAll(".navCloseButton, [class*='navCloseButton']").forEach((el) => {
      try { el.style.setProperty("color", "#007aff", "important"); } catch (e) {}
    });
    document.querySelectorAll(".courseMenuTab").forEach((tab) => {
      try {
        tab.style.removeProperty("color");
        Array.from(tab.querySelectorAll("*")).forEach((ch) => {
          try { ch.style.removeProperty("color"); } catch (e) {}
        });
      } catch (e) {}
    });
    // その他のナビアイコンは元の色を維持（上書きしない）
    // サイドnav（ライト背景のもの）をダーク化 (top navは元の色を維持)
    document.querySelectorAll("nav, .nav, [class*='nav' i]").forEach((el) => {
      try {
        if (isIconOrSvg(el)) return;
        const cls = String(el.className || "");
        if (/icon|Icon|svg|Svg/i.test(cls)) return;
        const cs = getComputedStyle(el);
        if (!isLightBg(cs.backgroundColor)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 700) return;
        el.style.setProperty("background-color", "#1f1f2e", "important");
        el.style.setProperty("color", "#e6e6e6", "important");
      } catch (e) {}
    });
  }
function revertForceDarkPanels() {
    const props = ["background-color", "color", "border", "border-radius", "fill", "stroke", "filter"];
    const selectors = [".courseNav", ".focusScope", ".coruseMenuNav", ".courseListItem", ".roundListItem", ".timelinePanelNav", ".courseMenuTabList", ".roundListSectionHeader", ".ellipsisTextLineClamp", ".ellipsisText", ".navCloseButton", "[class*='navCloseButton']", ".materialBox", ".searchBox", "[class*='searchBox']", ".materialBoxDialogDocumentCell", "[class*='materialBoxDialogDocumentCell']", ".submissionListItemDisabled", "[class*='submissionListItem']", ".timelineBalloonContent", "[class*='timelineBalloon']", ".documentDetailContent", "[class*='documentDetail']", ".navBody", "[class*='navBody']"];
    selectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          props.forEach((p) => { try { el.style.removeProperty(p); } catch (e) {} });
        });
      } catch (e) {}
    });
    // タイムライン関連
    document.querySelectorAll("[class*='timeline' i], [class*='Timeline']").forEach((el) => {
      props.forEach((p) => { try { el.style.removeProperty(p); } catch (e) {} });
    });
    // アイコン
    document.querySelectorAll(".uiIcon").forEach((el) => {
      const cls = String(el.className || "");
      if (/close/i.test(cls)) {
        ["background-color", "color", "fill", "stroke", "filter"].forEach((p) => { try { el.style.removeProperty(p); } catch (e) {} });
      }
    });
    // タブの色解除
    document.querySelectorAll(".courseMenuTab").forEach((tab) => {
      try { tab.style.removeProperty("color"); } catch (e) {}
      Array.from(tab.querySelectorAll("*")).forEach((ch) => { try { ch.style.removeProperty("color"); } catch (e) {} });
    });
    // ポップオーバー/ピッカー/ドロップダウンの背景解除
    document.querySelectorAll("[class*=\"popover\" i], [class*=\"picker\" i], [class*=\"dropdown\" i]").forEach((el) => {
      try { el.style.removeProperty("background-color"); } catch (e) {}
      try { el.style.removeProperty("color"); } catch (e) {}
    });
  }

  function fixPopovers() {
    if (!darkMode) return;
    document.querySelectorAll('[class*="popover" i], [class*="picker" i], [class*="dropdown" i]').forEach((el) => {
      const cls = String(el.className || "");
      if (/button|icon|title/i.test(cls)) return;
      try { el.style.setProperty("background-color", "rgba(31, 31, 46, 0.92)", "important"); } catch (e) {}
      try { el.style.setProperty("color", "#e6e6e6", "important"); } catch (e) {}
    });
  }
  function scanAndDarken() {
    if (!darkMode || !isNoteListView()) return;
    document.querySelectorAll("*").forEach((el) => {
      if (skipDarken(el)) return;
      if (darkOverrides.has(el)) return;
      // 親が既にダーク化されている場合はスキップ（階層保持・平坦化防止）
      let parent = el.parentElement;
      let parentDark = false;
      for (let i = 0; i < 4 && parent; i++) {
        if (darkOverrides.has(parent)) { parentDark = true; break; }
        try {
          const pcbg = getComputedStyle(parent).backgroundColor;
          if (pcbg && /rgb\(31,\s*31,\s*46\)/.test(pcbg)) { parentDark = true; break; }
        } catch (e) {}
        parent = parent.parentElement;
      }
      if (parentDark) return;
      let cs;
      try { cs = getComputedStyle(el); } catch (e) { return; }
      const bg = cs.backgroundColor;
      if (!isLightBg(bg)) return;
      const origColor = cs.color;
      darkOverrides.set(el, { bg: bg, color: origColor });
      const cls = String(el.className || "");
      const semi = /popover|menu|overlay|backdrop|mask|scrim|picker|dropdown/i.test(cls);
      const bgDark = semi ? "rgba(31, 31, 46, 0.92)" : "#1f1f2e";
      try { el.style.setProperty("background-color", bgDark, "important"); } catch (e) {}
      if (isDarkText(origColor)) { try { el.style.setProperty("color", "#e6e6e6", "important"); } catch (e) {} }
    });
  }

function revertDarkMode() {
    darkOverrides.forEach((orig, el) => {
      try { el.style.removeProperty("background-color"); } catch (e) {}
      try { el.style.removeProperty("color"); } catch (e) {}
    });
    darkOverrides.clear();
  }
  function isNoteListView() {
    // 全ページでダークモードを発動
    return true;
  }
  function syncDarkModeToView() {
    if (!darkMode) {
      revertDarkMode();
      revertForceDarkPanels();
      const extra = document.getElementById(MOD_ID + "-darkextra");
      if (extra) extra.remove();
      return;
    }
    // CSS-only dark mode: always apply when dark mode is on (no view check to avoid flash)
    fixPopovers();
    let extra = document.getElementById(MOD_ID + "-darkextra");
    if (!extra) {
      extra = document.createElement("style");
      extra.id = MOD_ID + "-darkextra";
      const head = document.head || document.documentElement;
      if (head) head.appendChild(extra);
    }
    extra.textContent = `
      body, html { background-color: #12264d !important; }
      .courseNav, .coruseMenuNav, .menu, .timelinePanelNav,
      .courseMenuTabList, [class*="timelinePanel"],
      .materialBox, .searchBox, [class*="searchBox"],
      .materialBoxDialogDocumentCell, [class*="materialBoxDialogDocumentCell"],
      .submissionListItemDisabled, [class*="submissionListItem"],
      .timelineBalloonContent, [class*="timelineBalloon"],
      .documentDetailContent, [class*="documentDetail"],
      .navBody, [class*="navBody"],
      .courseListItem, .roundListItem,
      .nav, [class*="navBody" i],
      .navHeader, .navTranslucentHeaderGroup, [class*="navHeader" i], [class*="TranslucentHeader" i],
      .navBar, [class*="navBar" i] {
        background-color: #1f1f2e !important;
        color: #e6e6e6 !important;
      }
      .courseListItem, .roundListItem {
        border: 1px solid #555 !important;
        border-radius: 8px !important;
      }
      .roundListSectionHeader, .ellipsisTextLineClamp, .ellipsisText {
        color: #e6e6e6 !important;
      }
      [class*="popover" i], [class*="picker" i], [class*="dropdown" i] {
        background-color: rgba(31, 31, 46, 0.92) !important;
        color: #e6e6e6 !important;
      }
      .uiIcon[class*="close" i], .navCloseButton .uiIcon {
        background-color: #007aff !important;
        color: #007aff !important;
        filter: none !important;
      }
      /* デスクトップ/キャンバス/背景は完全に除外（一切変更しない） */
    `;

  }
  function applyDarkMode(on) {
    darkMode = !!on;
    if (darkMode && colorfulMode) {
      colorfulMode = false;
      try { localStorage.setItem(MOD_ID + "-colorful", "false"); } catch (e) {}
      try { updateColorfulButton(); } catch (e) {}
    }
    try { localStorage.setItem(MOD_ID + "-dark", String(darkMode)); } catch (e) {}
    lastDarkUrl = location.href;
    syncDarkModeToView();
    injectToolbarDarkStyle();
    injectFlashyStyle();
    if (!on) {
      document.querySelectorAll("nav, .nav, [class*='nav' i]").forEach((el) => {
        try {
          ["background-color", "color"].forEach((p) => { try { el.style.removeProperty(p); } catch (e) {} });
        } catch (e) {}
      });
    }
    updateDarkButton();
  }
  function applyColorfulMode(on) {
    colorfulMode = !!on;
    if (colorfulMode && darkMode) {
      darkMode = false;
      try { localStorage.setItem(MOD_ID + "-dark", "false"); } catch (e) {}
      try { updateDarkButton(); } catch (e) {}
      try { revertDarkMode(); revertForceDarkPanels(); } catch (e) {}
    }
    try { localStorage.setItem(MOD_ID + "-colorful", String(colorfulMode)); } catch (e) {}
    injectFlashyStyle();
    updateColorfulButton();
  }

  function applyFontToSelection(font) {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        document.execCommand("fontName", false, font);
      }
    } catch (e) {}
    const active = document.activeElement;
    if (active) {
      try { active.style.setProperty("font-family", '"' + font + '", sans-serif', "important"); } catch (e) {}
      let node = active;
      for (let i = 0; i < 6 && node; i++) {
        if (node.style) {
          try { node.style.setProperty("font-family", '"' + font + '", sans-serif', "important"); } catch (e) {}
        }
        node = node.parentElement;
      }
    }
  }

  function applyFont(font, opts) {
    opts = opts || {};
    currentFont = font;
    try { localStorage.setItem(STORAGE_KEY, font); } catch (e) {}
    if (globalMode) applyGlobalFont(font); else clearGlobalFont();
    refreshOptionFonts();
    if (opts.toSelection) applyFontToSelection(font);
    updatePanelUI();
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = MOD_ID + "-panel";
    panel.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;width:300px;max-height:70vh;overflow:auto;background:rgba(20,20,30,0.92);color:#fff;border-radius:12px;padding:14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,0.4);backdrop-filter:blur(6px);user-select:none;font-family:sans-serif;";

    const title = document.createElement("div");
    title.textContent = "LoiLoNote フォントMOD";
    title.style.cssText = "font-weight:bold;font-size:15px;margin-bottom:8px;";
    panel.appendChild(title);

    const preview = document.createElement("div");
    preview.id = MOD_ID + "-preview";
    preview.textContent = "あいうえお ABC 123 フォントプレビュー";
    preview.style.cssText = "padding:8px;margin-bottom:8px;background:rgba(255,255,255,0.08);border-radius:6px;font-size:16px;";
    panel.appendChild(preview);

    const globalRow = document.createElement("label");
    globalRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;";
    const globalChk = document.createElement("input");
    globalChk.type = "checkbox";
    globalChk.checked = globalMode;
    globalChk.onchange = () => {
      globalMode = globalChk.checked;
      try { localStorage.setItem(MOD_ID + "-global", String(globalMode)); } catch (e) {}
      if (globalMode) applyGlobalFont(currentFont); else clearGlobalFont();
    };
    const globalLbl = document.createElement("span");
    globalLbl.textContent = "アプリ全体に適用 (Global)";
    globalRow.appendChild(globalChk);
    globalRow.appendChild(globalLbl);
    panel.appendChild(globalRow);

    const darkRow = document.createElement("label");
    darkRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;";
    const darkChk = document.createElement("input");
    darkChk.type = "checkbox";
    darkChk.checked = darkMode;
    darkChk.onchange = () => applyDarkMode(darkChk.checked);
    const darkLbl = document.createElement("span");
    darkLbl.textContent = "ダークモード";
    darkRow.appendChild(darkChk);
    darkRow.appendChild(darkLbl);
    panel.appendChild(darkRow);

    const colorfulRow = document.createElement("label");
    colorfulRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;";
    const colorfulChk = document.createElement("input");
    colorfulChk.type = "checkbox";
    colorfulChk.checked = colorfulMode;
    colorfulChk.onchange = () => applyColorfulMode(colorfulChk.checked);
    const colorfulLbl = document.createElement("span");
    colorfulLbl.textContent = "目に悪いカラフルモード";
    colorfulRow.appendChild(colorfulChk);
    colorfulRow.appendChild(colorfulLbl);
    panel.appendChild(colorfulRow);

    const selLabel = document.createElement("div");
    selLabel.textContent = "フォントを選択:";
    selLabel.style.marginBottom = "4px";
    panel.appendChild(selLabel);

    const select = document.createElement("select");
    select.id = MOD_ID + "-select";
    select.style.cssText = "width:100%;padding:6px;border-radius:6px;border:none;margin-bottom:8px;";

    const sysGroup = document.createElement("optgroup");
    sysGroup.label = "システム";
    SYSTEM_FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f.value; o.textContent = f.name; o.dataset.fontfamily = f.value; o.style.setProperty("font-family", f.value, "important");
      sysGroup.appendChild(o);
    });
    select.appendChild(sysGroup);

    const gfGroup = document.createElement("optgroup");
    gfGroup.label = "Google Fonts (日本語)";
    GOOGLE_FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f; o.textContent = f;
      o.dataset.fontfamily = '"' + f + '", sans-serif'; o.style.setProperty("font-family", '"' + f + '", sans-serif', "important");
      gfGroup.appendChild(o);
    });
    select.appendChild(gfGroup);

    select.value = currentFont;
    select.onchange = () => applyFont(select.value, { toSelection: false });
    panel.appendChild(select);

    const status = document.createElement("div");
    status.style.cssText = "margin-top:8px;font-size:12px;opacity:0.8;";
    status.textContent = "準備完了";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
    const applySelBtn = document.createElement("button");
    applySelBtn.textContent = "選択テキストに適用";
    applySelBtn.style.cssText = "flex:1;padding:6px;border:none;border-radius:6px;cursor:pointer;background:#4a90d9;color:#fff;";
    applySelBtn.onclick = () => applyFont(currentFont, { toSelection: true });
    const applyAllBtn = document.createElement("button");
    applyAllBtn.textContent = "全体に適用";
    applyAllBtn.style.cssText = "flex:1;padding:6px;border:none;border-radius:6px;cursor:pointer;background:#2ecc71;color:#fff;";
    applyAllBtn.onclick = () => {
      const n = applyInlineToAll(currentFont);
      if (globalMode) applyGlobalFont(currentFont);
      status.textContent = "適用要素数: " + n;
    };
    btnRow.appendChild(applySelBtn);
    btnRow.appendChild(applyAllBtn);
    panel.appendChild(btnRow);
    panel.appendChild(status);




    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ 閉じる";
    closeBtn.style.cssText = "width:100%;padding:6px;border:none;border-radius:6px;cursor:pointer;background:#555;color:#fff;margin-top:6px;";
    closeBtn.onclick = () => togglePanel(false);
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
    refreshOptionFonts();
    return panel;
  }

  function refreshOptionFonts() {
    const selects = [];
    const ps = document.getElementById(MOD_ID + "-select");
    if (ps) selects.push(ps);
    document.querySelectorAll("." + MOD_ID + "-editorfont select").forEach((s) => selects.push(s));
    selects.forEach((sel) => {
      sel.querySelectorAll("option").forEach((o) => {
        const ff = o.dataset.fontfamily;
        if (ff) {
          try { o.style.setProperty("font-family", ff, "important"); } catch (e) {}
        }
      });
    });
  }
  function updatePanelUI() {
    if (!panelEl) return;
    const preview = panelEl.querySelector("#" + MOD_ID + "-preview");
    if (preview) preview.style.fontFamily = '"' + currentFont + '", sans-serif';
    const select = panelEl.querySelector("#" + MOD_ID + "-select");
    if (select) select.value = currentFont;
  }

  function togglePanel(force) {
    if (force === undefined) force = !panelVisible;
    if (force && !panelVisible) {
      panelEl = buildPanel();
      panelVisible = true;
      updatePanelUI();
    } else if (!force && panelVisible) {
      if (panelEl) panelEl.remove();
      panelEl = null;
      panelVisible = false;
    }
  }

  window.__loiloFontModToggle = () => togglePanel();

  function createToggleButton() {
    if (document.getElementById(MOD_ID + "-toggle")) return;
    const btn = document.createElement("button");
    btn.id = MOD_ID + "-toggle";
    btn.textContent = "Font";
    btn.title = "フォント選択 MOD";
    btn.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:2147483647;padding:10px 14px;border:none;border-radius:8px;background:#6c5ce7;color:#fff;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;";
    btn.onclick = () => togglePanel();
    document.body.appendChild(btn);
  }
  function updateDarkButton() {
    const btn = document.getElementById(MOD_ID + "-darkbtn");
    if (!btn) return;
    btn.textContent = darkMode ? "Dark ON" : "Dark";
    btn.style.background = darkMode ? "#1f1f2e" : "#555";
  }
  function createDarkButton() {
    if (document.getElementById(MOD_ID + "-darkbtn")) return;
    const btn = document.createElement("button");
    btn.id = MOD_ID + "-darkbtn";
    btn.title = "ダークモード";
    btn.style.cssText = "position:fixed;bottom:20px;left:110px;z-index:2147483647;padding:10px 14px;border:none;border-radius:8px;background:#555;color:#fff;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;";
    btn.onclick = () => applyDarkMode(!darkMode);
    document.body.appendChild(btn);
    updateDarkButton();
  }
  function updateColorfulButton() {
    const btn = document.getElementById(MOD_ID + "-colorful");
    if (!btn) return;
    btn.textContent = colorfulMode ? "Colorful ON" : "Colorful";
    btn.style.background = colorfulMode ? "linear-gradient(45deg,#ff00ff,#00ffff)" : "#ff1493";
  }
  function createColorfulButton() {
    if (document.getElementById(MOD_ID + "-colorful")) return;
    const btn = document.createElement("button");
    btn.id = MOD_ID + "-colorful";
    btn.title = "目に悪いカラフルモード";
    btn.style.cssText = "position:fixed;bottom:20px;left:200px;z-index:2147483647;padding:10px 14px;border:none;border-radius:8px;background:#ff1493;color:#fff;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;";
    btn.onclick = () => applyColorfulMode(!colorfulMode);
    document.body.appendChild(btn);
    updateColorfulButton();
  }

  function tryInjectMenuButton() {
    const menus = document.querySelectorAll(".menu");
    menus.forEach((menu) => {
      if (menu.querySelector("." + MOD_ID + "-menubtn")) return;
      const btn = document.createElement("div");
      btn.className = "menuButton " + MOD_ID + "-menubtn";
      const icon = document.createElement("img");
      icon.className = "menuButtonIcon";
      icon.src = "https://cdn.loilonote.app/7.13.0/svg/materialbox/MaterialFolderPrivate.svg";
      icon.alt = "フォント";
      const lbl = document.createElement("div");
      lbl.className = "menuTitle";
      lbl.textContent = "フォント変更";
      btn.appendChild(icon);
      btn.appendChild(lbl);
      btn.onclick = () => togglePanel();
      menu.appendChild(btn);
    });
  }

  let reapplyTimer = null;
  let uiTimer = null;
  let lastScan = 0;
  let cleanupRegistered = false;
  const observer = new MutationObserver(() => {
    // Immediately clean up any inline styles on desktop/canvas elements
    // (prevents flash when new panels open)
    if (darkMode) {
      document.querySelectorAll(".focusScope.desktop, [class*='desktop'], .mainCanvas, canvas, [class*='a11yNote'], [class*='a11yMainCanvas']").forEach((el) => {
        try {
          if (el.style.backgroundColor && el.style.backgroundColor !== "") {
            el.style.removeProperty("background-color");
          }
          if (el.style.color && el.style.color !== "") {
            el.style.removeProperty("color");
          }
        } catch (e) {}
      });
    }
    if (uiTimer) clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      injectFlashyStyle();
      if (darkMode) { try { darkenNarrowNavs(); } catch (e) {} }
      if (darkMode) {
        try { fixPopovers(); } catch (e) {}
      }
    }, 1000);
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  // Cleanup on page unload to prevent memory leaks
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    window.addEventListener("beforeunload", () => {
      try { observer.disconnect(); } catch (e) {}
      try { clearInterval(retryTimer); } catch (e) {}
    });
  }

  function injectEditorFontControl() {
    if (document.querySelector("." + MOD_ID + "-editorfont")) return;
    const anchor = document.querySelector('[class*="editorTextPopoverSize"]')
                || document.querySelector('[class*="editorTextColorButtonLabel"]')
                || document.querySelector('[class*="editorTextButton"]')
                || document.querySelector('[class*="editorText"]')
                || document.querySelector('[class*="toolbar"] button');
    if (!anchor) return;
    let container = anchor.parentElement;
    for (let i = 0; i < 4 && container; i++) {
      if (container.querySelectorAll('[class*="editor"]').length >= 2) break;
      if (container.parentElement) container = container.parentElement;
      else break;
    }
    if (!container) return;
    const wrap = document.createElement("span");
    wrap.className = MOD_ID + "-editorfont";
    wrap.style.cssText = "display:inline-flex;align-items:center;margin:0 4px;";
    const select = document.createElement("select");
    select.title = "フォント";
    select.style.cssText = "font-size:12px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;max-width:120px;";
    SYSTEM_FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f.value; o.textContent = f.name; o.dataset.fontfamily = f.value; o.style.setProperty("font-family", f.value, "important"); select.appendChild(o);
    });
    GOOGLE_FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f; o.textContent = f; o.dataset.fontfamily = '"' + f + '", sans-serif'; o.style.setProperty("font-family", '"' + f + '", sans-serif', "important"); select.appendChild(o);
    });
    select.value = currentFont;
    select.onchange = () => {
      const font = select.value;
      currentFont = font;
      try { localStorage.setItem(STORAGE_KEY, font); } catch (e) {}
      if (lastRange) {
        try {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(lastRange);
        } catch (e) {}
      }
      try { document.execCommand("fontName", false, font); } catch (e) {}
      const active = document.activeElement;
      if (active) {
        try { active.style.setProperty("font-family", '"' + font + '", sans-serif', "important"); } catch (e) {}
      }
      updatePanelUI();
    };
    wrap.appendChild(select);
    try { container.appendChild(wrap); } catch (e) {}
  }

  function injectToolbarDarkStyle() {
    const old = document.getElementById(MOD_ID + "-toolbar");
    if (!darkMode) { if (old) old.remove(); return; }
    if (old) return;
    const el = document.createElement("style");
    el.id = MOD_ID + "-toolbar";
    el.textContent = `
      .menuWrapper .desktopBackButton,
      .menuWrapper .menu {
        background-color: #1f1f2e !important;
      }
      .menuWrapper .desktopBackButton .uiIcon,
      .menuWrapper .menu .menuButtonIcon,
      .menuWrapper .menu .uiIcon {
        filter: brightness(0) invert(1) !important;
      }
    `;
    const head = document.head || document.documentElement;
    if (head) head.appendChild(el);
  }
  function injectFlashyStyle() {
    const old = document.getElementById(MOD_ID + "-flashy");
    if (!colorfulMode || darkMode) { if (old) old.remove(); return; }
    if (old && old.dataset.v === "1.3.10") return;
    if (old) old.remove();
    const el = document.createElement("style");
    el.id = MOD_ID + "-flashy";
    el.dataset.v = "1.3.10";
    el.textContent = `
      html, body {
        background:
          radial-gradient(circle at 20% 30%, rgba(255,0,255,0.6) 0%, transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(0,255,255,0.6) 0%, transparent 40%),
          radial-gradient(circle at 50% 50%, rgba(255,255,0,0.4) 0%, transparent 50%),
          linear-gradient(135deg, #ff0080, #8000ff, #0080ff, #00ff80, #ff8000) !important;
        background-size: 100% 100%, 100% 100%, 100% 100%, 300% 300% !important;
        animation: loiloFlashyBg 5s ease infinite !important;
      }
      @keyframes loiloFlashyBg {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      * { font-family: "Comic Sans MS", "Papyrus", "Marker Felt", cursive !important; border-color: #ff1493 !important; }
      p, span, li, td, label { color: #ff00ff !important; text-shadow: 2px 2px 0 #00ffff !important; }
      h1, h2, h3 { color: #ffff00 !important; text-shadow: 3px 3px 0 #ff0000, 6px 6px 0 #0000ff !important; }
      h4, h5, h6 { color: #00ffff !important; text-shadow: 2px 2px 0 #ff00ff !important; }
      a, button { color: #000 !important; text-shadow: none !important; }
      div { color: #ff69b4 !important; }
      section { color: #00ff7f !important; }
      nav { color: #ffa500 !important; }
      div { background: rgba(255, 0, 255, 0.30) !important; border: 4px dashed #00ff00 !important; box-shadow: 0 0 16px #ff00ff !important; border-radius: 20px 4px 20px 4px !important; animation: loiloPulse 2s ease-in-out infinite !important; }
      section { background: rgba(0, 255, 255, 0.30) !important; border: 4px dotted #ff0000 !important; box-shadow: 0 0 16px #00ffff !important; border-radius: 4px 20px 4px 20px !important; animation: loiloWobble 1.5s ease-in-out infinite alternate !important; }
      article { background: rgba(255, 255, 0, 0.30) !important; border: 4px ridge #0000ff !important; box-shadow: 0 0 16px #ffff00 !important; border-radius: 12px !important; animation: loiloBounce 0.8s ease infinite alternate !important; }
      main { background: rgba(0, 255, 0, 0.25) !important; border: 4px double #ff00ff !important; box-shadow: 0 0 16px #00ff00 !important; border-radius: 30px !important; }
      aside { background: rgba(255, 165, 0, 0.30) !important; border: 4px groove #00ffff !important; box-shadow: 0 0 16px #ffa500 !important; border-radius: 8px 24px 8px 24px !important; }
      nav { background: rgba(75, 0, 130, 0.30) !important; border: 4px outset #ffff00 !important; box-shadow: 0 0 16px #4b0082 !important; border-radius: 16px !important; animation: loiloSpin 8s linear infinite !important; }
      header, footer { background: rgba(255, 20, 147, 0.35) !important; border: 4px inset #00ff00 !important; box-shadow: 0 0 16px #ff1493 !important; border-radius: 10px !important; animation: loiloPulse 1.5s ease-in-out infinite !important; }
      @keyframes loiloPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
      @keyframes loiloWobble { 0% { transform: rotate(-2deg); } 100% { transform: rotate(2deg); } }
      @keyframes loiloBounce { 0% { transform: translateY(0); } 100% { transform: translateY(-3px); } }
      @keyframes loiloSpin { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
      button, a, input, select, textarea {
        background: linear-gradient(45deg, #ff0000, #ffff00, #00ff00, #0000ff) !important;
        color: #000 !important;
        border: 4px solid #ff1493 !important;
        font-weight: 900 !important;
        text-shadow: none !important;
        box-shadow: 0 0 15px #ff00ff !important;
      }
      img, svg {
        filter: hue-rotate(90deg) saturate(300%) !important;
        border: 5px dotted #ff00ff !important;
      }
    `;
    const head = document.head || document.documentElement;
    if (head) head.appendChild(el);
  }

  function init() {
    injectToolbarDarkStyle();
    injectFlashyStyle();
    if (document.body) { createToggleButton(); createDarkButton(); createColorfulButton(); }
    if (darkMode) applyDarkMode(true);
    if (colorfulMode) applyColorfulMode(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  let retries = 0;
  const retryTimer = setInterval(() => {
    injectToolbarDarkStyle();
    injectFlashyStyle();
    if (document.body) { createToggleButton(); createDarkButton(); createColorfulButton(); }
    retries++;
    if (retries > 5) clearInterval(retryTimer);
  }, 1000);

  setInterval(() => {
    injectFlashyStyle();
    if (darkMode) { try { darkenNarrowNavs(); } catch (e) {} }
    if (darkMode) {
      if (location.href !== lastDarkUrl) { lastDarkUrl = location.href; }
      fixPopovers();
      // Ensure darkextra CSS is always present
      if (!document.getElementById(MOD_ID + "-darkextra")) {
        syncDarkModeToView();
      }
    } else {
      injectFlashyStyle();
    }
  }, 15000);

  window.loiloFontMod = { applyFont, togglePanel, current: () => currentFont };
})();
