// synth.js — the whole audio side of droneloop: a four-voice drone, an fx
// chain, and a stopwatch-style looper. Plain Web Audio, no dependencies.
//
//   voices -> filter -> fuzz -> chorus -> delay -> reverb -> fxOut
//   fxOut  -> (recorder tap) and -> master mix
//   loop layers -> master mix -> compressor -> speakers
//
// Layers are recorded from fxOut (the live drone with its effects) and play
// back straight into the master mix, so they never feed back into the recorder.

export const WAVES = ["sine", "triangle", "sawtooth", "square"];
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function defaultPatch() {
  return {
    root: 45, // A2
    glide: 0.25,
    voices: [
      { on: true, wave: "sawtooth", semi: 0, detune: -6, gain: 0.5 },
      { on: true, wave: "sawtooth", semi: 0, detune: 7, gain: 0.5 },
      { on: true, wave: "triangle", semi: 7, detune: 0, gain: 0.4 },
      { on: true, wave: "sine", semi: -12, detune: 0, gain: 0.6 },
    ],
    noise: 0.03,
    filter: { cutoff: 900, res: 3 },
    lfo: { rate: 0.15, depth: 0.35 },
    drift: 0.4,
    fx: {
      fuzz: { drive: 0.25, mix: 0 },
      chorus: { rate: 0.35, depth: 0.5, mix: 0.3 },
      delay: { time: 0.45, fb: 0.5, mix: 0.25 },
      reverb: { size: 3.5, mix: 0.4 },
    },
    master: 0.6,
  };
}

export const PRESETS = {
  "open fifth": (p) => {
    p.voices = [
      { on: true, wave: "sawtooth", semi: 0, detune: -5, gain: 0.5 },
      { on: true, wave: "sawtooth", semi: 7, detune: 5, gain: 0.4 },
      { on: true, wave: "triangle", semi: 12, detune: 0, gain: 0.35 },
      { on: true, wave: "sine", semi: -12, detune: 0, gain: 0.7 },
    ];
  },
  "minor haze": (p) => {
    p.voices = [
      { on: true, wave: "triangle", semi: 0, detune: -4, gain: 0.55 },
      { on: true, wave: "sawtooth", semi: 3, detune: 4, gain: 0.3 },
      { on: true, wave: "triangle", semi: 7, detune: 0, gain: 0.4 },
      { on: true, wave: "sine", semi: -12, detune: 0, gain: 0.6 },
    ];
    p.filter = { cutoff: 700, res: 2 };
  },
  "sus cloud": (p) => {
    p.voices = [
      { on: true, wave: "sine", semi: 0, detune: 0, gain: 0.6 },
      { on: true, wave: "triangle", semi: 5, detune: 3, gain: 0.45 },
      { on: true, wave: "triangle", semi: 7, detune: -3, gain: 0.45 },
      { on: true, wave: "sine", semi: 12, detune: 0, gain: 0.3 },
    ];
    p.filter = { cutoff: 1800, res: 1 };
  },
  "fat unison": (p) => {
    p.voices = [
      { on: true, wave: "sawtooth", semi: 0, detune: -18, gain: 0.45 },
      { on: true, wave: "sawtooth", semi: 0, detune: -6, gain: 0.45 },
      { on: true, wave: "sawtooth", semi: 0, detune: 6, gain: 0.45 },
      { on: true, wave: "sawtooth", semi: 0, detune: 18, gain: 0.45 },
    ];
    p.filter = { cutoff: 500, res: 4 };
    p.fx.fuzz = { drive: 0.5, mix: 0.35 };
  },
};

