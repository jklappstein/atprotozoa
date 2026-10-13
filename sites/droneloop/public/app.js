import { Engine, WAVES, NOTE_NAMES, PRESETS, defaultPatch, randomPatch, normalizePatch } from "./lib/synth.js";
import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import { resolveActor, listPatches, getPatch, savePatch, deletePatch } from "./lib/patches.js";

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};

const engine = new Engine();
let patch = defaultPatch();
let session = null;
let currentName = "";
// lap log for the current take: what was pressed, and where in the loop
let lapLog = [];

// ---------- helpers ----------
const getPath = (o, path) => path.split(".").reduce((a, k) => a[k], o);
const setPath = (o, path, v) => {
  const ks = path.split(".");
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
};
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
};
const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

function setStatus(msg, kind = "") {
  const s = $("#status");
  s.textContent = msg;
  s.className = "status " + kind;
}

// ---------- sliders ----------
// log sliders map a 0..1000 range exponentially onto [min,max]
function makeSlider({ path, label, min, max, step, log, fmt }) {
  const input = el("input", { type: "range", id: "s-" + path.replace(/\./g, "-") });
  const out = el("output");
  const toVal = (pos) => (log ? min * Math.pow(max / min, pos / 1000) : min + (pos / 1000) * (max - min));
  const toPos = (val) => (log ? (1000 * Math.log(val / min)) / Math.log(max / min) : (1000 * (val - min)) / (max - min));
  input.min = 0;
  input.max = 1000;
  input.step = 1;
  const show = (v) => (out.textContent = fmt ? fmt(v) : String(+v.toFixed(2)));
  const sync = () => {
    const v = getPath(patch, path);
    input.value = toPos(v);
    show(v);
  };
  input.addEventListener("input", () => {
    let v = toVal(+input.value);
    if (step) v = Math.round(v / step) * step;
    setPath(patch, path, v);
    show(v);
    engine.apply(patch);
  });
  const wrap = el("label", { className: "slider" }, el("span", { textContent: label }), input, out);
  return { wrap, sync };
}

const syncers = [];
function addSliders(container, specs) {
  for (const s of specs) {
    const { wrap, sync } = makeSlider(s);
    container.append(wrap);
    syncers.push(sync);
  }
}

