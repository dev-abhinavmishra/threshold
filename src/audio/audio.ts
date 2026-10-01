/**
 * Procedural audio — every sound is synthesized at runtime with WebAudio.
 * No samples, no external assets. Buses: master / music / sfx / ui / voice.
 * Also produces the caption stream (same event feeds both).
 */
import type { SoundEvent, SoundEventBus } from '../engine/events';
import type { SettingsData } from '../game/types';
import type { Vec3 } from '../engine/math';
import { v3dist } from '../engine/math';
import { Rng } from '../engine/rng';

export type CueSeverity = 'info' | 'warn' | 'danger';
export interface Caption {
  text: string;
  at: number;
  severity: CueSeverity;
}

type CueSpec = { freq: number; dur: number; type: OscillatorType; gain: number; sweep?: number; noise?: boolean };

const CUES: Record<string, CueSpec> = {
  'sweep-warn': { freq: 55, dur: 1.6, type: 'sine', gain: 0.5, sweep: 30 },
  'sweep-approach': { freq: 70, dur: 0.8, type: 'sawtooth', gain: 0.3, sweep: 90 },
  'sweep-roar': { freq: 90, dur: 1.4, type: 'sawtooth', gain: 0.55, sweep: 160, noise: true },
  'reprise-warn': { freq: 220, dur: 0.5, type: 'square', gain: 0.16, sweep: 180 },
  'reprise-approach': { freq: 240, dur: 0.4, type: 'square', gain: 0.14, sweep: 200 },
  'reprise-roar': { freq: 140, dur: 1.0, type: 'sawtooth', gain: 0.4, sweep: 60, noise: true },
  'reprise-return': { freq: 300, dur: 0.6, type: 'square', gain: 0.18, sweep: 120 },
  'redline-warn': { freq: 880, dur: 0.3, type: 'square', gain: 0.12, sweep: 660 },
  'redline-approach': { freq: 660, dur: 0.25, type: 'square', gain: 0.1 },
  'redline-roar': { freq: 440, dur: 0.9, type: 'sawtooth', gain: 0.4, sweep: 220, noise: true },
  'returner-warn': { freq: 180, dur: 1.2, type: 'triangle', gain: 0.3, sweep: 90 },
  'returner-approach': { freq: 160, dur: 0.6, type: 'triangle', gain: 0.25, sweep: 70 },
  'returner-roar': { freq: 120, dur: 1.1, type: 'sawtooth', gain: 0.45, sweep: 40, noise: true },
  'maelstrom-warn': { freq: 0.5, dur: 2.4, type: 'sine', gain: 0.4, sweep: 200 },
  'maelstrom-approach': { freq: 200, dur: 0.9, type: 'sawtooth', gain: 0.3, sweep: 420 },
  'maelstrom-roar': { freq: 300, dur: 1.5, type: 'sawtooth', gain: 0.5, sweep: 800, noise: true },
  'maelstrom-attack': { freq: 500, dur: 0.5, type: 'square', gain: 0.4, sweep: 900 },
  'witness-appear': { freq: 1000, dur: 1.8, type: 'sine', gain: 0.14, sweep: 1100 },
  'witness-drone': { freq: 980, dur: 1.2, type: 'sine', gain: 0.2 },
  'whisper-voice': { freq: 500, dur: 0.9, type: 'sine', gain: 0.14, sweep: 420 },
  'whisper-dismiss': { freq: 700, dur: 0.4, type: 'sine', gain: 0.1, sweep: 900 },
  'inkling-settle': { freq: 300, dur: 0.5, type: 'triangle', gain: 0.1 },
  'inkling-hiss': { freq: 400, dur: 0.4, type: 'sawtooth', gain: 0.16, sweep: 800, noise: true },
  'redactor-sense': { freq: 320, dur: 0.6, type: 'sine', gain: 0.1, sweep: 310 },
  'redactor-sting': { freq: 240, dur: 0.3, type: 'square', gain: 0.3, sweep: 100, noise: true },
  'echoskin-steps': { freq: 190, dur: 0.6, type: 'triangle', gain: 0.12 },
  'echoskin-step': { freq: 130, dur: 0.09, type: 'sine', gain: 0.1 },
  'echoskin-fold': { freq: 500, dur: 0.7, type: 'sine', gain: 0.12, sweep: 150 },
  'stillframe-snap': { freq: 2400, dur: 0.07, type: 'square', gain: 0.3 },
  'margin-edge': { freq: 90, dur: 1.0, type: 'triangle', gain: 0.16 },
  'margin-shift': { freq: 120, dur: 0.6, type: 'triangle', gain: 0.2, sweep: 60 },
  'hollow-wake': { freq: 80, dur: 0.8, type: 'sawtooth', gain: 0.3, sweep: 50 },
  'hollow-release': { freq: 300, dur: 0.5, type: 'sine', gain: 0.16, sweep: 500 },
  'curator-enter': { freq: 140, dur: 1.4, type: 'triangle', gain: 0.3, sweep: 100 },
  'curator-suspicious': { freq: 200, dur: 0.5, type: 'triangle', gain: 0.2 },
  'curator-investigate': { freq: 260, dur: 0.6, type: 'triangle', gain: 0.24, sweep: 200 },
  'curator-search': { freq: 230, dur: 0.8, type: 'sawtooth', gain: 0.2, sweep: 190 },
  'curator-pursue': { freq: 320, dur: 0.9, type: 'sawtooth', gain: 0.4, sweep: 400, noise: true },
  'pursuer-roar': { freq: 60, dur: 1.8, type: 'sawtooth', gain: 0.6, sweep: 30, noise: true },
  'pursuer-crash': { freq: 70, dur: 0.3, type: 'square', gain: 0.35, noise: true },
  'orrery-wake': { freq: 660, dur: 1.2, type: 'sine', gain: 0.2, sweep: 880 },
  'orrery-done': { freq: 440, dur: 2.0, type: 'sine', gain: 0.3, sweep: 220 },
  'editor-enter': { freq: 170, dur: 1.0, type: 'square', gain: 0.2, sweep: 140 },
  'editor-delete': { freq: 700, dur: 0.4, type: 'square', gain: 0.16, sweep: 350 },
  'door-open': { freq: 240, dur: 0.35, type: 'triangle', gain: 0.16, sweep: 180 },
  'door-locked': { freq: 150, dur: 0.2, type: 'square', gain: 0.2 },
  'door-unlock': { freq: 330, dur: 0.25, type: 'triangle', gain: 0.2, sweep: 440 },
  'drawer': { freq: 280, dur: 0.2, type: 'triangle', gain: 0.1 },
  'pickup': { freq: 520, dur: 0.2, type: 'sine', gain: 0.2, sweep: 700 },
  'purchase': { freq: 600, dur: 0.3, type: 'sine', gain: 0.22, sweep: 800 },
  'heal': { freq: 380, dur: 0.6, type: 'sine', gain: 0.18, sweep: 480 },
  'hide-in': { freq: 160, dur: 0.3, type: 'triangle', gain: 0.14 },
  'hide-out': { freq: 200, dur: 0.3, type: 'triangle', gain: 0.14 },
  'panic-eject': { freq: 250, dur: 0.6, type: 'sawtooth', gain: 0.3, sweep: 120 },
  'death': { freq: 90, dur: 2.0, type: 'sawtooth', gain: 0.5, sweep: 40, noise: true },
  'victory': { freq: 440, dur: 2.4, type: 'sine', gain: 0.3, sweep: 660 },
  'checkpoint': { freq: 520, dur: 0.5, type: 'sine', gain: 0.16, sweep: 660 },
  'relay': { freq: 480, dur: 0.4, type: 'square', gain: 0.16, sweep: 520 },
  'afterglow-hint': { freq: 880, dur: 0.8, type: 'sine', gain: 0.1, sweep: 990 },
  'ui-click': { freq: 700, dur: 0.06, type: 'square', gain: 0.08 },
  'ui-back': { freq: 400, dur: 0.06, type: 'square', gain: 0.08 },
  'stabilize-tick': { freq: 600, dur: 0.05, type: 'square', gain: 0.1 },
  'stabilize-good': { freq: 700, dur: 0.15, type: 'sine', gain: 0.16 },
  'stabilize-bad': { freq: 180, dur: 0.3, type: 'sawtooth', gain: 0.25, noise: true },
};

