/* Handover Teaching Wheel. Content comes from data.js, which the build
   generates from data/*.csv — nothing in here needs editing to add a topic. */
(function () {
"use strict";

var DATA = window.WHEEL_DATA || { systems: [], topics: [], order: [] };
var SYSTEMS = DATA.systems;
var TOPICS = DATA.topics;
var ORDER = DATA.order;
var N = TOPICS.length;

var BY_ID = new Map(TOPICS.map(function (t) { return [t.id, t]; }));
var SYS_BY_KEY = new Map(SYSTEMS.map(function (s) { return [s.key, s]; }));
var SLOT = new Map(ORDER.map(function (id, pos) { return [id, pos]; }));

/* ---------- geometry ---------- */
var SEG = N ? 360 / N : 360;
var GAP = 1.15;                      // degrees of white between segments
var CX = 210, CY = 210;
var R_OUT = 196, R_IN = 174;         // resting band
var H_OUT = 203, H_IN = 167;         // band when it is the one you landed on

/* ---------- timing ----------
   The spin runs in two phases. The first covers almost the whole distance in
   3 seconds and ends while still moving; the second creeps the last few
   segments home over 2.6 seconds, so the needle visibly picks one out. */
var SPIN_MS = 3000;
var SPIN_EASE = "cubic-bezier(.1,.62,.35,.93)";
var SETTLE_MS = 2600;
var SETTLE_EASE = "cubic-bezier(.17,.84,.3,1)";
var SETTLE_ARC = 34;                 // degrees left for the slow phase
var REVEAL_DELAY = 340;              // pause on the landed segment before the modal
var LAYER_OUT_MS = 420;

var KEY = "handover-wheel-v2";
var LEGACY_KEY = "handover-wheel-v1";

var $ = function (id) { return document.getElementById(id); };
var shell = $("shell");
var wheel = $("wheel"), card = $("card"), spinBtn = $("spinBtn");
var undoBtn = $("undoBtn"), indexBtn = $("indexBtn"), resetBtn = $("resetBtn"), fsBtn = $("fsBtn");
var indexPane = $("index"), grid = $("grid"), legend = $("legend");
var resultLayer = $("resultLayer"), resultCard = $("resultCard");
var sheetLayer = $("sheetLayer"), sheetBody = $("sheetBody");

var used = [], rotation = 0, spinning = false, memoryOnly = false, current = null;
var lastFocus = null;

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------- storage ---------- */
function clean(arr) {
  if (!Array.isArray(arr)) return [];
  var seen = new Set();
  return arr.filter(function (n) {
    if (!Number.isInteger(n) || !BY_ID.has(n) || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}
function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { used = clean(JSON.parse(raw)); return; }
    /* v1 stored zero-based positions; topic ids are one-based. */
    var legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      used = clean(JSON.parse(legacy).map(function (n) { return n + 1; }));
      save();
    }
  } catch (e) { memoryOnly = true; used = []; }
}
function save() {
  if (memoryOnly) return;
  try { localStorage.setItem(KEY, JSON.stringify(used)); } catch (e) { memoryOnly = true; }
}

/* ---------- wheel ---------- */
function pt(r, deg) {
  var a = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function band(pos, ro, ri) {
  var a0 = pos * SEG - SEG / 2 + GAP / 2, a1 = pos * SEG + SEG / 2 - GAP / 2;
  var p1 = pt(ro, a0), p2 = pt(ro, a1), p3 = pt(ri, a1), p4 = pt(ri, a0);
  return "M" + p1[0] + " " + p1[1] + " A" + ro + " " + ro + " 0 0 1 " + p2[0] + " " + p2[1] +
         " L" + p3[0] + " " + p3[1] + " A" + ri + " " + ri + " 0 0 0 " + p4[0] + " " + p4[1] + " Z";
}
function colour(t) {
  var s = SYS_BY_KEY.get(t.system);
  return s ? s.colour : "#8E8E93";
}
function buildWheel() {
  wheel.innerHTML = ORDER.map(function (id, pos) {
    var t = BY_ID.get(id);
    return '<g class="seg" id="seg' + id + '"><path d="' + band(pos, R_OUT, R_IN) +
           '" fill="' + colour(t) + '"/></g>';
  }).join("");
}
function paintWheel() {
  TOPICS.forEach(function (t) {
    var g = $("seg" + t.id);
    if (!g) return;
    g.classList.toggle("used", used.indexOf(t.id) > -1);
    var hit = current === t.id;
    g.querySelector("path").setAttribute("d",
      band(SLOT.get(t.id), hit ? H_OUT : R_OUT, hit ? H_IN : R_IN));
  });
}
function setWheel(deg, ms, ease) {
  wheel.style.transition = "transform " + ms + "ms " + ease;
  wheel.style.transform = "rotate(" + deg + "deg)";
}

/* ---------- markup ---------- */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function attr(s) { return esc(s).replace(/"/g, "&quot;"); }

function topicHtml(t, titleId) {
  var s = SYS_BY_KEY.get(t.system) || { name: "" };
  return '<article class="topic" style="--accent:' + attr(colour(t)) + '">' +
    '<div class="tag"><span class="dot"></span>No. ' + t.id + ' &middot; ' + esc(s.name) + ' &middot; ' + esc(t.theme) + '</div>' +
    '<h2' + (titleId ? ' id="' + titleId + '"' : '') + '>' + esc(t.title) + '</h2>' +
    '<dl class="beats">' +
      '<div class="beat"><dt>Principle</dt><dd>' + esc(t.principle) + '</dd></div>' +
      '<div class="beat"><dt>Rule</dt><dd>' + esc(t.rule) + '</dd></div>' +
      '<div class="beat"><dt>Trap</dt><dd>' + esc(t.trap) + '</dd></div>' +
    '</dl>' +
    '<div class="takehome"><span class="lbl">Take home</span><p>' + esc(t.takehome) + '</p></div>' +
    '<p class="source">' + esc(t.source) + '</p>' +
    '<p class="factcheck">Fact check: <a href="' + attr(t.check.url) + '" target="_blank" rel="noopener noreferrer">' + esc(t.check.label) + '</a></p>' +
  '</article>';
}

function renderCard(t) {
  shell.classList.remove("centered");
  card.innerHTML = topicHtml(t);
}
function renderDone() {
  shell.classList.remove("centered");
  card.innerHTML = '<div class="topic"><p class="allclear">All ' + N + ' delivered. Reset to start the cycle again.</p></div>';
}
function renderIdle() { shell.classList.add("centered"); card.innerHTML = ""; }

function renderLegend() {
  legend.innerHTML = SYSTEMS.map(function (s) {
    var left = TOPICS.filter(function (t) { return t.system === s.key && used.indexOf(t.id) < 0; }).length;
    return '<span class="' + (left ? "" : "empty") + '" style="--c:' + attr(s.colour) + '"><i></i>' + esc(s.name) + ' ' + left + '</span>';
  }).join("");
}
function renderIndex() {
  grid.innerHTML = ORDER.map(function (id) {
    var t = BY_ID.get(id);
    return '<button class="chip ' + (used.indexOf(id) > -1 ? "done" : "") + '" style="--c:' + attr(colour(t)) + '" data-id="' + id + '">' +
      '<span class="dot"></span><span>' + esc(t.title) + '</span></button>';
  }).join("");
}
function updateChrome() {
  $("doneCount").textContent = used.length;
  $("totalCount").textContent = N;
  undoBtn.disabled = used.length === 0;
  spinBtn.disabled = spinning || used.length >= N || N === 0;
  spinBtn.textContent = used.length >= N ? "All topics used" : (spinning ? "Spinning" : "Spin the wheel");
  paintWheel();
  renderLegend();
  if (!indexPane.hidden) renderIndex();
}

/* ---------- overlays ---------- */
function anyLayerOpen() { return !resultLayer.hidden || !sheetLayer.hidden; }

function settlePage() {
  var open = anyLayerOpen();
  document.body.classList.toggle("modal-open", open);
  shell.inert = open;
  if (!open && lastFocus) {
    var f = lastFocus;
    lastFocus = null;
    try { f.focus({ preventScroll: true }); } catch (e) { /* element is gone */ }
  }
}
function showLayer(layer, focusTarget) {
  if (!anyLayerOpen()) lastFocus = document.activeElement;
  layer.inert = false;
  layer.hidden = false;
  document.body.classList.add("modal-open");
  shell.inert = true;
  /* force a reflow so the closed transform is committed, otherwise the
     browser collapses both states into one and nothing animates */
  void layer.offsetHeight;
  layer.classList.add("is-open");
  if (focusTarget) { try { focusTarget.focus({ preventScroll: true }); } catch (e) {} }
}
function hideLayer(layer) {
  if (layer.hidden) return;
  layer.classList.remove("is-open");
  layer.inert = true;
  window.setTimeout(function () {
    layer.hidden = true;
    settlePage();
  }, reduced() ? 140 : LAYER_OUT_MS);
}

function openResult(id) {
  var t = BY_ID.get(id);
  if (!t) return;
  var s = SYS_BY_KEY.get(t.system) || { name: "" };
  resultCard.style.setProperty("--accent", colour(t));
  $("resultSystem").textContent = s.name;
  $("resultNumber").textContent = t.id;
  $("resultTheme").textContent = t.theme;
  $("resultTitle").textContent = t.title;
  showLayer(resultLayer, $("resultOpen"));
}
function openSheet(id) {
  var t = BY_ID.get(id);
  if (!t) return;
  sheetBody.innerHTML = topicHtml(t, "sheetTitle");
  sheetBody.scrollTop = 0;
  showLayer(sheetLayer, $("sheetClose"));
}
function resultToSheet() {
  if (current === null) return;
  openSheet(current);          /* open first, so focus is not handed back mid-way */
  hideLayer(resultLayer);
}

/* ---------- actions ---------- */
function deliver(id, fromWheel) {
  if (used.indexOf(id) < 0) { used.push(id); save(); }
  current = id;
  renderCard(BY_ID.get(id));
  updateChrome();
  if (!fromWheel) {
    var off = ((rotation % 360) + 360) % 360;
    rotation += (360 - off) - SLOT.get(id) * SEG;
    setWheel(rotation, reduced() ? 200 : 900, "cubic-bezier(.2,.8,.25,1)");
  }
}
function land(id) {
  spinning = false;
  deliver(id, true);
  window.setTimeout(function () { openResult(id); }, reduced() ? 0 : REVEAL_DELAY);
}
function spin() {
  if (spinning || anyLayerOpen()) return;
  var pool = TOPICS.filter(function (t) { return used.indexOf(t.id) < 0; }).map(function (t) { return t.id; });
  if (!pool.length) { renderDone(); return; }

  current = null;
  spinning = true;
  updateChrome();

  var pick = pool[Math.floor(Math.random() * pool.length)];
  var jitter = (Math.random() - 0.5) * (SEG * 0.5);
  var turns = 5 + Math.floor(Math.random() * 3);
  var off = ((rotation % 360) + 360) % 360;
  var target = rotation + turns * 360 + (360 - off) - SLOT.get(pick) * SEG + jitter;
  rotation = target;

  if (reduced()) {
    setWheel(target, 400, "ease-out");
    window.setTimeout(function () { land(pick); }, 440);
    return;
  }
  setWheel(target - SETTLE_ARC, SPIN_MS, SPIN_EASE);
  window.setTimeout(function () { setWheel(target, SETTLE_MS, SETTLE_EASE); }, SPIN_MS);
  window.setTimeout(function () { land(pick); }, SPIN_MS + SETTLE_MS + 40);
}
function undo() {
  if (!used.length || spinning) return;
  var last = used.pop();
  save();
  current = last;
  renderCard(BY_ID.get(last));
  updateChrome();
}
function reset() {
  if (spinning) return;
  if (used.length && !confirm("Clear all " + used.length + " delivered topics and start again?")) return;
  used = [];
  current = null;
  save();
  renderIdle();
  updateChrome();
}

/* ---------- wiring ---------- */
spinBtn.addEventListener("click", spin);
undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", reset);

resultCard.addEventListener("click", function (e) {
  if (e.target.closest("#resultClose")) return;
  resultToSheet();
});
$("resultClose").addEventListener("click", function () { hideLayer(resultLayer); });
$("sheetClose").addEventListener("click", function () { hideLayer(sheetLayer); });

[resultLayer, sheetLayer].forEach(function (layer) {
  layer.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-dismiss")) hideLayer(layer);
  });
});

indexBtn.addEventListener("click", function () {
  indexPane.hidden = !indexPane.hidden;
  indexBtn.textContent = indexPane.hidden ? "Browse all" : "Hide list";
  if (!indexPane.hidden) { renderIndex(); indexPane.scrollIntoView({ behavior: "smooth", block: "start" }); }
});
grid.addEventListener("click", function (e) {
  var b = e.target.closest(".chip");
  if (!b || spinning) return;
  var id = Number(b.dataset.id);
  deliver(id, false);
  openSheet(id);
});
fsBtn.addEventListener("click", function () {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});
document.addEventListener("fullscreenchange", function () {
  fsBtn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (!sheetLayer.hidden) { e.preventDefault(); hideLayer(sheetLayer); }
    else if (!resultLayer.hidden) { e.preventDefault(); hideLayer(resultLayer); }
    return;
  }
  if (anyLayerOpen() || e.target.matches("button")) return;
  if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); spin(); }
});

/* ---------- init ---------- */
load();
buildWheel();
$("wheelSvg").setAttribute("aria-label", "Wheel of " + N + " teaching topics");
if (N === 0) {
  card.innerHTML = '<div class="topic"><p class="allclear">No topics loaded. Check data.js.</p></div>';
  shell.classList.remove("centered");
} else if (used.length >= N) {
  renderDone();
} else {
  renderIdle();
}
updateChrome();
})();