function buildControls() {
  // root note + glide
  const rootSel = $("#root");
  for (let m = 24; m <= 72; m++) rootSel.append(el("option", { value: m, textContent: noteName(m) }));
  rootSel.addEventListener("change", () => {
    patch.root = +rootSel.value;
    engine.apply(patch);
  });
  syncers.push(() => (rootSel.value = patch.root));

  // voices
  const vbox = $("#voices");
  patch.voices.forEach((_, i) => {
    const row = el("div", { className: "voice" });
    const on = el("input", { type: "checkbox", title: "voice on/off" });
    on.addEventListener("change", () => {
      patch.voices[i].on = on.checked;
      engine.apply(patch);
    });
    const wave = el("select");
    for (const w of WAVES) wave.append(el("option", { value: w, textContent: w }));
    wave.addEventListener("change", () => {
      patch.voices[i].wave = wave.value;
      engine.apply(patch);
    });
    row.append(el("span", { className: "vnum", textContent: String(i + 1) }), on, wave);
    const sl = el("div", { className: "vsliders" });
    addSliders(sl, [
      { path: `voices.${i}.semi`, label: "pitch", min: -36, max: 36, step: 1, fmt: (v) => (v > 0 ? "+" : "") + v + " st" },
      { path: `voices.${i}.detune`, label: "detune", min: -100, max: 100, step: 1, fmt: (v) => v + "¢" },
      { path: `voices.${i}.gain`, label: "level", min: 0, max: 1 },
    ]);
    row.append(sl);
    vbox.append(row);
    syncers.push(() => {
      on.checked = patch.voices[i].on;
      wave.value = patch.voices[i].wave;
    });
  });

  addSliders($("#tone"), [
    { path: "filter.cutoff", label: "cutoff", min: 60, max: 12000, log: true, fmt: (v) => Math.round(v) + " Hz" },
    { path: "filter.res", label: "resonance", min: 0.1, max: 18, log: true },
    { path: "lfo.rate", label: "sweep rate", min: 0.01, max: 8, log: true, fmt: (v) => v.toFixed(2) + " Hz" },
    { path: "lfo.depth", label: "sweep depth", min: 0, max: 1 },
    { path: "drift", label: "drift", min: 0, max: 1 },
    { path: "glide", label: "glide", min: 0.01, max: 4, log: true, fmt: (v) => v.toFixed(2) + " s" },
    { path: "noise", label: "air", min: 0, max: 0.5 },
  ]);

  const fxBox = $("#fx");
  const groups = [
    ["fuzz", [
      { path: "fx.fuzz.drive", label: "drive", min: 0, max: 1 },
      { path: "fx.fuzz.mix", label: "mix", min: 0, max: 1 },
    ]],
    ["chorus", [
      { path: "fx.chorus.rate", label: "rate", min: 0.05, max: 6, log: true, fmt: (v) => v.toFixed(2) + " Hz" },
      { path: "fx.chorus.depth", label: "depth", min: 0, max: 1 },
      { path: "fx.chorus.mix", label: "mix", min: 0, max: 1 },
    ]],
    ["delay", [
      { path: "fx.delay.time", label: "time", min: 0.02, max: 1.5, log: true, fmt: (v) => v.toFixed(2) + " s" },
      { path: "fx.delay.fb", label: "feedback", min: 0, max: 0.92 },
      { path: "fx.delay.mix", label: "mix", min: 0, max: 1 },
    ]],
    ["reverb", [
      { path: "fx.reverb.size", label: "size", min: 0.3, max: 10, log: true, fmt: (v) => v.toFixed(1) + " s" },
      { path: "fx.reverb.mix", label: "mix", min: 0, max: 1 },
    ]],
  ];
  for (const [name, specs] of groups) {
    const g = el("div", { className: "fxgroup" }, el("h3", { textContent: name }));
    addSliders(g, specs);
    fxBox.append(g);
  }
  addSliders($("#master"), [{ path: "master", label: "master", min: 0, max: 1 }]);

  const pre = $("#presets");
  for (const name of Object.keys(PRESETS)) {
    pre.append(
      el("button", {
        type: "button",
        textContent: name,
        onclick: () => {
          const p = normalizePatch(patch);
          PRESETS[name](p);
          loadPatch(p, name);
        },
      }),
    );
  }
  pre.append(
    el("button", { type: "button", textContent: "🎲 random", onclick: () => loadPatch(randomPatch(), "random") }),
  );
}

function loadPatch(p, name) {
  patch = normalizePatch(p);
  currentName = name || "";
  syncers.forEach((f) => f());
  engine.apply(patch);
}

// ---------- power ----------
const powerBtn = $("#power");
async function togglePower() {
  try {
    if (engine.running) {
      await engine.stop();
    } else {
      await engine.start();
    }
  } catch (e) {
    setStatus("audio failed to start: " + e.message, "err");
  }
  renderPower();
}
function renderPower() {
  powerBtn.textContent = engine.running ? "■ drone off" : "▶ drone on";
  powerBtn.classList.toggle("on", engine.running);
  renderLooper();
}
powerBtn.addEventListener("click", togglePower);

// ---------- stopwatch / looper ----------
const lapBtn = $("#lap");
async function doLap() {
  if (!engine.running) {
    await togglePower();
    if (!engine.running) return;
  }
  const r = await engine.lap();
  if (!r) return;
  if (r.type === "start") lapLog = [];
  if (r.type === "loop") lapLog.push({ n: 1, at: 0, len: r.seconds, kind: "loop" });
  if (r.type === "arm") lapLog.push({ n: lapLog.length + 1, at: r.at, len: engine.loopSeconds, kind: "layer" });
  if (r.type === "layer") {
    const last = lapLog[lapLog.length - 1];
    if (last) last.early = true;
  }
  renderLooper();
}
lapBtn.addEventListener("click", doLap);
$("#undo").addEventListener("click", () => {
  if (engine.state === "idle") return;
  engine.undoLayer();
  lapLog.pop();
  renderLooper();
});
$("#reset").addEventListener("click", () => {
  engine.reset();
  lapLog = [];
  renderLooper();
});