export function randomPatch() {
  const p = defaultPatch();
  const r = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  p.root = 36 + Math.floor(Math.random() * 24);
  p.voices = p.voices.map(() => ({
    on: Math.random() > 0.15,
    wave: pick(WAVES),
    semi: pick([-24, -12, -7, -5, 0, 0, 0, 3, 4, 5, 7, 7, 12, 12, 19]),
    detune: Math.round(r(-20, 20)),
    gain: +r(0.25, 0.7).toFixed(2),
  }));
  p.voices[0].on = true;
  p.noise = +r(0, 0.12).toFixed(3);
  p.filter = { cutoff: Math.round(r(250, 3500)), res: +r(0.5, 8).toFixed(1) };
  p.lfo = { rate: +r(0.03, 2).toFixed(2), depth: +r(0, 0.8).toFixed(2) };
  p.drift = +r(0, 1).toFixed(2);
  p.glide = +r(0.05, 1.5).toFixed(2);
  p.fx = {
    fuzz: { drive: +r(0.1, 0.9).toFixed(2), mix: Math.random() < 0.4 ? +r(0.1, 0.6).toFixed(2) : 0 },
    chorus: { rate: +r(0.1, 2).toFixed(2), depth: +r(0.2, 0.9).toFixed(2), mix: +r(0, 0.6).toFixed(2) },
    delay: { time: +r(0.15, 1.2).toFixed(2), fb: +r(0.2, 0.75).toFixed(2), mix: +r(0, 0.5).toFixed(2) },
    reverb: { size: +r(1, 8).toFixed(1), mix: +r(0.15, 0.7).toFixed(2) },
  };
  return p;
}

// Fill in anything missing from a loaded patch (older/foreign records) with
// the defaults, and clamp the values the audio graph is sensitive to.
export function normalizePatch(raw) {
  const d = defaultPatch();
  const src = raw && typeof raw === "object" ? raw : {};
  const num = (v, lo, hi, dflt) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, +v)) : dflt);
  const p = d;
  p.root = Math.round(num(src.root, 12, 96, d.root));
  p.glide = num(src.glide, 0.01, 4, d.glide);
  p.voices = d.voices.map((dv, i) => {
    const v = (src.voices && src.voices[i]) || {};
    return {
      on: v.on === undefined ? dv.on : !!v.on,
      wave: WAVES.includes(v.wave) ? v.wave : dv.wave,
      semi: Math.round(num(v.semi, -36, 36, dv.semi)),
      detune: num(v.detune, -100, 100, dv.detune),
      gain: num(v.gain, 0, 1, dv.gain),
    };
  });
  p.noise = num(src.noise, 0, 0.5, d.noise);
  p.filter = {
    cutoff: num(src.filter?.cutoff, 60, 12000, d.filter.cutoff),
    res: num(src.filter?.res, 0.1, 18, d.filter.res),
  };
  p.lfo = { rate: num(src.lfo?.rate, 0.01, 8, d.lfo.rate), depth: num(src.lfo?.depth, 0, 1, d.lfo.depth) };
  p.drift = num(src.drift, 0, 1, d.drift);
  const f = src.fx || {};
  p.fx = {
    fuzz: { drive: num(f.fuzz?.drive, 0, 1, d.fx.fuzz.drive), mix: num(f.fuzz?.mix, 0, 1, d.fx.fuzz.mix) },
    chorus: {
      rate: num(f.chorus?.rate, 0.05, 6, d.fx.chorus.rate),
      depth: num(f.chorus?.depth, 0, 1, d.fx.chorus.depth),
      mix: num(f.chorus?.mix, 0, 1, d.fx.chorus.mix),
    },
    delay: {
      time: num(f.delay?.time, 0.02, 1.5, d.fx.delay.time),
      fb: num(f.delay?.fb, 0, 0.92, d.fx.delay.fb),
      mix: num(f.delay?.mix, 0, 1, d.fx.delay.mix),
    },
    reverb: { size: num(f.reverb?.size, 0.3, 10, d.fx.reverb.size), mix: num(f.reverb?.mix, 0, 1, d.fx.reverb.mix) },
  };
  p.master = num(src.master, 0, 1, d.master);
  return p;
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function fuzzCurve(drive) {
  const n = 1024;
  const k = 1 + drive * 40;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // asymmetric tanh so even harmonics show up — fuzz, not just clipping
    c[i] = Math.tanh(k * x + 0.15 * k * x * x) * 0.7;
  }
  return c;
}

const RECORDER_WORKLET = `
class Rec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.port.onmessage = (e) => { this.on = !!e.data; };
  }
  process(inputs) {
    const inp = inputs[0];
    if (this.on && inp && inp[0]) {
      const l = inp[0].slice();
      const r = (inp[1] || inp[0]).slice();
      this.port.postMessage({ l, r }, [l.buffer, r.buffer]);
    }
    return true;
  }
}
registerProcessor("droneloop-rec", Rec);
`;