/** Adaptive music layer states. */
export type MusicMood = 'menu' | 'calm' | 'tension' | 'chase' | 'milestone' | 'under' | 'engine' | 'off';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private buses = new Map<string, GainNode>();
  private settings: SettingsData | null = null;
  private captionListeners: ((c: Caption) => void)[] = [];
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private mood: MusicMood = 'off';
  private musicStep = 0;
  private rng = new Rng(0xA4D10);
  private listener: Vec3 = { x: 0, y: 0, z: 0 };
  private listenerYaw = 0;
  private noiseBuffer: AudioBuffer | null = null;
  captionsEnabled = true;

  /** Call from a user gesture. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    for (const name of ['master', 'music', 'sfx', 'ui', 'voice']) {
      const g = this.ctx.createGain();
      g.connect(this.ctx.destination);
      this.buses.set(name, g);
    }
    this.applyVolumes();
    // shared noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  applySettings(s: SettingsData): void {
    this.settings = s;
    this.captionsEnabled = s.captions;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.settings) return;
    const s = this.settings;
    this.bus('master')!.gain.value = s.masterVolume;
    this.bus('music')!.gain.value = s.musicVolume;
    this.bus('sfx')!.gain.value = s.effectsVolume;
    this.bus('ui')!.gain.value = s.uiVolume;
    this.bus('voice')!.gain.value = s.ambienceVolume;
  }

  private bus(name: string): GainNode | null {
    return this.buses.get(name) ?? null;
  }

  setListener(pos: Vec3, yaw: number): void {
    this.listener = { ...pos };
    this.listenerYaw = yaw;
  }

  onCaption(fn: (c: Caption) => void): () => void {
    this.captionListeners.push(fn);
    return () => {
      this.captionListeners = this.captionListeners.filter((f) => f !== fn);
    };
  }

  private emitCaption(text: string, severity: CueSeverity = 'info'): void {
    if (!text || !this.captionsEnabled) return;
    const c: Caption = { text, at: performance.now(), severity };
    for (const fn of this.captionListeners) fn(c);
  }

  /** Spatial: gain scales with distance, panned by bearing vs. listener yaw. */
  private spatial(at: Vec3 | null): { gain: number; pan: number } {
    if (!at) return { gain: 1, pan: 0 };
    const d = v3dist(this.listener, at);
    const gain = Math.max(0.05, Math.min(1, 14 / (d + 2)));
    const bearing = Math.atan2(at.x - this.listener.x, at.z - this.listener.z);
    let rel = bearing - this.listenerYaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return { gain, pan: Math.sin(rel) * 0.8 };
  }

  play(cueName: string, at: Vec3 | null = null, caption = '', severity: CueSeverity = 'info', bus = 'sfx'): void {
    this.emitCaption(caption, severity);
    if (!this.ctx) return;
    const spec = CUES[cueName];
    if (!spec) return;
    const t0 = this.ctx.currentTime;
    const { gain: gAmt, pan } = this.spatial(at);
    const dest = this.bus(bus) ?? this.bus('sfx')!;
    // panner
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(dest);
    // osc voice
    const osc = this.ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.sweep), t0 + spec.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(spec.gain * gAmt, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
    osc.connect(g).connect(panner);
    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.05);
    // optional noise bed
    if (spec.noise && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(spec.gain * gAmt * 0.6, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300;
      src.connect(bp).connect(ng).connect(panner);
      src.start(t0);
      src.stop(t0 + spec.dur);
    }
  }

  /** Footstep sound from a SoundEvent. */
  soundEvent(e: SoundEvent): void {
    const at = { x: e.x, y: e.y, z: e.z };
    const isPlayer = Math.abs(e.x - this.listener.x) < 0.5 && Math.abs(e.z - this.listener.z) < 0.5;
    const base = {
      footstep: { freq: 120 + e.intensity * 60, dur: 0.08, type: 'sine' as OscillatorType, gain: 0.1 * e.intensity },
      sprint: { freq: 140 + e.intensity * 60, dur: 0.1, type: 'sine' as OscillatorType, gain: 0.16 * e.intensity },
      door: CUES['door-open'],
      drawer: CUES['drawer'],
      impact: { freq: 90, dur: 0.2, type: 'square' as OscillatorType, gain: 0.25 },
      item: CUES['pickup'],
      'puzzle-fail': CUES['stabilize-bad'],
      machine: { freq: 110, dur: 0.5, type: 'triangle' as OscillatorType, gain: 0.2 },
      distraction: { freq: 350, dur: 0.4, type: 'sine' as OscillatorType, gain: 0.2, sweep: 500 },
      'entity-cue': CUES['curator-investigate'],
      ambient: { freq: 70, dur: 1.5, type: 'sine' as OscillatorType, gain: 0.05 },
    }[e.category];
    this.emitCaption(e.caption ?? '', 'info');
    if (!this.ctx || !base) return;
    const t0 = this.ctx.currentTime;
    const { gain, pan } = this.spatial(isPlayer ? null : at);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.bus('sfx')!);
    const osc = this.ctx.createOscillator();
    osc.type = base.type;
    osc.frequency.setValueAtTime(base.freq, t0);
    if ('sweep' in base && base.sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, base.sweep), t0 + base.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(base.gain * gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + base.dur);
    osc.connect(g).connect(panner);
    osc.start(t0);
    osc.stop(t0 + base.dur + 0.05);
  }

  /** Adaptive music — a slow generative pad; intensity follows mood. */
  setMood(mood: MusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.musicStep = 0;
  }

  private startMusic(): void {
    if (this.musicTimer) return;
    this.musicTimer = setInterval(() => this.musicTick(), 400);
  }

  private musicTick(): void {
    if (!this.ctx || this.mood === 'off' || !this.bus('music')) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    // scale roots by mood
    const profiles: Record<MusicMood, { root: number; tempo: number; notes: number; gain: number; bright: number }> = {
      menu: { root: 110, tempo: 1, notes: 4, gain: 0.07, bright: 1.4 },
      calm: { root: 110, tempo: 1, notes: 3, gain: 0.05, bright: 1.2 },
      tension: { root: 98, tempo: 1.4, notes: 2, gain: 0.08, bright: 0.8 },
      chase: { root: 90, tempo: 2.2, notes: 2, gain: 0.12, bright: 0.7 },
      milestone: { root: 130, tempo: 0.8, notes: 5, gain: 0.07, bright: 1.6 },
      under: { root: 82, tempo: 0.9, notes: 3, gain: 0.07, bright: 0.6 },
      engine: { root: 100, tempo: 1.8, notes: 3, gain: 0.11, bright: 0.9 },
      off: { root: 0, tempo: 1, notes: 0, gain: 0, bright: 0 },
    };
    const p = profiles[this.mood];
    if (p.notes === 0) return;
    this.musicStep += p.tempo;
    if (this.rng.float() > 0.55) return;
    const scale = [0, 3, 5, 7, 10];
    const note = p.root * Math.pow(2, scale[Math.floor(this.rng.float() * p.notes)] / 12);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = note;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p.gain, t0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 * p.bright;
    osc.connect(lp).connect(g).connect(this.bus('music')!);
    osc.start(t0);
    osc.stop(t0 + 2.3);
    // chase adds percussion ticks
    if (this.mood === 'chase' && this.noiseBuffer && this.musicStep % 2 < 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.06, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      src.connect(hp).connect(ng).connect(this.bus('music')!);
      src.start(t0);
      src.stop(t0 + 0.1);
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}

/** Wire a SoundEventBus into the AudioManager so world sounds are audible. */
export function bindSoundBus(bus: SoundEventBus, audio: AudioManager): () => void {
  return bus.on((e) => audio.soundEvent(e));
}
