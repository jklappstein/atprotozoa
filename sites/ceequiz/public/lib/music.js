// music.js — an original gameshow theme, synthesized live with WebAudio (no
// audio files). "Buzzer Beater in C": a bouncy bass walk, a stabbing chord
// vamp and a brass-ish lead, 132 bpm, looping 4 bars. Plus a few stings.

let ctx = null, master = null, timer = null, muted = false, step = 0, nextT = 0;
const BPM = 132, STEP = 60 / BPM / 2; // eighth notes
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 32 eighth-note steps (4 bars): C  Am  F  G
const BASS = [36, 36, 43, 36, 45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43];
const LEAD = [ // midi per eighth note, 0 = rest
  76, 0, 79, 76, 72, 0, 74, 76,   81, 0, 79, 81, 76, 0, 72, 0,
  77, 0, 81, 77, 74, 0, 77, 81,   79, 0, 74, 79, 83, 0, 79, 0,
];
const CHORDS = [[60, 64, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67]];

export function init() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq, t, dur, type, vol, dest) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(t, dur, vol) {
  const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; g.gain.value = vol;
  s.connect(g); g.connect(master); s.start(t);
}

function schedule() {
  while (nextT < ctx.currentTime + 0.3) {
    const i = step % 32, t = nextT;
    tone(hz(BASS[i % 16]), t, STEP * 0.9, "triangle", 0.35);
    if (i % 2 === 0) noise(t, 0.04, 0.05); // hat
    if (i % 8 === 0 || i % 8 === 5) { tone(90, t, 0.12, "sine", 0.5); } // kick
    if (i % 8 === 4) noise(t, 0.12, 0.18); // snare
    if (i % 4 === 2) for (const m of CHORDS[Math.floor(i / 8)]) tone(hz(m), t, STEP * 0.7, "square", 0.04);
    if (LEAD[i]) {
      tone(hz(LEAD[i]), t, STEP * 1.5, "sawtooth", 0.07);
      tone(hz(LEAD[i]) * 1.005, t, STEP * 1.5, "sawtooth", 0.05);
    }
    nextT += STEP; step++;
  }
}

export function startTheme() {
  if (!ctx || timer) return;
  step = 0; nextT = ctx.currentTime + 0.05;
  schedule();
  timer = setInterval(schedule, 100);
}

export function stopTheme() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function sting(kind) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  if (kind === "buzz") { tone(220, t, 0.18, "square", 0.2); tone(330, t, 0.18, "square", 0.1); }
  else if (kind === "right") [72, 76, 79, 84].forEach((m, i) => tone(hz(m), t + i * 0.09, 0.3, "triangle", 0.3));
  else if (kind === "wrong") { tone(150, t, 0.35, "sawtooth", 0.25); tone(110, t + 0.3, 0.6, "sawtooth", 0.25); }
  else if (kind === "cameo") [67, 72, 76, 79, 84, 88].forEach((m, i) => tone(hz(m), t + i * 0.07, 0.25, "square", 0.1));
}