export class Engine {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.patch = defaultPatch();
    this._reverbSize = null;
    this._fuzzDrive = null;
    this.layers = [];
    this.looper = { state: "idle", recording: null };
    this.onChange = () => {};
  }

  async start() {
    if (!this.ctx) await this._build();
    await this.ctx.resume();
    this.running = true;
    this.apply(this.patch);
  }

  async stop() {
    if (!this.ctx) return;
    this.running = false;
    await this.ctx.suspend();
  }

  async _build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const blobUrl = URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(blobUrl);

    // --- voices ---
    this.voiceBus = ctx.createGain();
    this.voices = [0, 1, 2, 3].map(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const drift = ctx.createOscillator();
      const driftGain = ctx.createGain();
      drift.frequency.value = 0.05 + Math.random() * 0.12;
      drift.connect(driftGain).connect(osc.detune);
      osc.connect(gain).connect(this.voiceBus);
      osc.start();
      drift.start();
      return { osc, gain, driftGain };
    });
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.noiseGain = ctx.createGain();
    noise.connect(this.noiseGain).connect(this.voiceBus);
    noise.start();

    // --- filter + lfo ---
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.voiceBus.connect(this.filter);
    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();
    this.lfo.connect(this.lfoGain).connect(this.filter.detune);
    this.lfo.start();

    // --- fuzz ---
    this.fuzzIn = ctx.createGain();
    this.filter.connect(this.fuzzIn);
    this.fuzzShaper = ctx.createWaveShaper();
    this.fuzzShaper.oversample = "2x";
    this.fuzzTone = ctx.createBiquadFilter();
    this.fuzzTone.type = "lowpass";
    this.fuzzTone.frequency.value = 4500;
    this.fuzzDry = ctx.createGain();
    this.fuzzWet = ctx.createGain();
    this.fuzzOut = ctx.createGain();
    this.fuzzIn.connect(this.fuzzDry).connect(this.fuzzOut);
    this.fuzzIn.connect(this.fuzzShaper).connect(this.fuzzTone).connect(this.fuzzWet).connect(this.fuzzOut);

    // --- chorus ---
    this.chIn = this.fuzzOut;
    this.chDelay = ctx.createDelay(0.1);
    this.chDelay.delayTime.value = 0.02;
    this.chLfo = ctx.createOscillator();
    this.chLfoGain = ctx.createGain();
    this.chLfo.connect(this.chLfoGain).connect(this.chDelay.delayTime);
    this.chLfo.start();
    this.chDry = ctx.createGain();
    this.chWet = ctx.createGain();
    this.chOut = ctx.createGain();
    this.chIn.connect(this.chDry).connect(this.chOut);
    this.chIn.connect(this.chDelay).connect(this.chWet).connect(this.chOut);

    // --- delay (feedback loop is darkened so repeats melt away) ---
    this.dlDelay = ctx.createDelay(2);
    this.dlFb = ctx.createGain();
    const dlTone = ctx.createBiquadFilter();
    dlTone.type = "lowpass";
    dlTone.frequency.value = 3200;
    this.dlDry = ctx.createGain();
    this.dlWet = ctx.createGain();
    this.dlOut = ctx.createGain();
    this.chOut.connect(this.dlDry).connect(this.dlOut);
    this.chOut.connect(this.dlDelay);
    this.dlDelay.connect(dlTone);
    dlTone.connect(this.dlFb).connect(this.dlDelay);
    dlTone.connect(this.dlWet).connect(this.dlOut);

    // --- reverb ---
    this.convolver = ctx.createConvolver();
    this.rvDry = ctx.createGain();
    this.rvWet = ctx.createGain();
    this.fxOut = ctx.createGain();
    this.dlOut.connect(this.rvDry).connect(this.fxOut);
    this.dlOut.connect(this.convolver).connect(this.rvWet).connect(this.fxOut);

    // --- master ---
    this.mix = ctx.createGain();
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.fxOut.connect(this.mix);
    this.mix.connect(this.master).connect(this.comp);
    this.comp.connect(this.analyser);
    this.comp.connect(ctx.destination);

    // --- recorder tap ---
    this.rec = new AudioWorkletNode(ctx, "droneloop-rec", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: "explicit",
    });
    this.fxOut.connect(this.rec);
    this.clip = null;
    this.clipNode = new AudioWorkletNode(ctx, "droneloop-rec", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: "explicit",
    });
    this.comp.connect(this.clipNode);
    this.clipNode.port.onmessage = (e) => {
      if (!this.clip) return;
      this.clip.l.push(e.data.l);
      this.clip.r.push(e.data.r);
      this.clip.frames += e.data.l.length;
    };
    this.rec.port.onmessage = (e) => {
      const r = this.looper.recording;
      if (r) {
        r.l.push(e.data.l);
        r.r.push(e.data.r);
        r.frames += e.data.l.length;
      }
    };
  }

  // Push a whole patch into the audio graph. Cheap enough to call on every
  // slider move; the two expensive pieces (fuzz curve, reverb impulse) only
  // rebuild when their own knob changed.
  apply(patch) {
    this.patch = patch;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.03) => param.setTargetAtTime(v, t, tc);
    const p = patch;

    p.voices.forEach((v, i) => {
      const n = this.voices[i];
      if (n.osc.type !== v.wave) n.osc.type = v.wave;
      set(n.osc.frequency, midiHz(p.root + v.semi), p.glide / 3);
      n.osc.detune.setTargetAtTime(v.detune, t, 0.05);
      set(n.gain.gain, v.on ? v.gain * 0.25 : 0, 0.05);
      set(n.driftGain.gain, p.drift * 25);
    });
    set(this.noiseGain.gain, p.noise * 0.5);
    set(this.filter.frequency, p.filter.cutoff);
    set(this.filter.Q, p.filter.res);
    set(this.lfo.frequency, p.lfo.rate);
    set(this.lfoGain.gain, p.lfo.depth * 1800);

    const fx = p.fx;
    if (this._fuzzDrive !== fx.fuzz.drive) {
      this._fuzzDrive = fx.fuzz.drive;
      this.fuzzShaper.curve = fuzzCurve(fx.fuzz.drive);
    }
    set(this.fuzzDry.gain, 1 - fx.fuzz.mix);
    set(this.fuzzWet.gain, fx.fuzz.mix);

    set(this.chLfo.frequency, fx.chorus.rate);
    set(this.chLfoGain.gain, fx.chorus.depth * 0.008);
    set(this.chDry.gain, 1 - fx.chorus.mix * 0.5);
    set(this.chWet.gain, fx.chorus.mix);

    set(this.dlDelay.delayTime, fx.delay.time, 0.1);
    set(this.dlFb.gain, fx.delay.fb);
    set(this.dlDry.gain, 1);
    set(this.dlWet.gain, fx.delay.mix);

    if (this._reverbSize !== fx.reverb.size) {
      this._reverbSize = fx.reverb.size;
      this.convolver.buffer = this._impulse(fx.reverb.size);
    }
    set(this.rvDry.gain, 1 - fx.reverb.mix * 0.6);
    set(this.rvWet.gain, fx.reverb.mix * 1.2);

    set(this.master.gain, p.master);
  }

  _impulse(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * seconds));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 3) * (x < 0.01 ? x * 100 : 1);
      }
    }
    return buf;
  }

  // ----- looper -----------------------------------------------------------
  // Stopwatch semantics. START begins the clock and records the drone; the
  // first LAP stops it, and that take starts looping. Every later LAP pair
  // (LAP to start a layer, LAP to close it) records one more layer. Each
  // layer's length is exactly how long you held it open, and each loops on its
  // own clock from the moment it was closed, so a 3s and a 5s layer only line
  // up again every 15s.

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get state() {
    return this.looper.state;
  }

  // length of the first layer; the main clock follows it
  get loopSeconds() {
    return this.layers.length ? this.layers[0].len : 0;
  }

  _layerPhase(l) {
    return (((this.now() - l.t0) % l.len) + l.len) % l.len;
  }

  phase() {
    return this.layers.length && this.looper.state === "looping" ? this._layerPhase(this.layers[0]) : 0;
  }

  layerPhase(i) {
    const l = this.layers[i];
    return l ? this._layerPhase(l) : 0;
  }

  _beginRecording() {
    this.looper.recording = { l: [], r: [], frames: 0, startTime: this.now() };
    this.rec.port.postMessage(true);
  }

  _takeRecording() {
    this.rec.port.postMessage(false);
    const r = this.looper.recording;
    this.looper.recording = null;
    return r;
  }

  // True while a layer is being captured (including the very first take).
  get recording() {
    return !!this.looper.recording;
  }

  elapsedRecording() {
    const r = this.looper.recording;
    return r ? this.now() - r.startTime : 0;
  }

  async lap() {
    if (!this.ctx || !this.running) return null;
    const lp = this.looper;
    if (lp.state === "idle") {
      lp.state = "timing";
      this._beginRecording();
      this.onChange();
      return { type: "start" };
    }
    if (lp.state === "timing") {
      const rec = this._takeRecording();
      lp.state = "looping";
      this._addLayer(rec);
      this.onChange();
      return { type: "loop", seconds: this.loopSeconds };
    }
    if (lp.recording) {
      const rec = this._takeRecording();
      const l = this._addLayer(rec);
      this.onChange();
      return { type: "layer", seconds: l ? l.len : 0 };
    }
    this._beginRecording();
    this.onChange();
    return { type: "arm" };
  }

  // Layers have no fixed length to fill, so there is nothing to do per frame.
  tick() {}

  _addLayer(rec) {
    const sr = this.ctx.sampleRate;
    const N = rec.frames;
    if (N < 1) {
      if (!this.layers.length) this.looper.state = "idle";
      return null;
    }
    const buf = this.ctx.createBuffer(2, N, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let w = 0;
    for (let c = 0; c < rec.l.length; c++) {
      L.set(rec.l[c], w);
      R.set(rec.r[c], w);
      w += rec.l[c].length;
    }
    const gain = this.ctx.createGain();
    gain.connect(this.mix);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
    const layer = { buf, gain, src, muted: false, level: 1, len: N / sr, t0: this.now() };
    this.layers.push(layer);
    return layer;
  }

  setLayerMuted(i, muted) {
    const l = this.layers[i];
    if (!l) return;
    l.muted = muted;
    l.gain.gain.setTargetAtTime(muted ? 0 : l.level, this.now(), 0.02);
  }

  setLayerLevel(i, level) {
    const l = this.layers[i];
    if (!l) return;
    l.level = level;
    if (!l.muted) l.gain.gain.setTargetAtTime(level, this.now(), 0.02);
  }

  _dropLayer(l) {
    try { l.src.stop(); } catch {}
    l.src.disconnect();
    l.gain.disconnect();
  }

  // Drop the newest layer (or cancel a take in progress). Dropping the last
  // one resets the stopwatch.
  undoLayer() {
    if (this.looper.recording) {
      this._takeRecording();
      if (this.looper.state === "timing") this.looper.state = "idle";
    } else {
      const l = this.layers.pop();
      if (l) this._dropLayer(l);
    }
    if (!this.layers.length) this.looper = { state: "idle", recording: null };
    this.onChange();
  }

  reset() {
    if (this.looper.recording && this.ctx) this._takeRecording();
    for (const l of this.layers) this._dropLayer(l);
    this.layers = [];
    this.looper = { state: "idle", recording: null };
    this.onChange();
  }

  // ----- clip recorder ----------------------------------------------------
  // Captures exactly what the speakers get (drone + fx + every loop layer) as
  // a stereo 16-bit WAV. Independent of the looper.

  get clipRecording() {
    return !!this.clip;
  }

  clipSeconds() {
    return this.clip ? this.now() - this.clip.startTime : 0;
  }

  startClip() {
    if (!this.ctx || this.clip) return;
    this.clip = { l: [], r: [], frames: 0, startTime: this.now() };
    this.clipNode.port.postMessage(true);
  }

  stopClip() {
    if (!this.clip) return null;
    this.clipNode.port.postMessage(false);
    const c = this.clip;
    this.clip = null;
    if (!c.frames) return null;
    return encodeWav(c, this.ctx.sampleRate);
  }
}

function encodeWav(c, sr) {
  const n = c.frames;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, t) => [...t].forEach((ch, k) => out.setUint8(o + k, ch.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 4, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 4, true);
  let o = 44;
  const s16 = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let k = 0; k < c.l.length; k++) {
    for (let i = 0; i < c.l[k].length; i++) {
      out.setInt16(o, s16(c.l[k][i]), true);
      out.setInt16(o + 2, s16(c.r[k][i]), true);
      o += 4;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}