function renderLooper() {
  const st = engine.state;
  const rec = engine.recording;
  lapBtn.textContent = st === "idle" ? "START" : st === "timing" ? "LAP" : rec ? "LAP · close layer" : "LAP · new layer";
  lapBtn.classList.toggle("rec", rec);
  $("#clockwrap").classList.toggle("rec", rec);
  $("#undo").disabled = st === "idle";
  $("#reset").disabled = st === "idle";
  $("#clockmsg").textContent =
    st === "idle"
      ? "hit START, play with the knobs, hit LAP: that stretch of time becomes the loop"
      : st === "timing"
        ? "recording… LAP sets the loop length"
        : rec
          ? "recording a layer over the loop"
          : "looping — LAP to record another layer";

  const box = $("#layers");
  box.replaceChildren();
  engine.layers.forEach((l, i) => {
    const mute = el("button", { type: "button", textContent: l.muted ? "unmute" : "mute", className: "small" });
    mute.addEventListener("click", () => {
      engine.setLayerMuted(i, !l.muted);
      renderLooper();
    });
    const vol = el("input", { type: "range", min: 0, max: 1, step: 0.01, value: l.level });
    vol.addEventListener("input", () => engine.setLayerLevel(i, +vol.value));
    const info = lapLog[i];
    const label = i === 0 ? `lap 1 · loop ${engine.loopSeconds.toFixed(2)}s` : `lap ${i + 1} · from ${(l.startPhase).toFixed(2)}s${info?.early ? " (closed early)" : ""}`;
    box.append(el("div", { className: "layer" + (l.muted ? " muted" : "") }, el("span", { textContent: label }), vol, mute));
  });
  renderSaveInfo();
}

function currentLaps() {
  return engine.state === "looping" ? { loopSeconds: +engine.loopSeconds.toFixed(3), layers: engine.layers.length } : null;
}
function renderSaveInfo() {
  const laps = currentLaps();
  $("#saveinfo").textContent = laps
    ? `saves the sound plus its lap times (${laps.loopSeconds}s loop, ${laps.layers} layer${laps.layers === 1 ? "" : "s"}). the recorded audio itself stays in this tab.`
    : "saves the sound settings (voices, tone, effects).";
}

// clock + scope animation
const scope = $("#scope");
const sctx = scope.getContext("2d");
const buf = new Float32Array(2048);
function frame() {
  engine.tick();
  const st = engine.state;
  let t = 0;
  let prog = 0;
  if (st === "timing") t = engine.elapsedRecording();
  else if (st === "looping") {
    t = engine.phase();
    prog = t / engine.loopSeconds;
  }
  $("#clock").textContent = fmtTime(t);
  $("#bar").style.width = (st === "looping" ? prog * 100 : st === "timing" ? 100 : 0) + "%";
  if (st === "looping") {
    $("#clocksub").textContent = `of ${fmtTime(engine.loopSeconds)}`;
    const recNow = engine.recording;
    if (recNow !== lapBtn.classList.contains("rec")) renderLooper();
  } else {
    $("#clocksub").textContent = st === "timing" ? "elapsed" : "stopped";
  }
  // scope
  const w = scope.width, h = scope.height;
  sctx.clearRect(0, 0, w, h);
  if (engine.analyser) {
    engine.analyser.getFloatTimeDomainData(buf);
    sctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
    sctx.lineWidth = 2;
    sctx.beginPath();
    for (let x = 0; x < w; x++) {
      const v = buf[Math.floor((x / w) * buf.length)];
      const y = h / 2 - v * h * 0.9;
      x ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    }
    sctx.stroke();
  }
  requestAnimationFrame(frame);
}

engine.onChange = renderLooper;

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input[type=text], input:not([type]), select, textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    doLap();
  }
});

// a focused button would also fire its own click on space-up; swallow it
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && !e.target.closest("input[type=text], input:not([type]), select, textarea")) e.preventDefault();
});

// ---------- patches (PDS) ----------
function patchRow(p, { mine, handle }) {
  const loops = p.laps && p.laps.loopSeconds ? ` · ${p.laps.loopSeconds}s loop, ${p.laps.layers} layer${p.laps.layers === 1 ? "" : "s"}` : "";
  const when = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "";
  const row = el("div", { className: "prow" });
  const title = el("div", { className: "ptitle" }, el("strong", { textContent: p.name || "untitled" }), el("small", { textContent: ` ${when}${loops}` }));
  const btns = el("div", { className: "pbtns" });
  btns.append(
    el("button", {
      type: "button",
      className: "small",
      textContent: "load",
      onclick: () => {
        loadPatch(p.patch, p.name);
        $("#patchname").value = p.name || "";
        setStatus(`loaded “${p.name}”`, "ok");
      },
    }),
    el("button", { type: "button", className: "small", textContent: "share", onclick: () => sharePatch(handle, p) }),
  );
  if (mine) {
    btns.append(
      el("button", {
        type: "button",
        className: "small danger",
        textContent: "delete",
        onclick: async () => {
          if (!confirm(`delete “${p.name}” from your PDS?`)) return;
          try {
            await deletePatch(session, p.rkey);
            row.remove();
            setStatus("deleted", "ok");
          } catch (e) {
            setStatus("delete failed: " + e.message, "err");
          }
        },
      }),
    );
  }
  row.append(title, btns);
  return row;
}

