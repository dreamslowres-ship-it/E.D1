(function () {
  "use strict";

  const MAX = 50;
  const MAX_LINES = 3;
  const KEY = "ed-ff-v1";

  const state = {
    data: null,
    history: [],
    favorites: [],
    undo: [],
    panel: "colors",
    histTab: "recent",
    theme: "dark"
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const input = $("#bioInput");
  const preview = $("#previewBox");
  const charEl = $("#charCounter");
  const lineEl = $("#lineCounter");
  const badge = $("#validBadge");

  // —— Utils ——
  function esc(t) {
    return String(t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toast(msg, err) {
    const el = document.createElement("div");
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 200);
    }, 2000);
  }

  function load() {
    try {
      const r = localStorage.getItem(KEY);
      if (!r) return;
      const p = JSON.parse(r);
      state.history = Array.isArray(p.history) ? p.history.slice(0, 25) : [];
      state.favorites = Array.isArray(p.favorites) ? p.favorites : [];
      state.theme = p.theme === "light" ? "light" : "dark";
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          history: state.history,
          favorites: state.favorites,
          theme: state.theme
        })
      );
    } catch (_) {}
  }

  function applyTheme() {
    document.documentElement.setAttribute(
      "data-theme",
      state.theme === "light" ? "light" : "dark"
    );
  }

  // —— Parser (FF style: tags apply forward) ——
  function parseBio(text) {
    let html = "";
    let i = 0;
    const stack = [];

    while (i < text.length) {
      if (text[i] === "[") {
        const j = text.indexOf("]", i);
        if (j === -1) {
          html += esc(text[i]);
          i++;
          continue;
        }
        const tag = text.slice(i + 1, j);

        if (tag.startsWith("/")) {
          const name = tag.slice(1);
          if (stack.length && stack[stack.length - 1] === name) {
            stack.pop();
            html += closeTag(name);
          } else {
            html += esc(text.slice(i, j + 1));
          }
          i = j + 1;
          continue;
        }

        if (["b", "i", "u", "s", "c"].includes(tag)) {
          stack.push(tag);
          html += openTag(tag);
          i = j + 1;
          continue;
        }

        if (/^[0-9A-Fa-f]{6}$/.test(tag)) {
          stack.push("color");
          html += `<span style="color:#${tag}">`;
          i = j + 1;
          continue;
        }

        html += esc(text.slice(i, j + 1));
        i = j + 1;
      } else {
        html += esc(text[i]);
        i++;
      }
    }

    while (stack.length) html += closeTag(stack.pop());
    return html || '<span style="opacity:.35">Vacío</span>';
  }

  function openTag(t) {
    if (t === "b") return "<strong>";
    if (t === "i") return "<em>";
    if (t === "u") return "<u>";
    if (t === "s") return "<s>";
    if (t === "c") return '<span style="filter:brightness(1.15)">';
    return "";
  }

  function closeTag(t) {
    if (t === "b") return "</strong>";
    if (t === "i") return "</em>";
    if (t === "u") return "</u>";
    if (t === "s") return "</s>";
    if (t === "c" || t === "color") return "</span>";
    return "";
  }

  function countLines(text) {
    if (!text) return 0;
    // Approximate visual lines: split by \n and also soft-wrap estimate is hard;
    // Free Fire wraps, but community treats explicit newlines + length.
    // We count explicit newlines + 1, capped by content.
    const parts = text.split(/\n/);
    return Math.min(parts.length, MAX_LINES + 2);
  }

  function validate(text) {
    const issues = [];
    const stack = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === "[") {
        const j = text.indexOf("]", i);
        if (j === -1) {
          issues.push("] faltante");
          break;
        }
        const tag = text.slice(i + 1, j);
        if (tag.startsWith("/")) {
          const n = tag.slice(1);
          if (!stack.length || stack[stack.length - 1] !== n) {
            issues.push(`cierre [/${n}]`);
          } else stack.pop();
        } else if (["b", "i", "u", "s", "c"].includes(tag)) {
          stack.push(tag);
        } else if (/^[0-9A-Fa-f]{6}$/.test(tag)) {
          stack.push("color");
        }
        i = j + 1;
      } else i++;
    }
    if (stack.length) issues.push("tags abiertos");
    return issues;
  }

  // —— UI update ——
  function update() {
    const text = input.value;
    const len = text.length;
    const lines = countLines(text);

    charEl.textContent = `${len} / ${MAX}`;
    charEl.className = len > MAX ? "warning" : len > MAX - 8 ? "warning" : "";
    lineEl.textContent = `${Math.min(lines, MAX_LINES)} / ${MAX_LINES} líneas`;
    if (lines > MAX_LINES) lineEl.className = "warning";
    else lineEl.className = "";

    if (len > MAX) {
      preview.innerHTML = '<span style="color:#e07070">Límite de 50 caracteres</span>';
      badge.hidden = false;
      badge.className = "badge err";
      badge.textContent = `+${len - MAX}`;
      return;
    }

    preview.innerHTML = parseBio(text);

    const issues = validate(text);
    if (text && issues.length) {
      badge.hidden = false;
      badge.className = "badge err";
      badge.textContent = issues[0];
    } else if (text) {
      badge.hidden = false;
      badge.className = "badge";
      badge.textContent = "ok";
    } else {
      badge.hidden = true;
    }
  }

  function pushUndo() {
    const v = input.value;
    if (!state.undo.length || state.undo[state.undo.length - 1] !== v) {
      state.undo.push(v);
      if (state.undo.length > 40) state.undo.shift();
    }
  }

  function insert(text, start, end) {
    pushUndo();
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const next = before + text + after;
    if (next.length > MAX + 15) {
      toast("Demasiado largo", true);
      return;
    }
    input.value = next;
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.focus();
    update();
  }

  function insertTag(tag) {
    const s = input.selectionStart;
    const e = input.selectionEnd;
    const sel = input.value.slice(s, e);
    insert(`[${tag}]${sel}[/${tag}]`, s, e);
  }

  function insertColor(hex) {
    const s = input.selectionStart;
    const e = input.selectionEnd;
    const sel = input.value.slice(s, e) || "texto";
    insert(`[${hex}]${sel}`, s, e);
  }

  function hexToRgb(h) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function gradient(word, c1, c2) {
    if (!word) return "";
    const a = hexToRgb(c1);
    const b = hexToRgb(c2);
    const n = word.length;
    let out = "";
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      out += `[${rgbToHex(r, g, bl)}]${word[i]}`;
    }
    return out;
  }

  // —— History ——
  function addHist(code) {
    if (!code || !code.trim()) return;
    const t = code.trim();
    state.history = state.history.filter((h) => h !== t);
    state.history.unshift(t);
    if (state.history.length > 25) state.history.pop();
    save();
    if (state.histTab === "recent") renderHist();
  }

  function toggleFav(code) {
    const i = state.favorites.indexOf(code);
    if (i >= 0) {
      state.favorites.splice(i, 1);
      toast("Quitado de favoritos");
    } else {
      state.favorites.unshift(code);
      toast("Favorito");
    }
    save();
    renderHist();
  }

  // —— Build ——
  function buildColors() {
    const g = $("#colorGrid");
    if (!state.data?.colors) return;
    g.innerHTML = state.data.colors
      .map(
        (c) =>
          `<button type="button" class="color-swatch" data-hex="${c.hex}" style="background:#${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`
      )
      .join("");
  }

  function buildSymbols() {
    const g = $("#symbolsGrid");
    if (!state.data?.symbols) return;
    g.innerHTML = state.data.symbols
      .map((s) => `<button type="button" class="sym-btn" data-c="${s}">${s === "ㅤ" ? "␣" : s}</button>`)
      .join("");
  }

  function buildPresets() {
    const row = $("#gradientPresets");
    if (!state.data?.gradientPresets) return;
    row.innerHTML = state.data.gradientPresets
      .map(
        (p) =>
          `<button type="button" class="chip" data-c1="${p.c1}" data-c2="${p.c2}">${p.name}</button>`
      )
      .join("");
  }

  function renderTemplates() {
    const list = $("#templatesList");
    if (!state.data?.templates) return;
    list.innerHTML = state.data.templates
      .map(
        (t) =>
          `<button type="button" class="list-item" data-code="${esc(t.code)}">
            <span class="name">${esc(t.name)}</span>
            <span class="code">${esc(t.code)}</span>
          </button>`
      )
      .join("");
  }

  function renderHist() {
    const list = $("#historyList");
    const items = state.histTab === "favorites" ? state.favorites : state.history;
    if (!items.length) {
      list.innerHTML = `<div class="empty">${
        state.histTab === "favorites" ? "Sin favoritos" : "Sin historial"
      }</div>`;
      return;
    }
    list.innerHTML = items
      .map((code) => {
        const fav = state.favorites.includes(code);
        return `<div class="list-item" data-code="${esc(code)}">
          <span class="code" style="flex:1">${esc(code)}</span>
          <div class="actions">
            <button type="button" class="icon-btn load" title="Cargar">↩</button>
            <button type="button" class="icon-btn fav ${fav ? "on" : ""}" title="Favorito">★</button>
            <button type="button" class="icon-btn del" title="Eliminar">×</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function setPanel(name) {
    state.panel = name;
    $$(".panel").forEach((p) => p.classList.remove("active"));
    $$(`.tb[data-panel]`).forEach((b) => b.classList.remove("active"));
    const panel = $(`#panel-${name}`);
    if (panel) panel.classList.add("active");
    const btn = $(`.tb[data-panel="${name}"]`);
    if (btn) btn.classList.add("active");
  }

  // —— Events ——
  function bind() {
    input.addEventListener("input", update);
    input.addEventListener("focus", pushUndo);

    $$("[data-tag]").forEach((b) =>
      b.addEventListener("click", () => insertTag(b.dataset.tag))
    );

    $("#colorGrid").addEventListener("click", (e) => {
      const s = e.target.closest(".color-swatch");
      if (s) insertColor(s.dataset.hex);
    });

    $("#applyCustomColor").addEventListener("click", () => {
      insertColor($("#customColor").value.slice(1).toUpperCase());
    });

    $("#symbolsGrid").addEventListener("click", (e) => {
      const b = e.target.closest(".sym-btn");
      if (!b) return;
      const s = input.selectionStart;
      const en = input.selectionEnd;
      insert(b.dataset.c, s, en);
    });

    $("#applyGradientBtn").addEventListener("click", () => {
      const w = $("#gradientWord").value.trim();
      if (!w) {
        toast("Escribe una palabra", true);
        return;
      }
      const c1 = $("#gradientColor1").value.slice(1);
      const c2 = $("#gradientColor2").value.slice(1);
      const code = gradient(w, c1, c2);
      const s = input.selectionStart;
      insert(code, s, s);
      toast("Degradado listo");
    });

    $("#gradientPresets").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c || !c.dataset.c1) return;
      $("#gradientColor1").value = "#" + c.dataset.c1;
      $("#gradientColor2").value = "#" + c.dataset.c2;
    });

    $("#templatesList").addEventListener("click", (e) => {
      const item = e.target.closest(".list-item");
      if (!item) return;
      pushUndo();
      input.value = item.dataset.code;
      update();
      addHist(item.dataset.code);
      toast("Plantilla cargada");
    });

    $$(".tb[data-panel]").forEach((b) =>
      b.addEventListener("click", () => setPanel(b.dataset.panel))
    );

    $$("[data-hist]").forEach((b) =>
      b.addEventListener("click", () => {
        $$("[data-hist]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.histTab = b.dataset.hist;
        renderHist();
      })
    );

    $("#historyList").addEventListener("click", (e) => {
      const item = e.target.closest(".list-item");
      if (!item) return;
      const code = item.dataset.code;

      if (e.target.closest(".load") || e.target.classList.contains("code")) {
        pushUndo();
        input.value = code;
        update();
        toast("Cargado");
        return;
      }
      if (e.target.closest(".fav")) {
        toggleFav(code);
        return;
      }
      if (e.target.closest(".del")) {
        if (state.histTab === "favorites") {
          state.favorites = state.favorites.filter((f) => f !== code);
        } else {
          state.history = state.history.filter((h) => h !== code);
        }
        save();
        renderHist();
      }
    });

    function copy() {
      const t = input.value;
      if (!t.trim()) {
        toast("Nada que copiar", true);
        return;
      }
      if (t.length > MAX) {
        toast("Supera 50 caracteres", true);
        return;
      }
      navigator.clipboard
        .writeText(t)
        .then(() => {
          addHist(t);
          toast("Copiado");
        })
        .catch(() => toast("Error al copiar", true));
    }

    $("#copyBtn").addEventListener("click", copy);
    $("#favBtn").addEventListener("click", () => {
      const t = input.value.trim();
      if (!t) {
        toast("Escribe algo", true);
        return;
      }
      toggleFav(t);
    });

    $("#clearBtn").addEventListener("click", () => {
      if (!input.value) return;
      pushUndo();
      input.value = "";
      update();
    });

    $("#undoBtn").addEventListener("click", () => {
      if (state.undo.length < 2) {
        toast("Nada que deshacer", true);
        return;
      }
      state.undo.pop();
      input.value = state.undo[state.undo.length - 1];
      update();
    });

    input.addEventListener("keydown", (e) => {
      if (["Backspace", "Delete"].includes(e.key) || e.key.startsWith("Arrow") || e.ctrlKey || e.metaKey)
        return;
      if (input.value.length >= MAX) e.preventDefault();
    });

    $("#themeBtn").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      save();
    });

    $("#helpBtn").addEventListener("click", () => {
      $("#helpModal").hidden = false;
    });
    $$("[data-close]").forEach((el) =>
      el.addEventListener("click", () => {
        $("#helpModal").hidden = true;
      })
    );

    $("#exportBtn").addEventListener("click", () => {
      const blob = new Blob(
        [JSON.stringify({ history: state.history, favorites: state.favorites }, null, 2)],
        { type: "application/json" }
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ed-export.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Exportado");
    });

    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (Array.isArray(d.history))
            state.history = [...new Set([...d.history, ...state.history])].slice(0, 25);
          if (Array.isArray(d.favorites))
            state.favorites = [...new Set([...d.favorites, ...state.favorites])];
          save();
          renderHist();
          toast("Importado");
        } catch (_) {
          toast("JSON inválido", true);
        }
      };
      r.readAsText(f);
      e.target.value = "";
    });

    $("#clearHistBtn").addEventListener("click", () => {
      if (state.histTab === "favorites") state.favorites = [];
      else state.history = [];
      save();
      renderHist();
      toast("Vaciado");
    });
  }

  async function init() {
    load();
    applyTheme();

    try {
      const res = await fetch("./app-data.json");
      state.data = await res.json();
    } catch (_) {
      state.data = { colors: [], symbols: [], templates: [], gradientPresets: [] };
      toast("No se cargó data.json", true);
    }

    buildColors();
    buildSymbols();
    buildPresets();
    renderTemplates();
    renderHist();
    bind();
    setPanel("colors");
    update();
    pushUndo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
