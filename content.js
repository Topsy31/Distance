// Content script: injected on every page. Watches for text selections,
// shows a small floating icon next to the selection, and on click asks the
// background worker to look up driving distance/time from home. UI lives
// inside a shadow root so it can't be affected by (or bleed into) the
// host page's CSS.

let enabled = true;
chrome.storage.local.get(["enabled"], (v) => {
  enabled = v.enabled !== false;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    enabled = changes.enabled.newValue !== false;
    if (!enabled) hideIcon();
  }
});

const MIN_SELECTION_LENGTH = 3;
const MAX_SELECTION_LENGTH = 200;

let host = null;
let shadow = null;
let icon = null;
let panel = null;
let lastSelectionText = "";
let lastSelectionRect = null;

function ensureRoot() {
  if (host) return;
  host = document.createElement("div");
  host.style.all = "initial";
  // Interacting with our UI (e.g. clicking the icon) shouldn't blur
  // whatever field the user was selecting text in — a blur would hide the
  // icon (see the 'blur' listener below) before the click even registers.
  host.addEventListener("mousedown", (e) => e.preventDefault());
  document.documentElement.appendChild(host);
  shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .dfh-icon {
      position: fixed;
      z-index: 2147483647;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #1a73e8;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 16px/1 system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      user-select: none;
    }
    .dfh-icon:hover { background: #1558b0; }
    .dfh-panel {
      position: fixed;
      z-index: 2147483647;
      min-width: 220px;
      max-width: 300px;
      background: #fff;
      color: #202124;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      font: 13px/1.4 system-ui, sans-serif;
      padding: 12px 14px;
    }
    .dfh-panel .dfh-title {
      font-weight: 600;
      margin-bottom: 6px;
      word-break: break-word;
    }
    .dfh-panel .dfh-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 4px;
    }
    .dfh-panel .dfh-label { color: #5f6368; }
    .dfh-panel .dfh-error { color: #d93025; }
    .dfh-panel .dfh-link {
      color: #1a73e8;
      cursor: pointer;
      text-decoration: underline;
      margin-top: 8px;
      display: inline-block;
    }
    .dfh-panel .dfh-loading { color: #5f6368; }
  `;
  shadow.appendChild(style);
}

function hideIcon() {
  if (icon) icon.remove();
  icon = null;
}

function hidePanel() {
  if (panel) panel.remove();
  panel = null;
}

function hideAll() {
  hideIcon();
  hidePanel();
}

document.addEventListener("mouseup", (e) => {
  if (host && host.contains(e.target)) return; // ignore clicks on our own UI
  setTimeout(handleSelectionChange, 0);
});

document.addEventListener("mousedown", (e) => {
  if (host && host.contains(e.target)) return;
  hidePanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideAll();
});

// window.getSelection() can't see text selected inside <input>/<textarea>
// elements (e.g. read-only-looking detail fields in admin panels) — those
// use their own selectionStart/selectionEnd model, surfaced via the
// 'select' event instead.
function getFieldSelection(el) {
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return null;
  let start, end;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    return null; // input types like number/checkbox don't support text selection
  }
  if (start == null || end == null || start === end) return null;
  return el.value.substring(start, end).trim() || null;
}

document.addEventListener(
  "select",
  (e) => {
    if (!enabled) return;
    const text = getFieldSelection(e.target);
    if (!text || text.length < MIN_SELECTION_LENGTH || text.length > MAX_SELECTION_LENGTH) {
      return;
    }
    const rect = e.target.getBoundingClientRect();
    lastSelectionText = text;
    lastSelectionRect = rect;
    showIcon(rect);
  },
  true
);

document.addEventListener(
  "blur",
  (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      hideIcon();
    }
  },
  true
);

function handleSelectionChange() {
  if (!enabled) return;

  // A text field currently owns the icon (see the 'select' listener above)
  // — don't let the empty document-level selection clobber it.
  if (getFieldSelection(document.activeElement)) return;

  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";

  if (
    !text ||
    text.length < MIN_SELECTION_LENGTH ||
    text.length > MAX_SELECTION_LENGTH ||
    selection.rangeCount === 0
  ) {
    hideIcon();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideIcon();
    return;
  }

  lastSelectionText = text;
  lastSelectionRect = rect;
  showIcon(rect);
}

function showIcon(rect) {
  ensureRoot();
  hideIcon();

  icon = document.createElement("div");
  icon.className = "dfh-icon";
  icon.title = "Distance from home";
  icon.textContent = "\u{1F697}"; // car emoji
  icon.style.top = `${Math.max(rect.top - 34, 4)}px`;
  icon.style.left = `${Math.min(rect.right + 6, window.innerWidth - 34)}px`;

  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    runLookup(lastSelectionText, lastSelectionRect);
  });

  shadow.appendChild(icon);
}

function showPanel(rect, contentEl) {
  ensureRoot();
  hidePanel();

  panel = document.createElement("div");
  panel.className = "dfh-panel";
  panel.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 120)}px`;
  panel.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  panel.appendChild(contentEl);

  shadow.appendChild(panel);
}

function isContextValid() {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

function renderStaleContextError(rect) {
  const wrap = document.createElement("div");
  const errEl = document.createElement("div");
  errEl.className = "dfh-error";
  errEl.textContent = "This extension was updated. Refresh this page to keep using it.";
  wrap.appendChild(errEl);
  showPanel(rect, wrap);
}

function runLookup(text, rect) {
  if (!isContextValid()) {
    renderStaleContextError(rect);
    return;
  }

  const loading = document.createElement("div");
  loading.className = "dfh-loading";
  loading.textContent = "Looking up route…";
  showPanel(rect, loading);

  try {
    chrome.runtime.sendMessage(
      { type: "LOOKUP_DISTANCE", text },
      (response) => {
        if (chrome.runtime.lastError) {
          renderError(rect, chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) {
          renderError(rect, response?.error || "Lookup failed.");
          return;
        }
        renderResult(rect, response.result);
      }
    );
  } catch {
    renderStaleContextError(rect);
  }
}

function renderResult(rect, result) {
  const wrap = document.createElement("div");

  const title = document.createElement("div");
  title.className = "dfh-title";
  title.textContent = result.destinationAddress;
  wrap.appendChild(title);

  const distanceRow = document.createElement("div");
  distanceRow.className = "dfh-row";
  distanceRow.innerHTML = `<span class="dfh-label">Distance</span><span>${escapeHtml(
    result.distanceText
  )}</span>`;
  wrap.appendChild(distanceRow);

  const durationRow = document.createElement("div");
  durationRow.className = "dfh-row";
  durationRow.innerHTML = `<span class="dfh-label">Driving time</span><span>${escapeHtml(
    result.durationText
  )}</span>`;
  wrap.appendChild(durationRow);

  showPanel(rect, wrap);
}

function renderError(rect, message) {
  const wrap = document.createElement("div");

  const errEl = document.createElement("div");
  errEl.className = "dfh-error";
  errEl.textContent = message;
  wrap.appendChild(errEl);

  if (/settings/i.test(message)) {
    const link = document.createElement("span");
    link.className = "dfh-link";
    link.textContent = "Open settings";
    link.addEventListener("click", () => {
      if (!isContextValid()) {
        renderStaleContextError(lastSelectionRect);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        hideAll();
      } catch {
        renderStaleContextError(lastSelectionRect);
      }
    });
    wrap.appendChild(link);
  }

  showPanel(rect, wrap);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