function shareUrl(handle, p) {
  return `https://droneloop.bisks.net/?u=${encodeURIComponent(handle)}&p=${encodeURIComponent(p.rkey)}`;
}
function sharePatch(handle, p) {
  const url = shareUrl(handle, p);
  const text = `🌀 “${p.name}” — a drone patch on droneloop`;
  const intent = `https://bsky.app/intent/compose?text=${encodeURIComponent(text + "\n" + url)}`;
  navigator.clipboard?.writeText(url).catch(() => {});
  setStatus("link copied. ", "ok");
  $("#status").append(el("a", { href: intent, target: "_blank", rel: "noopener", textContent: "post it to bluesky →" }));
}

async function showPatches(box, who, mine) {
  box.replaceChildren(el("p", { className: "dim", textContent: "loading…" }));
  try {
    const a = who.did ? who : await resolveActor(who);
    const list = await listPatches(a.pds, a.did);
    box.replaceChildren();
    if (!list.length) box.append(el("p", { className: "dim", textContent: mine ? "no saved patches yet" : `@${a.handle} has no patches` }));
    for (const p of list) box.append(patchRow(p, { mine, handle: a.handle }));
  } catch (e) {
    box.replaceChildren(el("p", { className: "err", textContent: e.message }));
  }
}

function renderAuth() {
  const out = $("#signed-out");
  const inn = $("#signed-in");
  out.hidden = !!session;
  inn.hidden = !session;
  if (session) {
    $("#who").textContent = "@" + session.handle;
    showPatches($("#mylist"), { did: session.did, pds: session.pdsUrl.replace(/\/$/, ""), handle: session.handle }, true);
  }
}

$("#loginform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = $("#handle").value.trim().replace(/^@/, "");
  if (!h) return;
  setStatus("redirecting to your PDS…");
  try {
    await login(h);
  } catch (err) {
    setStatus("sign-in failed: " + err.message, "err");
  }
});
$("#logout").addEventListener("click", async () => {
  await clearSession();
  session = null;
  renderAuth();
});

$("#saveform").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const btn = $("#savebtn");
  btn.disabled = true;
  try {
    const name = $("#patchname").value.trim() || currentName || "untitled drone";
    const saved = await savePatch(session, name, JSON.parse(JSON.stringify(patch)), currentLaps());
    currentName = saved.name;
    $("#mylist").prepend(patchRow(saved, { mine: true, handle: session.handle }));
    setStatus(`saved “${saved.name}” to your PDS`, "ok");
  } catch (err) {
    setStatus("save failed: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

$("#browseform").addEventListener("submit", (e) => {
  e.preventDefault();
  const h = $("#browsehandle").value.trim().replace(/^@/, "");
  if (h) showPatches($("#otherlist"), h, false);
});

// ?u=<handle>&p=<rkey> — a shared patch
async function loadShared() {
  const q = new URLSearchParams(location.search);
  const u = q.get("u");
  const p = q.get("p");
  if (!u || !p) return;
  try {
    const a = await resolveActor(u);
    const rec = await getPatch(a.pds, a.did, p);
    loadPatch(rec.patch, rec.name);
    $("#patchname").value = rec.name || "";
    setStatus(`loaded “${rec.name}” by @${a.handle} — hit “drone on”`, "ok");
  } catch (e) {
    setStatus(e.message, "err");
  }
}

// ---------- boot ----------
buildControls();
syncers.forEach((f) => f());
renderPower();
if (window.attachHandleTypeahead) {
  attachHandleTypeahead($("#handle"));
  attachHandleTypeahead($("#browsehandle"));
}
requestAnimationFrame(frame);
(async () => {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus(e.message, "err");
  }
  renderAuth();
  loadShared();
})();
