/**
 * Game — the runtime orchestrator. Owns the renderer, scene, simulation
 * loop, input, entity scheduling, milestone dispatch, inventory, doors,
 * hiding/panic, death/victory, checkpoints, and the HUD snapshot that
 * React renders.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { PostGovernor } from './postGovernor';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameClock } from '../engine/clock';
import { SoundEventBus, type SoundEvent } from '../engine/events';
import { noiseCanRouse, withinRouseRadius } from '../engine/noiseRouse';
import { pointInRoom } from '../engine/doorGeo';
import { SeedStreams, Rng } from '../engine/rng';
import { v3, v3copy, v3dist, aabb, aabbContainsPoint, clamp, type Vec3, type Aabb } from '../engine/math';
import { generateRoute, type GeneratedRoute } from '../world/generator';
import { plateMaterial } from '../world/builder';
import { buildProp } from '../world/props';
import { RoomStreamer } from '../world/streamer';
import { preloadModels, modelInstance } from '../world/modelLibrary';
import { preloadFigures, riggedFigure, type RiggedFigure } from '../entities/rigged';
import { portLocalPos } from '../world/spec';
import { MAT } from '../world/materials';
import { HeldView } from './viewmodel';
import { PlayerController, type MoveInput } from '../player/controller';
import { InteractionSystem, addCrouchedDoorInteracts, type Interactable } from '../player/interaction';
import { Entity, type EntityCtx } from '../entities/base';
import { CorridorRunner, Warden } from '../entities/corridor';
import { tickFigure, statueFigure, tallFigure } from '../entities/figure';
import { Witness, Whisper, Inkling, Redactor, EchoSkin, Margin, Stillframe, Hollow, Husk, HazardField, Lurker, Porter, Groundswell, Inspector, Commissionaire } from '../entities/room';
import { AudioManager, bindSoundBus } from '../audio/audio';
import {
  IndexEncounter, CustodianEncounter, ChaseEncounter, LensHallEncounter, EngineEncounter, UnderscriptGate,
  type MilestoneEvents, Milestone,
} from '../encounters/milestones';
import { Auditor, Detective, Editor, Filer, Grafter, Hauler, Laundress, Swamper } from '../entities/setpieces';
import { Collector } from '../entities/collector';
import { Singer } from '../entities/singer';
import { Curator } from '../entities/curator';
import { Bellman } from '../entities/bellman';
import { PANIC, DIFFICULTY, ITEM_DEFS, QUALITY, PLAYER, SAFE_ROOM_TEMPLATES, DEATH_HINTS } from '../game/config';
import type {
  Difficulty, Door, EntityId, ItemId, RoomInstance, SettingsData, RunStats, Document, Socket,
} from '../game/types';
import { useGameStore, loadSettings, saveSettings, loadMeta, saveMeta, saveCheckpoint, loadCheckpoint, clearCheckpoint, type CheckpointSave } from './store';
import { DOCUMENTS } from './documents';

export interface StartOptions {
  seedText?: string;
  difficulty?: Difficulty;
  shortRun?: boolean;
  checkpoint?: CheckpointSave | null;
}

const KEY_DEFAULT = (s: SettingsData, name: string) => s.keybinds[name] ?? '';

// SAFE_ROOM_TEMPLATES lives in config.ts — shared with entities (bellman).

/** Ear-to-the-seam tells: entity scheduled beyond the door → what leaks
 *  through the crack. Each borrows that entity's own audio vocabulary. */
const LISTEN_CUES: Record<EntityId, { sfx: string; text: string; sev?: 'info' | 'warn' | 'danger' }> = {
  sweep: { sfx: 'floor-creak', text: '[floor-creaks crawling — it is coming]', sev: 'danger' },
  reprise: { sfx: 'floor-creak', text: '[floor-creaks crawling — again]', sev: 'danger' },
  witness: { sfx: 'witness-drone', text: '[a held breath — it waits to be seen]', sev: 'warn' },
  whisper: { sfx: 'whisper-voice', text: '[whispering — your name, or near enough]', sev: 'warn' },
  inkling: { sfx: 'inkling-hiss', text: '[small feet — too many of them]', sev: 'warn' },
  redactor: { sfx: 'redactor-sense', text: '[a page turning itself]', sev: 'warn' },
  echoskin: { sfx: 'echoskin-steps', text: '[your own footsteps, answering late]', sev: 'danger' },
  maelstrom: { sfx: 'steam-hiss', text: '[a held chord, straining]', sev: 'danger' },
  pursuer: { sfx: 'husk-foot', text: '[heavy steps — pacing]', sev: 'danger' },
  curator: { sfx: 'curator-search', text: '[ticking — it is hunting]', sev: 'danger' },
  hollow: { sfx: 'hollow-wake', text: '[a hum, pitched wrong]', sev: 'danger' },
  husk: { sfx: 'husk-stir', text: '[a low rattle — something remembers being people]', sev: 'warn' },
  redline: { sfx: 'printer-jam', text: '[a machine trying to start]', sev: 'warn' },
  stillframe: { sfx: 'stillframe-snap', text: '[the air held stiff]', sev: 'warn' },
  returner: { sfx: 'echoskin-step', text: '[steps that know the way back]', sev: 'danger' },
  margin: { sfx: 'margin-rustle', text: '[a rustle along the far wall]', sev: 'warn' },
  editor: { sfx: 'editor-delete', text: '[paper being unwritten]', sev: 'warn' },
  grafter: { sfx: 'grafter-grind', text: '[something grafting itself together]', sev: 'warn' },
  hazard: { sfx: 'steam-hiss', text: '[a hiss, steady]', sev: 'warn' },
  orrery: { sfx: 'orrery-wake', text: '[gears — a slow count]', sev: 'warn' },
  lurker: { sfx: 'lurker-stalk', text: '[cloth dragged over boards]', sev: 'danger' },
  behemoth: { sfx: 'behemoth-thud', text: '[something vast shifting]', sev: 'danger' },
  collector: { sfx: 'collector-rattle', text: '[a rattle — counting]', sev: 'warn' },
  singer: { sfx: 'singer-steps', text: '[humming — a lullaby]', sev: 'danger' },
  bellman: { sfx: 'knock', text: '[a knock — courteous, in no hurry]', sev: 'warn' },
  porter: { sfx: 'hide-creak', text: '[drips of dust — something clings overhead]', sev: 'warn' },
  warden: { sfx: 'footstep', text: '[measured pacing — something walks its post]', sev: 'warn' },
  groundswell: { sfx: 'floor-creak', text: '[the boards groan — a swell in the floor]', sev: 'warn' },
  inspector: { sfx: 'collector-rattle', text: '[a latch being tried — one after another]', sev: 'warn' },
  commissionaire: { sfx: 'collector-rattle', text: '[a gloved hand raps the frame — a door held shut]', sev: 'warn' },
  swamper: { sfx: 'puddle-splash', text: '[water, and something in it — slow]', sev: 'warn' },
  hauler: { sfx: 'impact', text: '[a sledge scrape — cargo on the move]', sev: 'warn' },
  laundress: { sfx: 'puddle-splash', text: '[wash, wring — somebody works the drain]', sev: 'warn' },
  auditor: { sfx: 'chalk-mark', text: '[a ledger page turns — the clerk is in]', sev: 'warn' },
  detective: { sfx: 'chalk-mark', text: '[a register opens — the house is checking names]', sev: 'warn' },
  filer: { sfx: 'chalk-mark', text: '[an index drawer slides — the index is in]', sev: 'warn' },
};

/** Agitated variants once a scheduled encounter has been roused by noise —
 *  used by the rouse tell and by ear-to-the-seam listens. */
/** Pipe-family props a flooded room's water can be drained through. */
const DRAIN_PROPS = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);

const ROUSED_LINES: Record<EntityId, string> = {
  sweep: '[floor-creaks racing the boards — it heard you]',
  reprise: '[the creaking doubles back — it heard you]',
  witness: '[the held breath sharpens — it knows]',
  whisper: '[the whispering quickens — your name, faster]',
  inkling: '[small feet scatter, then gather — alert]',
  redactor: '[pages riffling — it marked the noise]',
  echoskin: '[your footsteps, answering at a run]',
  maelstrom: '[the held chord snaps taut]',
  pursuer: '[heavy steps — already at the door]',
  curator: '[ticking, quick — it has your measure]',
  hollow: '[the hum swells to meet you]',
  husk: '[the rattle quickens — it remembers hunger]',
  redline: '[the machine catches — running now]',
  stillframe: '[the stiff air tightens — posed]',
  returner: '[steps — turned toward you]',
  margin: '[the rustle skitters to the seam]',
  editor: '[paper tearing — it found your page]',
  grafter: '[grinding faster — assembling]',
  hazard: '[the hiss steadies — breathing]',
  orrery: '[gears spin up — counting faster]',
  lurker: '[cloth drag, quick — crossing the room]',
  behemoth: '[the vast thing shifts — floor settling]',
  collector: '[the rattle rattles — counting louder]',
  singer: '[the lullaby lifts — it heard you coming]',
  bellman: '[the knocking quickens — it knows you are there]',
  porter: '[the dust pours — it is already above the door]',
  warden: '[the whistle again — it is still on station]',
  groundswell: '[the floor rolls again]',
  inspector: '[the keys again — it is still checking]',
  commissionaire: '[the rap again — it is still holding the doors]',
  swamper: '[the flood stirs — it is still in the water]',
  hauler: '[the scrape halts — it heard you]',
  laundress: '[the wringing stops — the drain is watched]',
  auditor: '[scratch of nib — the tally is open]',
  detective: '[the house phone — a name repeated quietly]',
  filer: '[a card drawn from the drawer — your name on it]',
};

// Fresh wall scrawl — jagged red caps on transparent, cached per text.
const wallWordTextures = new Map<string, THREE.Texture>();
function wallWordMaterial(text: string): THREE.MeshBasicMaterial | null {
  if (typeof document === 'undefined') return null;
  let tex = wallWordTextures.get(text);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 112;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 112);
    ctx.fillStyle = '#6e1410';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // jittered glyphs — smeared, hand-drawn feel
    let x = 256 - (text.length * 22) / 2;
    for (const ch of text) {
      const jy = (Math.sin(x * 3.7) * 5), jx = (Math.cos(x * 2.3) * 3);
      const w = ch === ' ' ? 14 : 22;
      ctx.save();
      ctx.translate(x + w / 2 + jx, 56 + jy);
      ctx.rotate(Math.sin(x) * 0.06);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += w;
    }
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    wallWordTextures.set(text, tex);
  }
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

// Vertical alpha ramp for the torch beam: bright at the apex (torch head),
// gone before the far end — shared by both nested cones.
let beamTex: THREE.Texture | null = null;
function beamTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!beamTex) {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#7a7a7a');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 128);
    beamTex = new THREE.CanvasTexture(cv);
  }
  return beamTex;
}

export class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private worldGroup!: THREE.Group;
  private entityGroup!: THREE.Group;
  private clock = new GameClock();
  private audio = new AudioManager();
  private sound = new SoundEventBus();
  private player = new PlayerController();
  private interaction = new InteractionSystem();
  private streamer!: RoomStreamer;
  private route: GeneratedRoute | null = null;
  private streams!: SeedStreams;
  private raf = 0;
  private settings: SettingsData;
  private keys = new Set<string>();
  private currentRoom = 0;
  private space: 'main' | 'under' = 'main';
  private rats: { obj: THREE.Object3D; ax: number; az: number; bx: number; bz: number; t: number; dur: number; floor: number }[] = [];
  private moths: { obj: THREE.Object3D; cx: number; cy: number; cz: number; r: number; t: number; dur: number; speed: number; phase: number }[] = [];
  private entities: Entity[] = [];
  private spawned = new Set<string>();
  private milestones = new Map<number, Milestone>();
  private hazard = new HazardField();
  private canvas: HTMLCanvasElement;
  private input = { interactPressed: false };
  private inventory: { id: ItemId; count: number }[] = [];
  private activeSlot = 0;
  private lampOn = false;
  private pulseLampOn = false;
  private imprints = 0;
  private marginalia = 0;
  private stats!: RunStats;
  private documents: Document[] = [];
  private meta = loadMeta();
  private deathCount: Record<string, number> = {};
  /** Source of the most recent kill — read by playtest/debug harnesses. */
  lastDeathCause = '';
  private checkpoint: CheckpointSave | null = null;
  private stabilize: { needle: number; dir: number; zone: number; timeLeft: number; failT: number } | null = null;
  private roomBounds = new Map<number, Aabb>();
  private lastHud = 0;
  private nextAmbience = 8;
  private relic: THREE.Object3D | null = null;
  private relicRoom = -1;
  private relicSeen = true;
  private relicHome: THREE.Vector3 | null = null;
  private mirrorFig: THREE.Object3D | null = null;
  private mirrorRig: RiggedFigure | null = null;
  private mirrorFigRoom = -1;
  private mirrorSeenT = 0;
  private mirrorLostT = 0;
  private cornerFig: THREE.Object3D | null = null;
  private cornerRig: RiggedFigure | null = null;
  private cornerFigRoom = -1;
  private cornerSeenT = 0;
  private cornerT = 0;
  // The Shade — an apparition with no body of its own; only the torch beam
  // gives it opacity. It never moves; walking into it dispels it.
  private shadeFig: THREE.Object3D | null = null;
  private shadeRig: RiggedFigure | null = null;
  private shadeRoom = -1;
  private shadeSeenT = 0;
  private shadeRevealed = false;
  private shadeMats: THREE.MeshStandardMaterial[] = [];
  private nextBreath = 0;
  private hemi: THREE.HemisphereLight | null = null;
  private lightning = 0;
  private nextThunder = 30;
  private pendingBlackout: { room: number; at: number } | null = null;
  private pendingDoorOpen: { room: number; at: number } | null = null;
  private hauntedRooms = new Set<number>();
  private nextMusicBox = 45;
  private nextKnock = 40;
  private nextSteps = 55;
  private nextPiano = 70;
  private blackedOut = new Set<number>();
  /** Rooms already dimmed by an arrival flicker — the house flinches once
   *  per room, so stacked encounters can't compound into darkness. */
  private dimmedRooms = new Set<number>();
  private doorStates = new Map<string, { t: number; opening: boolean }>();
  /** Staged arrival captions for a fresh run (lobby cold-open). */
  private arrival: { t: number; text: string; sev: 'info' | 'warn' | 'danger'; fired: boolean }[] = [];
  private dread = 0;
  /** Keyhole peek: camera pushed through a locked door for a look beyond. */
  private peek: { eye: Vec3; dir: Vec3; t: number; baseFov: number; doorKey: string; eyeDone: boolean } | null = null;
  private peekEyeDecisions = new Map<string, boolean>();
  private peekEyeUsed = new Set<string>();
  private peekEye: THREE.Group | null = null;
  private composer: EffectComposer | null = null;
  private grainUniforms: Record<string, THREE.IUniform> | null = null;
  private ssaoPass: SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private postGov: PostGovernor | null = null;
  private basePixelRatio = 1;
  private lastFrameNow = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.initThree();
    preloadModels();
    preloadFigures();
    this.bindInput();
    bindSoundBus(this.sound, this.audio);
    this.sound.on((ev) => this.onRouseNoise(ev));
    this.audio.applySettings(this.settings);
    this.audio.onCaption((c) => {
      const st = useGameStore.getState();
      const subtitles = [...st.hud.subtitles.slice(-4), { text: c.text, severity: c.severity, key: c.at }];
      useGameStore.setState({ hud: { ...st.hud, subtitles } });
    });
    useGameStore.setState({ settings: this.settings, documents: this.loadDocs() });
  }

  /* ==================== three setup ==================== */

  private initThree(): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    const q = QUALITY[this.settings.quality];
    this.basePixelRatio = Math.min(window.devicePixelRatio, q.pixelRatioCap);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (q.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene = new THREE.Scene();
    // Neutral room environment gives PBR materials something to reflect —
    // without it metallic/dark GLTF props collapse to flat black. Kept dim
    // so the horror lighting stays dominant.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, q.fogDensity);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.08, 80);
    this.worldGroup = new THREE.Group();
    this.entityGroup = new THREE.Group();
    this.scene.add(this.worldGroup, this.entityGroup);
    const amb = new THREE.AmbientLight(0x35302a, 0.72);
    this.scene.add(amb);
    this.hemi = new THREE.HemisphereLight(0x3a342c, 0x0c0a08, 0.7);
    this.scene.add(this.hemi);
    this.streamer = new RoomStreamer(this.worldGroup, this.settings.quality, 0);
    this.initPost();
    window.addEventListener('resize', this.onResize);
  }

  private initPost(): void {
    const q = this.settings.quality;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q === 'high') {
      const ssao = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      ssao.kernelRadius = 0.6;
      ssao.minDistance = 0.002;
      ssao.maxDistance = 0.12;
      composer.addPass(ssao);
      this.ssaoPass = ssao;
    }
    if (q !== 'low') {
      const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.42, 0.93);
      composer.addPass(bloom);
      this.bloomPass = bloom;
    }
    // Adaptive post budget — the governor sheds SSAO → bloom → render
    // scale under sustained low fps and restores with hysteresis.
    this.postGov = new PostGovernor({
      setSsao: (on) => { if (this.ssaoPass) this.ssaoPass.enabled = on; },
      setBloom: (on) => { if (this.bloomPass) this.bloomPass.enabled = on; },
      setScale: (mul) => {
        this.renderer.setPixelRatio(this.basePixelRatio * mul);
        this.composer?.setPixelRatio(this.renderer.getPixelRatio());
        this.composer?.setSize(window.innerWidth, window.innerHeight);
      },
    }, { hasSsao: !!this.ssaoPass, hasBloom: !!this.bloomPass });
    this.grainUniforms = {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrain: { value: q === 'low' ? 0.028 : 0.04 },
      uVig: { value: 0.34 },
    };
    const grain = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: this.grainUniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime * 43.0) * 43758.5453); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          c.rgb += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
          vec2 d = vUv - 0.5;
          c.rgb *= 1.0 - uVig * smoothstep(0.28, 0.72, dot(d, d) * 2.0);
          gl_FragColor = c;
        }`,
    }), 'tDiffuse');
    composer.addPass(grain);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private renderFrame(): void {
    if (this.composer) {
      if (this.grainUniforms) this.grainUniforms.uTime.value = performance.now() / 1000;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
  };

  /* ==================== input ==================== */

  private keyFor(action: string): string {
    return KEY_DEFAULT(this.settings, action);
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && useGameStore.getState().phase === 'PLAYING') {
        this.pause();
      }
    });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const st = useGameStore.getState();
    if (st.phase === 'PLAYING' || st.phase === 'MINIGAME') {
      this.keys.add(e.code);
      if (e.code === this.keyFor('interact')) this.input.interactPressed = true;
      if (e.code === this.keyFor('useItem')) this.useLamp();
      if (e.code === this.keyFor('toss')) this.tossPebble();
      for (let i = 0; i < 4; i++) {
        if (e.code === this.keyFor(`slot${i + 1}`)) {
          this.activeSlot = i;
          this.useActiveSlot();
        }
      }
      if (e.code === 'Escape') this.pause();
    } else if (st.phase === 'PAUSED' && e.code === 'Escape') {
      this.resume();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    if (useGameStore.getState().phase !== 'PLAYING' && useGameStore.getState().phase !== 'MINIGAME') return;
    this.player.look(e.movementX, e.movementY, this.settings);
  };

  private onMouseDown = (): void => {
    const st = useGameStore.getState();
    if ((st.phase === 'PLAYING' || st.phase === 'MINIGAME') && document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  };

  private readMoveInput(): MoveInput {
    const k = this.keys;
    return {
      forward: (k.has(this.keyFor('forward')) ? 1 : 0) - (k.has(this.keyFor('back')) ? 1 : 0),
      strafe: (k.has(this.keyFor('right')) ? 1 : 0) - (k.has(this.keyFor('left')) ? 1 : 0),
      sprint: k.has(this.keyFor('sprint')),
      crouch: k.has(this.keyFor('crouch')),
    };
  }

  /* ==================== run lifecycle ==================== */

  startRun(opts: StartOptions = {}): void {
    const seedText = opts.seedText?.trim() || this.randomSeed();
    const cp = opts.checkpoint ?? null;
    const difficulty = cp?.difficulty ?? opts.difficulty ?? useGameStore.getState().difficulty;
    const shortRun = opts.shortRun ?? difficulty === 'qa';

    this.route = generateRoute({ seedText, difficulty, shortRun, includeUnderscript: true });
    this.streams = new SeedStreams(seedText);
    this.entities.forEach((e) => e.dispose());
    this.entities = [];
    for (const l of this.lures) this.entityGroup.remove(l.mesh);
    this.lures = [];
    for (const cr of this.crossers) this.entityGroup.remove(cr.mesh);
    this.crossers = [];
    if (this.bookDrop?.mesh) this.entityGroup.remove(this.bookDrop.mesh);
    this.bookDrop = null;
    this.echoRoom = -1;
    this.echoQueue.length = 0;
    this.phoneRing = null;
    for (const fig of this.brokerFigs.values()) this.entityGroup.remove(fig);
    this.brokerFigs.clear();
    this.clearRats();
    this.spawned.clear();
    this.milestones.clear();
    this.doorStates.clear();
    this.hazard = new HazardField();
    for (const r of [...this.route.rooms, ...this.route.underRooms]) this.hazard.addFromRoom(r);
    this.roomBounds.clear();
    // the prop layer holds no memory across runs — every one-time
    // arm/fire decision resets so a retry or reseed replays honestly
    this.hauntedRooms.clear();
    this.blackedOut.clear();
    this.dimmedRooms.clear();
    this.pendingBlackout = null;
    this.pendingDoorOpen = null;
    this.peek = null;
    this.peekEyeDecisions.clear();
    this.peekEyeUsed.clear();
    this.chalkMarks.clear();
    this.visitedRooms.clear();
    this.listenAcc.clear();
    this.listenDone.clear();
    this.doorKnocks.length = 0;
    this.relabeled.clear();
    this.wallWords.clear();
    this.tenantMoved.clear();
    this.deepSeen.clear();
    this.playedPianos.clear();
    this.litTVs.clear();
    this.woundClocks.clear();
    this.crackedVents.clear();
    this.litHearths.clear();
    this.answeredPhones.clear();
    this.listenedDoors.clear();
    this.rousedSpawned.clear();
    this.playerTrail.length = 0;
    this.lastCrumbSet = false;
    this.armedTraps.clear();
    this.snappedTraps.clear();
    this.priedTraps.clear();
    this.liveTraps = [];
    this.liveTickProps = [];
    this.pipeTickNext = 0;
    this.liveBooks = [];
    this.bookNear = 0;
    this.bookTarget = null;
    this.bookWhispered.clear();
    this.liveRugs = [];
    this.armedRugs.clear();
    this.slippedRugs.clear();
    this.livePuddles = [];
    this.armedPuddles.clear();
    this.slippedPuddles.clear();
    this.ranWashers.clear();
    this.finishedWashers.clear();
    this.emptiedWashers.clear();
    this.runningWashers = [];
    this.activeWashKeys.clear();
    this.printedPages.clear();
    this.typedKeys.clear();
    this.lookedWindows.clear();
    this.drunkCoolers.clear();
    this.satSeats.clear();
    this.resting = null;
    this.luggageArmed.clear();
    this.luggageSpawned.clear();
    this.luggageNoticed.clear();
    this.creakyRooms.clear();
    this.nextCreak = 0;
    this.creakParity = 0;
    this.statuePlans.clear();
    this.coffinOpened = false;
    this.liveChandeliers = [];
    this.armedChandeliers.clear();
    this.droppedChandeliers.clear();
    this.warnedChandeliers.clear();
    this.pendingChanDrop = null;
    this.camObjs.clear();
    this.camTicked.clear();
    this.dynamicInteractables = [];
    this.inventory = cp ? cp.inventory.map((i) => ({ ...i })) : [];
    this.imprints = cp?.imprints ?? 0;
    this.marginalia = cp?.marginalia ?? 0;
    this.lampOn = false;
    this.pulseLampOn = false;
    this.wardArmed = false;
    this.space = cp?.inUnderscript ? 'under' : 'main';
    this.streamer.setSpace(this.space);
    this.streamer.clear();
    this.stats = cp?.stats ? { ...cp.stats, entityEncounters: { ...cp.stats.entityEncounters } } : {
      startedAt: Date.now(), endedAt: 0, deaths: 0, retries: 0, roomsVisited: 0,
      imprintsEarned: 0, marginaliaEarned: 0, entityEncounters: {},
      underscriptDeepest: 0, underscriptCompleted: false, victory: false,
    };
    this.stabilize = null;

    // Player spawn
    this.player = new PlayerController();
    const startIdx = cp ? (cp.inUnderscript ? cp.underIndex : cp.roomIndex) : 0;
    const rooms = this.activeRooms();
    const spawn = rooms[Math.min(startIdx, rooms.length - 1)] ?? rooms[0];
    this.player.teleport(spawn.entryPos.x, 0, spawn.entryPos.z, Math.atan2(spawn.exitPos.x - spawn.entryPos.x, spawn.exitPos.z - spawn.entryPos.z));
    if (cp) this.player.health = cp.health;
    this.currentRoom = startIdx;

    // milestones
    this.setupMilestones();

    // checkpoint at spawn
    this.checkpoint = cp ?? this.makeCheckpoint(startIdx);
    if (this.checkpoint) saveCheckpoint(this.checkpoint);

    this.audio.init();
    this.audio.setMood(this.space === 'under' ? 'under' : 'calm');
    // Cold-open: staged arrival captions establish the house and the goal
    // before anything threatens the player.
    this.arrival = !cp && startIdx === 0 ? [
      { t: 1.5, text: `[The Meridian. You don't remember checking in.]`, sev: 'info', fired: false },
      { t: 7, text: `[Sign the register at the counter.]`, sev: 'info', fired: false },
      { t: 15, text: `[Door 100 — The Engine. The ledger says that is where you belong.]`, sev: 'warn', fired: false },
    ] : [];
    this.clock.start();
    useGameStore.setState({
      phase: 'PLAYING', paused: false, deathInfo: null, victoryInfo: null, shopOpen: false,
      hud: { ...useGameStore.getState().hud, seedText, roomLabel: spawn.label, roomIndex: startIdx, floor: this.space, inUnderscript: this.space === 'under' },
    });
    void this.canvas.requestPointerLock();
  }

  private randomSeed(): string {
    const words = ['sable', 'marble', 'ink', 'vault', 'wax', 'ledger', 'ash', 'cord', 'bell', 'spine', 'gilt', 'moth'];
    const r = new Rng((Math.random() * 0xffffffff) >>> 0);
    return `${r.pick(words)}-${r.pick(words)}-${r.int(100, 999)}`;
  }

  private activeRooms(): RoomInstance[] {
    if (!this.route) return [];
    return this.space === 'under' ? this.route.underRooms : this.route.rooms;
  }

  private setupMilestones(): void {
    const rooms = this.route!.rooms;
    const events: MilestoneEvents = {
      ctx: () => this.entityCtx(),
      spawnEntity: (e) => this.spawnEntity(e),
      cue: (n, at, cap, sev) => this.cue(n, at, cap, sev),
      unlockMainDoor: (room) => {
        for (const d of room.doors) if (d.isMainRoute) d.locked = false;
        const nxt = this.route!.rooms[room.index + 1];
        if (nxt) for (const d of nxt.doors) if (d.isMainRoute) d.locked = false;
      },
      openExit: (room) => {
        for (const d of room.doors) if (d.isMainRoute) d.locked = false;
      },
      enterUnderscript: () => this.enterUnderscript(),
      exitUnderscript: () => this.exitUnderscript(),
      victory: () => this.victory(),
      giveItem: (item, n = 1) => this.giveItem(item as ItemId, n),
      spendImprints: (n) => {
        if (this.imprints >= n) { this.imprints -= n; return true; }
        return false;
      },
      hasItem: (id) => this.inventory.some((i) => i.id === id && i.count > 0),
    };
    for (const r of rooms) {
      switch (r.templateId) {
        case 'ms-index':
          this.milestones.set(r.index, new IndexEncounter(r, events, this.streams.seedHash));
          break;
        case 'ms-custodian':
          this.milestones.set(r.index, new CustodianEncounter(r, events));
          this.populateShop(r);
          break;
        case 'ms-lens-hall':
          this.milestones.set(r.index, new LensHallEncounter(r, events));
          break;
        case 'ms-engine':
          this.milestones.set(r.index, new EngineEncounter(r, events, this.streams.seedHash));
          break;
        case 'ms-chase1':
          this.milestones.set(r.index, new ChaseEncounter(r, events, r.index, Math.min(r.index + 3, rooms.length - 1), () => this.activeRooms()));
          break;
        case 'ms-chase2':
          this.milestones.set(r.index, new ChaseEncounter(r, events, r.index, Math.min(r.index + 4, rooms.length - 1), () => this.activeRooms()));
          break;
        case 'ms-under-entrance':
          this.milestones.set(r.index, new UnderscriptGate(r, events));
          break;
      }
    }
    for (const r of this.route!.underRooms) {
      if (r.templateId === 'u-lobby') this.populateBroker(r);
    }
  }

  /** The Broker trades for marginalia — the subfloor's own economy. */
  private populateBroker(room: RoomInstance): void {
    const rng = this.streams.roomStream('loot', room.index + 733);
    const stock: { id: ItemId; price: number }[] = [
      { id: 'tonic', price: rng.int(14, 22) },
      { id: 'bandage', price: rng.int(10, 16) },
      { id: 'feltWrap', price: rng.int(18, 28) },
      { id: 'latchpick', price: rng.int(24, 34) },
      { id: 'windAlarm', price: rng.int(28, 40) },
      { id: 'doorChock', price: rng.int(8, 14) },
    ];
    // seeded pick of 2
    const first = rng.int(0, stock.length - 1);
    let second = rng.int(0, stock.length - 2);
    if (second >= first) second++;
    const picks = [stock[first], stock[second]];
    let slot = 0;
    for (const sock of room.sockets) {
      if (sock.meta.broker !== undefined && slot < picks.length) {
        sock.meta.brokerItem = picks[slot].id;
        sock.meta.brokerPrice = picks[slot].price;
        slot++;
      }
    }
  }

  private populateShop(room: RoomInstance): void {
    // Seeded stock: the Custodian's wares differ run to run — a shuffled
    // subset of the full pool, so repeat visits read as different shelves.
    const pool: { id: ItemId; price: number }[] = [
      { id: 'sparkFlash', price: 60 },
      { id: 'bandage', price: 25 },
      { id: 'latchpick', price: 50 },
      { id: 'windAlarm', price: 55 },
      { id: 'wardSeal', price: 90 },
      { id: 'doorChock', price: 12 },
    ];
    const rng = this.streams.roomStream('loot', room.index + 377);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const stock = pool.slice(0, rng.int(3, 5));
    let slot = 0;
    for (const sock of room.sockets) {
      if (sock.meta.shop !== undefined) {
        if (slot < stock.length) {
          sock.meta.shopItem = stock[slot].id;
          sock.meta.price = stock[slot].price;
          slot++;
        } else {
          // unstocked pedestal — the shelf is bare this run
          sock.meta.taken = true;
        }
      }
    }
    useGameStore.setState({ shopItems: stock.map((s, i) => ({ ...s, slot: i, sold: false })) });
  }

  /* ==================== entity context ==================== */

  private entityCtx(): EntityCtx {
    const clock = this.clock;
    return {
      player: this.player,
      rooms: this.activeRooms(),
      currentRoomIndex: this.currentRoom,
      sound: this.sound,
      streams: this.streams,
      get now() { return clock.time; },
      seed: this.streams.stream('entity').int(0, 0x7fffffff),
      cue: (name, at, caption, opts) => this.cue(name, at, caption, opts?.severity),
      damagePlayer: (a, src, hint) => this.damagePlayer(a, src, hint),
      killPlayer: (src, hint) => this.killPlayer(src, hint),
      addEntityMesh: (o) => this.entityGroup.add(o),
      removeEntityMesh: (o) => this.entityGroup.remove(o),
      flickerRoom: (i, mode) => this.flickerRoom(i, mode),
      spawnAt: (i) => {
        const r = this.activeRooms()[i];
        return r ? v3(r.origin.x, 0, r.origin.z) : v3();
      },
      playerTrail: this.playerTrail,
      difficulty: useGameStore.getState().difficulty,
      accessibility: {
        reducedMotion: this.settings.reducedMotion,
        captions: this.settings.captions,
        minigameAssist: this.settings.minigameAssist,
      },
      gameState: () => useGameStore.getState().phase,
      duckTone: (s, l) => this.audio.duckRoomTone(s, l),
      addInteractable: (it) => {
        this.dynamicInteractables.push(it);
        this.interaction.add(it);
      },
      removeInteractable: (id) => {
        this.dynamicInteractables = this.dynamicInteractables.filter((x) => x.id !== id);
        this.interaction.interactables = this.interaction.interactables.filter((x) => x.id !== id);
      },
      nearestThreat: (exclude) => {
        let best: { d: number; p: import('../engine/math').Vec3 } | null = null;
        for (const e of this.entities) {
          if (e === exclude || e.state === 'done') continue;
          const tp = e.threatPos();
          if (!tp) continue;
          const d = Math.hypot(tp.x - this.player.pos.x, tp.z - this.player.pos.z);
          if (!best || d < best.d) best = { d, p: tp };
        }
        return best;
      },
      purse: () => this.imprints,
      isRoomDrained: (i) => this.drainedRooms.has(`${this.space}:${i}`),
      claimsOwed: () => this.unpaidTheft,
      heldOwed: () => this.unpaidHeld,
      trailOwed: () => this.paperTrail,
      hazardEvidence: (key, x, z, r) => {
        // The Warden smells fresh kills; the dumber rubble chases ghosts —
        // OLD sign still pulls a grafter (a spent-wire room is free bait),
        // and only it bothers with weak sign (the ash a rubbed wrap leaves).
        // Wipes (a scrubbed floor's shadow) show only to warden keys and are
        // never marked read — a wiped floor stays wiped, so the zone keeps
        // poisoning that hunter's reads permanently.
        // And sign goes cold: a mark older than ~6 minutes has dried —
        // the warden stops believing it (the grafter still chases the cold
        // trail; its whole diet is ghosts).
        const staleOk = key.startsWith('grafter:');
        const wardenOk = key.startsWith('warden:');
        const cold = this.clock.time - 360;
        const out = this.hazard.evidence.filter((e) => (staleOk || !e.old) && (staleOk || !e.weak)
          && (wardenOk || !e.wiped)
          && (staleOk || e.wiped || e.t >= cold)
          && (e.wiped || !e.readBy.includes(key))
          && Math.hypot(e.pos.x - x, e.pos.z - z) < r);
        for (const e of out) if (!e.wiped) e.readBy.push(key);
        return out;
      },
    };
  }

  /** Interactable points registered by living entities (e.g. the
   *  Collector's toll) — re-applied after every stream rebuild. */
  private dynamicInteractables: import('../player/interaction').Interactable[] = [];

  /** The Auditor's tally — each marginalia claim drawn, sledge pick, and
   *  basket steal below is pilferage the under's clerks can read. Settled
   *  at an auditor's desk; refused, it walks. */
  private unpaidTheft = 0;

  /** The Detective's register — each imprint claim drawn on the main
   *  route is a debt the house keeps. Settled at his desk; walking out
   *  owed puts your face on the wire. */
  private unpaidHeld = 0;

  /** The Filer's consult ledger — each paid read of the under's own
   *  paper (work order, crew board, claim register) is a question the
   *  index logs. Squared at her station; carrying questions into her
   *  room puts your name on a card. */
  private paperTrail = 0;

  private spawnEntity(e: Entity): void {
    e.spawn(this.entityCtx());
    this.entities.push(e);
    this.stats.entityEncounters[e.id] = (this.stats.entityEncounters[e.id] ?? 0) + 1;
    // Afterglow: repeat-death hint
    if ((this.deathCount[e.id] ?? 0) >= 2) {
      this.cue('afterglow-hint', null, `[the Afterglow marks: ${e.id} — check your archive]`, 'warn');
    }
  }

  /** Spawn an entity by tuning-table id — shared by the scheduler and debug panel. */
  spawnById(id: string, passes?: number): void {
    switch (id) {
      case 'sweep': this.spawnEntity(new CorridorRunner('sweep')); break;
      case 'reprise': this.spawnEntity(new CorridorRunner('reprise', { passes: passes ?? 2 })); break;
      case 'maelstrom': this.spawnEntity(new CorridorRunner('maelstrom', { maelstrom: true })); break;
      case 'redline': this.spawnEntity(new CorridorRunner('redline', { redline: true })); break;
      case 'returner': this.spawnEntity(new CorridorRunner('returner', { fromAhead: true })); break;
      case 'witness': this.spawnEntity(new Witness()); break;
      case 'whisper': this.spawnEntity(new Whisper()); break;
      case 'inkling': this.spawnEntity(new Inkling()); break;
      case 'redactor': this.spawnEntity(new Redactor()); break;
      case 'echoskin': this.spawnEntity(new EchoSkin()); break;
      case 'margin': this.spawnEntity(new Margin()); break;
      case 'stillframe': this.spawnEntity(new Stillframe()); break;
      case 'husk': this.spawnEntity(new Husk()); break;
      case 'lurker': this.spawnEntity(new Lurker()); break;
      case 'behemoth': this.spawnEntity(new CorridorRunner('behemoth', { behemoth: true, passes: 2 })); break;
      case 'editor': this.spawnEntity(new Editor()); break;
      case 'grafter': this.spawnEntity(new Grafter()); break;
      // The Swamper: drowned thing that lies in flooded halls and hears splashes.
      case 'swamper': this.spawnEntity(new Swamper()); break;
      // The Hauler: a salvage-drag drudge — the sledge is a moving loot source.
      case 'hauler': this.spawnEntity(new Hauler()); break;
      // The Laundress: works a flooded drain and fouls it — the crank is hers.
      case 'laundress': this.spawnEntity(new Laundress()); break;
      // The Auditor: reads the theft tally, walks his ledger after debtors.
      // The Detective: reads the held-property register, phones ahead about debtors.
      case 'detective': this.spawnEntity(new Detective()); break;
      case 'auditor': this.spawnEntity(new Auditor()); break;
      case 'filer': this.spawnEntity(new Filer()); break;
      case 'collector': this.spawnEntity(new Collector()); break;
      case 'singer': this.spawnEntity(new Singer()); break;
      // The Bellman: a stalker that follows your own trail through the hotel.
      case 'bellman': this.spawnEntity(new Bellman()); break;
      // The Porter: lintel ambusher — the counterplay is looking UP.
      case 'porter': this.spawnEntity(new Porter()); break;
      // The Warden: corridor patrol — whistle + charge on sight.
      case 'warden': this.spawnEntity(new Warden()); break;
      // The Groundswell: the room itself heaves — sidestep the travelling hump.
      case 'groundswell': this.spawnEntity(new Groundswell()); break;
      // The Inspector: walks the room testing every hiding spot.
      case 'inspector': this.spawnEntity(new Inspector()); break;
      // The Commissionaire: holds the doors — cross its blind arc or bait it.
      case 'commissionaire': this.spawnEntity(new Commissionaire()); break;
      // Ambient Curator: post-Index it walks the deep stacks — scheduled only
      // in records/gallery/unlit threat-tier rooms (see ENTITY_TUNING.curator).
      case 'curator': this.spawnEntity(new Curator()); break;
      case 'pursuer': case 'hazard': break; // milestone-triggered only
      default: break;
    }
  }

  /** Dev-only godmode flag — gates damagePlayer. */
  godMode = false;

  private cue(name: string, at: Vec3 | null, caption: string, severity: 'info' | 'warn' | 'danger' = 'info'): void {
    this.audio.play(name, at, caption, severity);
  }

  /** Ear-to-the-seam: probe through the leaf for an honest report on the
   *  room beyond — scheduled entities get their own audible tell, darkness
   *  and safe landings read differently, and walls with nothing behind them
   *  (false doors, dead plaster) report dead air. */
  private listenedDoors = new Set<string>();
  /** Door leaves the player is crouch-bracing — held while they stay close. */
  private bracedDoors: RoomInstance['doors'] = [];
  private listenThrough(door: Door): { sfx: string; text: string; sev?: 'info' | 'warn' | 'danger' } {
    if (door.openT > 0.4) return { sfx: 'floor-creak', text: '[the door hangs open — you can just look]' };
    if (door.falseDoor) return { sfx: 'floor-creak', text: '[dead air — plaster, and nothing behind it]', sev: 'warn' };
    if (door.deep) return { sfx: 'margin-edge', text: '[a draught, far too cold — a breath held]', sev: 'warn' };
    const target = this.roomBeyondDoor(door);
    if (!target) return { sfx: 'floor-creak', text: '[dead air — nothing behind it]' };
    const sched = target.scheduled[0];
    if (sched) {
      const base = LISTEN_CUES[sched.entity] ?? { sfx: 'floor-creak', text: '[something moves beyond]', sev: 'warn' as const };
      return sched.roused
        ? { sfx: base.sfx, text: ROUSED_LINES[sched.entity] ?? '[pacing — it heard you]', sev: 'danger' as const }
        : base;
    }
    if (SAFE_ROOM_TEMPLATES.has(target.templateId)) return { sfx: 'fire-crackle', text: '[still air — a resting place]' };
    if (target.darkRoom) return { sfx: 'hollow-wake', text: '[stale air — dark beyond]', sev: 'warn' };
    return { sfx: 'floor-creak', text: '[nothing moves]' };
  }

  /** Doors that already pre-spawned their roused encounters (one-shot). */
  private rousedSpawned = new Set<string>();
  /** Rolling breadcrumbs of where the player has walked (~1.15m apart,
   *  capped at the last 160 — roughly the last 3-4 rooms of travel). */
  private playerTrail: Vec3[] = [];
  private lastCrumb = v3();
  private lastCrumbSet = false;

  /** Loud-noise rouse: a loud enough player-side event near a closed door
   *  wakes whatever is scheduled beyond it. The door shudders, the thing
   *  inside answers with its own tell, listens thereafter report agitation,
   *  and the encounter pre-spawns the moment the leaf opens. */
  private onRouseNoise(ev: SoundEvent): void {
    if (!noiseCanRouse(ev) || this.space !== 'main') return;
    const cur = this.activeRooms()[this.currentRoom];
    if (!cur) return;
    const rooms = this.activeRooms();
    // Check every built room's doors — the door to the next room is owned
    // by *that* room (door-i-in), not the one the player stands in.
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (!r) continue;
      for (const d of r.doors) {
        if (d.openT > 0.4 || d.opening || d.falseDoor || d.deep) continue;
        if (!withinRouseRadius(ev, d.pos.x, d.pos.z)) continue;
        const beyond = this.roomBeyondDoor(d);
        if (!beyond || beyond === cur) continue;
        let fired = false;
        for (const sch of beyond.scheduled) {
          if (sch.roused) continue;
          sch.roused = true;
          fired = true;
        }
        if (!fired) continue;
        const ent = beyond.scheduled[0].entity;
        const pos = { x: d.pos.x, y: 1.2, z: d.pos.z };
        this.cue(LISTEN_CUES[ent]?.sfx ?? 'floor-creak', pos,
          ROUSED_LINES[ent] ?? '[something stirs beyond]', 'warn');
        // The leaf rattles in its frame — visible tell while it runs.
        this.doorTry = { id: d.id, pos: d.pos, at: this.clock.time, until: this.clock.time + 1.1, rung: true };
        // Other listeners (the Curator) hear it stir too.
        this.sound.emit({ ...pos, intensity: 0.3, category: 'entity-cue', caption: '', source: ent });
      }
    }
  }

  /** Pre-spawn scheduled encounters through a roused door as it opens —
   *  the entity is already live before the player crosses the threshold. */
  private spawnRousedThrough(d: Door): void {
    const beyond = this.roomBeyondDoor(d);
    if (!beyond) return;
    for (const sch of beyond.scheduled) {
      if (!sch.roused) continue;
      const key = `${this.space}-${sch.entity}-${sch.triggerRoom}-${sch.seed}`;
      if (this.spawned.has(key)) continue;
      this.spawned.add(key);
      this.spawnById(sch.entity, sch.passes);
    }
  }

  /** The room on the far side of a door: probe both directions along the
   *  leaf normal and take the room that contains the far point. */
  private roomBeyondDoor(door: Door): RoomInstance | null {
    const nx = Math.sin(door.yaw), nz = Math.cos(door.yaw);
    const cur = this.activeRooms()[this.currentRoom];
    for (const s of [1, -1]) {
      const x = door.pos.x + nx * 1.7 * s, z = door.pos.z + nz * 1.7 * s;
      for (const room of this.activeRooms()) {
        if (room === cur || !room.spec) continue;
        const dx = x - room.origin.x, dz = z - room.origin.z;
        const c = Math.cos(room.yaw), sy = Math.sin(room.yaw);
        const lx = dx * c - dz * sy, lz = dx * sy + dz * c;
        if (Math.abs(lx) <= room.spec.width / 2 + 0.8 && Math.abs(lz) <= room.spec.depth / 2 + 0.8) return room;
      }
    }
    return null;
  }

  private flickerRoom(roomIndex: number, mode: 'sweep' | 'reprise' | 'dim' | 'break'): void {
    const built = this.streamer.get(roomIndex);
    if (!built) return;
    for (const l of built.lights) {
      if (mode === 'break') {
        l.userData.flicker = false;
        l.userData.baseIntensity = 0;
        l.intensity = 0;
        // No lampMesh write needed: the ambient loop's dead branch drops
        // every paired fixture's emissive next frame.
      } else {
        // Flicker/dim writes ride on baseIntensity — the per-frame ambient
        // loop recomputes l.intensity from it every frame, so writing
        // intensity directly would be stomped within a frame.
        const base = (l.userData.baseIntensity as number) ?? l.intensity;
        let f = 0;
        const iv = setInterval(() => {
          l.userData.baseIntensity = f++ % 2 ? base * 0.15 : base;
          if (f > (this.settings.reducedFlashes ? 2 : 8)) {
            clearInterval(iv);
            l.userData.baseIntensity = mode === 'dim' ? base * 0.5 : base;
          }
        }, 70);
      }
    }
    // 'break' persists for the run: the room stays dead if the player
    // backtracks through it (blackedOut gates the ambient flicker loop).
    if (mode === 'break') this.blackedOut.add(roomIndex);
  }

  /* ==================== interactions ==================== */

  /** Push the view through the keyhole: freeze the body, drive the camera
   *  half a metre past the door plane, hold, retract. Look stays live. */
  private startPeek(it: Interactable): void {
    const p = this.player;
    if (p.dead || p.hiddenSpot || this.peek) return;
    const eye = v3();
    p.eyePos(eye);
    const dir = v3();
    p.lookDir(dir);
    dir.y = 0;
    const dl = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= dl; dir.z /= dl;
    this.peek = { eye, dir, t: 0, baseFov: this.camera.fov, doorKey: it.id, eyeDone: false };
    p.frozen = true;
    this.camera.fov = this.camera.fov * 0.8;
    this.camera.updateProjectionMatrix();
    this.cue('door-peek', it.pos, '[through the keyhole]', 'info');
  }

  private updatePeek(dt: number): void {
    const pk = this.peek;
    if (!pk) return;
    if (this.player.dead || this.player.hiddenSpot || this.player.protection === 'hidden') {
      this.endPeek();
      return;
    }
    pk.t += dt;
    // depth: 0.8s in, 1.8s hold, 0.8s out
    const depth = pk.t < 0.8 ? (pk.t / 0.8) * 0.55
      : pk.t < 2.6 ? 0.55
      : pk.t < 3.4 ? (1 - (pk.t - 2.6) / 0.8) * 0.55
      : -1;
    if (depth < 0) { this.endPeek(); return; }
    this.camera.position.set(
      pk.eye.x + pk.dir.x * depth,
      pk.eye.y - 0.15,
      pk.eye.z + pk.dir.z * depth,
    );
    // once through the hole, the far side may already be occupied — the eye
    // is seeded per door and only ever answers a peek once
    if (pk.t >= 0.9 && !pk.eyeDone) {
      pk.eyeDone = true;
      if (!this.peekEyeDecisions.has(pk.doorKey)) {
        const h = [...pk.doorKey].reduce((s, c) => s + c.charCodeAt(0), 0);
        this.peekEyeDecisions.set(pk.doorKey, this.streams.roomStream('scare', this.currentRoom * 677 + h).bool(0.24));
      }
      if (this.peekEyeDecisions.get(pk.doorKey) && !this.peekEyeUsed.has(pk.doorKey)) {
        this.peekEyeUsed.add(pk.doorKey);
        const at = { x: pk.eye.x + pk.dir.x * 0.66, y: pk.eye.y - 0.06, z: pk.eye.z + pk.dir.z * 0.66 };
        const g = new THREE.Group();
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xd8d4c8, emissive: 0x8a8478, emissiveIntensity: 0.5 }));
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
        pupil.position.set(0, 0, -0.026);
        g.add(white, pupil);
        g.position.set(at.x, at.y, at.z);
        g.lookAt(pk.eye.x, pk.eye.y, pk.eye.z);
        this.scene.add(g);
        this.peekEye = g;
        this.audio.play('whisper-voice', at, '[an eye, close — it sees you seeing it]', 'danger');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.3, category: 'entity-cue', caption: '' });
        this.player.panic = Math.min(1, this.player.panic + 0.14);
      }
    }
  }

  private endPeek(): void {
    if (!this.peek) return;
    this.player.frozen = false;
    this.camera.fov = this.peek.baseFov;
    this.camera.updateProjectionMatrix();
    this.peek = null;
    if (this.peekEye) {
      this.scene.remove(this.peekEye);
      this.peekEye = null;
    }
  }

  private rebuildInteractables(): void {
    this.interaction.clear();
    const rooms = this.activeRooms();
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (r) this.interaction.addRoomInteractables(r);
    }
    if (this.player.hiddenSpot) {
      this.interaction.add({
        kind: 'exitHide', id: 'exit-hide', pos: this.player.hiddenSpot.exitPos,
        prompt: 'Leave hiding', data: this.player.hiddenSpot, enabled: true, priority: 5,
      });
    }
    // Entity-registered points (the Collector's toll) survive rebuilds.
    for (const it of this.dynamicInteractables) this.interaction.add(it);
    // Cut the seal — an armed paper wire is a quiet thing you can cut;
    // under live floodwater the wire only shows itself to a wader
    // crouched low enough to feel for it.
    for (const hz of this.hazard.snares) {
      if (!hz.armed) continue;
      const rm = rooms.find((r) => r.index === hz.room) ?? this.route?.branchRooms.find((r) => r.index === hz.room);
      if (!rm) continue;
      const submerged = !!rm.flooded && !this.drainedRooms.has(`${this.space}:${rm.index}`);
      if (submerged && !this.player.crouching) continue;
      const dx = hz.pos.x - this.player.pos.x, dz = hz.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 4.6 * 4.6) continue;
      this.interaction.add({
        kind: 'snip', id: `snip-${this.space}:${rm.index}:${Math.round(hz.pos.x * 7)}x${Math.round(hz.pos.z * 7)}`,
        pos: { x: hz.pos.x, y: 0.06, z: hz.pos.z },
        prompt: submerged ? 'Feel for the wire — cut it' : 'Cut the seal',
        holdTime: 1.4, enabled: true, priority: 2,
        data: { room: rm.index, sx: hz.pos.x, sz: hz.pos.z },
      });
    }
    // Bleed the line — a live steam fitting can be bled quiet at the
    // valve; the blast stops, the corridor calms.
    for (const st of this.hazard.steams) {
      if (st.dead) continue;
      const dx = st.pos.x - this.player.pos.x, dz = st.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 4.4 * 4.4) continue;
      this.interaction.add({
        kind: 'bleed', id: `bleed-${this.space}:${st.room}:${Math.round(st.pos.x * 7)}x${Math.round(st.pos.z * 7)}`,
        pos: { x: st.pos.x, y: 0.4, z: st.pos.z },
        prompt: 'Bleed the line',
        holdTime: 1.6, enabled: true, priority: 2,
        data: { room: st.room, sx: st.pos.x, sz: st.pos.z },
      });
    }
    // Crouched at a wired drawer: 'Coax the latch' — kneel to work the
    // bitten latch slow and free (the standing prompt shows the tell).
    if (this.player.crouching) {
      const roomIdxs = new Set<number>();
      const allBuilt = this.streamer.builtIndices
        .map((i) => this.activeRooms().find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i))
        .filter((r): r is NonNullable<typeof r> => !!r);
      for (const room of allBuilt) {
        if (roomIdxs.has(room.index)) continue;
        roomIdxs.add(room.index);
      for (const sock of room?.sockets ?? []) {
        if (sock.kind !== 'drawer' || sock.meta.wired !== true || sock.meta.opened === true) continue;
        const dx = sock.pos.x - this.player.pos.x, dz = sock.pos.z - this.player.pos.z;
        if (dx * dx + dz * dz > 2.4 * 2.4) continue;
        this.interaction.add({
          kind: 'coax', id: `coax-${this.space}:${room.index}-${Math.round(sock.pos.x * 7)}x${Math.round(sock.pos.z * 7)}`,
          pos: { x: sock.pos.x, y: 0.4, z: sock.pos.z },
          prompt: 'Coax the latch',
          holdTime: 1.4, enabled: true, priority: 3,
          data: sock,
        });
      }
      }
    }
    // Crouched on bare floor with a wrap: 'Forge the sign' — rub a scuff
    // that smells like fresh work to anything that reads the boards.
    if (this.player.crouching
      && this.inventory.some((i) => i.id === 'feltWrap' && i.count > 0)
      && !this.hazard.evidence.some((e) => e.room === this.currentRoom
        && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 1.4)) {
      this.interaction.add({
        kind: 'forge', id: `forge-${this.space}:${this.currentRoom}`,
        pos: { x: this.player.pos.x, y: 0.3, z: this.player.pos.z },
        prompt: 'Forge the sign — felt wrap',
        holdTime: 1.6, enabled: true, priority: 1,
        data: { room: this.currentRoom },
      });
    }
    // Crouched at fresh sign: 'Scrub the sign' — a felt wrap rubbed over
    // the mark erases what a hunter could read. Quiet AND clean.
    if (this.player.crouching) {
      for (const ev of this.hazard.evidence) {
        if (ev.wiped) continue; // a wiped floor is not sign — nothing to rub
        const dx = ev.pos.x - this.player.pos.x, dz = ev.pos.z - this.player.pos.z;
        if (dx * dx + dz * dz > 2.6 * 2.6) continue;
        this.interaction.add({
          kind: 'scrub', id: `scrub-${this.space}:${ev.room}:${Math.round(ev.pos.x * 7)}x${Math.round(ev.pos.z * 7)}`,
          pos: { x: ev.pos.x, y: 0.4, z: ev.pos.z },
          prompt: this.inventory.some((i) => i.id === 'feltWrap' && i.count > 0)
            ? 'Scrub the sign — felt wrap'
            : 'Scrub the sign (needs a felt wrap)',
          holdTime: 1.8, enabled: true, priority: 3,
          data: ev,
        });
      }
    }
    // Crouched at a door: keyhole-peek on locked leaves, ear-to-the-seam
    // beside any closed one (see addCrouchedDoorInteracts).
    // Standing at a live belt-wheel: 'Chock the blades' — a door chock
    // dropped in the wheel stills it quiet (and leaves readable sign).
    for (const f of this.hazard.fans) {
      if (f.dead || !this.streamer.builtIndices.includes(f.room)) continue;
      const dx = f.pos.x - this.player.pos.x, dz = f.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 2.6 * 2.6) continue;
      this.interaction.add({
        kind: 'chock', id: `chock-${this.space}:${f.room}:${Math.round(f.pos.x * 7)}x${Math.round(f.pos.z * 7)}`,
        pos: { x: f.pos.x, y: 1.15, z: f.pos.z },
        prompt: this.inventory.some((i) => i.id === 'doorChock' && i.count > 0)
          ? 'Chock the blades — door chock'
          : 'Chock the blades (needs a door chock)',
        holdTime: 1.2, enabled: true, priority: 4,
        data: f,
      });
    }
    // Beside a hauler's sledge: 'Pick the sledge' — pilfer the moving load.
    for (const ent of this.entities) {
      if (ent.id !== 'hauler' || ent.state === 'done') continue;
      const h = ent as unknown as { sledgePos: Vec3; lampPos: Vec3; lampLit: boolean; stock: number; roomIdx: number };
      if (!this.streamer.builtIndices.includes(h.roomIdx)) continue;
      const dx = h.sledgePos.x - this.player.pos.x, dz = h.sledgePos.z - this.player.pos.z;
      if (h.stock > 0 && dx * dx + dz * dz <= 1.9 * 1.9) {
        this.interaction.add({
          kind: 'pick', id: `pick-${this.space}:${h.roomIdx}`,
          pos: { x: h.sledgePos.x, y: 0.4, z: h.sledgePos.z },
          prompt: 'Pick the sledge',
          holdTime: 0.9, enabled: true, priority: 3,
          data: ent as unknown as Record<string, unknown>,
        });
      }
      // its work-lamp is a separate lift — the drag goes dark for it
      if (h.lampLit) {
        const lx = h.lampPos.x - this.player.pos.x, lz = h.lampPos.z - this.player.pos.z;
        if (lx * lx + lz * lz <= 1.9 * 1.9) {
          this.interaction.add({
            kind: 'strip', id: `strip-${this.space}:${h.roomIdx}`,
            pos: { x: h.lampPos.x, y: 0.75, z: h.lampPos.z },
            prompt: 'Strip the lamp',
            holdTime: 1.1, enabled: true, priority: 3,
            data: ent as unknown as Record<string, unknown>,
          });
        }
      }
    }
    // Beside the filer's courier: 'Cut the runner' — tear the message
    // mid-delivery and the word dies with it.
    for (const ent of this.entities) {
      if (ent.id !== 'filer' || ent.state === 'done') continue;
      const f = ent as unknown as { runnerOut: boolean; runnerPos: Vec3 };
      if (!f.runnerOut) continue;
      const dx = f.runnerPos.x - this.player.pos.x, dz = f.runnerPos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 1.9 * 1.9) continue;
      this.interaction.add({
        kind: 'cutWord', id: `cutWord-${this.space}:filer`,
        pos: { x: f.runnerPos.x, y: 0.9, z: f.runnerPos.z },
        prompt: 'Cut the runner',
        holdTime: 1.0, enabled: true, priority: 3,
        data: ent as unknown as Record<string, unknown>,
      });
    }
    // While the laundress sniffs a splash: 'Search the wash' on her basin.
    for (const ent of this.entities) {
      if (ent.id !== 'laundress' || ent.state !== 'engage') continue;
      const w = ent as unknown as { drainPos: Vec3; guarding: boolean; basketFull: boolean; spawnRoomIdx?: number };
      if (w.guarding || !w.basketFull) continue;
      const dx = w.drainPos.x - this.player.pos.x, dz = w.drainPos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 1.9 * 1.9) continue;
      this.interaction.add({
        kind: 'basket', id: `basket-${this.space}:${this.currentRoom}`,
        pos: { x: w.drainPos.x, y: 0.5, z: w.drainPos.z },
        prompt: 'Search the wash',
        holdTime: 1.0, enabled: true, priority: 3,
        data: ent as unknown as Record<string, unknown>,
      });
    }
    if (this.player.crouching) addCrouchedDoorInteracts(this.interaction, this.inventory.some((i) => i.id === 'doorChock' && i.count > 0), this.player.pos);
    // The Wake's bier — a hold-to-open lid. The reveal is authored, not loot.
    if (!this.coffinOpened) {
      const wr = this.activeRooms()[this.currentRoom];
      if (wr?.spec?.special === 'wake') {
        const cp = this.wakeCoffinPos(wr);
        if (cp) this.interaction.add({
          kind: 'coffin', id: 'wake-coffin', pos: { x: cp.x, y: cp.y + 0.15, z: cp.z },
          prompt: 'Lift the coffin lid', holdTime: 1.8, enabled: true, priority: 2,
        });
      }
    }
    // The Index's seal console — the glyph-submission interactable the
    // IndexEncounter's 'puzzle' branch waits on (without this the whole
    // cards → catalogue → console chain ended in silence).
    {
      const ir = this.activeRooms()[this.currentRoom];
      if (ir?.spec?.special === 'index') {
        const prop = ir.spec?.props.find((p) => p.kind === 'sealConsole');
        if (prop) {
          const cs = Math.cos(ir.yaw), sn = Math.sin(ir.yaw);
          const wx = ir.origin.x + prop.x * cs + prop.z * sn;
          const wz = ir.origin.z - prop.x * sn + prop.z * cs;
          this.interaction.add({
            kind: 'puzzle', id: `seal-${ir.index}`, pos: { x: wx, y: 1.25, z: wz },
            prompt: 'Examine the seal console', holdTime: 0, enabled: true, priority: 2,
          });
        }
      }
    }
    // Pianos play — a real lure: loud distraction, hunters walk to it.
    {
      const pr = this.activeRooms()[this.currentRoom];
      this.liveTraps = [];
      this.liveTickProps = [];
      this.liveBooks = [];
      this.liveRugs = [];
      this.livePuddles = [];
      this.liveChandeliers = [];
      this.bookNear = 0;
      if (pr?.spec && !SAFE_ROOM_TEMPLATES.has(pr.templateId)) {
        const c = Math.cos(pr.yaw), s = Math.sin(pr.yaw);
        const ord: Record<string, number> = {};
        let vn = 0, hn = 0, pn = 0, tn = 0, wn = 0, rn = 0, yn = 0, gn = 0, cn = 0, rg = 0, pd2 = 0, sn2 = 0, chn = 0, al = 0, dn = 0;
        let drainDone = false;
        for (const p of pr.spec.props) {
          const isVent = p.kind === 'steamVent' || p.kind === 'boilerTank' || p.kind === 'pipeManifold';
          const isDrain = !!pr.flooded && DRAIN_PROPS.has(p.kind);
          const isWatch = p.kind === 'securityCam' || p.kind === 'searchlight';
          const isHearth = p.kind === 'fireplace' || p.kind === 'stove' || p.kind === 'masonryHeater' || p.kind === 'firePit';
          const isPhone = p.kind === 'payphone';
          const isTrap = p.kind === 'mousetrap';
          const isWash = p.kind === 'washer';
          const isPrint = p.kind === 'printer' || p.kind === 'printerRow';
          const isType = p.kind === 'typewriter';
          const isWin = p.kind === 'window';
          const isCool = p.kind === 'waterCooler';
          const isSeat = p.kind === 'bench' || p.kind === 'plasticChair' || p.kind === 'armchair' || p.kind === 'diningChair';
          const isAlarm = p.kind === 'fireAlarm';
          const wx = pr.origin.x + p.x * c + p.z * s;
          const wz = pr.origin.z - p.x * s + p.z * c;
          // ticking ironwork: proximity tells that answer the house's pulse
          if (p.kind === 'pipe' || p.kind === 'indPipes' || p.kind === 'pipeManifold' || p.kind === 'boilerDrum' || p.kind === 'boilerTank' || p.kind === 'steamVent' || p.kind === 'wallVent') {
            this.liveTickProps.push({ x: wx, z: wz });
          }
          // loose rugs slide once — a curled corner is the tell
          if (p.kind === 'rug') {
            const rkey = `${this.space}:${pr.index}:rug${rg++}`;
            if (!this.armedRugs.has(rkey)) this.armedRugs.set(rkey, this.streams.roomStream('scare', pr.index * 617 + rg - 1).bool(0.35));
            if (this.armedRugs.get(rkey) && !this.slippedRugs.has(rkey)) this.liveRugs.push({ x: wx, z: wz, key: rkey });
          }
          // chandeliers creak overhead — loud noise under one drops it
          if (p.kind === 'chandelier') {
            const ck = `${this.space}:${pr.index}:chan${chn++}`;
            if (!this.armedChandeliers.has(ck)) this.armedChandeliers.set(ck, this.streams.roomStream('scare', pr.index * 701 + chn - 1).bool(0.35));
            if (this.armedChandeliers.get(ck) && !this.droppedChandeliers.has(ck)) this.liveChandeliers.push({ x: wx, z: wz, key: ck });
          }
          // wet floors take running feet — crouch-wading stays upright
          if (p.kind === 'puddle') {
            const pkey = `${this.space}:${pr.index}:pud${pd2++}`;
            if (!this.armedPuddles.has(pkey)) this.armedPuddles.set(pkey, this.streams.roomStream('scare', pr.index * 619 + pd2 - 1 + 977).bool(0.4));
            if (this.armedPuddles.get(pkey) && !this.slippedPuddles.has(pkey)) this.livePuddles.push({ x: wx, z: wz, key: pkey });
          }
          // written things whisper once if you linger close
          if (p.kind === 'bookshelf' || p.kind === 'papers' || p.kind === 'paperStack' || p.kind === 'books' || p.kind === 'drawerUnit') {
            this.liveBooks.push({ x: wx, z: wz, key: `${this.space}:${pr.index}:${p.kind === 'bookshelf' ? 's' : p.kind === 'papers' ? 'p' : p.kind === 'paperStack' ? 't' : p.kind === 'books' ? 'b' : 'd'}${this.liveBooks.length}` });
          }
          if (!isVent && !isHearth && !isPhone && !isTrap && !isWash && !isPrint && !isType && !isWin && !isCool && !isSeat && !isAlarm && !isDrain && !isWatch && p.kind !== 'pianoUpright' && p.kind !== 'television' && p.kind !== 'clock') continue;
          const n = isVent ? vn++ : isHearth ? hn++ : isPhone ? pn++ : isTrap ? tn++ : isWash ? wn++ : isPrint ? rn++ : isType ? yn++ : isWin ? gn++ : isCool ? cn++ : isSeat ? sn2++ : isAlarm ? al++ : isDrain ? dn++ : (ord[p.kind] ?? 0);
          if (!isVent && !isHearth && !isPhone && !isTrap && !isWash && !isPrint && !isType && !isWin && !isCool && !isSeat && !isAlarm && !isDrain) ord[p.kind] = n + 1;
          const key = `${this.space}:${pr.index}:${n}`;
          if (p.kind === 'pianoUpright' && !this.playedPianos.has(key)) {
            this.interaction.add({
              kind: 'piano', id: `piano-${key}`,
              pos: { x: wx, y: 1, z: wz },
              prompt: 'Play the piano', holdTime: 0.9, enabled: true, priority: 2,
            });
          } else if (p.kind === 'television' && !this.litTVs.has(key)) {
            this.interaction.add({
              kind: 'tv', id: `tv-${key}`,
              pos: { x: wx, y: 1, z: wz },
              prompt: 'Tune the static', holdTime: 0.8, enabled: true, priority: 2,
            });
          } else if (p.kind === 'clock' && !this.woundClocks.has(key)) {
            this.interaction.add({
              kind: 'clock', id: `clock-${key}`,
              pos: { x: wx, y: 1.3, z: wz },
              prompt: 'Wind the clock', holdTime: 1.4, enabled: true, priority: 2,
            });
          } else if (isDrain && !drainDone && !this.drainedRooms.has(`${this.space}:${pr.index}`)) {
            drainDone = true;
            this.interaction.add({
              kind: 'drain', id: `drain-${key}`,
              pos: { x: wx, y: 0.9, z: wz },
              prompt: 'Open the drain', holdTime: 1.2, enabled: true, priority: 2,
            });
          } else if (isWatch) {
            // Wall eyes: tape/smother blinds the eye — only while it's live
            // (dead mains already killed it; a taped eye is furniture).
            const wy = p.y ?? (p.kind === 'securityCam' ? 2.35 : 1.4);
            const live = !pr.darkRoom && this.hazard.watchers.some((w) =>
              !w.dead && w.room === pr.index && Math.hypot(w.pos.x - wx, w.pos.z - wz) < 0.6);
            if (live) this.interaction.add({
              kind: 'tape', id: `tape-${key}`, pos: { x: wx, y: wy, z: wz },
              prompt: p.kind === 'securityCam' ? 'Tape the eye — felt wrap' : 'Smother the beam — felt wrap',
              holdTime: 1.6, enabled: true, priority: 2, data: { watchPos: { x: wx, z: wz } },
            });
          } else if (isVent && !this.crackedVents.has(key)) {
            this.interaction.add({
              kind: 'valve', id: `valve-${key}`,
              pos: { x: wx, y: 0.8, z: wz },
              prompt: 'Crack the valve', holdTime: 1.0, enabled: true, priority: 2,
            });
          } else if (isHearth && !this.litHearths.has(key)) {
            this.interaction.add({
              kind: 'hearth', id: `hearth-${key}`,
              pos: { x: wx, y: 0.8, z: wz },
              prompt: 'Light the hearth', holdTime: 1.6, enabled: true, priority: 2,
            });
          } else if (isPhone && !this.answeredPhones.has(key)) {
            this.interaction.add({
              kind: 'phone', id: `phone-${key}`,
              pos: { x: wx, y: 1.4, z: wz },
              prompt: 'Lift the receiver', holdTime: 1.0, enabled: true, priority: 2,
            });
          } else if (isTrap) {
            // some of the house's traps are set — seeded per trap, stable
            if (!this.armedTraps.has(key)) {
              this.armedTraps.set(key, this.streams.roomStream('scare', pr.index * 611 + n * 17).bool(0.32));
            }
            if (this.armedTraps.get(key) && !this.snappedTraps.has(key) && !this.priedTraps.has(key)) {
              this.liveTraps.push({ key, x: wx, z: wz });
              this.interaction.add({
                kind: 'trap', id: `trap-${key}`,
                pos: { x: wx, y: 0.08, z: wz },
                prompt: 'Pry the trap', holdTime: 0.7, enabled: true, priority: 2,
              });
            }
          } else if (isAlarm && !this.pulledAlarms.has(key)) {
            this.interaction.add({
              kind: 'alarm', id: `alarm-${key}`,
              pos: { x: wx, y: 1.2, z: wz },
              prompt: 'Pull the alarm', holdTime: 0.7, enabled: true, priority: 2,
            });
          } else if (isWash && !this.ranWashers.has(key)) {
            this.interaction.add({
              kind: 'washer', id: `wash-${key}`,
              pos: { x: wx, y: 0.7, z: wz },
              prompt: 'Run the load', holdTime: 1.1, enabled: true, priority: 2,
            });
          } else if (isWash && this.finishedWashers.has(key) && !this.emptiedWashers.has(key)) {
            this.interaction.add({
              kind: 'washer', id: `wash-${key}`,
              pos: { x: wx, y: 0.7, z: wz },
              prompt: 'Empty the drum', holdTime: 0.8, enabled: true, priority: 2,
            });
          } else if (isPrint && !this.printedPages.has(key)) {
            this.interaction.add({
              kind: 'printer', id: `print-${key}`,
              pos: { x: wx, y: 0.75, z: wz },
              prompt: 'Print the page', holdTime: 0.9, enabled: true, priority: 2,
            });
          } else if (isType && !this.typedKeys.has(key)) {
            this.interaction.add({
              kind: 'typewriter', id: `type-${key}`,
              pos: { x: wx, y: 0.82, z: wz },
              prompt: 'Strike a key', holdTime: 0.7, enabled: true, priority: 2,
            });
          } else if (isWin && !this.lookedWindows.has(key)) {
            this.interaction.add({
              kind: 'window', id: `win-${key}`,
              pos: { x: wx, y: 1.5, z: wz },
              prompt: 'Look out', holdTime: 0.8, enabled: true, priority: 2,
            });
          } else if (isCool && !this.drunkCoolers.has(key)) {
            this.interaction.add({
              kind: 'cooler', id: `cool-${key}`,
              pos: { x: wx, y: 0.9, z: wz },
              prompt: 'Drink', holdTime: 0.9, enabled: true, priority: 2,
            });
          } else if (isSeat && !this.satSeats.has(key) && !this.resting) {
            this.interaction.add({
              kind: 'seat', id: `seat-${key}`,
              pos: { x: wx, y: 0.55, z: wz },
              prompt: 'Rest a moment', holdTime: 1.1, enabled: true, priority: 2,
            });
          }
        }
      }
    }
    // Redactor false doors become interactable
    for (const e of this.entities) {
      if (e instanceof Redactor && e.state === 'engage') {
        e.forgeryPositions().forEach((pos, n) => {
          this.interaction.add({
            kind: 'door', id: `redactor-false-${n}`, pos,
            prompt: `Open Door ${(this.activeRooms()[this.currentRoom]?.index ?? 0) + 1}`,
            data: { id: `redactor-false-${n}`, falseDoor: true, openT: 0 } as never,
            enabled: true, priority: 2,
          });
        });
      }
    }
  }

  private tryInteract(): void {
    const it = this.interaction.focused;
    if (!it) return;
    this.heldView?.thrust();
    // milestones first
    const ms = this.milestones.get(this.currentRoom);
    if (ms?.onInteract(it)) return;

    switch (it.kind) {
      case 'shop': {
        const sock = it.data as Socket;
        if (sock.meta.broker === undefined) return;
        if (sock.meta.sold) return;
        const item = sock.meta.brokerItem as ItemId;
        const price = (sock.meta.brokerPrice as number) ?? 20;
        // the clerks' score is on your hands — an unpaid tally trades at
        // the marked rate, the same reading the Auditor's desk makes
        const marked = this.unpaidTheft > 0;
        const effPrice = marked ? price + Math.min(4 + this.unpaidTheft * 2, 14) : price;
        if (this.marginalia >= effPrice) {
          this.marginalia -= effPrice;
          sock.meta.sold = true;
          it.enabled = false;
          this.giveItem(item, 1);
          this.cue('purchase', it.pos,
            marked ? `[traded at the marked rate — ${effPrice} marginalia]` : `[traded — ${effPrice} marginalia]`, 'info');
        } else {
          this.cue('door-locked', it.pos,
            marked ? `[the marked rate is ${effPrice} marginalia — settle the tally or pay the crew]` : `[${effPrice} marginalia required]`, 'warn');
        }
        return;
      }
      case 'exitHide': {
        if (this.player.hiddenSpot?.trappedBy === 'inspector') {
          // Hold-the-lid grapple — presses feed the Inspector's struggle(),
          // never exit; it clears trappedBy itself when the rattle resolves.
          const insp = this.entities.find((e) => e instanceof Inspector);
          if (insp) (insp as Inspector).struggle();
          this.cue('stabilize-tick', null, '[hold it shut!]', 'danger');
          return;
        }
        if (this.player.hiddenSpot?.trappedBy === 'hollow') {
          // struggle minigame
          const hollow = this.entities.find((e) => e instanceof Hollow);
          if (hollow) (hollow as Hollow).struggle();
          if (!this.entities.some((e) => e instanceof Hollow && e.state !== 'done')) {
            this.player.exitHiding(this.clock.time);
            this.cue('hide-out', null, '');
          } else {
            this.cue('stabilize-tick', null, '[it grips — struggle!]', 'danger');
          }
          return;
        }
        this.player.exitHiding(this.clock.time);
        this.cue('hide-out', null, '');
        return;
      }
      case 'hide': {
        const spot = it.data as RoomInstance['hidingSpots'][number];
        if (this.player.enterHiding(spot, this.clock.time)) {
          this.cue('hide-in', null, '');
          if (spot.trappedBy === 'hollow') {
            this.spawnEntity(new Hollow());
          }
        }
        return;
      }
      case 'peek': {
        // Tap only rattles — the peek itself fires on hold completion.
        this.cue('door-locked', it.pos, '[locked — hold to peek]', 'warn');
        return;
      }
      case 'listen': {
        const door = it.data as Door;
        this.listenedDoors.add(door.id);
        const c = this.listenThrough(door);
        this.cue(c.sfx, it.pos, c.text, c.sev);
        return;
      }
      case 'brace': {
        // Brace the whole doorway cluster: your weight on this leaf holds
        // both sides. Released by stepping away, or by opening it yourself.
        const cluster = this.doorsAt(it.pos);
        if (cluster.some((d) => d.heldBy && d.heldBy !== 'player')) {
          this.cue('door-locked', it.pos, '[something already holds it]', 'warn');
          return;
        }
        for (const d of cluster) d.heldBy = 'player';
        this.bracedDoors.push(...cluster);
        this.cue('door-creak', it.pos, '[you put your weight into the door]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.3, category: 'door', caption: '' });
        return;
      }
      case 'wedge': {
        // Set a chock under the leaf — holds while you walk away, but a
        // determined rattle worries it loose. Weaker than your weight.
        // it.pos is the anchor (offset off the leaf) — cluster on the door's.
        const cluster = this.doorsAt((it.data as RoomInstance['doors'][number]).pos);
        if (cluster.some((d) => d.heldBy)) {
          this.cue('door-locked', it.pos, '[something already holds it]', 'warn');
          return;
        }
        const chock = this.inventory.find((i) => i.id === 'doorChock');
        if (!chock || chock.count <= 0) return;
        chock.count--;
        for (const d of cluster) d.heldBy = 'wedge';
        this.cue('door-creak', it.pos, '[you set the wedge under the leaf]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.25, category: 'door', caption: '' });
        return;
      }
      case 'unwedge': {
        const cluster = this.doorsAt((it.data as RoomInstance['doors'][number]).pos);
        for (const d of cluster) if (d.heldBy === 'wedge') d.heldBy = undefined;
        this.giveItem('doorChock', 1);
        this.cue('door-creak', it.pos, '[you pull the wedge free]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.2, category: 'door', caption: '' });
        return;
      }
      case 'door': {
        const door = it.data as RoomInstance['doors'][number];
        if (door.falseDoor) {
          const red = this.entities.find((e) => e instanceof Redactor) as Redactor | undefined;
          red?.punish();
          it.enabled = false;
          return;
        }
        // Port boundaries and folded corridors stack several door objects at
        // the same position (prev room's out leaf + next room's in leaf); they
        // are one physical doorway, so the whole cluster opens/locks together.
        const cluster = this.doorsAt(it.pos);
        // A held leaf is not a lock: the Commissionaire grips the far side.
        // Your own brace just releases — opening it IS letting go. A wedge
        // you set holds it from this side — pull it free instead.
        if (cluster.some((d) => d.heldBy === 'wedge')) {
          this.cue('door-locked', it.pos, '[the wedge holds it — pull it free first]', 'warn');
          return;
        }
        if (cluster.some((d) => d.heldBy && d.heldBy !== 'player')) {
          this.cue('door-locked', it.pos, '[the door is held from the far side]', 'warn');
          return;
        }
        if (cluster.some((d) => d.locked)) {
          const lockId = cluster.find((d) => d.locked)?.lockId ?? '';
          if (lockId === 'toll') {
            // The toll door — imprints, not keys, open it.
            if (this.imprints >= 3) {
              this.imprints -= 3;
              for (const d of cluster) d.locked = false;
              this.cue('door-unlock', it.pos, '[the door takes its toll — 3 imprints]');
            } else {
              this.cue('door-locked', it.pos, `[it asks a toll — ${3 - this.imprints} imprints short]`, 'warn');
              return;
            }
          } else if (this.consumeKeyFor(lockId)) {
            for (const d of cluster) d.locked = false;
            this.cue('door-unlock', it.pos, `[unlocked — Door ${door.label}]`);
          } else {
            this.cue('door-locked', it.pos, `[locked — needs a key]`, 'warn');
            return;
          }
        }
        // Door intent: sprint+E slams (fast, loud — entities hear it),
        // crouch+E creeps (slow, near-silent). Plain E opens normally.
        const slam = this.keys.has(this.keyFor('sprint'));
        const creep = this.player.crouching || this.keys.has(this.keyFor('crouch'));
        for (const d of cluster) {
          d.opening = true;
          d.openRate = slam ? 2.6 : creep ? 0.42 : undefined;
        }
        if (slam) {
          this.cue('door-slam', it.pos, `[slammed — Door ${door.label}]`, 'warn');
          this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 1.5, category: 'door', caption: '[door slammed]' });
        } else if (creep) {
          this.cue('door-creak', it.pos, `[creaked open — Door ${door.label}]`);
          this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.12, category: 'door', caption: '[door creak]' });
        } else {
          this.cue('door-open', it.pos, '');
          this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'door', caption: '[door]' });
        }
        return;
      }
      case 'drawer': {
        const sock = it.data as { meta: Record<string, unknown>; pos: Vec3; filled?: boolean };
        // Locked drawer: tap with a latchpick opens quietly; the hold path
        // (forceDrawer) opens loudly and costs nothing.
        if (sock.meta.drawerLocked && !sock.meta.picked) {
          const lp = this.inventory.find((i) => i.id === 'latchpick' && i.count > 0);
          if (lp) {
            lp.count -= 1;
            sock.meta.picked = true;
            this.cue('drawer', it.pos, '[latchpick spent — the lock gives]');
          } else {
            this.cue('door-locked', it.pos, '[locked — a latchpick, or hold to force]', 'warn');
            return;
          }
        }
        if (sock.meta.wired) {
          // The latch bites once — a toll, not a lock. Loud enough to carry.
          sock.meta.wired = false;
          this.damagePlayer(7, 'hazard', 'The latch bites — a wired drawer. Coax them, or pay the teeth.');
          this.sound.emit({ x: it.pos.x, y: 0.8, z: it.pos.z, intensity: 0.45, category: 'impact', caption: '[a latch snaps]' });
        }
        sock.meta.opened = true;
        it.enabled = false;
        this.cue('drawer', it.pos, '');
        // slide the matching drawer front open
        const built = this.streamer.get(this.currentRoom);
        built?.group.traverse((o) => {
          if (o.userData.anim === 'drawerFront' && o.userData.sockKey === `${it.pos.x.toFixed(1)}|${it.pos.z.toFixed(1)}`) {
            o.userData.open = true;
          }
        });
        this.resolveSocketLoot(it);
        return;
      }
      case 'coax': {
        const sock = it.data as { meta: Record<string, unknown>; pos: Vec3 };
        sock.meta.wired = false;
        sock.meta.opened = true;
        it.enabled = false;
        this.cue('drawer', it.pos, '[the latch eases — bitten, not sprung]');
        this.sound.emit({ x: it.pos.x, y: 0.8, z: it.pos.z, intensity: 0.3, category: 'item', caption: '[a latch coaxes open]' });
        const builtC = this.streamer.get(this.currentRoom);
        builtC?.group.traverse((o) => {
          if (o.userData.anim === 'drawerFront' && o.userData.sockKey === `${sock.pos.x.toFixed(1)}|${sock.pos.z.toFixed(1)}`) {
            o.userData.open = true;
          }
        });
        this.resolveSocketLoot(it);
        return;
      }
      case 'vend': {
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 5;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the machine wants ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.cue('machine', it.pos, '[the machine coughs something up]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.6, category: 'machine', caption: '' });
        this.giveItem(sock.meta.vendItem as ItemId, 1);
        return;
      }
      case 'claim': {
        // The porter's cage — a priced claim tag; the bag's contents are
        // semi-blind until you pay. Contains resolves like loot sockets.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 8;
        const cur = sock.meta.marginalia === true;
        if ((cur ? this.marginalia : this.imprints) < price) {
          this.cue('door-locked', it.pos,
            `[the claim is ${price} ${cur ? 'marginalia' : 'imprints'} — ${price - (cur ? this.marginalia : this.imprints)} short]`, 'warn');
          return;
        }
        if (cur) this.marginalia -= price; else this.imprints -= price;
        if (cur) this.unpaidTheft += 1; // a claim against somebody else's effects — the crew keeps score
        else this.unpaidHeld += 1; // the house keeps its own book — the detective reads it
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'machine', caption: '' });
        const contains = sock.meta.contains as string | undefined;
        if (contains === 'marginalia') {
          const amt = (sock.meta.amount as number) ?? 8;
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.cue('pickup', it.pos, `[the effects held a purse — +${amt} marginalia]`);
        } else if (contains === 'imprints') {
          const amt = (sock.meta.amount as number) ?? 10;
          this.imprints += amt;
          this.stats.imprintsEarned += amt;
          this.cue('pickup', it.pos, `[the bag held a purse — +${amt} imprints]`);
        } else if (contains === 'lore') {
          const doc = DOCUMENTS[Math.abs(this.streams.stream('loot').int(0, DOCUMENTS.length - 1)) % DOCUMENTS.length];
          if (doc && !this.documents.some((d) => d.id === doc.id)) {
            this.documents.push({ ...doc, unlockedAt: Date.now() });
            this.meta.documents.push(doc.id);
            saveMeta(this.meta);
            useGameStore.setState({ documents: this.loadDocs() });
            this.cue('pickup', it.pos, `[the bag held someone's papers — ${doc.title}]`);
          } else {
            this.imprints += 6;
            this.cue('pickup', it.pos, '[the bag held old papers — worth 6 imprints]');
          }
        } else if (contains) {
          this.giveItem(contains as ItemId, 1);
          const name = ITEM_DEFS[contains as ItemId]?.name.toLowerCase() ?? contains;
          this.cue('pickup', it.pos, `[inside the bag — ${name}]`);
        }
        return;
      }
      case 'register': {
        // The guest ledger — the hotel's own book of who is expected. A
        // priced foresight read: the next few doors' waiting things, told
        // in the ledger's euphemisms. One read per book — the ink dries.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 10;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the ledger costs ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const NOUNS: Record<string, string> = {
          sweep: 'the passing steps', reprise: 'the returning steps', witness: 'the unblinking guest',
          collector: 'the toll-taker and his tin', whisper: 'a voice inside the wall',
          commissionaire: 'a doorman who will not step aside', porter: 'a porter above the lintels',
          redactor: 'the forger of doors', hollow: 'what the cupboards bred',
          bellman: 'a valet who follows', warden: 'a watchman on his rounds',
          groundswell: 'the floor, restless', lurker: 'what dims the lamps',
          maelstrom: 'the turning stair', inspector: 'a clerk who tries the lids',
          echoskin: 'your own step, late', grafter: 'a guest wearing the walls',
          curator: 'the archivist at his desk', returner: 'a guest come back',
          margin: 'the handwritten edge', redline: 'the red margin',
          stillframe: 'the paused hall', editor: 'the revising hand',
          inkling: 'an inkstain walking', husk: 'a guest long emptied',
          singer: 'the choir of one', swamper: 'a drowned porter in the flood',
          hauler: 'a porter who hauls salvage', laundress: 'a laundress at the outflow',
          auditor: 'a clerk auditing the claims',
          detective: 'a house detective on the register',
        };
        const seen = new Set<string>();
        const parts: string[] = [];
        const cover = sock.meta.forgedCover as number | undefined;
        const rooms = this.route?.rooms ?? [];
        for (const r of rooms) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 10 || parts.length >= 4) continue;
          if (r.index === cover) continue;   // the forged page — a lie by omission
          for (const s of r.scheduled ?? []) {
            const noun = NOUNS[s.entity] ?? 'a guest unlisted';
            const key = `${noun}|${r.index}`;
            if (seen.has(key) || parts.length >= 4) continue;
            seen.add(key);
            parts.push(`${noun} at Door ${String(r.index).padStart(3, '0')}`);
          }
        }
        const text = parts.length
          ? `[the ledger expects: ${parts.join(' · ')}]`
          : cover !== undefined
            ? `[the ledger expects: still air until Door ${String(cover).padStart(3, '0')}]`
            : "[the ledger's pages ahead are blank — nothing is expected]";
        this.cue('whisper', it.pos, text);
        if (cover !== undefined) this.cue('whisper', it.pos, '[the ink on one page is still wet]');
        return;
      }
      case 'roster': {
        // The duty roster — cheaper paper, narrower knowledge: which of the
        // house's staff are marked working right now, and where they stand.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 6;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the roster costs ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const STAFF: Record<string, string> = {
          bellman: 'a valet walking the halls', warden: 'a watchman on his rounds',
          inspector: 'a clerk trying the lids', commissionaire: 'a doorman holding his post',
          porter: 'a porter above the lintels', custodian: 'the custodian behind his counter',
          collector: 'a toll-taker, off the books',
        };
        const marks: string[] = [];
        for (const e of this.entities) {
          if (e.state === 'done' || marks.length >= 4) continue;
          const noun = STAFF[e.id];
          if (!noun) continue;
          const tp = e.threatPos();
          if (!tp) continue;
          let at = 'between the doors';
          for (const r of this.route?.rooms ?? []) {
            if (pointInRoom(r, tp.x, tp.z)) { at = `at Door ${String(r.index).padStart(3, '0')}`; break; }
          }
          marks.push(`${noun} ${at}`);
        }
        const text = marks.length
          ? `[the duty roster marks: ${marks.join(' · ')}]`
          : '[the roster is all signatures — no one is marked working]';
        this.cue('whisper', it.pos, text);
        return;
      }
      case 'complaint': {
        // The complaint/fault book — cheapest paper. Files HAZARDS by door
        // the other books don't cover: biting lids, doors that aren't
        // doors, heaving floors, dimming lamps — everything but staff.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 5;
        const fault = sock.meta.fault === true;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the book costs ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const NOUNS: Record<string, string> = {
          groundswell: 'the floor heaves', hollow: 'something nests in the lids',
          redactor: 'the doors move', lurker: 'the lamps dim for no reason',
          maelstrom: 'the room turns', margin: 'the margins write',
          whisper: 'voices inside the wall', witness: 'a guest who stares',
          husk: 'a guest long emptied', echoskin: 'steps that are not yours',
          grafter: 'a guest wearing the walls', singer: 'the choir of one',
          stillframe: 'a hall that will not move', editor: 'the revising hand',
          inkling: 'an inkstain walking', returner: 'a guest come back',
          sweep: 'steps that pass too fast', reprise: 'steps that come back too fast',
          swamper: 'a drowned porter, under the water',
          hauler: 'a porter who hauls salvage', laundress: 'a laundress at the outflow',
          auditor: 'a clerk auditing the claims',
          detective: 'a house detective on the register',
        };
        const STAFF = new Set(['bellman', 'warden', 'inspector', 'commissionaire', 'porter', 'custodian', 'collector']);
        const filings: string[] = [];
        const rooms = this.route?.rooms ?? [];
        for (const r of rooms) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 8 || filings.length >= 5) continue;
          const complaints = new Set<string>();
          for (const s of r.scheduled ?? []) {
            if (STAFF.has(s.entity)) continue;
            complaints.add(NOUNS[s.entity] ?? 'a guest unlisted');
          }
          if (r.hidingSpots.some((s) => s.trappedBy === 'hollow')) complaints.add('a lid that bites');
          if (r.doors.some((d) => d.falseDoor)) complaints.add("a door that isn't");
          if (r.doors.some((d) => d.deep)) complaints.add('a door deeper than the wall');
          for (const c of complaints) {
            if (filings.length >= 5) break;
            filings.push(`Door ${String(r.index).padStart(3, '0')} — ${c}`);
          }
        }
        const text = filings.length
          ? `[${fault ? 'the fault book' : 'the complaint book'} lists: ${filings.join(' · ')}]`
          : fault ? '[the fault book is clear ahead — nothing logged]' : '[no complaints filed ahead — suspicious in itself]';
        this.cue('whisper', it.pos, text);
        return;
      }
      case 'workOrder': {
        // The work-order book — the under's own paper, priced in marginalia.
        // Where the books above answer threats and staff, the order sheet
        // answers CARGO: which rooms still hold unclaimed stock, and where
        // the egress is stamped.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 5;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the order costs ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= price;
        this.paperTrail += 1;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const TASKS: Record<string, string> = {
          imprints: 'imprints for the tin', marginalia: 'marginalia for the margins',
          lore: 'papers unsigned',
        };
        const tickets: string[] = [];
        const under = this.route?.underRooms ?? [];
        for (const r of under) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 12 || tickets.length >= 4) continue;
          for (const s of r.sockets ?? []) {
            if (tickets.length >= 4) break;
            if (s.meta.taken || s.meta.workOrder) continue;
            if (s.meta.vend) tickets.push(`Door ${String(r.index).padStart(3, '0')} — the machine still stocks`);
            else if (s.meta.contains) {
              const t = TASKS[s.meta.contains as string] ?? 'a tool unclaimed';
              tickets.push(`Door ${String(r.index).padStart(3, '0')} — ${t}`);
            }
          }
        }
        const egress = under[under.length - 1];
        const text = tickets.length
          ? `[open tickets: ${tickets.join(' · ')}]`
          : "[the sheet is stamped closed ahead — the crew's been through]";
        this.cue('whisper', it.pos, text);
        if (egress) this.cue('whisper', it.pos, `[the egress stamp is filed at Door ${String(egress.index).padStart(3, '0')}]`);
        return;
      }
      case 'crewBoard': {
        // The crew board — who is signed on down the line: the under's
        // entity foresight, told in crew euphemisms. One read per board.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 5;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the board wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= price;
        this.paperTrail += 1;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const CREW: Record<string, string> = {
          swamper: 'hands in the water', hauler: 'a haul team on the line',
          laundress: 'a laundress at the outflow', grafter: 'a grafter in the fill',
          auditor: 'a clerk walking the ledger',
          filer: 'a filer at the index',
          detective: 'a detective on the wire',
          redline: 'the red margin', stillframe: 'the paused hall',
          returner: 'a guest come back', margin: 'the handwritten edge',
        };
        const parts: string[] = [];
        const under = this.route?.underRooms ?? [];
        for (const r of under) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 12 || parts.length >= 5) continue;
          for (const s of r.scheduled ?? []) {
            const crew = CREW[s.entity] ?? 'a hand unlisted';
            if (parts.length >= 5) break;
            parts.push(`Door ${String(r.index).padStart(3, '0')} — ${crew}`);
          }
        }
        const text = parts.length
          ? `[the shift sheet marks: ${parts.join(' · ')}]`
          : '[the sheet runs clean ahead — nobody signed on]';
        this.cue('whisper', it.pos, text);
        return;
      }
      case 'claimRegister': {
        // The claim register — the library's cross-reference. Where the
        // board answers crew and the order sheet answers cargo, this files
        // CLAIMS: which tagged effects in the next stretch are still held
        // and which the crew already drew.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 4;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the register wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= price;
        this.paperTrail += 1;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const entries: string[] = [];
        const under = this.route?.underRooms ?? [];
        for (const r of under) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 10 || entries.length >= 6) continue;
          for (const s of r.sockets ?? []) {
            if (entries.length >= 6) break;
            if (!s.meta.claim || s.meta.marginalia !== true) continue;
            const tag = (s.meta.claimTag as string) ?? 'unsigned';
            entries.push(`Door ${String(r.index).padStart(3, '0')} — '${tag}' ${s.meta.taken ? 'drawn' : 'still held'}`);
          }
        }
        const text = entries.length
          ? `[the claim register shows: ${entries.join(' · ')}]`
          : "[the register's claim columns run blank ahead]";
        this.cue('whisper', it.pos, text);
        return;
      }
      case 'counterClaim': {
        // The counter-claim — the paper that files YOUR file. Strikes two
        // lines off the consult ledger... but the asking is itself a paid
        // consult, so the clerk logs it right back: net −1. It can lighten
        // a file, never empty it cleanly — only her desk squares the card.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 6;
        if (this.paperTrail <= 0) {
          this.cue('door-locked', it.pos, '[your file is already blank — the clerk shrugs]', 'warn');
          return;
        }
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the counter-claim wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.paperTrail = Math.max(0, this.paperTrail - 2) + 1;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, '[the clerk strikes two lines from your file — and logs the asking]');
        return;
      }
      case 'watchSheet': {
        // The inspection sheet — the security wing's paper. Where the fault
        // book files what BITES, this files what WATCHES: which doors ahead
        // hold a live eye, a sweeping beam, or one drowned with the mains.
        // Read from spec.props — the sheet knows rooms before they build.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 6;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the sheet wants ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= price;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const entries: string[] = [];
        for (const r of this.route?.rooms ?? []) {
          if (r.index <= this.currentRoom || r.index > this.currentRoom + 10 || entries.length >= 6) continue;
          const cams = (r.spec?.props ?? []).filter((p) => p.kind === 'securityCam').length;
          const beams = (r.spec?.props ?? []).filter((p) => p.kind === 'searchlight').length;
          if (!cams && !beams) continue;
          const mark = r.darkRoom
            ? 'a dead eye — mains out'
            : cams && beams ? 'an eye and a beam'
            : cams ? 'a live eye sweeps' : 'the beam crosses';
          entries.push(`Door ${String(r.index).padStart(3, '0')} — ${mark}`);
        }
        const text = entries.length
          ? `[the inspection sheet marks: ${entries.join(' · ')}]`
          : '[nothing watches the doors ahead — the sheet runs clean]';
        this.cue('whisper', it.pos, text);
        return;
      }
      case 'pry': {
        // The confiscated case — free goods guarded by a live eye. The pry
        // is a 2.2s dwell inside the cone plus a ring the room hears; the
        // paid-quiet alternative is 'tape the eye' before you reach it.
        const sock = it.data as Socket;
        sock.meta.taken = true;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.45, category: 'machine', caption: '[the case cracks]' });
        const contains = sock.meta.contains as string | undefined;
        const amt = (sock.meta.amount as number) ?? 1;
        if (contains === 'imprints') {
          this.imprints += amt;
          this.stats.imprintsEarned += amt;
          this.cue('pickup', it.pos, `[the case held a purse — +${amt} imprints]`);
        } else if (contains === 'warrant') {
          // The sealed warrant — the seizure ledger itself. It lists which
          // confiscated cases in the rooms ahead are still held and which
          // the house already drew: paper for goods, the house's own trade.
          const entries: string[] = [];
          for (const r of this.route?.rooms ?? []) {
            // Cases are too sparse for a stretch window — the ledger runs
            // the rest of the route.
            if (r.index <= this.currentRoom || entries.length >= 6) continue;
            for (const s of r.sockets ?? []) {
              if (entries.length >= 6) break;
              if (!s.meta.confiscated) continue;
              entries.push(`Door ${String(r.index).padStart(3, '0')} — case ${s.meta.taken ? 'drawn' : 'still held'}`);
            }
          }
          const text = entries.length
            ? `[the warrant lists: ${entries.join(' · ')}]`
            : "[the warrant's seizure column runs blank ahead]";
          this.cue('whisper', it.pos, text);
        } else if (contains) {
          this.giveItem(contains as ItemId, amt);
          this.cue('pickup', it.pos, `[the case breaks open — confiscated goods, now yours]`);
        }
        return;
      }
      case 'audit': {
        // The Auditor's settle point — pay the tally or the book walks.
        const owed = this.unpaidTheft;
        if (owed <= 0) { it.enabled = false; return; }
        const toll = Math.min(4 + owed * 2, 14);
        if (this.marginalia < toll) {
          this.cue('door-locked', it.pos, `[the ledger asks ${toll} marginalia — ${toll - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= toll;
        this.unpaidTheft = 0;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, `[paid ${toll} — the clerk turns the page]`);
        (it.data as { auditor?: { settled?: () => void } }).auditor?.settled?.();
        return;
      }
      case 'square': {
        // The Filer's index — pay the filing fee or the halls keep
        // listening for your step. Priced in marginalia; the settle
        // counterpart to the Detective's imprints on the route above.
        const trail = this.paperTrail;
        if (trail <= 0) { it.enabled = false; return; }
        const toll = Math.min(4 + trail * 2, 14);
        if (this.marginalia < toll) {
          this.cue('door-locked', it.pos, `[the index asks ${toll} marginalia — ${toll - this.marginalia} short]`, 'warn');
          return;
        }
        this.marginalia -= toll;
        this.paperTrail = 0;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, `[paid ${toll} — the filer strikes your card]`);
        (it.data as { filer?: { squared?: () => void } }).filer?.squared?.();
        return;
      }
      case 'settle': {
        // The Detective's settle point — pay the register or your face
        // goes on the wire.
        const owed = this.unpaidHeld;
        if (owed <= 0) { it.enabled = false; return; }
        const toll = Math.min(8 + owed * 2, 24);
        if (this.imprints < toll) {
          this.cue('door-locked', it.pos, `[the register asks ${toll} imprints — ${toll - this.imprints} short]`, 'warn');
          return;
        }
        this.imprints -= toll;
        this.unpaidHeld = 0;
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, `[paid ${toll} — the detective strikes your name]`);
        (it.data as { detective?: { settled?: () => void } }).detective?.settled?.();
        return;
      }
      case 'item':
      case 'lore':
      case 'card': {
        this.resolveSocketLoot(it);
        return;
      }
      case 'puzzle': {
        // puzzle-valve mechanisms — crack them open: a steam burst on the
        // way out (the same mask/lure trade as the prop valves), then the
        // mechanism yields whatever it held. Sockets can co-carry
        // contains/doorKey — the lock filler hides keys inside these.
        const sock = it.data as Socket;
        if (sock.meta.taken) return;
        const at = { x: it.pos.x, y: 0.9, z: it.pos.z };
        this.steamMasks.push({ pos: at, until: this.clock.time + 26 });
        this.spawnSteamJet(at);
        this.audio.play('steam-hiss', at, '[the mechanism cracks open — steps drowned]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.5, category: 'machine', caption: '[steam vents]' });
        this.resolveSocketLoot(it);
        return;
      }
      case 'toll': {
        // The Collector's price — scales with the purse it counted on you;
        // imprints first, a marginalia if you're poor.
        const d = it.data as { pay?: () => void; price?: number } | undefined;
        const price = d?.price ?? 2;
        let paid = false;
        if (this.imprints >= price) { this.imprints -= price; paid = true; }
        else if (this.marginalia >= 1) { this.marginalia -= 1; paid = true; }
        if (paid && d?.pay) {
          it.enabled = false;
          d.pay();
        } else {
          this.cue('collector-refuse', it.pos, '[empty pockets — the rattle goes on]', 'warn');
          this.sound.emit({ x: it.pos.x, y: 1.0, z: it.pos.z, intensity: 0.4, category: 'footstep', caption: '[a petulant rattle]' });
        }
        return;
      }
      case 'coffin': {
        it.enabled = false;
        this.coffinOpened = true;
        const g = this.worldGroup.getObjectByName(`coffin-${this.currentRoom}`);
        if (g) this.openCoffinLid(g);
        const doc = DOCUMENTS.find((d) => d.id === 'doc-guest-bier');
        if (doc && !this.documents.some((d) => d.id === doc.id)) {
          this.documents.push({ ...doc, unlockedAt: Date.now() });
          this.meta.documents.push(doc.id);
          saveMeta(this.meta);
          useGameStore.setState({ documents: this.loadDocs() });
        }
        this.cue('door-creak', it.pos, '');
        this.cue('amb-settle', it.pos, '[empty — the pillow is still warm]', 'warn');
        return;
      }
      case 'phone': {
        it.enabled = false;
        this.answeredPhones.add(it.id.replace(/^phone-/, ''));
        // the line reads the house back to you — nearest hunter by distance,
        // whispered; the receiver's clack is a sound either way
        const at = { x: it.pos.x, y: 1.4, z: it.pos.z };
        let nearest: Entity | null = null;
        let nd = Infinity;
        for (const e of this.entities) {
          if (e.state === 'done') continue;
          const tp = e.threatPos();
          if (!tp) continue;
          const d = v3dist(tp, this.player.pos);
          if (d < nd) { nd = d; nearest = e; }
        }
        const line = !nearest ? '[a dial tone that sounds like counting]'
          : nd < 3.2 ? '[a voice, close: it is in the room with you]'
          : nd < 12 ? '[a voice: near — a door or two away]'
          : '[a voice: rooms away — keep walking]';
        this.audio.play('whisper-voice', at, line, 'warn');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.5, category: 'ambient', caption: '' });
        return;
      }
      case 'trap': {
        it.enabled = false;
        this.priedTraps.add(it.id.replace(/^trap-/, ''));
        const at = { x: it.pos.x, y: 0.05, z: it.pos.z };
        this.audio.play('trap-click', at, '[the spring slackens]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.2, category: 'ambient', caption: '' });
        return;
      }
      case 'snip': {
        it.enabled = false;
        const d = it.data as { room: number; sx: number; sz: number };
        const hsn = this.hazard.snares.find((hz) => hz.room === d.room
          && Math.hypot(hz.pos.x - d.sx, hz.pos.z - d.sz) < 0.45);
        if (hsn) {
          hsn.armed = false;
          this.hazard.evidence.push({ pos: v3(hsn.pos.x, 0, hsn.pos.z), room: hsn.room, kind: 'wire', t: this.clock.time, readBy: [] });
        }
        const rm = this.activeRooms()[this.currentRoom];
        const sub = !!rm?.flooded && !this.drainedRooms.has(`${this.space}:${rm.index}`);
        this.audio.play('trap-click', { x: d.sx, y: 0.1, z: d.sz },
          sub ? '[the wire comes loose under the water]' : '[the seal parts — the wire goes slack]');
        this.sound.emit({ x: d.sx, y: 0.2, z: d.sz, intensity: 0.3, category: 'item', caption: '[a quiet snip]' });
        return;
      }
      case 'bleed': {
        it.enabled = false;
        const d = it.data as { room: number; sx: number; sz: number };
        const st = this.hazard.steams.find((v) => v.room === d.room
          && Math.hypot(v.pos.x - d.sx, v.pos.z - d.sz) < 0.5);
        if (st) {
          st.dead = true;
          this.hazard.evidence.push({ pos: v3(st.pos.x, 0, st.pos.z), room: st.room, kind: 'line', t: this.clock.time, readBy: [] });
        }
        this.audio.play('steam-hiss', { x: d.sx, y: 0.4, z: d.sz }, '[the pressure falls — the line goes quiet]');
        this.sound.emit({ x: d.sx, y: 0.4, z: d.sz, intensity: 0.3, category: 'item', caption: '[a valve eases]' });
        return;
      }
      case 'scrub': {
        const ev = it.data as { pos: Vec3; room: number; kind: string; readBy: string[] };
        const wrap = this.inventory.find((i) => i.id === 'feltWrap' && i.count > 0);
        if (!wrap) {
          this.cue('drawer', it.pos, '[a felt wrap would rub this out]', 'warn');
          return;
        }
        wrap.count--;
        it.enabled = false;
        // Every sign within the rub's reach goes — one wrap, one clean floor.
        this.hazard.evidence = this.hazard.evidence.filter((e) =>
          Math.hypot(e.pos.x - ev.pos.x, e.pos.z - ev.pos.z) > 2.6);
        // ...but the felt itself leaves a shadow: the floor smells wiped.
        // Only the warden's nose reads it — and only to doubt the next mark.
        this.hazard.evidence.push({ pos: v3(ev.pos.x, 0, ev.pos.z), room: ev.room,
          kind: 'wipe', t: this.clock.time, readBy: [], wiped: true });
        this.cue('item', it.pos, '[the sign rubs out under the felt — nothing left to read]');
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.25, category: 'item', caption: '[felt on stone]' });
        return;
      }
      case 'chock': {
        const f = it.data as { pos: Vec3; room: number; dead: boolean };
        const chock = this.inventory.find((i) => i.id === 'doorChock' && i.count > 0);
        if (!chock) {
          this.cue('drawer', it.pos, '[a door chock would jam the wheel]', 'warn');
          return;
        }
        chock.count--;
        it.enabled = false;
        f.dead = true;
        this.hazard.evidence.push({ pos: v3(f.pos.x, 0, f.pos.z), room: f.room, kind: 'fan', t: this.clock.time, readBy: [] });
        this.cue('item', it.pos, '[the wheel chokes on the chock — the blades stand still]');
        this.sound.emit({ x: it.pos.x, y: 1.1, z: it.pos.z, intensity: 0.3, category: 'item', caption: '[wood into the wheel]' });
        return;
      }
      case 'basket': {
        const w = it.data as unknown as { basketFull: boolean };
        if (!w.basketFull) { it.enabled = false; return; }
        w.basketFull = false;
        this.unpaidTheft += 1; // her wash, your pockets — the clerks mark it
        it.enabled = false;
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const pool = ['feltWrap', 'bandage', 'tonic', 'chalkSpool'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — clean linen, still warm]`);
        } else {
          const amt = this.streams.stream('loot').int(8, 14);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.cue('pickup', it.pos, `[+${amt} marginalia — pins in the hem]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.5, z: it.pos.z, intensity: 0.3, category: 'item', caption: '[linen lifted]' });
        return;
      }
      case 'pick': {
        const h = it.data as unknown as { stock: number; sledgePos: Vec3 };
        if (h.stock <= 0) { it.enabled = false; return; }
        h.stock--;
        this.unpaidTheft += 1; // off the sledge, into the tally
        it.enabled = false;
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 9);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.cue('pickup', it.pos, `[+${amt} marginalia — off the sledge]`);
        } else {
          const pool = ['latchpick', 'doorChock', 'feltWrap', 'bandage', 'tonic'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the sledge]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        if (h.stock <= 0) this.cue('drawer', it.pos, '[the sledge is stripped]');
        return;
      }
      case 'docket': {
        // Rifling the Filer's own drawer — a one-shot skim priced against
        // BOTH ledgers: the crew counts it as theft, and reaching into the
        // index is itself the loudest question the under records. A hand
        // in her drawer at trail 2 files you mid-reach.
        const h = it.data as unknown as { stock: number };
        if (h.stock <= 0) { it.enabled = false; return; }
        h.stock--;
        this.unpaidTheft += 1; // out of her drawer, into the tally
        this.paperTrail += 2;  // the index logs the rummage as two questions
        it.enabled = false;
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 9);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.cue('pickup', it.pos, `[+${amt} marginalia — off the index]`);
        } else {
          const pool = ['latchpick', 'doorChock', 'feltWrap', 'bandage', 'tonic'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the index]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        this.cue('drawer', it.pos, '[the docket notes your hands — filed as two questions]', 'warn');
        return;
      }
      case 'cutWord': {
        // Tearing the courier's message — the word dies mid-delivery.
        // Not theft: the card is yours, and the Filer closes it torn.
        // The runner's satchel still carries the crew's coin, though.
        const f = it.data as unknown as { runnerOut: boolean; cutRunner(): void };
        if (!f.runnerOut) { it.enabled = false; return; }
        f.cutRunner();
        it.enabled = false;
        const amt = this.streams.stream('loot').int(3, 6);
        this.marginalia += amt;
        this.stats.marginaliaEarned += amt;
        this.cue('pickup', it.pos, `[+${amt} marginalia — off the courier]`);
        return;
      }
      case 'strip': {
        const h = it.data as unknown as { lampLit: boolean; relit: boolean; stripLamp(): void };
        if (!h.lampLit) { it.enabled = false; return; }
        const scavenged = h.relit;
        h.stripLamp();
        this.unpaidTheft += 1; // off the sledge, into the tally
        it.enabled = false;
        // the lamp IS the loot — a hooded hand lamp at half battery, or a
        // top-up for the one you carry (count is charge). A scavenged bulb
        // is second-hand: less charge, and the strip point re-registers
        // the moment the team wires a replacement on.
        this.giveItem('handLamp', scavenged ? 30 : 55);
        this.cue('pickup', it.pos, scavenged ? '[the scavenged bulb is yours — charge for a walk]' : '[the work-lamp comes free — hooded, half a battery]');
        this.sound.emit({ x: it.pos.x, y: 0.5, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        return;
      }
      case 'forge': {
        const wrap = this.inventory.find((i) => i.id === 'feltWrap' && i.count > 0);
        if (!wrap) {
          this.cue('drawer', it.pos, '[a felt wrap holds the ash]', 'warn');
          return;
        }
        wrap.count--;
        it.enabled = false;
        this.hazard.evidence.push({
          pos: v3(this.player.pos.x, 0, this.player.pos.z), room: this.currentRoom,
          kind: 'wire', t: this.clock.time, readBy: [],
        });
        // The wrap's ash is a second, weaker mark — rubbed felt leaves a
        // real trace even where the wire lie is fake. Only the grafter's
        // duller nose bothers with it; the warden reads through.
        this.hazard.evidence.push({
          pos: v3(this.player.pos.x + 0.4, 0, this.player.pos.z + 0.4), room: this.currentRoom,
          kind: 'water', t: this.clock.time, readBy: [], weak: true,
        });
        this.cue('item', it.pos, '[you rub a scuff into the boards — a lie in wire; the ash keeps]');
        this.sound.emit({ x: it.pos.x, y: 0.3, z: it.pos.z, intensity: 0.3, category: 'item', caption: '[felt on the boards]' });
        return;
      }
      case 'alarm': {
        // A pulled bell is the under's own lure — loud, fixed, free, and
        // it rings exactly where you stand. The crew's bells were wired
        // for someone else's safety; now they only announce you.
        it.enabled = false;
        const key = it.id.replace(/^alarm-/, '');
        this.pulledAlarms.add(key);
        this.sound.emit({ x: it.pos.x, y: 1.6, z: it.pos.z, intensity: 1.0, category: 'machine', caption: '[the alarm screams]' });
        this.cue('door-slam', it.pos, '[the bell screams in the stairwell]', 'warn');
        return;
      }
      case 'tape': {
        // Blind the eye: felt over the lens / across the beam — the wrap's
        // third job after scrubbing sign and forging it.
        const wrap = this.inventory.find((i) => i.id === 'feltWrap' && i.count > 0);
        if (!wrap) {
          this.cue('drawer', it.pos, '[you need a felt wrap to blind it]', 'warn');
          return;
        }
        wrap.count--;
        it.enabled = false;
        const wp = (it.data as { watchPos?: { x: number; z: number } }).watchPos;
        const w = wp && this.hazard.watchers.find((x) =>
          !x.dead && Math.hypot(x.pos.x - wp.x, x.pos.z - wp.z) < 0.6);
        if (w) w.dead = true;
        this.cue('item', it.pos, '[the eye goes blind under the felt]');
        this.sound.emit({ x: it.pos.x, y: 1.2, z: it.pos.z, intensity: 0.25, category: 'item', caption: '[felt over the lens]' });
        return;
      }
      case 'drain': {
        // The Laundress fouls her basin — the crank answers to her while she works.
        for (const ent of this.entities) {
          if (ent.id !== 'laundress' || ent.state !== 'engage') continue;
          const w = ent as unknown as { drainPos: Vec3; guarding: boolean; aggravate: (p: Vec3) => void };
          if (!w.guarding || v3dist(it.pos, w.drainPos) > 0.9) continue;
          this.cue('puddle-splash', it.pos, "[the drain is choked with somebody's wash]", 'warn');
          w.aggravate(this.player.pos);
          return;
        }
        // The crank is loud once — then the water goes and the hall is quiet.
        it.enabled = false;
        const parts = it.id.split(':');
        const rIdx = Number(parts[1]);
        this.drainedRooms.add(`${this.space}:${rIdx}`);
        this.draining.set(rIdx, 0);
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: rIdx, kind: 'water', t: this.clock.time, readBy: [] });
        this.sound.emit({ x: it.pos.x, y: 0.9, z: it.pos.z, intensity: 0.55, category: 'machine', caption: '[the crank screams once]' });
        this.cue('puddle-splash', it.pos, '[the water finds the drain]', 'info');
        return;
      }
      case 'washer': {
        it.enabled = false;
        const key = it.id.replace(/^wash-/, '');
        const at = { x: it.pos.x, y: 0.7, z: it.pos.z };
        if (this.ranWashers.has(key)) {
          // Empty the drum — the load pays out, or it was never laundry
          this.emptiedWashers.add(key);
          const room = this.currentRoom;
          const roll = this.streams.roomStream('scare', room * 631 + Number(key.split(':')[2] ?? 0)).range(0, 1);
          if (roll < 0.55) {
            const take = 4 + Math.floor(roll * 20);
            this.marginalia += take;
            this.audio.play('purchase', at, `[the load pays out — ${take} marginalia]`);
          } else if (roll < 0.85) {
            this.audio.play('trap-snap', at, '[something metal, not a coin]', 'warn');
            this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.7, category: 'distraction', caption: '[a clank in the drum]' });
          } else {
            this.audio.play('pickup', at, '[wet cloth — that is all]');
          }
          return;
        }
        this.ranWashers.add(key);
        // a cycle you cannot stop: ~24s of thumping the house can hear — the
        // drum calls patrols to the laundry while you take the long way
        this.runningWashers.push({ pos: at, until: this.clock.time + 24, nextThump: this.clock.time + 1.2, key });
        this.audio.play('washer-spin', at, '[the drum spins up — it will not stop]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.5, category: 'machine', caption: '[a machine starts]' });
        return;
      }
      case 'typewriter': {
        it.enabled = false;
        this.typedKeys.add(it.id.replace(/^type-/, ''));
        // four struck keys, spaced like a word — a mechanical lure on the desk
        const at = { x: it.pos.x, y: 0.85, z: it.pos.z };
        for (let n = 0; n < 4; n++) {
          window.setTimeout(() => {
            this.audio.play('type-clack', at, n === 0 ? '[the key strikes — the ribbon spells nothing]' : '');
            this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.55, category: 'distraction', caption: '[a typewriter clacks]' });
          }, n * 350 + (n % 2) * 90);
        }
        return;
      }
      case 'printer': {
        it.enabled = false;
        const key = it.id.replace(/^print-/, '');
        this.printedPages.add(key);
        const at = { x: it.pos.x, y: 0.8, z: it.pos.z };
        const roll = this.streams.roomStream('scare', this.currentRoom * 647 + Number(key.split(':')[2] ?? 0)).range(0, 1);
        if (roll < 0.28) {
          // the paper jams — a grind the floor hears, no page
          this.audio.play('printer-jam', at, '[the feed jams — it grinds on empty]', 'warn');
          this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.6, category: 'machine', caption: '[a printer grinds]' });
          return;
        }
        this.audio.play('printer-whir', at, '[the machine warms — a page is coming]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.3, category: 'machine', caption: '' });
        if (this.space === 'under') {
          let exitIdx = -1;
          for (const r of this.route!.underRooms) {
            if (r.sockets.some((s) => s.meta.underExit === true)) { exitIdx = r.index; break; }
          }
          const msg = exitIdx >= 0 ? `[the page reads: the way out is ${Math.max(0, exitIdx - this.currentRoom)} doors on]`
            : '[the page reads: a floor plan with no exits marked]';
          window.setTimeout(() => this.cue('pickup', at, msg), 1400);
        } else {
          // the next locked door on the main route, as a count of rooms
          let lockIdx = -1;
          for (const r of this.route!.rooms) {
            if (r.index <= this.currentRoom) continue;
            if (r.doors.some((d) => d.locked)) { lockIdx = r.index; break; }
          }
          const msg = lockIdx >= 0 ? `[the page reads: the next lock waits ${lockIdx - this.currentRoom} doors on]`
            : '[the page reads: no locks ahead — the house lets you walk]';
          window.setTimeout(() => this.cue('pickup', at, msg), 1400);
        }
        return;
      }
      case 'seat': {
        it.enabled = false;
        this.satSeats.add(it.id.replace(/^seat-/, ''));
        // sit, exposed, while your breath comes back — three seconds you can't move
        this.resting = { until: this.clock.time + 3, x: it.pos.x, z: it.pos.z, crouch: this.player.crouching };
        this.player.frozen = true;
        this.player.crouching = true;
        this.cue('amb-settle', { x: it.pos.x, y: 0.6, z: it.pos.z }, '[you sit — the wood takes your weight]');
        this.sound.emit({ x: it.pos.x, y: 0.6, z: it.pos.z, intensity: 0.3, category: 'footstep', caption: '[a creak]' });
        return;
      }
      case 'cooler': {
        it.enabled = false;
        this.drunkCoolers.add(it.id.replace(/^cool-/, ''));
        const at = { x: it.pos.x, y: 1.0, z: it.pos.z };
        const bad = this.streams.roomStream('scare', this.currentRoom * 691 + Number(it.id.split(':')[2] ?? 0)).bool(0.3);
        if (bad) {
          this.audio.play('inkling-hiss', at, '[the water is wrong — tepid, thick]', 'warn');
          this.player.panic = Math.min(1, this.player.panic + 0.12);
        } else {
          this.player.health = Math.min(100, this.player.health + 6);
          this.cue('pickup', at, '[cold, real water — a small mercy]');
        }
        return;
      }
      case 'window': {
        it.enabled = false;
        this.lookedWindows.add(it.id.replace(/^win-/, ''));
        const at = { x: it.pos.x, y: 1.6, z: it.pos.z };
        const roll = this.streams.roomStream('scare', this.currentRoom * 683 + Number(it.id.split(':')[2] ?? 0)).range(0, 1);
        if (roll < 0.4) {
          this.cue('amb-settle', at, '[only fog — the hotel does not end]');
        } else if (roll < 0.75) {
          this.cue('amb-settle', at, `[the window shows the corridor you crossed — empty]`, 'warn');
        } else {
          this.audio.play('whisper', at, '[in the fog — someone looking up]', 'danger');
          this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.25, category: 'entity-cue', caption: '' });
          this.player.panic = Math.min(1, this.player.panic + 0.1);
        }
        return;
      }
      case 'hearth': {
        it.enabled = false;
        this.litHearths.add(it.id.replace(/^hearth-/, ''));
        // ~45s of firelight — heal slowly inside its circle while the crackle
        // murmurs to anything listening: the house sells you rest, loudly
        const at = { x: it.pos.x, y: 0.6, z: it.pos.z };
        this.spawnHearth(at);
        this.audio.play('fire-crackle', at, '[the hearth takes — warmth, and witnesses]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.5, category: 'machine', caption: '[a fire catches]' });
        return;
      }
      case 'valve': {
        it.enabled = false;
        this.crackedVents.add(it.id.replace(/^valve-/, ''));
        // ~26s of vented steam — inside ~7m your steps are drowned by the
        // hiss, which itself calls quietly to listeners: cover, not silence
        const at = { x: it.pos.x, y: 0.9, z: it.pos.z };
        this.steamMasks.push({ pos: at, until: this.clock.time + 26 });
        this.spawnSteamJet(at);
        this.audio.play('steam-hiss', at, '[steam hisses — steps drowned]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.5, category: 'machine', caption: '[steam vents]' });
        return;
      }
      case 'clock': {
        it.enabled = false;
        this.woundClocks.add(it.id.replace(/^clock-/, ''));
        // three struck chimes, each one a lure call on the clock's position —
        // the loudest noise a guest can make on purpose
        const at = { x: it.pos.x, y: 1.6, z: it.pos.z };
        for (let n = 0; n < 3; n++) {
          window.setTimeout(() => {
            this.audio.play('clock-chime', at, n === 0 ? '[the chime carries down the hall]' : '');
            this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 1.3, category: 'distraction', caption: '[a clock chimes]' });
          }, n * 1100);
        }
        return;
      }
      case 'tv': {
        it.enabled = false;
        const key = it.id.replace(/^tv-/, '');
        this.litTVs.add(key);
        // the flicker resolves to a steady dead channel — a fixed light in a
        // dark room, but the hiss carries
        this.tuneTVAt(this.currentRoom, Number(key.split(':')[2] ?? 0));
        const at = { x: it.pos.x, y: 1.2, z: it.pos.z };
        this.audio.play('tv-static', at, '[a station that was never broadcast]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.7, category: 'machine', caption: '[tv static]' });
        // ~1/3 of tuned sets answer back, a breath later
        const scare = this.streams.roomStream('scare', this.currentRoom + 383);
        if (scare.bool(0.32)) {
          this.tvAnswerQueue.push({ at: this.clock.time + 14 + scare.range(0, 12), pos: at });
        }
        return;
      }
      case 'piano': {
        it.enabled = false;
        this.playedPianos.add(it.id.replace(/^piano-/, ''));
        // three detuned strikes, same language as the building's own — the
        // emit point is the instrument, not you: play it and be elsewhere
        const at = { x: it.pos.x, y: 1.1, z: it.pos.z };
        this.audio.play('piano-wire', at, '[the piano answers, out of tune]');
        window.setTimeout(() => this.audio.play('piano-wire', at, '', 'info', 'sfx', 1.06), 140);
        window.setTimeout(() => this.audio.play('piano-wire', at, '', 'info', 'sfx', 0.5), 290);
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 1.5, category: 'distraction', caption: '[the piano sounds]' });
        return;
      }
      case 'underExit': {
        this.exitUnderscript();
        return;
      }
      default:
        return;
    }
  }

  private resolveSocketLoot(it: Interactable): void {
    const sock = it.data as { meta: Record<string, unknown>; filled?: boolean };
    const contains = sock.meta.contains as string | undefined;
    it.enabled = false;
    if (sock.meta) sock.meta.taken = true;
    if (sock.meta.arrivalRegister) {
      // Signing the register: arrival payoff — imprints, the first archive
      // document, and the door-handling tutorial caption.
      this.imprints += 25;
      this.stats.imprintsEarned += 25;
      const doc = DOCUMENTS[0];
      if (doc && !this.documents.some((d) => d.id === doc.id)) {
        this.documents.push({ ...doc, unlockedAt: Date.now() });
        this.meta.documents.push(doc.id);
        saveMeta(this.meta);
        useGameStore.setState({ documents: this.loadDocs() });
      }
      this.cue('arrival', it.pos, `[signed — the ledger notes your name · +25 imprints]`);
      this.arrival.push({
        t: this.clock.time + 6,
        text: `[Doors open with E. Shift slams them loud. Crouch opens them quiet.]`,
        sev: 'info', fired: false,
      });
      return;
    }
    if (sock.meta.bare === true) {
      this.cue('drawer', it.pos, '[the drawer is bare — someone else was through it first]');
      return;
    }
    if (contains === 'imprints' || contains === 'imprints-few' || contains === 'imprints-many') {
      const amt = (sock.meta.amount as number) ?? 12;
      this.imprints += amt;
      this.stats.imprintsEarned += amt;
      this.cue('pickup', it.pos, `[+${amt} imprints]`);
    } else if (contains === 'marginalia') {
      const amt = (sock.meta.amount as number) ?? 6;
      this.marginalia += amt;
      this.stats.marginaliaEarned += amt;
      this.cue('pickup', it.pos, `[+${amt} marginalia]`);
    } else if (contains === 'lore' || contains === 'document') {
      const doc = DOCUMENTS[Math.abs(this.streams.stream('loot').int(0, DOCUMENTS.length - 1)) % DOCUMENTS.length];
      if (doc && !this.documents.some((d) => d.id === doc.id)) {
        this.documents.push({ ...doc, unlockedAt: Date.now() });
        this.meta.documents.push(doc.id);
        saveMeta(this.meta);
        useGameStore.setState({ documents: this.loadDocs() });
        this.cue('pickup', it.pos, `[document: ${doc.title}]`);
      } else {
        this.imprints += 8;
        this.cue('pickup', it.pos, '[+8 imprints]');
      }
    } else if (contains && (ITEM_DEFS as Record<string, unknown>)[contains]) {
      this.giveItem(contains as ItemId, 1);
      this.cue('pickup', it.pos, `[${ITEM_DEFS[contains].name}]`);
    } else if (this.space === 'under') {
      this.marginalia += 6;
      this.stats.marginaliaEarned += 6;
      this.cue('pickup', it.pos, '[+6 marginalia]');
    } else {
      this.imprints += 6;
      this.cue('pickup', it.pos, '[+6 imprints]');
    }
  }

  /** Force a locked drawer without a latchpick — free, but loud enough
   *  for anything listening. */
  private forceDrawer(it: Interactable): void {
    const sock = it.data as { meta: Record<string, unknown>; pos: Vec3 };
    sock.meta.picked = true;
    this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 1.3, category: 'door', caption: '[wood splinters]' });
    this.cue('drawer', it.pos, '[forced — that carried]', 'warn');
    sock.meta.opened = true;
    it.enabled = false;
    const built = this.streamer.get(this.currentRoom);
    built?.group.traverse((o) => {
      if (o.userData.anim === 'drawerFront' && o.userData.sockKey === `${it.pos.x.toFixed(1)}|${it.pos.z.toFixed(1)}`) {
        o.userData.open = true;
      }
    });
    this.resolveSocketLoot(it);
  }

  private consumeKeyFor(lockId: string): boolean {
    const ki = this.inventory.find((i) => i.id === 'doorKey' && i.count > 0);
    if (ki) {
      ki.count--;
      return true;
    }
    const lp = this.inventory.find((i) => i.id === 'latchpick' && i.count > 0);
    if (lp) {
      lp.count--;
      this.cue('drawer', null, '[latchpick spent]');
      return true;
    }
    void lockId;
    return false;
  }

  private giveItem(id: ItemId, count = 1): void {
    const existing = this.inventory.find((i) => i.id === id);
    const def = ITEM_DEFS[id];
    const maxStack = def?.maxCharges ?? 1;
    if (existing) existing.count = Math.min(maxStack * 4, existing.count + count);
    else this.inventory.push({ id, count });
  }

  private useLamp(): void {
    const hasLamp = this.inventory.some((i) => i.id === 'handLamp' && i.count > 0);
    const hasPulse = this.inventory.some((i) => i.id === 'pulseLamp' && i.count > 0);
    if (hasPulse) {
      const pulseItem = this.inventory.find((i) => i.id === 'pulseLamp');
      if (!this.pulseLampOn && (pulseItem?.count ?? 0) <= 0) {
        this.cue('ui-click', null, '[the pulse lamp is spun out]', 'warn');
        return;
      }
      this.pulseLampOn = !this.pulseLampOn;
      this.heldView?.use('pulseLamp');
      this.cue('ui-click', null, this.pulseLampOn ? '[pulse lamp humming]' : '');
      return;
    }
    if (hasLamp) {
      const lampItem = this.inventory.find((i) => i.id === 'handLamp');
      if (!this.lampOn && (lampItem?.count ?? 0) <= 0) {
        this.cue('ui-click', null, '[the battery is dead]', 'warn');
        return;
      }
      this.lampOn = !this.lampOn;
      this.heldView?.use('handLamp');
      this.cue('ui-click', null, this.lampOn ? '[lamp on]' : '[lamp off]');
    }
  }

  private useActiveSlot(): void {
    const slotItems = this.inventory.filter((i) => ITEM_DEFS[i.id]?.slotItem);
    const item = slotItems[this.activeSlot];
    // lamps pass through at 0 charge so their case can report the dead battery
    if (!item || (item.count <= 0 && item.id !== 'handLamp' && item.id !== 'pulseLamp')) return;
    this.heldView?.use(item.id);
    switch (item.id) {
      case 'handLamp':
        if (!this.lampOn && item.count <= 0) {
          this.cue('ui-click', null, '[the battery is dead]', 'warn');
          return;
        }
        this.lampOn = !this.lampOn;
        return;
      case 'pulseLamp':
        if (this.pulseLampOn) {
          // crank while on: +charge, but the hum carries
          item.count = Math.min(100, item.count + 30);
          this.cue('ui-click', null, '[pulse lamp cranked]', 'info');
          this.sound.emit({ x: this.player.pos.x, y: 1.2, z: this.player.pos.z, intensity: 0.7, category: 'item', caption: '[lamp crank]' });
        } else if (item.count > 0) {
          this.pulseLampOn = true;
        } else {
          this.cue('ui-click', null, '[the pulse lamp is spun out]', 'warn');
        }
        return;
      case 'sparkFlash':
        item.count--;
        this.cue('spark-flash', null, '[a white reprieve]', 'info');
        for (const e of this.entities) {
          if ('stun' in e && typeof (e as { stun: (s: number) => void }).stun === 'function') {
            (e as { stun: (s: number) => void }).stun(3);
          }
        }
        this.sound.emit({ x: this.player.pos.x, y: 1.5, z: this.player.pos.z, intensity: 0.9, category: 'item', caption: '[spark flash]' });
        return;
      case 'tonic':
        item.count--;
        this.player.stamina = 100;
        this.player.speedMul = 1.12;
        {
          const p = this.player;
          setTimeout(() => {
            if (this.player === p) p.speedMul = 1;
          }, 90000);
        }
        this.cue('heal', null, '[tonic — lungs open]');
        return;
      case 'bandage':
        if (this.player.health < 100) {
          item.count--;
          this.player.health = Math.min(100, this.player.health + 40);
          this.cue('heal', null, '[bandaged]');
        }
        return;
      case 'doorChock':
        this.cue('ui-click', null, '[set it under a shut door — crouch at one]', 'info');
        return;
      case 'windAlarm': {
        item.count--;
        // Plant a ticking lure ~1.2m ahead on the floor. It ticks for 14s
        // then rings once — sound-hunters go to it, not to you.
        const fwd = v3();
        this.player.lookDir(fwd);
        const pos = v3(this.player.pos.x + fwd.x * 1.2, 0, this.player.pos.z + fwd.z * 1.2);
        pos.y = (this.activeRooms()[this.currentRoom]?.origin.y ?? 0) + 0.12;
        const mesh = modelInstance('wallClock', 0.6) ?? new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), MAT.brass());
        mesh.position.copy(pos as unknown as THREE.Vector3);
        this.entityGroup.add(mesh);
        this.lures.push({ pos, mesh, until: this.clock.time + 14, nextTick: this.clock.time + 0.8, rang: false });
        this.cue('alarm-tick', pos, '[the alarm starts to tick]', 'info');
        this.sound.emit({ x: pos.x, y: pos.y, z: pos.z, intensity: 0.5, category: 'item', caption: '[wind-up key]' });
        return;
      }
      case 'feltWrap':
        item.count--;
        this.player.noiseMul = 0.4;
        {
          const p = this.player;
          setTimeout(() => {
            if (this.player === p) p.noiseMul = 1;
          }, 120000);
        }
        this.cue('heal', null, '[steps muffled]');
        return;
      case 'chalkSpool': {
        item.count--;
        // Mark the focused door (or nearest within 3m) with a chalk tally —
        // persistent for the run, readable in the dark.
        const focused = this.interaction.focused;
        let target = focused?.kind === 'door' ? (focused.data as Door) : undefined;
        if (!target) {
          let bd = 3;
          for (const r of this.activeRooms()) {
            for (const d of r.doors) {
              const dist = v3dist(d.pos, this.player.pos);
              if (dist < bd) { bd = dist; target = d; }
            }
          }
        }
        if (target && !target.falseDoor) {
          this.chalkMarks.set(target.id, { pos: target.pos, yaw: target.yaw, label: target.label });
          this.cue('chalk-mark', target.pos, `[marked — Door ${target.label}]`);
        } else {
          this.cue('afterglow-hint', null, '[chalk needs a threshold]');
        }
        return;
      }
      case 'wardSeal':
        item.count--;
        // Arm one protection charge — consumed by next lethal corridor threat.
        this.wardArmed = true;
        this.cue('checkpoint', null, '[ward armed — it will refuse once]');
        return;
      default:
        return;
    }
  }

  private wardArmed = false;

  /** Chalk marks left on doors this run: doorId → placement. */
  private chalkMarks = new Map<string, { pos: Vec3; yaw: number; label: string }>();

  /** Chalk tally texture — unlit so it reads faintly in unlit rooms. */
  private static chalkTex: THREE.Texture | null = null;
  private static chalkMaterial(): THREE.MeshBasicMaterial | null {
    if (typeof document === 'undefined') return null;
    if (!Game.chalkTex) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(232,228,214,0.95)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      // crossed tally: four strokes + a diagonal — wobbly for a hand-drawn feel
      for (let i = 0; i < 4; i++) {
        const x = 16 + i * 9;
        ctx.beginPath();
        ctx.moveTo(x + (i % 2), 16 + (i % 3));
        ctx.lineTo(x - (i % 2), 46 - (i % 3));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(12, 44);
      ctx.lineTo(52, 20);
      ctx.stroke();
      const tex = new THREE.CanvasTexture(cv);
      Game.chalkTex = tex;
    }
    return new THREE.MeshBasicMaterial({
      map: Game.chalkTex, transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide,
    });
  }

  /** Hand-drawn "down" scuff for the sealed passage — once per built room. */
  private static gateTex: THREE.Texture | null = null;
  private static gateMaterial(): THREE.MeshBasicMaterial | null {
    if (typeof document === 'undefined') return null;
    if (!Game.gateTex) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(210,200,180,0.9)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      // a wobbly hand-drawn arrow pointing down
      ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(31, 46); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 34); ctx.lineTo(31, 50); ctx.lineTo(48, 33); ctx.stroke();
      const tex = new THREE.CanvasTexture(cv);
      Game.gateTex = tex;
    }
    return new THREE.MeshBasicMaterial({
      map: Game.gateTex, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide,
    });
  }

  private ensureGateMark(roomIndex: number, built: { group: THREE.Group }): void {
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    const sock = room.sockets.find((s) => s.meta.underDoor === true);
    if (!sock) return;
    if (built.group.getObjectByName('gate-mark')) return;
    const mat = Game.gateMaterial();
    if (!mat) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat);
    m.name = 'gate-mark';
    m.rotation.x = -Math.PI / 2;
    m.position.set(sock.pos.x, 0.03, sock.pos.z + 0.55);
    m.renderOrder = 2;
    built.group.add(m);
  }

  /** Deep doors open onto only dark — an opaque quad masks the branch closet
   *  behind them (one-directional: visible from the parent room only). */
  private ensureDeepVoid(roomIndex: number, built: { group: THREE.Group }): void {
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    for (const d of room.doors) {
      if (!d.deep) continue;
      const name = `deep-void-${d.id}`;
      if (built.group.getObjectByName(name)) continue;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2.35),
        new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
      );
      m.name = name;
      // sit just inside the closet, normal facing back toward the parent room
      m.position.set(d.pos.x - Math.sin(d.yaw) * 0.4, 1.15, d.pos.z - Math.cos(d.yaw) * 0.4);
      m.rotation.y = d.yaw + Math.PI;
      m.renderOrder = 3;
      built.group.add(m);
    }
  }

  private readonly deepSeen = new Set<string>();
  private maybeDeepReveal(): void {
    for (const i of this.streamer.builtIndices) {
      const room = this.activeRooms()[i];
      if (!room) continue;
      for (const d of room.doors) {
        if (!d.deep || d.openT < 0.6 || this.deepSeen.has(d.id)) continue;
        const dx = this.player.pos.x - d.pos.x;
        const dz = this.player.pos.z - d.pos.z;
        if (dx * dx + dz * dz > 4) continue;
        this.deepSeen.add(d.id);
        this.cue('door-locked', d.pos, '[deeper than it looked]', 'warn');
        this.sound.emit({ x: d.pos.x, y: 1, z: d.pos.z, intensity: 0.35, category: 'door', caption: '[the door shows only dark]' });
      }
    }
  }

  /** Seeded per-room light character — temperature tint + ragged brightness,
   *  so rooms stop reading on one uniform warm palette. */
  private readonly tinted = new Set<object>();
  private ensureRoomTint(roomIndex: number, built: { group: THREE.Group; lights: THREE.PointLight[] }): void {
    if (this.tinted.has(built)) return;
    this.tinted.add(built);
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    const rng = this.streams.roomStream('dressing', roomIndex + 41);
    const biome = this.space === 'under' ? 'underscript' : (room.biome ?? 'corridor');
    const palette: Record<string, number[]> = {
      guest: [0xffd8a8, 0xffc890, 0xffe0c0],
      lobby: [0xffd8a8, 0xffe0c0, 0xf0e0d0],
      milestone: [0xffe0c0, 0xffffff],
      gallery: [0xffe0c0, 0xf0d8c0],
      records: [0xf0d8b8, 0xe8d8c0],
      maintenance: [0xd8e4ff, 0xd4e8d8, 0xe0e8f0],
      corridor: [0xffd0a0, 0xe8dcd0, 0xd8e4e8],
      underscript: [0xc8d4e8, 0xd0dce8],
    };
    const pal = palette[biome] ?? palette.corridor;
    const tint = new THREE.Color(pal[rng.int(0, pal.length - 1)]);
    for (const l of built.lights) {
      l.color.lerp(tint, 0.35);
      l.userData.baseIntensity = (l.userData.baseIntensity as number) * rng.range(0.88, 1.14);
    }
  }

  /** Attach chalk marks to built rooms' doors (re-applied as rooms stream). */
  private ensureChalkMarks(roomIndex: number, built: { group: THREE.Group }): void {
    if (this.chalkMarks.size === 0) return;
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    for (const d of room.doors) {
      const mark = this.chalkMarks.get(d.id);
      if (!mark) continue;
      const name = `chalk-${d.id}`;
      if (built.group.getObjectByName(name)) continue;
      const mat = Game.chalkMaterial();
      if (!mat) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
      m.name = name;
      // face the room's interior — chalk lives on the side you marked from
      const inward = Math.atan2(room.origin.x - d.pos.x, room.origin.z - d.pos.z);
      m.rotation.y = inward;
      const off = 0.07;
      m.position.set(
        d.pos.x + Math.sin(inward) * off,
        d.pos.y + 1.62,
        d.pos.z + Math.cos(inward) * off,
      );
      m.renderOrder = 2;
      built.group.add(m);
    }
  }

  /* ==================== underscript ==================== */

  private enterUnderscript(): void {
    if (!this.route?.underRooms.length) return;
    this.space = 'under';
    this.streamer.setSpace('under');
    const first = this.route.underRooms[0];
    this.player.teleport(first.entryPos.x, first.entryPos.y ?? 0, first.entryPos.z, 0);
    this.currentRoom = 0;
    this.cue('door-open', null, '[the floor accepts the key]', 'info');
    this.audio.setMood('under');
    this.entities.forEach((e) => e.dispose());
    this.entities = [];
    this.clearRats();
    // scare state is space-scoped — armed beats die at the threshold
    this.doorTry = null;
    this.breathingRoom = -1;
    this.pianoRoom = -1;
    if (this.bookDrop?.mesh) this.entityGroup.remove(this.bookDrop.mesh);
    this.bookDrop = null;
    this.echoRoom = -1;
    this.echoQueue.length = 0;
    this.phoneRing = null;
    this.stats.underscriptDeepest = Math.max(this.stats.underscriptDeepest, 0);
    this.checkpoint = this.makeCheckpoint(0);
    saveCheckpoint(this.checkpoint);
  }

  private exitUnderscript(): void {
    if (!this.route) return;
    this.space = 'main';
    this.streamer.setSpace('main');
    const back = this.route.rooms[Math.min(this.route.underReturn, this.route.rooms.length - 1)];
    this.player.teleport(back.entryPos.x, 0, back.entryPos.z);
    this.currentRoom = back.index;
    this.cue('door-open', null, '[you resurface]', 'info');
    this.audio.setMood('calm');
    this.entities.forEach((e) => e.dispose());
    this.entities = [];
    this.clearRats();
    this.doorTry = null;
    this.breathingRoom = -1;
    this.pianoRoom = -1;
    if (this.bookDrop?.mesh) this.entityGroup.remove(this.bookDrop.mesh);
    this.bookDrop = null;
    this.echoRoom = -1;
    this.echoQueue.length = 0;
    this.phoneRing = null;
    if (this.stats.underscriptDeepest >= this.route.underRooms.length - 1) {
      this.stats.underscriptCompleted = true;
      if (!this.inventory.some((i) => i.id === 'palimpsest')) this.giveItem('palimpsest');
      this.cue('victory', null, '[the Palimpsest is yours]', 'info');
    }
    this.checkpoint = this.makeCheckpoint(this.currentRoom);
    saveCheckpoint(this.checkpoint);
  }

  private makeCheckpoint(roomIndex: number): CheckpointSave {
    return {
      seedText: this.route?.seedText ?? '',
      difficulty: useGameStore.getState().difficulty,
      roomIndex: this.space === 'under' ? 0 : roomIndex,
      underIndex: this.space === 'under' ? roomIndex : 0,
      inUnderscript: this.space === 'under',
      health: this.player.health,
      imprints: this.imprints,
      marginalia: this.marginalia,
      inventory: this.inventory.map((i) => ({ ...i })),
      stats: { ...this.stats, entityEncounters: { ...this.stats.entityEncounters } },
    };
  }

  /* ==================== damage/death/victory ==================== */

  private damagePlayer(amount: number, source: EntityId, hint: string): void {
    if (this.godMode) return;
    if (this.player.dead) return;
    if (this.wardArmed && amount >= 50) {
      this.wardArmed = false;
      this.cue('stabilize-good', null, '[the ward seal refuses — once]', 'info');
      return;
    }
    this.player.health -= amount;
    if (this.player.health <= 0) this.killPlayer(source, hint);
  }

  private killPlayer(source: EntityId, hint: string): void {
    if (this.player.dead) return;
    this.player.dead = true;
    this.lastDeathCause = source;
    this.deathCount[source] = (this.deathCount[source] ?? 0) + 1;
    this.deathEcho = { room: this.currentRoom, space: this.space, fired: false };
    this.stats.deaths++;
    this.meta.deaths++;
    saveMeta(this.meta);
    this.audio.play('death', null, '', 'danger');
    this.audio.setMood('off');
    this.audio.setRoomTone('off');
    const doc = DOCUMENTS.find((d) => d.id === `doc-${source}`);
    if (doc && !this.documents.some((d) => d.id === doc.id)) {
      this.documents.push({ ...doc, unlockedAt: Date.now() });
      this.meta.documents.push(doc.id);
      saveMeta(this.meta);
    }
    setTimeout(() => {
      useGameStore.setState({
        phase: 'DEAD', paused: true,
        deathInfo: { cause: source, hint: DEATH_HINTS[source] ?? hint, entity: source },
      });
      document.exitPointerLock?.();
      this.audio.setMood('menu');
    }, 1200);
    this.clock.stop();
    this.audio.suspend();
  }

  private victory(): void {
    this.stats.victory = true;
    this.stats.endedAt = Date.now();
    this.meta.victories++;
    this.meta.bestRoom = Math.max(this.meta.bestRoom, this.currentRoom);
    saveMeta(this.meta);
    clearCheckpoint();
    this.audio.play('victory', null, '', 'info');
    this.audio.setMood('menu');
    this.audio.setRoomTone('off');
    useGameStore.setState({ phase: 'COMPLETE', victoryInfo: { stats: this.stats }, paused: true });
    document.exitPointerLock?.();
    this.clock.stop();
  }

  retryFromCheckpoint(): void {
    const cp = this.checkpoint ?? loadCheckpoint();
    if (!cp) {
      useGameStore.setState({ phase: 'MENU', paused: true });
      return;
    }
    this.stats = cp.stats;
    this.stats.retries++;
    this.startRun({ seedText: cp.seedText, difficulty: cp.difficulty, checkpoint: cp });
  }

  quitToMenu(): void {
    this.audio.setRoomTone('off');
    useGameStore.setState({ phase: 'MENU', paused: true, menuPage: 'title' });
    document.exitPointerLock?.();
    this.audio.setMood('menu');
  }

  pause(): void {
    if (useGameStore.getState().phase !== 'PLAYING') return;
    useGameStore.setState({ phase: 'PAUSED', paused: true, menuPage: 'pause' });
    document.exitPointerLock?.();
    this.audio.suspend();
  }

  resume(): void {
    useGameStore.setState({ phase: 'PLAYING', paused: false, menuPage: 'title' });
    this.audio.resume();
    void this.canvas.requestPointerLock();
  }

  applySettings(s: SettingsData): void {
    this.settings = s;
    saveSettings(s);
    this.audio.applySettings(s);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.streamer.setQuality(s.quality);
    const q = QUALITY[s.quality];
    this.basePixelRatio = Math.min(window.devicePixelRatio, q.pixelRatioCap);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.postGov?.hardReset();
    this.scene.fog = new THREE.FogExp2(0x050505, q.fogDensity);
    useGameStore.setState({ settings: s });
  }

  private loadDocs(): Document[] {
    const base = DOCUMENTS.filter((d) => this.meta.documents.includes(d.id));
    return [...base, ...this.documents.filter((d) => !base.some((b) => b.id === d.id))];
  }

  /* ==================== per-frame ==================== */

  private roomAabb(r: RoomInstance): Aabb {
    let a = this.roomBounds.get(r.index + (this.space === 'under' ? 10000 : 0));
    if (!a) {
      const swap = Math.round(r.yaw / (Math.PI / 2)) % 2 !== 0;
      const w = swap ? r.depth : r.width;
      const d = swap ? r.width : r.depth;
      a = aabb(r.origin.x, r.height / 2, r.origin.z, w / 2 + 0.5, r.height / 2, d / 2 + 0.5);
      this.roomBounds.set(r.index + (this.space === 'under' ? 10000 : 0), a);
    }
    return a;
  }

  private currentRoomIndex(): number {
    const rooms = this.activeRooms();
    for (const r of rooms) {
      if (aabbContainsPoint(this.roomAabb(r), this.player.pos.x, this.player.pos.y + 0.5, this.player.pos.z)) {
        return r.index;
      }
    }
    // branch closets
    for (const b of this.route?.branchRooms ?? []) {
      if (aabbContainsPoint(this.roomAabb(b), this.player.pos.x, this.player.pos.y + 0.5, this.player.pos.z)) {
        return b.branchOf ?? this.currentRoom;
      }
    }
    return this.currentRoom;
  }

  /** Every door object within one doorway's width of pos, across built rooms. */
  private doorsAt(pos: Vec3): RoomInstance['doors'] {
    const rooms = this.activeRooms();
    const out: RoomInstance['doors'] = [];
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (!r) continue;
      for (const d of r.doors) {
        const dx = d.pos.x - pos.x;
        const dz = d.pos.z - pos.z;
        if (dx * dx + dz * dz < 1.2) out.push(d);
      }
    }
    return out;
  }

  private collectBlockers(): Aabb[] {
    const rooms = this.activeRooms();
    const out: Aabb[] = [];
    const addRoom = (r: RoomInstance) => {
      out.push(...r.colliders);
      // closed doors block
      for (const d of r.doors) {
        if (d.openT < 0.5) {
          const w = Math.abs(Math.sin(d.yaw)) > 0.5 ? 1.0 : 0.35;
          const dd = Math.abs(Math.sin(d.yaw)) > 0.5 ? 0.35 : 1.0;
          out.push(aabb(d.pos.x, 1.1, d.pos.z, w, 1.1, dd));
        }
      }
    };
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (r) addRoom(r);
    }
    return out;
  }

  private spawnScheduled(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room) return;
    for (const sch of room.scheduled) {
      const key = `${this.space}-${sch.entity}-${sch.triggerRoom}-${sch.seed}`;
      if (sch.triggerRoom !== this.currentRoom || this.spawned.has(key)) continue;
      this.spawned.add(key);
      this.spawnById(sch.entity, sch.passes);
    }
    // milestone entry hooks
    const ms = this.milestones.get(this.currentRoom);
    if (ms && 'enter' in ms && !this.spawned.has(`ms-${this.currentRoom}`)) {
      this.spawned.add(`ms-${this.currentRoom}`);
      (ms as { enter?: () => void }).enter?.();
    }
    // safe rooms checkpoint on entry whether or not they run a milestone
    if (!this.spawned.has(`cp-${this.currentRoom}`) && SAFE_ROOM_TEMPLATES.has(room.templateId)) {
      this.spawned.add(`cp-${this.currentRoom}`);
      this.checkpoint = this.makeCheckpoint(this.currentRoom);
      saveCheckpoint(this.checkpoint);
      this.cue('checkpoint', null, '[a breath — progress recorded]', 'info');
    }
    this.foreshadowRoom(room);
  }

  /** The milestone-only entities never spawn in ordinary rooms, but the House
   *  lets them be heard: seeded ambient foreshadowing. Pursuer footfalls mass
   *  ahead of the chases, the Curator turns pages in the deep stacks, the
   *  maintenance spine ticks, and the Unlit stretch groans under the House. */
  private foreshadowRoom(room: RoomInstance): void {
    const key = `fs-${this.space}-${room.index}`;
    if (this.space !== 'main' || room.authored || room.biome === 'safe' || this.spawned.has(key)) return;
    this.spawned.add(key);
    const rng = this.streams.roomStream('scare', room.index + 3077);
    const rooms = this.activeRooms();
    const ahead = rooms[Math.min(room.index + 1, rooms.length - 1)];
    const far = { x: ahead.origin.x, y: ahead.origin.y + 1.4, z: ahead.origin.z };
    for (const chase of [30, 80]) {
      const d = chase - room.index;
      if (d >= 1 && d <= 5 && rng.bool(0.3 + (5 - d) * 0.12)) {
        this.cue('husk-foot', far, '[heavy footfalls, far ahead — then nothing]', 'warn');
        this.sound.emit({ x: far.x, y: 1.2, z: far.z, intensity: 0.3, category: 'footstep', caption: '' });
        return;
      }
    }
    if (room.index >= 45 && (room.biome === 'records' || room.biome === 'gallery') && rng.bool(0.22)) {
      this.cue('book-drop', far, '[pages turning somewhere deep in the stacks]', 'info');
      return;
    }
    if (room.biome === 'maintenance' && rng.bool(0.3)) {
      this.cue(rng.bool(0.4) ? 'steam-hiss' : 'pipe-tick', far, '[metal fatigues in the walls]', 'info');
      return;
    }
    if (room.biome === 'unlit' && rng.bool(0.35)) {
      this.cue('amb-distant', far, '[the House groans somewhere below]', 'warn');
    }
  }

  private updatePanic(dt: number): void {
    const p = this.player;
    if (!p.hiddenSpot) {
      p.panic = Math.max(0, p.panic - dt * 0.25);
      return;
    }
    // panic only rises while a corridor threat is near
    const threatNear = this.entities.some(
      (e) => e instanceof CorridorRunner && e.state === 'engage' && v3dist(e.posApprox(), p.pos) < 30,
    );
    const progress = clamp(this.currentRoom / 100, 0, 1);
    const safeTime = (this.currentRoom < PANIC.graceRoomLimit ? PANIC.graceSafeTime : PANIC.baseSafeTime + (PANIC.lateSafeTime - PANIC.baseSafeTime) * progress);
    const mod = DIFFICULTY[useGameStore.getState().difficulty].panicSafeMul;
    if (threatNear) {
      p.panic += dt / (safeTime * mod);
      if (p.panic > PANIC.warningAt && Math.random() < dt * 2) {
        this.cue('panic-beat', null, '[your breath betrays the cabinet]', 'warn');
      }
      if (p.panic >= 1) {
        p.panicEject(this.clock.time);
        this.cue('panic-eject', null, '[panic throws you out]', 'danger');
      }
    } else {
      p.panic = Math.max(0, p.panic - dt * 0.15);
    }
  }

  /** Braced leaves stay held only while the player's weight is on them —
   *  stepping away or the leaf swinging open releases the brace. */
  private updateBraces(): void {
    let letGo = false;
    this.bracedDoors = this.bracedDoors.filter((d) => {
      if (d.heldBy !== 'player') return false;
      const p = this.player.pos;
      if (d.openT > 0.05 || Math.hypot(p.x - d.pos.x, p.z - d.pos.z) > 1.7) {
        d.heldBy = undefined;
        letGo = true;
        return false;
      }
      return true;
    });
    if (letGo) this.cue('door-breath', null, '[you let go]');
  }

  private updateDoors(dt: number): void {
    const rooms = this.activeRooms();
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (!r) continue;
      for (const d of r.doors) {
        if (d.opening && d.openT < 1) {
          d.openT = Math.min(1, d.openT + dt * 1.8 * (d.openRate ?? 1));
          // Roused encounters pre-spawn as soon as the leaf has swung —
          // the thing beyond is live before the player crosses in.
          if (d.openT >= 0.6 && !this.rousedSpawned.has(d.id)) {
            this.rousedSpawned.add(d.id);
            this.spawnRousedThrough(d);
          }
        } else if (!d.opening && d.openT > 0) {
          d.openT = Math.max(0, d.openT - dt * 2.2);
        }
        // animate leaf(es)
        const built = this.streamer.get(r.index);
        if (built) {
          const leaf = built.doorLeaves.get(this.doorLeafKey(r, d));
          this.syncLockHardware(d, leaf);
          if (leaf) {
            const hinge = leaf.userData.hinge as THREE.Group | undefined;
            if (hinge) {
              hinge.rotation.y = -d.openT * 1.9;
              // handle-rattle beat: the leaf shudders in its frame
              if (this.doorTry && this.doorTry.id === d.id && this.clock.time < this.doorTry.until) {
                hinge.rotation.y += Math.sin(this.clock.time * 38) * 0.04;
              }
            }
          }
          // mirrored leaf on the other side of the boundary (prev room's out port)
          if (d.id === `door-${r.index}-in`) {
            const prev = this.streamer.get(r.index - 1);
            if (prev) {
              const prevRoom = rooms.find((x) => x.index === r.index - 1);
              if (prevRoom?.spec) {
                const ex = prevRoom.spec.exits[0];
                const k = `door-${r.index - 1}-out-${ex.wall}${ex.offset.toFixed(1)}`;
                const leaf2 = prev.doorLeaves.get(k);
                this.syncLockHardware(d, leaf2);
                if (leaf2) {
                  const hinge2 = leaf2.userData.hinge as THREE.Group | undefined;
                  if (hinge2) hinge2.rotation.y = d.openT * 1.9;
                }
              }
            }
          }
        }
      }
      // doors close behind the player on the main route
      for (const d of r.doors) {
        if (d.opening && d.openT >= 1 && d.isMainRoute && r.index < this.currentRoom) {
          d.opening = false;
        }
      }
    }
    void dt;
  }

  /** Leaf map key for a door record — branch toll doors live on the parent's
   *  out port, keyed by wall+offset rather than by door id. */
  private doorLeafKey(room: RoomInstance, d: RoomInstance['doors'][number]): string {
    const m = /^door-(-?\d+)-b(\d+)$/.exec(d.id);
    if (m) {
      const ex = room.spec?.exits[Number(m[2])];
      if (ex) return `door-${room.index}-out-${ex.wall}${ex.offset.toFixed(1)}`;
    }
    return d.id;
  }

  /** Locked doors wear their state — a chained hasp on key-locked leaves, a
   *  brass toll plate on 'it asks a toll' doors. Attached/detached with
   *  d.locked so unlocking strips the hardware off the leaf. */
  private syncLockHardware(d: RoomInstance['doors'][number], leaf: THREE.Object3D | undefined): void {
    if (!leaf) return;
    const hw = leaf.getObjectByName('lockHw');
    if (!d.locked) {
      if (hw) leaf.remove(hw);
      return;
    }
    if (hw) return;
    const toll = d.lockId === 'toll';
    const inst = modelInstance(toll ? 'tollPlate' : 'doorChain', 0);
    if (!inst) return;
    inst.name = 'lockHw';
    const leafW = (leaf.userData.leafW as number | undefined) ?? 0.9;
    inst.position.set(leafW / 2 - 0.18, toll ? 0.05 : -0.02, 0.055);
    leaf.add(inst);
  }

  /* ==================== atmosphere ==================== */

  private readonly fogTargets: Record<string, { d: number; c: number }> = {
    lobby: { d: 0.04, c: 0x060606 },
    corridor: { d: 0.055, c: 0x060606 },
    guest: { d: 0.05, c: 0x060606 },
    records: { d: 0.05, c: 0x070706 },
    gallery: { d: 0.04, c: 0x080806 },
    maintenance: { d: 0.075, c: 0x070a08 },
    unlit: { d: 0.08, c: 0x040404 },
    milestone: { d: 0.045, c: 0x060606 },
    safe: { d: 0.03, c: 0x060606 },
    underscript: { d: 0.09, c: 0x050806 },
  };

  private updateAtmosphere(dt: number): void {
    for (const a of this.arrival) {
      if (!a.fired && this.clock.time >= a.t) {
        a.fired = true;
        this.cue('arrival', null, a.text, a.sev);
      }
    }
    // Fog eases toward the current biome's density/tint.
    const fog = this.scene.fog as THREE.FogExp2 | null;
    const cur = this.activeRooms()[this.currentRoom];
    const target = cur ? (this.fogTargets[cur.biome] ?? { d: 0.05, c: 0x060606 }) : { d: 0.05, c: 0x060606 };
    if (fog) {
      const k = Math.min(1, dt * 0.9);
      const targetD = target.d * (QUALITY[this.settings.quality].fogDensity / 0.05);
      fog.density += (targetD - fog.density) * k;
      fog.color.lerp(new THREE.Color(target.c), k);
    }

    // Corridor telegraph: darkness wave crawling along each warning runner's
    // pass span — rooms behind the front go near-black, the front pulses dim.
    this.telegraphMul.clear();
    for (const e of this.entities) {
      const ts = e.telegraphSpan();
      if (!ts) continue;
      const front = ts.dir > 0 ? ts.lo + ts.frac * (ts.hi - ts.lo) : ts.hi - ts.frac * (ts.hi - ts.lo);
      for (let i = ts.lo; i <= ts.hi; i++) {
        const rel = ts.dir * (i - front);
        const m = rel <= 0 ? 0.12 : rel <= 1 ? 0.35 : rel <= 2 ? 0.65 : 1;
        this.telegraphMul.set(i, Math.min(this.telegraphMul.get(i) ?? 1, m));
      }
    }

    for (const i of this.streamer.builtIndices) {
      const built = this.streamer.get(i);
      if (!built) continue;
      this.ensureChalkMarks(i, built);
      this.ensureGateMark(i, built);
      this.ensureDeepVoid(i, built);
      this.ensureRoomTint(i, built);
      this.ensureWallWords(i, built);
      this.ensureTenant(i, built);
      this.ensureCoffin(i, built);
      this.ensureTV(i, built);
      this.ensureTrap(i, built);
      this.ensureWasher(i, built);
      this.ensureLuggage(i, built);
      this.ensureStatue(i, built);
      this.ensureRug(i, built);
      this.ensureChandelier(i, built);
      this.ensureCam(i, built);
      const wrong = this.relabeled.get(i);
      if (wrong) this.applyWrongPlate(i, wrong);
      this.ensureBroker(i);
      this.tickDoorListening(i);
      const t = this.clock.time;
      const dead = this.blackedOut.has(i);
      // breathing rooms pulse their lights on a slow cycle
      const breath = i === this.breathingRoom ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.9)) : 1;
      const tele = this.telegraphMul.get(i) ?? 1;
      let roomMul = 0, roomMulN = 0;
      for (const l of built.lights) {
        const lamp = l.userData.lampMesh as THREE.Mesh | undefined;
        if (dead) {
          l.intensity = 0;
          if (lamp) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.02;
          continue;
        }
        if (!l.userData.flicker) l.intensity = (l.userData.baseIntensity as number) * breath * tele;
        else {
          const s = (l.userData.flickerSeed as number) ?? 0;
          // Squared-off pseudo-noise: mostly steady with occasional deep dips.
          const n = Math.sin(t * 11.3 + s) * Math.sin(t * 5.7 + s * 1.7) * Math.sin(t * 2.9 + s * 0.6);
          const f = n > 0.82 ? 0.15 : n > 0.62 ? 0.55 : 1.0;
          l.intensity = (l.userData.baseIntensity as number) * f * breath * tele;
        }
        // Fixture glow tracks the light's real output — including dim,
        // break and telegraph writes to baseIntensity.
        const ob = (l.userData.origBaseIntensity as number) || 1;
        roomMul += l.intensity / ob; roomMulN++;
        if (lamp) {
          (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(1.6, Math.max(0.04, 1.4 * (l.intensity / ob)));
        }
      }
      roomMul = roomMulN ? Math.min(1.3, roomMul / roomMulN) : 1;
      // Glow decals (shafts, pools, sconce throws) ride the same multiplier
      // as their light — resolved lazily through lsRef/lightRef.
      for (const m of built.shafts) {
        const mat = m.material as THREE.MeshBasicMaterial;
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = mat.opacity;
        if (m.userData.lightRef === undefined) {
          m.userData.lightRef = m.userData.lsRef
            ? built.lights.find((l) => l.userData.ls === m.userData.lsRef) ?? null
            : null;
        }
        const lr = m.userData.lightRef as THREE.PointLight | null;
        if (!lr) continue;
        const ob = (lr.userData.origBaseIntensity as number) || 1;
        const mul = Math.min(1.3, Math.max(0, lr.intensity / ob));
        mat.opacity = (m.userData.baseOpacity as number) * mul;
      }
      if (built.dust) {
        built.dust.rotation.y += dt * 0.02;
        built.dust.position.y = Math.sin(t * 0.13 + (built.dust.userData.phase as number)) * 0.12;
        // Motes need light to catch — thin them out as the room dims.
        const dm = built.dust.material as THREE.PointsMaterial;
        if (built.dust.userData.baseOpacity === undefined) built.dust.userData.baseOpacity = dm.opacity;
        dm.opacity = (built.dust.userData.baseOpacity as number) * (dead ? 0 : Math.min(1, roomMul));
      }
      if (built.drips) {
        const pos = built.drips.geometry.getAttribute('position') as THREE.BufferAttribute;
        const tops = built.drips.userData.tops as Float32Array;
        const speeds = built.drips.userData.speeds as Float32Array;
        const phases = built.drips.userData.phases as Float32Array;
        for (let pi = 0; pi < pos.count; pi++) {
          const top = tops[pi];
          const y = top - ((t * speeds[pi] + phases[pi]) % top);
          pos.setY(pi, y);
        }
        pos.needsUpdate = true;
      }
      if (this.dread < 0.55) this.clockT += this.clock.dt;
      // Powered devices (LEDs, monitors, tuned screens) share the room's
      // mains — they dim and die with its lights. Open flame does not.
      const deviceMul = dead ? 0 : Math.min(1, roomMul);
      for (const o of built.animated) {
        const kind = o.userData.anim as string;
        const s = (o.userData.animSeed as number) ?? 0;
        if (kind === 'blink') {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = ((Math.sin(t * 1.7 + s * 3.1) + Math.sin(t * 4.3 + s)) > 0.9 ? 0.04 : 1.1) * deviceMul;
        } else if (kind === 'screen') {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const n = Math.sin(t * 13.7 + s) * Math.sin(t * 3.1 + s * 2.3);
          mat.emissiveIntensity = (n > 0.55 ? 0.1 : 0.85 + Math.sin(t * 29 + s) * 0.12) * deviceMul;
        } else if (kind === 'tv-live') {
          // tuned channel — steady bright, only a thin shimmer
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = (1.05 + Math.sin(t * 7 + s) * 0.05 + Math.sin(t * 23 + s * 5) * 0.04) * deviceMul;
        } else if (kind === 'device') {
          // Powered fixture glow — tracks the room's mains, same as screens.
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = ((o.userData.baseEm as number) ?? mat.emissiveIntensity) * deviceMul;
        } else if (kind === 'spin') {
          o.rotation.y += dt * ((o.userData.animSpeed as number) ?? 2.2);
        } else if (kind === 'sway') {
          const a = (o.userData.animAmp as number) ?? 0.03;
          o.rotation.z = Math.sin(t * 1.4 + s) * a;
          o.rotation.x = Math.cos(t * 1.1 + s * 0.7) * a * 0.6;
          // grandfather pendulums tick once a second in earshot
          if (a >= 0.1) {
            o.getWorldPosition(this.tmpV3);
            const d = v3dist(this.tmpV3, this.player.pos);
            if (d < this.clockNear) { this.clockNear = d; this.clockPos.copy(this.tmpV3); }
          }
        } else if (kind === 'swing') {
          const a = (o.userData.animAmp as number) ?? 0.12;
          o.rotation.x = Math.sin(t * 1.15 + s) * a;
          o.rotation.z = Math.cos(t * 0.83 + s) * a * 0.7;
        } else if (kind === 'flicker') {
          // Fluorescent dying-glow: emissive dips with the coupled room light.
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (o.userData.lightRef === undefined) {
            o.userData.lightRef = built.lights.find((l) => l.userData.ls === o.userData.lsRef) ?? null;
          }
          const light = o.userData.lightRef as THREE.PointLight | null;
          const n = Math.sin(t * 27 + s) * Math.sin(t * 9.7 + s * 1.31) + Math.sin(t * 61 + s * 2.7) * 0.4;
          const on = n > -0.75;
          mat.emissiveIntensity = on ? 1.35 + Math.sin(t * 47 + s) * 0.15 : 0.04;
          if (light) light.intensity = (light.userData.baseIntensity as number) * (on ? 1 : 0.1);
        } else if (kind === 'drawerFront') {
          if (o.userData.open) {
            const p = Math.min(1, ((o.userData.dprog as number) ?? 0) + dt * 2.2);
            o.userData.dprog = p;
            if (o.userData.baseZ === undefined) o.userData.baseZ = o.position.z;
            const e = 1 - Math.pow(1 - p, 3);
            o.position.z = (o.userData.baseZ as number) + e * 0.24;
          }
        } else if (kind === 'ripple') {
          // Drip landing ring — expanding loop; fades as it spreads.
          const m = o as THREE.Mesh;
          const ph = (o.userData.animSeed as number) ?? 0;
          const u = ((t * 0.55 + ph) % 1.4) / 1.4;
          m.scale.setScalar(0.05 + u * 0.42);
          (m.material as THREE.MeshBasicMaterial).opacity = 0.24 * (1 - u);
        } else if (kind === 'handS') {
          // Clockwork — stepped second hand, smooth minute/hour. Runs on
          // clockT so every hand freezes together when dread is near.
          o.rotation.z = -Math.floor(this.clockT % 60) * (Math.PI / 30);
        } else if (kind === 'handM') {
          o.rotation.z = -((this.clockT / 60) % 60) * (Math.PI / 30);
        } else if (kind === 'handH') {
          o.rotation.z = -((this.clockT / 720) % 12) * (Math.PI / 6);
        } else if (kind === 'flame') {
          // Open-flame fixture: layered sine jitter on the shared emissive.
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const base = (o.userData.baseEm as number) ?? 0.5;
          const n = Math.sin(t * 11.3 + s) * 0.35 + Math.sin(t * 23.7 + s * 1.7) * 0.22 + Math.sin(t * 5.1 + s * 0.7) * 0.18;
          mat.emissiveIntensity = base * (0.75 + n);
        } else if (kind === 'watch') {
          // Watcher figure — weeping-angel behavior: while outside the
          // player's view cone it turns to face them and creeps closer
          // (bounded); inside the cone it freezes.
          o.getWorldPosition(Game.watchPos);
          const dx = this.player.pos.x - Game.watchPos.x;
          const dz = this.player.pos.z - Game.watchPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.01 && dist < 17) {
            const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
            // +dot = player's facing continues through the object = the
            // player faces AWAY from it. Weeping-angel: move only then.
            const unobserved = (fx * dx + fz * dz) / dist > 0.6;
            if (unobserved) {
              const parentYaw = o.parent ? o.parent.rotation.y : 0;
              o.rotation.y = Math.atan2(dx, dz) - parentYaw;
              const creep = (o.userData.creep as number) ?? 0;
              const creepMax = (o.userData.creepMax as number) ?? 0.7;
              const minDist = (o.userData.watchMinDist as number) ?? 2.0;
              if (dist > minDist && creep < creepMax) {
                const step = Math.min(dt * 0.22, creepMax - creep, dist - minDist);
                const cy = Math.cos(parentYaw), sy = Math.sin(parentYaw);
                o.position.x += ((dx * cy + dz * sy) / dist) * step;
                o.position.z += ((-dx * sy + dz * cy) / dist) * step;
                o.userData.creep = creep + step;
              }
            }
          }
        } else if (kind === 'gaze') {
          // Painted eyes — they only open while unobserved. Direct view
          // snaps them shut (fast fade out); periphery and darkness let them
          // open and drift toward the player's position.
          const mat = o.userData.gazeMat as THREE.MeshBasicMaterial | undefined;
          if (!mat) continue;
          o.getWorldPosition(Game.watchPos);
          const dx = this.player.pos.x - Game.watchPos.x;
          const dz = this.player.pos.z - Game.watchPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 14) continue;
          const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
          // +dot = player's facing continues through the object = player
          // faces AWAY. The painting is in view when dot < -0.55.
          const away = dist > 0.01 ? (fx * dx + fz * dz) / dist : 0;
          const target = away > -0.55 && dist < 10 ? 0.85 : 0;
          const rate = target < mat.opacity ? 6 : 1.4; // shut fast, open slow
          const nv = mat.opacity + Math.sign(target - mat.opacity) * Math.min(Math.abs(target - mat.opacity), dt * rate);
          mat.opacity = nv;
          if (nv > 0.3 && away > -0.55 && dist > 0.4) {
            // pupils track the player in the painting's own plane
            const parentYaw = o.parent ? o.parent.rotation.y : 0;
            const cy = Math.cos(parentYaw), sy = Math.sin(parentYaw);
            const lx = (dx * cy + dz * sy) / dist;
            const dy = ((this.player.pos.y + 1.5) - Game.watchPos.y) / dist;
            o.position.x = (o.userData.lx as number) + Math.max(-1, Math.min(1, lx)) * 0.022;
            o.position.y = (o.userData.ly as number) + Math.max(-1, Math.min(1, dy)) * 0.016;
          }
          if (nv >= 0.8 && !o.userData.gazed) {
            // once per painting — it narrates the discovery, not the habit
            o.userData.gazed = true;
            this.audio.play('watch-eyes', { x: Game.watchPos.x, y: Game.watchPos.y, z: Game.watchPos.z });
            this.cue('watch-eyes', { x: Game.watchPos.x, y: Game.watchPos.y, z: Game.watchPos.z }, '[the painted eyes are open]', 'info');
          }
        } else if (kind === 'vanish') {
          // Hallway figure — present only while unobserved. Once it has sat in
          // the player's view cone for ~0.35s, the next blink/approach removes
          // it for good.
          if (!o.visible) continue;
          o.getWorldPosition(Game.watchPos);
          const dx = this.player.pos.x - Game.watchPos.x;
          const dz = this.player.pos.z - Game.watchPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 18) {
            const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
            const seen = dist > 0.01 && (fx * dx + fz * dz) / dist > 0.55;
            const seenT = (o.userData.seenT as number) ?? 0;
            if (seen) {
              o.userData.seenT = seenT + dt;
            } else if (seenT > 0.35 || dist < 5.5) {
              o.visible = false;
              this.audio.play('amb-settle', { x: Game.watchPos.x, y: Game.watchPos.y, z: Game.watchPos.z });
            }
          }
        }
      }
    }

    // Delayed knock answers from door listening.
    while (this.doorKnocks.length && this.doorKnocks[0].at <= this.clock.time) {
      const k = this.doorKnocks.shift()!;
      this.audio.play('knock', { x: k.x, y: 1.2, z: k.z });
    }

    // Working clocks tock once a second — a metronome for rooms that keep
    // time. When something hunts nearby the clocks hold their breath:
    // hands stop, tocks stop — silence is the tell.
    if (this.dread >= 0.55) {
      if (!this.clocksHeld) {
        this.clocksHeld = true;
        if (this.clockNear < 10) this.cue('phone-stop', this.clockPos, '[the clock stopped]');
      }
    } else if (this.dread < 0.3) this.clocksHeld = false;
    if (this.clockNear < 10 && this.dread < 0.55 && this.clock.time >= this.nextClockTick) {
      this.nextClockTick = (this.nextClockTick > 0 ? this.nextClockTick : this.clock.time) + 1;
      this.cue('clock-tick', this.clockPos, '');
      this.sound?.emit({ x: this.clockPos.x, y: this.clockPos.y, z: this.clockPos.z, intensity: Math.max(0.02, 0.12 * (1 - this.clockNear / 10)), category: 'ambient', caption: '' });
    }
    this.clockNear = 999;

    // Entity figure idle animation — breathing sway + eye pulse.
    const t = this.clock.time;
    this.entityGroup.traverse((o) => {
      (o.userData.rig as RiggedFigure | undefined)?.update(dt);
      if (o.userData.figureParts) {
        tickFigure(o, t);
        // Broker figures track the player with their head.
        if (o.userData.broker) {
          const head = (o.userData.figureParts as Record<string, THREE.Object3D>).head;
          if (head) {
            const dx = this.player.pos.x - o.position.x;
            const dz = this.player.pos.z - o.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.01 && dist < 16) {
              const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - o.rotation.y), Math.cos(Math.atan2(dx, dz) - o.rotation.y));
              head.rotation.y += (Math.max(-1.1, Math.min(1.1, rel)) - head.rotation.y) * Math.min(1, dt * 4);
            }
          }
        }
      }
    });
  }

  /** Seeded ambient scare: ~6% of lit rooms die as the player enters —
   *  lights sputter briefly, then the room goes dark for good. */
  // The door you just came through opens itself behind you. Once per run
  // per room, and only where the door isn't sealed by a lock state.
  private maybeHauntDoor(): void {
    if (this.hauntedRooms.has(this.currentRoom) || this.pendingDoorOpen) return;
    const room = this.activeRooms()[this.currentRoom];
    if (!room?.spec || SAFE_ROOM_TEMPLATES.has(room.templateId) || room.spec.special) return;
    if (this.currentRoom < 6) return;
    if (!this.streams.roomStream('scare', this.currentRoom + 87).bool(0.08)) return;
    this.hauntedRooms.add(this.currentRoom);
    this.pendingDoorOpen = { room: this.currentRoom, at: this.clock.time + 1.2 + Math.random() * 1.4 };
  }

  /** Elsewhere sounds: seeded chance per room entry that a spatialized event
   *  fires in a room 2–5 doors away — the building sounds inhabited. */
  private pendingFarSound: { at: number; pos: Vec3; cue: string; caption: string } | null = null;

  private maybeFarSound(): void {
    if (this.pendingFarSound) return;
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    if (this.currentRoom < 4) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 555);
    if (!scare.bool(0.38)) return;
    const rooms = this.activeRooms();
    const ahead = scare.bool(0.7);
    const target = rooms[this.currentRoom + (ahead ? 1 : -1) * scare.int(2, 5)];
    const tspec = target?.spec;
    if (!target || !tspec || tspec.special) return;
    const c = Math.cos(target.yaw), s = Math.sin(target.yaw);
    const lx = (scare.float() - 0.5) * tspec.width;
    const lz = (scare.float() - 0.5) * tspec.depth;
    const pos = v3(target.origin.x + lx * c + lz * s, 1.4, target.origin.z - lx * s + lz * c);
    const table = [
      { cue: 'door-slam', cap: '[somewhere — a door slams]' },
      { cue: 'drawer', cap: '[somewhere — a drawer shuts]' },
      { cue: 'whisper-voice', cap: '[somewhere — a voice answers nothing]' },
      { cue: 'sweep-return', cap: '[somewhere — something heavy turns]' },
      { cue: 'door-creak', cap: '[somewhere — a door opens itself]' },
    ];
    const pick = table[Math.floor(scare.float() * table.length)];
    this.pendingFarSound = {
      at: this.clock.time + 1.5 + scare.float() * 4,
      pos, cue: pick.cue,
      caption: scare.bool(0.5) ? pick.cap : '',
    };
  }

  private crossers: { mesh: THREE.Object3D; rig: RiggedFigure | null; from: Vec3; to: Vec3; t: number; dur: number }[] = [];

  /** Doorway crosser: a figure passes the far door once — there and gone. */
  private maybeCrosser(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || room.spec?.special) return;
    if (this.currentRoom < 5) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 733);
    if (!scare.bool(0.16)) return;
    const fwd = room.doors.find((d) => d.isMainRoute && !d.falseDoor);
    if (!fwd) return;
    const rig = riggedFigure('tribal');
    const fig = rig ? rig.group : tallFigure({ height: 2.2, body: MAT.shadowFigure(), hood: true });
    rig?.play('move', 0);
    const c = Math.cos(fwd.yaw), s = Math.sin(fwd.yaw);
    const dir = v3(c, 0, -s); // along the door's wall
    const side = scare.bool() ? 1 : -1;
    const from = v3(fwd.pos.x - dir.x * 1.4 * side, 0, fwd.pos.z - dir.z * 1.4 * side);
    const to = v3(fwd.pos.x + dir.x * 1.4 * side, 0, fwd.pos.z + dir.z * 1.4 * side);
    from.y = to.y = fwd.pos.y;
    fig.position.copy(from as unknown as THREE.Vector3);
    fig.rotation.y = Math.atan2(dir.x * side, dir.z * side);
    this.entityGroup.add(fig);
    this.crossers.push({ mesh: fig, rig, from, to, t: 0, dur: 0.9 + scare.float() * 0.5 });
    this.cue('figure-pass', fwd.pos, scare.bool(0.5) ? '[something crosses the far door]' : '', 'info');
  }

  private readonly visitedRooms = new Set<number>();
  private deathEcho: { room: number; space: 'main' | 'under'; fired: boolean } | null = null;
  private lures: { pos: Vec3; mesh: THREE.Object3D; until: number; nextTick: number; rang: boolean }[] = [];
  private lowBattWarned = false;
  private nextHollowHum = 0;
  private nextUnderDraft = 0;
  private underDraftSeen = false;
  /** A room whose lights inhale and dim on a slow cycle — present while inside. */
  private breathingRoom = -1;
  /** Piano rooms get one self-played note, when the player isn't watching it. */
  private pianoRoom = -1;
  private pianoAt = 0;
  private pianoFired = false;
  /** Door-rattle scare — something on the other side tries the handle. */
  private doorTry: { id: string; pos: Vec3; at: number; until: number; rung: boolean } | null = null;
  /** A shelf sheds a book while you're inside — it stays fallen. */
  private bookDrop: { x: number; z: number; y: number; vy: number; at: number; mesh: THREE.Mesh | null; landed: boolean } | null = null;

  private maybeBookDrop(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    const prop = room.spec?.props.find((p) => p.kind === 'bookshelf' || p.kind === 'stackShelf');
    if (!prop) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 955 + (this.space === 'under' ? 977 : 0));
    if (!scare.bool(0.3)) return;
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    this.bookDrop = {
      x: room.origin.x + prop.x * cs + prop.z * sn,
      z: room.origin.z - prop.x * sn + prop.z * cs,
      y: 1.5 + scare.range(0, 0.5),
      vy: 0,
      at: this.clock.time + 2 + scare.range(0, 6),
      mesh: null,
      landed: false,
    };
  }

  /** Toss a pebble — a free, weak lure on a cooldown. Quieter than the
   *  wind-up alarm, but it costs nothing but nerve. */
  private nextToss = 0;

  private tossPebble(): void {
    if (this.clock.time < this.nextToss) return;
    this.nextToss = this.clock.time + 8;
    const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
    const x = this.player.pos.x + fx * 3.5;
    const z = this.player.pos.z + fz * 3.5;
    this.audio.play('pebble', { x, y: 0.1, z }, '');
    this.sound.emit({ x, y: 0.1, z, intensity: 0.45, category: 'distraction', caption: '' });
  }

  /** The numbers moved — on revisit, a room's exit-door plate can read a
   *  wrong room number. Pure scare: locks, geometry and routing never change. */
  private readonly relabeled = new Map<number, string>();

  private applyWrongPlate(roomIndex: number, wrong: string): void {
    const room = this.activeRooms()[roomIndex];
    const d = room?.doors.find((x) => x.isMainRoute && !x.falseDoor && x.id.includes('-out'));
    if (!d) return;
    const leaf = this.streamer.get(roomIndex)?.doorLeaves.get(d.id);
    const plate = leaf?.parent?.parent?.getObjectByName('door-plate');
    const mat = plateMaterial(wrong);
    if (plate instanceof THREE.Mesh && mat) plate.material = mat;
  }

  private maybeRelabel(): void {
    if (this.relabeled.has(this.currentRoom)) return;
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 143);
    if (!scare.bool(0.3)) return;
    const wrong = String(Math.max(1, this.currentRoom + 1 + scare.int(-9, 9))).padStart(3, '0');
    this.relabeled.set(this.currentRoom, wrong);
    const d = room.doors.find((x) => x.isMainRoute && !x.falseDoor && x.id.includes('-out'));
    if (!d) return;
    d.label = wrong;
    this.applyWrongPlate(this.currentRoom, wrong);
    this.cue('door-locked', d.pos, '[the number moved]', 'warn');
  }

  /** The walls write back — on revisit, a seeded room can grow fresh
   *  scrawl: red block letters on a wall that weren't there before.
   *  Pure scare; the message is seeded per room and reapplied on rebuild. */
  private readonly wallWords = new Map<number, { text: string; lx: number; lz: number; yaw: number }>();
  private wallWordsTouched = false;

  private maybeWallWord(under = false): void {
    if (this.wallWords.has(this.currentRoom)) return;
    const room = this.activeRooms()[this.currentRoom];
    const spec = room?.spec;
    if (!room || !spec || SAFE_ROOM_TEMPLATES.has(room.templateId) || this.currentRoom < 6) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 177 + (under ? 977 : 0));
    if (!scare.bool(0.28)) return;
    const texts = ['YOU WERE HERE BEFORE', 'STILL COUNTING', 'BEHIND YOU', 'WRONG DOOR', 'NO EXIT WAS BUILT', 'STAY'];
    const text = texts[scare.int(0, texts.length - 1)];
    const side = scare.bool(0.5) ? 1 : -1;
    const lx = side * (spec.width / 2 - 0.06);
    const lz = scare.range(-spec.depth / 4, spec.depth / 4);
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.wallWords.set(this.currentRoom, { text, lx, lz, yaw });
    if (!this.wallWordsTouched) {
      this.wallWordsTouched = true;
      this.cue('whisper', { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }, '[writing that wasn\'t there]', 'warn');
    }
  }

  private ensureWallWords(i: number, built: { group: THREE.Group }): void {
    const ww = this.wallWords.get(i);
    if (!ww || built.group.getObjectByName(`wall-words-${i}`)) return;
    const mat = wallWordMaterial(ww.text);
    if (!mat) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), mat);
    m.position.set(ww.lx, 1.45, ww.lz);
    m.rotation.y = ww.yaw;
    m.name = `wall-words-${i}`;
    built.group.add(m);
  }

  /** The tenant moved — a seated figure you passed is gone when you come
   *  back; only the pool it sat in remains. Revisit-only scare; the set
   *  persists across re-streams like relabel/wall-words state. */
  private readonly tenantMoved = new Set<number>();

  private hideTenant(t: THREE.Object3D): void {
    for (const c of t.children) c.visible = c.name === 'tenant-pool';
  }

  private maybeTenantMoved(under = false): void {
    const key = under ? -this.currentRoom - 1 : this.currentRoom;
    if (this.tenantMoved.has(key)) return;
    const t = this.streamer.get(this.currentRoom)?.group.getObjectByName(`tenant-${this.currentRoom}`);
    if (!t || !t.visible) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 188 + (under ? 977 : 0));
    if (!scare.bool(0.7)) return;
    this.tenantMoved.add(key);
    this.hideTenant(t);
    this.cue('amb-settle', { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }, '[it moved while you were gone]', 'warn');
  }

  private ensureTenant(i: number, built: { group: THREE.Group }): void {
    const key = this.space === 'under' ? -i - 1 : i;
    if (!this.tenantMoved.has(key)) return;
    const t = built.group.getObjectByName(`tenant-${i}`);
    if (t) this.hideTenant(t);
  }

  /** A burst of steam particles above a cracked vent. */
  private spawnSteamJet(at: Vec3): void {
    const n = 22;
    const pos = new Float32Array(n * 3);
    const data: { a: number; r: number; y: number; v: number }[] = [];
    for (let i = 0; i < n; i++) {
      const d = { a: Math.random() * Math.PI * 2, r: Math.random() * 0.14, y: Math.random() * 1.2, v: 0.5 + Math.random() * 0.6 };
      data.push(d);
      pos[i * 3] = at.x + Math.cos(d.a) * d.r;
      pos[i * 3 + 1] = at.y + d.y;
      pos[i * 3 + 2] = at.z + Math.sin(d.a) * d.r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfd4d8, size: 0.24, sizeAttenuation: true, transparent: true,
      opacity: 0.3, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.steamJets.push({ pts, geo, mat, base: new THREE.Vector3(at.x, at.y, at.z), until: this.clock.time + 26, data });
  }

  /** Flame points + warm light for a lit hearth. */
  private spawnHearth(at: Vec3): void {
    const n = 14;
    const pos = new Float32Array(n * 3);
    const data: { a: number; r: number; y: number; v: number }[] = [];
    for (let i = 0; i < n; i++) {
      const d = { a: Math.random() * Math.PI * 2, r: Math.random() * 0.09, y: Math.random() * 0.7, v: 0.9 + Math.random() * 0.9 };
      data.push(d);
      pos[i * 3] = at.x + Math.cos(d.a) * d.r;
      pos[i * 3 + 1] = at.y + d.y;
      pos[i * 3 + 2] = at.z + Math.sin(d.a) * d.r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff9a4a, size: 0.16, sizeAttenuation: true, transparent: true,
      opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    const light = new THREE.PointLight(0xff8a3a, 2.1, 6, 2);
    light.position.set(at.x, at.y + 0.7, at.z);
    this.scene.add(light);
    this.hearths.push({ pts, geo, mat, light, base: new THREE.Vector3(at.x, at.y, at.z), until: this.clock.time + 45, seed: Math.random() * 100, nextCrackle: this.clock.time + 2, data });
  }

  private ensureTV(i: number, built: { group: THREE.Group }): void {
    let n = -1;
    built.group.traverse((o) => {
      if (o.name !== `tv-${i}`) return;
      n += 1;
      if (this.litTVs.has(`${this.space}:${i}:${n}`)) {
        o.traverse((x) => { if (x.userData.anim === 'screen') x.userData.anim = 'tv-live'; });
      }
    });
  }

  /** Light the n-th television group in room i (prop order). */
  private tuneTVAt(i: number, n: number): void {
    let seen = -1;
    this.worldGroup.traverse((o) => {
      if (o.name !== `tv-${i}`) return;
      seen += 1;
      if (seen === n) o.traverse((x) => { if (x.userData.anim === 'screen') x.userData.anim = 'tv-live'; });
    });
  }

  private ensureCoffin(_i: number, built: { group: THREE.Group }): void {
    if (!this.coffinOpened) return;
    const g = built.group.getObjectByName(`coffin-${_i}`);
    if (g && !g.userData.coffinOpen) this.openCoffinLid(g);
  }

  /** Push the lid fully back — empty shelf, warm pillow. */
  private openCoffinLid(g: THREE.Object3D): void {
    g.userData.coffinOpen = true;
    const lid = g.getObjectByName('lid');
    if (lid) { lid.rotation.z = 1.22; lid.rotation.y = 0; lid.position.x += 0.14; }
  }

  /** The occupant knocks — in the Wake, approach the bier on a seeded run
   *  and something inside answers your presence. Fires once. */
  private occupantAt: Vec3 | null = null;
  private occupantFired = false;
  private coffinOpened = false;
  private playedPianos = new Set<string>();
  private litTVs = new Set<string>();
  private woundClocks = new Set<string>();
  private crackedVents = new Set<string>();
  private steamMasks: { pos: Vec3; until: number }[] = [];
  private steamJets: { pts: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.PointsMaterial; base: THREE.Vector3; until: number; data: { a: number; r: number; y: number; v: number }[] }[] = [];
  private nextHiss = 0;
  private litHearths = new Set<string>();
  private answeredPhones = new Set<string>();
  private armedTraps = new Map<string, boolean>();
  private snappedTraps = new Set<string>();
  private priedTraps = new Set<string>();
  private liveTraps: { key: string; x: number; z: number }[] = [];
  private liveTickProps: { x: number; z: number }[] = [];
  private pipeTickNext = 0;
  private liveBooks: { x: number; z: number; key: string }[] = [];
  private bookNear = 0;
  private bookTarget: { x: number; z: number; key: string } | null = null;
  private bookWhispered = new Set<string>();
  private liveRugs: { x: number; z: number; key: string }[] = [];
  private armedRugs = new Map<string, boolean>();
  private slippedRugs = new Set<string>();
  private livePuddles: { x: number; z: number; key: string }[] = [];
  private armedPuddles = new Map<string, boolean>();
  private slippedPuddles = new Set<string>();
  private drainedRooms = new Set<string>();
  private drainNoted = new Set<string>();
  private draining = new Map<number, number>();
  private wadeAcc = 0;
  private wadeMul = false;
  /* — the glass falls: armed chandeliers creak when you stand under
     them; a loud enough noise there brings the whole thing down — */
  private liveChandeliers: { x: number; z: number; key: string }[] = [];
  private armedChandeliers = new Map<string, boolean>();
  private droppedChandeliers = new Set<string>();
  private warnedChandeliers = new Set<string>();
  private pendingChanDrop: { key: string; x: number; z: number; t: number } | null = null;
  private chanHooked = false;
  private pulledAlarms = new Set<string>();
  /* — the house watches: armed cameras pan to track you and, once
     their glass settles on you for a breath, they report you — */
  private camObjs = new Map<string, { o: THREE.Object3D; i: number; expo: number; fired: boolean }>();
  private camTicked = new Set<string>();
  private ranWashers = new Set<string>();
  private printedPages = new Set<string>();
  private typedKeys = new Set<string>();
  private lookedWindows = new Set<string>();
  private drunkCoolers = new Set<string>();
  private satSeats = new Set<string>();
  private resting: { until: number; x: number; z: number; crouch: boolean } | null = null;
  private finishedWashers = new Set<string>();
  private emptiedWashers = new Set<string>();
  private runningWashers: { pos: Vec3; until: number; nextThump: number; key: string }[] = [];
  private activeWashKeys = new Set<string>();
  private trapJawMat: THREE.MeshStandardMaterial | null = null;

  /* — the luggage arrives: a suitcase that was not there — */
  private luggageArmed = new Map<number, { lx: number; lz: number; wx: number; wz: number; since: number }>();
  private luggageSpawned = new Set<number>();
  private luggageNoticed = new Set<number>();

  /** The boards remember — some rooms complain under upright feet,
   *  a soft creak every other stride. Crouch and the house forgets. */
  private creakyRooms = new Set<string>();
  private nextCreak = 0;
  private creakParity = 0;
  private maybeCreakyRoom(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || room.spec?.special) return;
    const key = `${this.space}:${this.currentRoom}`;
    if (this.creakyRooms.has(key)) return;
    if (this.streams.roomStream('scare', this.currentRoom * 619 + (this.space === 'under' ? 977 : 0)).bool(0.22)) {
      this.creakyRooms.add(key);
      this.cue('amb-settle', { x: this.player.pos.x, y: 0.2, z: this.player.pos.z }, '[the boards remember feet]');
    }
  }

  /** Stone that migrates — statues/busts take one quiet step toward you,
   *  only ever while their new spot is unobserved. Once each. */
  private statuePlans = new Map<string, { n: number; since: number; done: boolean }>();
  private maybeStatueShift(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room?.spec || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    let n = 0;
    for (const p of room.spec.props) {
      if (p.kind !== 'statue' && p.kind !== 'marbleBust') continue;
      const key = `${this.space}:${room.index}:${n}`;
      if (!this.statuePlans.has(key)) {
        const armed = this.streams.roomStream('scare', room.index * 613 + n * 29 + (this.space === 'under' ? 977 : 0)).bool(0.55);
        this.statuePlans.set(key, { n, since: this.clock.time, done: !armed });
      }
      n++;
    }
  }

  private ensureStatue(i: number, built: { group: THREE.Group }): void {
    const groups: THREE.Object3D[] = [];
    built.group.traverse((o) => { if (o.name === `stat-${i}`) groups.push(o); });
    if (!groups.length) return;
    const room = this.activeRooms()[i];
    if (!room?.spec) return;
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    let n = 0;
    for (const p of room.spec.props) {
      if (p.kind !== 'statue' && p.kind !== 'marbleBust') continue;
      const key = `${this.space}:${i}:${n}`;
      const plan = this.statuePlans.get(key);
      const g = groups[n];
      n++;
      if (!plan || plan.done || !g) continue;
      // only move while unobserved: far away, or out of frame
      const wx = room.origin.x + g.position.x * c + g.position.z * s;
      const wz = room.origin.z - g.position.x * s + g.position.z * c;
      const dx = wx - this.player.pos.x, dz = wz - this.player.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
      const dot = dist > 0.001 ? (dx / dist) * fx + (dz / dist) * fz : 0;
      if (this.clock.time - plan.since < 3.5) continue;
      if (dist < 6 && dot > 0.2) continue;
      // one quiet step, up to 1.1m, toward the player — room-local delta
      const toX = this.player.pos.x - wx, toZ = this.player.pos.z - wz;
      const len = Math.sqrt(toX * toX + toZ * toZ) || 1;
      const step = Math.min(1.1, len * 0.55);
      const wxd = (toX / len) * step, wzd = (toZ / len) * step;
      g.position.x += wxd * c - wzd * s;
      g.position.z += wxd * s + wzd * c;
      plan.done = true;
      if (dist < 11) {
        this.audio.play('luggage-thud', { x: wx, y: 0.3, z: wz }, '[stone scrapes — it was not there before]', 'warn');
      }
    }
  }

  private maybeLuggage(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room?.spec || room.spec.special || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    if (this.luggageArmed.has(room.index) || this.luggageSpawned.has(room.index)) return;
    const rs = this.streams.roomStream('scare', room.index + 563);
    if (!rs.bool(0.16)) { this.luggageArmed.delete(room.index); return; }
    const lx = rs.range(-room.width / 2 + 1.4, room.width / 2 - 1.4);
    const lz = rs.range(-room.depth / 2 + 1.4, room.depth / 2 - 1.4);
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    this.luggageArmed.set(room.index, {
      lx, lz,
      wx: room.origin.x + lx * cs + lz * sn,
      wz: room.origin.z - lx * sn + lz * cs,
      since: this.clock.time,
    });
  }

  /** It only ever arrives while the spot is unobserved — first it is empty,
   *  then it isn't; it must have been carried in while you looked elsewhere. */
  /** Armed rugs get a curled corner — a readable tell if you're watching the floor. */
  private ensureRug(i: number, built: { group: THREE.Group }): void {
    const groups: THREE.Object3D[] = [];
    built.group.traverse((o) => { if (o.name === `rug-${i}`) groups.push(o); });
    if (!groups.length) return;
    const room = this.activeRooms()[i];
    if (!room?.spec) return;
    let r = 0;
    for (const p of room.spec.props) {
      if (p.kind !== 'rug') continue;
      const g = groups[r];
      const key = `${this.space}:${i}:rug${r}`;
      r++;
      if (!g || (g.userData.rugDone as boolean)) continue;
      if (this.slippedRugs.has(key)) {
        g.rotation.z += 0.5;
        g.userData.rugDone = true;
      } else if (this.armedRugs.get(key)) {
        g.rotation.z = 0.045; // the curled corner
        g.userData.rugDone = true;
      }
    }
  }

  /** Cameras register into camObjs when their room streams in — armed
   *  ones get a slow servo toward the player in the tick above. */
  private ensureCam(i: number, built: { group: THREE.Group }): void {
    let n = 0;
    built.group.traverse((o) => {
      if (o.name !== `cam-${i}`) return;
      const key = `${this.space}:${i}:cam${n++}`;
      const armed = this.streams.roomStream('scare', i * 707 + n - 1).bool(0.45);
      if (!this.camObjs.has(key)) this.camObjs.set(key, { o, i, expo: 0, fired: false });
      o.userData.camArmed = armed;
      if (!armed) o.userData.camDone = true;
    });
  }

  /** Armed chandeliers lean on their chain; dropped ones lie where they fell. */
  private ensureChandelier(i: number, built: { group: THREE.Group }): void {
    let n = 0;
    built.group.traverse((o) => {
      if (o.name !== `chan-${i}`) return;
      const key = `${this.space}:${i}:chan${n++}`;
      if (o.userData.chanDone) return;
      if (this.droppedChandeliers.has(key)) {
        o.userData.chanDone = true;
        o.position.y = 0.12;
        o.rotation.x += 0.9;
        o.rotation.z += 0.5;
      } else if (this.armedChandeliers.get(key)) {
        o.userData.chanDone = true;
        o.rotation.z = 0.03;
      }
    });
  }

  private ensureLuggage(i: number, built: { group: THREE.Group }): void {
    const a = this.luggageArmed.get(i);
    if (!a) return;
    const has = built.group.children.some((c) => c.name === `lug-${i}`);
    if (has) return;
    if (!this.luggageSpawned.has(i)) {
      if (this.clock.time - a.since < 6) return;
      const dx = a.wx - this.player.pos.x, dz = a.wz - this.player.pos.z;
      const dist = Math.hypot(dx, dz);
      this.camera.getWorldDirection(this.tmpV3);
      const dot = dist > 0.001 ? (this.tmpV3.x * dx + this.tmpV3.z * dz) / dist : 1;
      if (dist < 5.5 && dot > 0.15) return; // watched — it waits for you to look away
      this.luggageSpawned.add(i);
      if (dist < 9) {
        const at = { x: a.wx, y: 0.4, z: a.wz };
        this.audio.play('luggage-thud', at, '[a weight settles somewhere]', 'warn');
        this.sound.emit({ x: a.wx, y: 0.3, z: a.wz, intensity: 0.4, category: 'ambient', caption: '' });
      }
    }
    const p = buildProp({ kind: 'suitcase', x: a.lx, z: a.lz, yaw: (a.lx * 7 + a.lz * 3) % 3.14 }, this.streams.roomStream('dressing', i * 7919));
    p.group.name = `lug-${i}`;
    built.group.add(p.group);
  }

  private tickLuggage(): void {
    const i = this.currentRoom;
    const a = this.luggageArmed.get(i);
    if (!a || !this.luggageSpawned.has(i) || this.luggageNoticed.has(i)) return;
    const dx = a.wx - this.player.pos.x, dz = a.wz - this.player.pos.z;
    if (Math.hypot(dx, dz) < 2.4) {
      this.luggageNoticed.add(i);
      this.audio.play('whisper', { x: a.wx, y: 0.5, z: a.wz }, '[someone packed this — it was not here]', 'warn');
    }
  }

  /** Re-apply trap tell (raised jaw wire) for armed traps in a (re)streamed room. */
  private ensureTrap(i: number, built: { group: THREE.Group }): void {
    const groups: THREE.Object3D[] = [];
    built.group.traverse((o) => { if (o.name === `trap-${i}`) groups.push(o); });
    if (!groups.length) return;
    if (!this.trapJawMat) {
      this.trapJawMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35 });
    }
    const geo = new THREE.BoxGeometry(0.11, 0.006, 0.006);
    groups.forEach((g, n) => {
      const key = `${this.space}:${i}:${n}`;
      let jaw = g.children.find((c) => c.userData.jaw === true) as THREE.Mesh | undefined;
      const armed = this.armedTraps.get(key) === true;
      const down = this.snappedTraps.has(key) || this.priedTraps.has(key);
      if (armed && !jaw) {
        jaw = new THREE.Mesh(geo, this.trapJawMat!);
        jaw.userData.jaw = true;
        jaw.position.set(0, 0.045, 0);
        g.add(jaw);
      }
      if (jaw) jaw.rotation.x = down ? -1.5 : -0.55;
      if (!armed && jaw) jaw.visible = false;
    });
  }

  /** Running washers shudder on the floor for their cycle. */
  private ensureWasher(i: number, built: { group: THREE.Group }): void {
    const t = this.clock.time;
    built.group.traverse((o) => {
      if (o.name !== `wash-${i}`) return;
      const groups = built.group.children.filter((c) => c.name === `wash-${i}`);
      const n = groups.indexOf(o);
      const key = `${this.space}:${i}:${n}`;
      if (o.userData.washBaseY === undefined) o.userData.washBaseY = o.position.y;
      o.position.y = this.activeWashKeys.has(key)
        ? (o.userData.washBaseY as number) + Math.abs(Math.sin(t * 38 + n * 1.7)) * 0.012
        : (o.userData.washBaseY as number);
    });
  }
  private hearths: { pts: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.PointsMaterial; light: THREE.PointLight; base: THREE.Vector3; until: number; seed: number; nextCrackle: number; data: { a: number; r: number; y: number; v: number }[] }[] = [];
  private tvAnswerQueue: { at: number; pos: Vec3 }[] = [];
  private beamGroup: THREE.Group | null = null;
  private beamMats: { mat: THREE.MeshBasicMaterial; base: number }[] = [];
  private motesGeo: THREE.BufferGeometry | null = null;
  private motesMat: THREE.PointsMaterial | null = null;
  private motesData: { d: number; a: number; r: number; spin: number; fall: number }[] = [];
  private lampFade = 1;

  /** World position of the Wake's coffin prop, or null outside that room. */
  private wakeCoffinPos(room: RoomInstance | undefined): Vec3 | null {
    const prop = room?.spec?.props.find((p) => p.kind === 'coffin');
    if (!prop || !room) return null;
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    return { x: room.origin.x + prop.x * cs + prop.z * sn, y: 1, z: room.origin.z - prop.x * sn + prop.z * cs };
  }

  private maybeOccupant(): void {
    this.occupantAt = null;
    this.occupantFired = false;
    const room = this.activeRooms()[this.currentRoom];
    if (room?.spec?.special !== 'wake') return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 211);
    if (!scare.bool(0.55)) return;
    this.occupantAt = this.wakeCoffinPos(room);
  }

  private tickOccupant(): void {
    if (!this.occupantAt || this.occupantFired) return;
    if (v3dist(this.occupantAt, this.player.pos) < 3.4) {
      this.occupantFired = true;
      this.cue('knock', this.occupantAt, '[something shifted inside]', 'danger');
    }
  }

  /** The answering steps — for a few strides in a seeded room, each of your
   *  footsteps is repeated a few paces behind you, loud enough that
   *  sound-hunting entities can hear the echo too. */
  private echoRoom = -1;
  private echoLeft = 0;
  private echoCaptioned = false;
  private readonly echoQueue: { at: number; x: number; y: number; z: number }[] = [];
  private echoHooked = false;

  private maybeEchoRoom(under = false): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || this.currentRoom < 5) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 166 + (under ? 977 : 0));
    if (!scare.bool(0.18)) return;
    this.echoRoom = this.currentRoom;
    this.echoLeft = scare.int(4, 8);
    this.echoCaptioned = false;
    if (this.echoHooked) return;
    this.echoHooked = true;
    this.sound.on((ev) => {
      if (ev.category !== 'footstep' || this.echoRoom < 0 || this.echoLeft <= 0) return;
      if (Math.abs(ev.x - this.player.pos.x) > 1.2 || Math.abs(ev.z - this.player.pos.z) > 1.2) return;
      this.echoLeft--;
      this.echoQueue.push({
        at: this.clock.time + 0.7,
        x: this.player.pos.x - Math.sin(this.player.yaw) * 2.8,
        y: this.player.pos.y,
        z: this.player.pos.z - Math.cos(this.player.yaw) * 2.8,
      });
    });
  }

  private tickEchoQueue(): void {
    while (this.echoQueue.length && this.echoQueue[0].at <= this.clock.time) {
      const q = this.echoQueue.shift()!;
      this.audio.play('footstep', { x: q.x, y: q.y + 0.1, z: q.z },
        this.echoCaptioned ? '' : '[footsteps — yours?]');
      this.echoCaptioned = true;
      this.sound.emit({ x: q.x, y: q.y, z: q.z, intensity: 0.3, category: 'ambient', caption: '' });
    }
  }

  /** The phone rings — a dead payphone fires a burst of rings a few seconds
   *  after you enter, loud enough to draw anything that hunts by sound. */
  private phoneRing: { pos: Vec3; at: number; until: number; lastRing: number } | null = null;

  private maybePhoneRing(under = false): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || this.currentRoom < 4) return;
    const prop = room.spec?.props.find((p) => p.kind === 'payphone');
    if (!prop) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 199 + (under ? 977 : 0));
    if (!scare.bool(0.3)) return;
    const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    const at = this.clock.time + 1.5 + scare.range(0, 5);
    this.phoneRing = {
      pos: { x: room.origin.x + prop.x * cs + prop.z * sn, y: 1.4, z: room.origin.z - prop.x * sn + prop.z * cs },
      at, until: at + 4.2, lastRing: 0,
    };
  }

  private maybeDoorTry(under = false): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || this.currentRoom < 4) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 933 + (under ? 977 : 0));
    if (!scare.bool(0.2)) return;
    const closed = room.doors.filter((d) => !d.opening && d.openT < 0.1 && !d.falseDoor);
    if (!closed.length) return;
    const d = closed[scare.int(0, closed.length - 1)];
    this.doorTry = { id: d.id, pos: d.pos, at: this.clock.time + 1 + scare.range(0, 4), until: 0, rung: false };
    this.doorTry.until = this.doorTry.at + 0.9;
  }

  private maybePiano(): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || !room.spec?.props.some((p) => p.kind === 'pianoUpright')) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 911);
    if (!scare.bool(0.5)) return;
    this.pianoRoom = this.currentRoom;
    this.pianoAt = this.clock.time + 4 + scare.range(0, 8);
    this.pianoFired = false;
  }
  private nextClockTick = 0;
  private listenAcc = new Map<string, number>();
  private listenDone = new Set<string>();
  private doorKnocks: { at: number; x: number; z: number }[] = [];
  private clockNear = 0;
  private readonly clockPos = new THREE.Vector3();
  private clockT = 0;
  private clocksHeld = false;
  private readonly tmpV3 = new THREE.Vector3();
  private readonly telegraphMul = new Map<number, number>();

  private maybeBreathing(under = false): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || room.spec?.special) return;
    if (this.currentRoom < 6) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 811 + (under ? 977 : 0));
    if (!scare.bool(0.11)) return;
    this.breathingRoom = this.currentRoom;
    this.cue('room-breathe', null, scare.bool(0.4) ? '[the room breathes]' : '', 'warn');
  }

  /** The Broker: one robed figure per u-lobby, behind the counter, head that
   *  follows you. Spawned lazily when the room first builds. */
  private readonly brokerFigs = new Map<number, THREE.Object3D>();

  private ensureBroker(roomIndex: number): void {
    if (this.space !== 'under' || this.brokerFigs.has(roomIndex)) return;
    const room = this.activeRooms()[roomIndex];
    if (!room || room.templateId !== 'u-lobby') return;
    const rig = riggedFigure('hooded');
    const fig = rig ? rig.group : tallFigure({ height: 1.9, body: MAT.shadowFigure(), face: 'mask', eyes: 'white', hood: true });
    const yaw = room.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const lx = 0, lz = 3.0; // behind the counter at local z 2.2
    const wx = room.origin.x + lx * cos + lz * sin;
    const wz = room.origin.z - lx * sin + lz * cos;
    fig.position.set(wx, room.origin.y, wz);
    fig.rotation.y = Math.atan2(room.entryPos.x - wx, room.entryPos.z - wz);
    fig.userData.broker = true;
    if (rig) fig.userData.rig = rig;
    this.entityGroup.add(fig);
    this.brokerFigs.set(roomIndex, fig);
    // first sighting — the building has staff down here too
    const greet = this.streams.roomStream('scare', roomIndex + 881);
    if (greet.bool(0.75)) {
      this.cue('custodian-bell', fig.position as unknown as Vec3, '[something stands behind the counter]', 'info');
    }
  }

  /** Door listening — linger facing a closed door and the House may let you
   *  hear what waits beyond it. Real when a scheduled encounter or live
   *  threat sits near the far side; otherwise a seeded lie (~1/7 doors).
   *  ~1/5 of triggers answer back instead: three slow knocks. Once per door. */
  private tickDoorListening(i: number): void {
    const room = this.activeRooms()[i];
    if (!room || this.player.hiddenSpot || this.peek) return;
    const p = this.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (const d of room.doors) {
      if (d.openT > 0.05 || d.opening || this.listenDone.has(d.id)) continue;
      const dx = d.pos.x - p.pos.x, dz = d.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const facing = dist > 0.01 && dist < 2.4 ? (fx * dx + fz * dz) / dist : 0;
      if (facing <= 0.55) { this.listenAcc.delete(d.id); continue; }
      const acc = (this.listenAcc.get(d.id) ?? 0) + this.clock.dt;
      if (acc < 2.4) { this.listenAcc.set(d.id, acc); continue; }
      this.listenDone.add(d.id);
      this.listenAcc.delete(d.id);
      const rooms = this.activeRooms();
      let real = false;
      for (const j of [i - 1, i + 1]) {
        const r = rooms[j];
        if (r && r.scheduled.length > 0) { real = true; break; }
      }
      if (!real) {
        for (const e of this.entities) {
          if (e.state === 'done') continue;
          const tp = e.threatPos();
          if (tp && Math.hypot(tp.x - d.pos.x, tp.z - d.pos.z) < 14) { real = true; break; }
        }
      }
      let h = 0;
      for (const ch of d.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const rng = this.streams.roomStream('scare', h % 104729);
      if (!real && !rng.bool(0.14)) continue;
      if (rng.bool(0.22)) {
        this.cue('door-answer', d.pos, '[something answers — three slow knocks]', 'warn');
        for (let k = 0; k < 3; k++) this.doorKnocks.push({ at: this.clock.time + 0.2 + k * 0.42, x: d.pos.x, z: d.pos.z });
      } else {
        this.cue('door-breath', d.pos, '[something breathes on the other side]', 'warn');
        this.sound.emit({ x: d.pos.x, y: 1.1, z: d.pos.z, intensity: 0.15, category: 'ambient', caption: '' });
      }
    }
  }

  /** Revisit scare: a door you left open drifts shut — while you might watch. */
  private maybeShiftDoor(idx: number): void {
    const room = this.activeRooms()[idx];
    if (!room || room.spec?.special) return;
    const under = this.space === 'under';
    const rng = this.streams.roomStream('scare', idx + 311 + (under ? 977 : 0));
    if (!rng.bool(0.4)) return;
    const candidates = room.doors.filter((d) => !d.locked && !d.falseDoor && d.openT > 0.5);
    if (!candidates.length) return;
    const d = candidates[rng.int(0, candidates.length - 1)];
    d.opening = false;
    const dist = v3dist(d.pos, this.player.pos);
    if (dist > 4 && dist < 22) {
      const cap = under ? '[metal groans somewhere — a bulkhead settles]' : '[a door drifts shut]';
      this.sound.emit({ x: d.pos.x, y: 1.2, z: d.pos.z, intensity: 0.5, category: 'door', caption: cap });
      this.cue(under ? 'sweep-return' : 'door-creak', d.pos, cap, 'info');
    }
  }

  /** Revisit scare: back at the front desk, the register has signed you in again. */
  private reSigned = false;
  private maybeReSignature(): void {
    if (this.reSigned) return;
    if (!this.meta.documents.includes(DOCUMENTS[0]?.id ?? '')) return;
    const rng = this.streams.roomStream('scare', 711);
    if (!rng.bool(0.6)) return;
    this.reSigned = true;
    this.cue('register-sign', null, `[the register has a fresh signature — yours]`, 'warn');
  }

  private maybeBlackout(roomIndex: number): void {
    if (this.blackedOut.has(roomIndex) || this.pendingBlackout) return;
    const room = this.activeRooms()[roomIndex];
    const spec = room?.spec;
    if (!room || !spec || spec.lights.length === 0 || room.darkRoom) return;
    if (SAFE_ROOM_TEMPLATES.has(room.templateId) || spec.special) return;
    if (!this.streams.roomStream('scare', roomIndex).bool(0.06)) return;
    this.pendingBlackout = { room: roomIndex, at: this.clock.time + 0.8 + Math.random() * 0.9 };
    this.blackedOut.add(roomIndex);
  }

  private blackoutRoom(roomIndex: number): void {
    const built = this.streamer.get(roomIndex);
    if (!built) return;
    for (const l of built.lights) {
      l.userData.flicker = false;
      l.userData.baseIntensity = 0;
      l.intensity = 0;
      // Paired lamp meshes die via the ambient loop's dead branch.
    }
  }

  /** Ambient critter: a rat scurries along a wall edge when the player enters a room. */
  private maybeSpawnRat(): void {
    const room = this.activeRooms()[this.currentRoom];
    const spec = room?.spec;
    if (!room || !spec || SAFE_ROOM_TEMPLATES.has(room.templateId) || spec.width < 3) return;
    const roll = this.streams.roomStream('entity', this.currentRoom);
    // Moths circling a lit fixture — sells "this light has burned for years".
    if (!room.darkRoom && spec.lights.length && roll.bool(0.45)) {
      const ls = spec.lights[Math.floor(roll.float() * spec.lights.length)];
      const mc = Math.cos(room.yaw), ms = Math.sin(room.yaw);
      const lx = room.origin.x + ls.x * mc + ls.z * ms;
      const lz = room.origin.z - ls.x * ms + ls.z * mc;
      const ly = room.origin.y + ls.y;
      const n2 = roll.int(2, 4);
      for (let i = 0; i < n2 && this.moths.length < 14; i++) {
        const moth = new THREE.Mesh(
          new THREE.SphereGeometry(0.014, 5, 4),
          new THREE.MeshBasicMaterial({ color: 0x6e6353 }),
        );
        moth.scale.set(1, 0.6, 1.6);
        this.entityGroup.add(moth);
        this.moths.push({
          obj: moth, cx: lx, cy: ly - 0.12, cz: lz,
          r: 0.22 + roll.float() * 0.45, t: 0, dur: 6 + roll.float() * 6,
          speed: (2.2 + roll.float() * 1.8) * (roll.bool(0.5) ? 1 : -1),
          phase: roll.float() * Math.PI * 2,
        });
      }
    }
    if (roll.float() < 0.55) return;
    const hw = spec.width / 2 - 0.35;
    const hd = spec.depth / 2 - 0.35;
    const wall = roll.int(0, 3);
    const [lx1, lz1, lx2, lz2] = [
      [-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd],
    ][wall];
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    const wx = (lx: number, lz: number) => room.origin.x + lx * c + lz * s;
    const wz = (lx: number, lz: number) => room.origin.z - lx * s + lz * c;
    const rev = roll.bool(0.5);
    const ax = wx(rev ? lx2 : lx1, rev ? lz2 : lz1), az = wz(rev ? lx2 : lx1, rev ? lz2 : lz1);
    const bx = wx(rev ? lx1 : lx2, rev ? lz1 : lz2), bz = wz(rev ? lx1 : lx2, rev ? lz1 : lz2);

    const pack = roll.float() < 0.2 ? roll.int(2, 4) : 1;
    for (let i = 0; i < pack; i++) {
      const off = pack > 1 ? (i - (pack - 1) / 2) * 0.28 : 0;
      const ox = (bx - ax) / Math.hypot(bx - ax, bz - az) * off;
      const oz = (bz - az) / Math.hypot(bx - ax, bz - az) * off;
      this.spawnRatMesh(ax + ox, az + oz, bx + ox, bz + oz, room.origin.y, roll.float());
    }
    this.sound.emit({ x: ax, y: 1, z: az, intensity: 0.3, category: 'critter', caption: '[small scuffle]' });
  }

  private spawnRatMesh(ax: number, az: number, bx: number, bz: number, floor: number, roll: number): void {
    let obj = modelInstance('rat', roll);
    if (!obj) {
      obj = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9 }),
      );
      body.scale.set(1, 0.75, 1.9);
      body.position.y = 0.045;
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.002, 0.16, 4),
        new THREE.MeshStandardMaterial({ color: 0x6b5a52, roughness: 0.9 }),
      );
      tail.rotation.x = Math.PI / 2 - 0.35;
      tail.position.set(0, 0.035, -0.14);
      obj.add(body, tail);
    }
    obj.position.set(ax, floor, az);
    obj.rotation.y = Math.atan2(bx - ax, bz - az);
    this.entityGroup.add(obj);
    const dist = Math.hypot(bx - ax, bz - az);
    this.rats.push({ obj, ax, az, bx, bz, t: 0, dur: Math.max(0.6, dist / 2.6), floor });
  }

  private clearRats(): void {
    for (const r of this.rats) this.entityGroup.remove(r.obj);
    this.rats = [];
    if (this.cornerFig) { this.entityGroup.remove(this.cornerFig); this.cornerFig = null; this.cornerRig = null; }
    for (const m of this.moths) this.entityGroup.remove(m.obj);
    this.moths = [];
  }

  private updateMoths(dt: number): void {
    for (const m of [...this.moths]) {
      m.t += dt;
      const a = m.phase + m.t * m.speed;
      // Wobbling orbit + vertical bob + wing flutter (roll)
      m.obj.position.set(
        m.cx + Math.cos(a) * m.r + Math.sin(m.t * 9.7) * 0.03,
        m.cy + Math.sin(m.t * 3.1 + m.phase) * 0.12 + Math.sin(a * 1.4) * 0.05,
        m.cz + Math.sin(a) * m.r + Math.cos(m.t * 8.3) * 0.03,
      );
      m.obj.rotation.z = Math.sin(m.t * 42) * 0.55;
      m.obj.rotation.y = a + Math.PI / 2;
      if (m.t >= m.dur) {
        this.entityGroup.remove(m.obj);
        this.moths.splice(this.moths.indexOf(m), 1);
      }
    }
  }

  // The Relic — a statue that relocates between rooms while you're away.
  // Non-lethal ambient dread: it never moves inside your sightline, it just
  // keeps ending up somewhere it has no business being.
  private maybeRelocateRelic(_prev: number): void {
    const room = this.activeRooms()[this.currentRoom];
    const spec = room?.spec;
    if (!room || !spec || SAFE_ROOM_TEMPLATES.has(room.templateId)) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 444);
    if (!this.relic) {
      if (this.currentRoom < 12 || !scare.bool(0.1)) return;
      this.relic = statueFigure({ height: 2.3 }) ?? tallFigure({ height: 2.3, hood: true });
      this.entityGroup.add(this.relic);
    } else if (this.relicRoom === this.currentRoom || !scare.bool(0.55)) {
      return;
    }
    // place at a random wall corner of the new room, facing the center
    const c = Math.cos(room.yaw), sn = Math.sin(room.yaw);
    const lx = (scare.float() - 0.5) * (spec.width - 1.8);
    const lz = (scare.bool(0.6) ? 1 : -1) * (spec.depth / 2 - 0.8 - scare.float() * 0.4);
    const wx = room.origin.x + lx * c + lz * sn;
    const wz = room.origin.z - lx * sn + lz * c;
    this.relic.position.set(wx, room.origin.y, wz);
    this.relic.rotation.y = Math.atan2(room.origin.x - wx, room.origin.z - wz) - room.yaw;
    this.relicRoom = this.currentRoom;
    this.relicSeen = false;
    this.relicHome = this.relic.position.clone();
  }

  private updateRelic(_dt: number): void {
    if (!this.relic) return;
    const room = this.activeRooms()[this.relicRoom];
    if (!room) { this.entityGroup.remove(this.relic); this.relic = null; this.relicRoom = -1; return; }
    const dx = this.relic.position.x - this.player.pos.x;
    const dz = this.relic.position.z - this.player.pos.z;
    const dist = Math.hypot(dx, dz);
    const inRoom = this.relicRoom === this.currentRoom;
    // gaze check — same view-cone math the watch anim uses
    const cp = Math.cos(this.player.pitch);
    const fx = Math.sin(this.player.yaw) * cp;
    const fz = Math.cos(this.player.yaw) * cp;
    const facing = dist > 0.001 ? (-fx * dx - fz * dz) / dist : 0;
    const seen = inRoom && dist < 15 && facing > 0.55;
    if (seen && !this.relicSeen) {
      this.relicSeen = true;
      this.cue('amb-settle', { x: this.relic.position.x, y: this.relic.position.y + 1.6, z: this.relic.position.z },
        '[it was not in this room before]', 'warn');
    }
    // unobserved drift — a slow lean toward the player, capped, only while
    // they are in the room but facing away (weeping-angel pressure)
    if (inRoom && !seen && dist > 2.2 && dist < 12 && this.relicHome) {
      const traveled = this.relic.position.distanceTo(this.relicHome);
      if (traveled < 1.6) {
        const step = Math.min(0.05, 2.2 / dist * 0.03) ;
        this.relic.position.x -= (dx / dist) * step;
        this.relic.position.z -= (dz / dist) * step;
      }
      this.relic.rotation.y = Math.atan2(-dx, -dz) - (room.yaw ?? 0);
    }
    if (this.relic.userData.figureParts) tickFigure(this.relic, this.clock.time);
  }

  // Mirror figure — while you stare into a mirror it stands just off your
  // shoulder. Turn to look and it's gone. One arm per room, seeded.
  private updateMirrorFigure(dt: number): void {
    const room = this.activeRooms()[this.currentRoom];
    const spec = room?.spec;
    if (this.mirrorFig && (!room || this.mirrorFigRoom !== this.currentRoom)) {
      this.entityGroup.remove(this.mirrorFig);
      this.mirrorFig = null;
      this.mirrorRig = null;
      this.mirrorSeenT = 0;
    }
    const mirror = spec?.props.find((p) => p.kind === 'mirror');
    if (!room || !spec || !mirror || this.currentRoom < 8) { this.mirrorLostT = 0; if (!this.mirrorFig) return; }
    const scare = this.streams.roomStream('scare', this.currentRoom + 313);
    if (!this.mirrorFig) {
      if (!mirror || !scare.bool(0.55)) return;
      // facing the mirror, near it — that's the trigger
      const mco = Math.cos(room.yaw), msi = Math.sin(room.yaw);
      const mx = room.origin.x + mirror.x * mco + mirror.z * msi;
      const mz = room.origin.z - mirror.x * msi + mirror.z * mco;
      const ddx = mx - this.player.pos.x, ddz = mz - this.player.pos.z;
      const md = Math.hypot(ddx, ddz);
      if (md > 6) return;
      const cp = Math.cos(this.player.pitch);
      const fx = Math.sin(this.player.yaw) * cp, fz = Math.cos(this.player.yaw) * cp;
      if ((fx * ddx + fz * ddz) / (md || 1) < 0.78) return;
      // spawn just off the player's shoulder
      const rx = fz, rz = -fx;
      const rig = riggedFigure('inkGhost');
      const fig = rig ? rig.group : tallFigure({ height: 2.15, hood: true, eyes: 'white' });
      if (rig) { this.mirrorRig = rig; rig.play('idle', 0); }
      fig.position.set(
        this.player.pos.x - fx * 1.7 + rx * 0.85,
        room.origin.y,
        this.player.pos.z - fz * 1.7 + rz * 0.85,
      );
      fig.rotation.y = Math.atan2(this.player.pos.x - fig.position.x, this.player.pos.z - fig.position.z);
      this.entityGroup.add(fig);
      this.mirrorFig = fig;
      this.mirrorFigRoom = this.currentRoom;
      this.mirrorSeenT = 0;
      this.audio.play('breath', { x: fig.position.x, y: fig.position.y + 1.6, z: fig.position.z }, '[a breath, behind you]');
      return;
    }
    // player turned to face it — give them a glimpse, then it is gone
    const fig = this.mirrorFig;
    const dx = fig.position.x - this.player.pos.x, dz = fig.position.z - this.player.pos.z;
    const dist = Math.hypot(dx, dz);
    const cp2 = Math.cos(this.player.pitch);
    const fx2 = Math.sin(this.player.yaw) * cp2, fz2 = Math.cos(this.player.yaw) * cp2;
    const facing = dist > 0.001 ? (fx2 * dx + fz2 * dz) / dist : 0;
    if (facing > 0.5 && dist < 12) {
      this.mirrorSeenT += dt;
      if (this.mirrorSeenT > 0.4) {
        this.entityGroup.remove(fig);
        this.mirrorFig = null;
        this.mirrorRig = null;
        this.cue('amb-settle', { x: fig.position.x, y: fig.position.y + 1.4, z: fig.position.z }, '[nothing there]', 'warn');
      }
    } else {
      this.mirrorSeenT = Math.max(0, this.mirrorSeenT - dt * 0.5);
      // if the mirror gaze broke entirely, quietly stand down
      if (mirror) {
        const mco = Math.cos(room!.yaw), msi = Math.sin(room!.yaw);
        const mx = room!.origin.x + mirror.x * mco + mirror.z * msi;
        const mz = room!.origin.z - mirror.x * msi + mirror.z * mco;
        const ddx = mx - this.player.pos.x, ddz = mz - this.player.pos.z;
        const md = Math.hypot(ddx, ddz);
        this.mirrorLostT = (fx2 * ddx + fz2 * ddz) / (md || 1) < 0.55 ? this.mirrorLostT + dt : 0;
        if (this.mirrorLostT > 2.5) { this.entityGroup.remove(fig); this.mirrorFig = null; this.mirrorRig = null; this.mirrorLostT = 0; }
      }
    }
    if (this.mirrorRig) this.mirrorRig.update(dt);
    else if (this.mirrorFig?.userData.figureParts) tickFigure(this.mirrorFig, this.clock.time);
  }

  // Corner watcher — in dark rooms something small and wrong occupies the far
  // corner. Direct gaze makes it fold into the dark; it never twice haunts
  // the same room index.
  private updateCornerWatcher(dt: number): void {
    const room = this.activeRooms()[this.currentRoom];
    if (this.cornerFig && (!room || this.cornerFigRoom !== this.currentRoom)) {
      this.entityGroup.remove(this.cornerFig);
      this.cornerFig = null;
      this.cornerRig = null;
      this.cornerSeenT = 0;
    }
    if (!room || !room.darkRoom || this.currentRoom < 12 || room.biome === 'underscript') {
      if (!this.cornerFig) return;
    }
    const scare = this.streams.roomStream('scare', this.currentRoom + 977);
    if (!this.cornerFig) {
      if (!room || !room.darkRoom || this.currentRoom < 12 || room.biome === 'underscript') return;
      if (!scare.bool(0.3)) return;
      // player must be inside the room's bounds
      const lx = this.player.pos.x - room.origin.x, lz = this.player.pos.z - room.origin.z;
      if (Math.abs(lx) > room.width / 2 || Math.abs(lz) > room.depth / 2) return;
      // farthest corner, scaled down — a crouch, not a stand
      const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
      let bx = 0, bz = 0, best = -1;
      for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const px = room.origin.x + (cx * (room.width / 2 - 0.8)) * c + (cz * (room.depth / 2 - 0.8)) * s;
        const pz = room.origin.z - (cx * (room.width / 2 - 0.8)) * s + (cz * (room.depth / 2 - 0.8)) * c;
        const d = Math.hypot(px - this.player.pos.x, pz - this.player.pos.z);
        if (d > best) { best = d; bx = px; bz = pz; }
      }
      const rig = riggedFigure('inkGhost');
      const fig = rig ? rig.group : tallFigure({ height: 1.3, hood: true, eyes: 'white' });
      if (rig) { this.cornerRig = rig; rig.play('idle', 0); }
      fig.scale.multiplyScalar(0.62);
      fig.position.set(bx, room.origin.y, bz);
      fig.rotation.y = Math.atan2(this.player.pos.x - bx, this.player.pos.z - bz);
      this.entityGroup.add(fig);
      this.cornerFig = fig;
      this.cornerFigRoom = this.currentRoom;
      this.cornerSeenT = 0;
      this.cornerT = 0;
      this.cue('amb-settle', { x: bx, y: 0.8, z: bz }, '[something shifts in the corner]', 'warn');
      return;
    }
    this.cornerT += dt;
    const fig = this.cornerFig;
    const dx = fig.position.x - this.player.pos.x, dz = fig.position.z - this.player.pos.z;
    const dist = Math.hypot(dx, dz);
    const cp = Math.cos(this.player.pitch);
    const fx = Math.sin(this.player.yaw) * cp, fz = Math.cos(this.player.yaw) * cp;
    const facing = dist > 0.001 ? (fx * dx + fz * dz) / dist : 0;
    if (facing > 0.88 && this.lampOn) {
      this.cornerSeenT += dt;
      if (this.cornerSeenT > 0.22) {
        this.entityGroup.remove(fig);
        this.cornerFig = null;
        this.cornerRig = null;
        this.cue('amb-settle', { x: fig.position.x, y: 1, z: fig.position.z }, '[the corner is empty]', 'warn');
        return;
      }
    } else this.cornerSeenT = Math.max(0, this.cornerSeenT - dt);
    if (this.cornerT > 14) {
      this.entityGroup.remove(fig);
      this.cornerFig = null;
      this.cornerRig = null;
      return;
    }
    if (this.cornerRig) this.cornerRig.update(dt);
    else if (fig.userData.figureParts) tickFigure(fig, this.clock.time);
  }

  /** The Shade — stands dead still; opacity is wholly beam-driven. */
  private maybeShade(under = false): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || SAFE_ROOM_TEMPLATES.has(room.templateId) || room.spec?.special) return;
    if (!under && this.currentRoom < 9) return;
    if (under && this.currentRoom < 3) return;
    const scare = this.streams.roomStream('scare', this.currentRoom + 347 + (under ? 977 : 0));
    if (!scare.bool(0.14)) return;
    if (this.shadeFig) this.clearShade();
    // stands on the far side of the room, off the door line, facing the entry
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    const lx = (scare.bool() ? 1 : -1) * (room.width * 0.22 + scare.float() * room.width * 0.12);
    const lz = room.depth * 0.28 + scare.float() * room.depth * 0.12;
    const wx = room.origin.x + lx * c + lz * s;
    const wz = room.origin.z - lx * s + lz * c;
    const rig = riggedFigure('inkGhost');
    const fig = rig ? rig.group : tallFigure({ height: 2.05, body: MAT.shadowFigure(), eyes: 'white', hood: true });
    if (rig) { rig.play('idle', 0); this.shadeRig = rig; }
    // beam-driven opacity needs per-instance materials — rig bodies already
    // clone theirs; the tallFigure fallback shares MAT.* so clone that here
    fig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mm) => (rig ? mm : mm.clone()) as THREE.MeshStandardMaterial);
      if (!rig) m.material = Array.isArray(m.material) ? out : out[0];
      for (const cl of out) {
        if (this.shadeMats.includes(cl)) continue;
        cl.transparent = true;
        cl.opacity = 0.02;
        cl.depthWrite = false;
        this.shadeMats.push(cl);
      }
    });
    fig.position.set(wx, room.origin.y, wz);
    fig.rotation.y = Math.atan2(room.entryPos.x - wx, room.entryPos.z - wz);
    fig.userData.shade = true;
    this.entityGroup.add(fig);
    this.shadeFig = fig;
    this.shadeRoom = this.currentRoom;
    this.shadeSeenT = 0;
    this.shadeRevealed = false;
  }

  private clearShade(): void {
    if (this.shadeFig) this.entityGroup.remove(this.shadeFig);
    for (const m of this.shadeMats) m.dispose();
    this.shadeMats = [];
    this.shadeFig = null;
    this.shadeRig = null;
    this.shadeRoom = -1;
    this.shadeSeenT = 0;
    this.shadeRevealed = false;
  }

  private updateShade(dt: number): void {
    if (this.shadeRoom !== this.currentRoom && this.shadeFig) this.clearShade();
    const fig = this.shadeFig;
    if (!fig) return;
    const dx = fig.position.x - this.player.pos.x, dz = fig.position.z - this.player.pos.z;
    const dist = Math.hypot(dx, dz);
    const cp = Math.cos(this.player.pitch);
    const fx = Math.sin(this.player.yaw) * cp, fz = Math.cos(this.player.yaw) * cp;
    const facing = dist > 0.001 ? (fx * dx + fz * dz) / dist : 0;
    const inBeam = (this.lampOn || this.pulseLampOn) && facing > 0.72 && dist < 14;
    const target = inBeam ? 0.62 : 0.02;
    const k = Math.min(1, dt * 6);
    for (const m of this.shadeMats) m.opacity += (target - m.opacity) * k;
    if (inBeam) {
      this.shadeSeenT += dt;
      if (!this.shadeRevealed && this.shadeSeenT > 0.28) {
        this.shadeRevealed = true;
        this.cue('whisper', { x: fig.position.x, y: 1.5, z: fig.position.z }, '[the light settles on a shape]', 'warn');
      }
    }
    if (dist < 2.1) {
      const was = this.shadeRevealed;
      const px = fig.position.x, pz = fig.position.z;
      this.clearShade();
      if (was) this.cue('amb-settle', { x: px, y: 1, z: pz }, '[only darkness here]', 'warn');
      return;
    }
    if (this.shadeRig) this.shadeRig.update(dt);
    else if (fig.userData.figureParts) tickFigure(fig, this.clock.time);
  }

  private updateRats(dt: number): void {
    for (const r of [...this.rats]) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      // slight ease + scurry bob
      const e = k * k * (3 - 2 * k);
      r.obj.position.x = r.ax + (r.bx - r.ax) * e;
      r.obj.position.z = r.az + (r.bz - r.az) * e;
      r.obj.position.y = r.floor + Math.abs(Math.sin(r.t * 22)) * 0.012;
      if (k >= 1) {
        this.entityGroup.remove(r.obj);
        this.rats = this.rats.filter((x) => x !== r);
      }
    }
  }

  private updateMaelstrom(dt: number): void {
    const mael = this.entities.find((e) => e instanceof CorridorRunner && e.id === 'maelstrom' && e.state !== 'done') as CorridorRunner | undefined;
    if (mael?.stabilizeTriggered && !this.stabilize && this.player.hiddenSpot) {
      const assist = this.settings.minigameAssist;
      this.stabilize = {
        needle: 0.5, dir: 1, zone: 0.18 + assist * 0.15,
        timeLeft: 18 - assist * 5, failT: 0,
      };
      useGameStore.setState({ phase: 'MINIGAME' });
      this.cue('maelstrom-attack', null, '[hold E in rhythm — keep the needle centered]', 'danger');
    }
    if (this.stabilize) {
      const s = this.stabilize;
      s.timeLeft -= dt;
      s.needle += s.dir * dt * (0.9 - this.settings.minigameAssist * 0.4);
      if (s.needle > 1 || s.needle < 0) s.dir *= -1;
      const holding = this.keys.has(this.keyFor('interact'));
      if (holding && Math.abs(s.needle - 0.5) < s.zone) {
        s.timeLeft -= dt * 2; // good rhythm doubles progress
        if (Math.random() < dt * 6) this.cue('stabilize-tick', null, '', 'info');
      } else if (Math.abs(s.needle - 0.5) > 0.42) {
        s.failT += dt;
        if (s.failT > 2.4) {
          this.stabilize = null;
          useGameStore.setState({ phase: 'PLAYING' });
          this.damagePlayer(45, 'maelstrom', 'Stabilization slipped. Hold E only while the needle is centered.');
          this.player.exitHiding(this.clock.time);
          return;
        }
      }
      if (s.timeLeft <= 0) {
        this.stabilize = null;
        useGameStore.setState({ phase: 'PLAYING' });
        this.cue('stabilize-good', null, '[the cabinet steadies — it forgets you]', 'info');
        if (mael) mael.stabilizeTriggered = false;
      }
    }
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    const realDt = this.lastFrameNow ? (now - this.lastFrameNow) / 1000 : 0;
    this.lastFrameNow = now;
    const st = useGameStore.getState();
    const running = st.phase === 'PLAYING' || st.phase === 'MINIGAME';
    this.postGov?.update(realDt, this.settings.adaptiveQuality && running);
    if (!running || !this.clock.tick(now)) {
      this.renderFrame();
      return;
    }
    const dt = this.clock.dt;

    // input → player
    const moveIn = this.readMoveInput();
    const blockers = this.collectBlockers();
    this.player.update(dt, moveIn, blockers, this.settings, this.sound, this.activeRooms()[this.currentRoom] ?? null, this.clock.time);
    this.player.refreshProtection(this.activeRooms()[this.currentRoom]?.safeZones ?? []);

    // Breadcrumb trail — where the player has actually walked, ~1.15m apart.
    // The Bellman (and anything else that trails you) reads these.
    if (!this.lastCrumbSet || v3dist(this.lastCrumb, this.player.pos) >= 1.15) {
      this.playerTrail.push(v3(this.player.pos.x, 0, this.player.pos.z));
      v3copy(this.lastCrumb, this.player.pos);
      this.lastCrumbSet = true;
      if (this.playerTrail.length > 160) {
        this.playerTrail.shift();
        for (const e of this.entities) e.trailShifted?.();
      }
    }

    // room tracking
    const prev = this.currentRoom;
    this.currentRoom = this.currentRoomIndex();
    if (this.currentRoom !== prev && this.space === 'main') {
      this.stats.roomsVisited = Math.max(this.stats.roomsVisited, this.currentRoom);
      const revisit = this.visitedRooms.has(this.currentRoom);
      this.visitedRooms.add(this.currentRoom);
      if (revisit) {
        this.maybeShiftDoor(this.currentRoom);
        this.maybeRelabel();
        this.maybeTenantMoved();
        if (this.currentRoom === 0) this.maybeReSignature();
      }
      this.maybeSpawnRat();
      this.maybeBlackout(this.currentRoom);
      this.maybeRelocateRelic(prev);
      this.maybeHauntDoor();
      this.maybeFarSound();
      this.maybeCrosser();
      this.maybeShade();
      this.maybeBreathing();
      this.maybePiano();
      this.maybeDoorTry();
      this.maybeBookDrop();
      this.maybeEchoRoom();
      this.maybePhoneRing();
      this.maybeDeepReveal();
      this.maybeWallWord();
      this.maybeOccupant();
      this.maybeLuggage();
      this.maybeStatueShift();
      this.maybeCreakyRoom();
    }
    this.tickEchoQueue();
    this.tickOccupant();
    this.tickLuggage();
    if (this.space === 'under') {
      this.stats.underscriptDeepest = Math.max(this.stats.underscriptDeepest, this.currentRoom);
      this.maybeSpawnRat();
      if (this.currentRoom !== prev) {
        const revisit = this.visitedRooms.has(-this.currentRoom - 1);
        this.visitedRooms.add(-this.currentRoom - 1);
        if (revisit) { this.maybeShiftDoor(this.currentRoom); this.maybeTenantMoved(true); }
        this.maybeStatueShift();
        this.maybeCreakyRoom();
        this.maybeFarSound();
        this.maybeBreathing(true);
        this.maybeDoorTry(true);
        this.maybeBookDrop();
        this.maybeEchoRoom(true);
        this.maybePhoneRing(true);
        this.maybeShade(true);
      }
    }
    // death echo: the building remembers where it took you
    if (this.currentRoom !== prev && this.deathEcho && !this.deathEcho.fired
      && this.currentRoom === this.deathEcho.room && this.space === this.deathEcho.space) {
      this.deathEcho.fired = true;
      this.cue('death-echo', null, '[you remember this room — you died here]', 'warn');
    }
    // Room-tone bed — idempotent; follows space + biome changes each frame.
    const toneRoom = this.activeRooms()[this.currentRoom];
    this.audio.setRoomTone(this.space === 'under' ? 'underscript' : (toneRoom?.biome ?? 'unknown'), {
      dark: toneRoom?.darkRoom ?? this.space === 'under',
      window: toneRoom?.spec?.props.some((p) => p.kind === 'window') ?? false,
    });

    // Sparse ambience — settling creaks, pipe drips, far-off booms. Weighted
    // per biome, positional inside the current room.
    const tA = this.clock.time;
    if (tA >= this.nextAmbience && useGameStore.getState().phase === 'PLAYING') {
      this.nextAmbience = tA + 14 + Math.random() * 30;
      const sp = toneRoom?.spec;
      if (toneRoom && sp) {
        const b = toneRoom.biome;
        const table: [string, number][] =
          this.space === 'under' || b === 'maintenance'
            ? [['amb-drip', 0.34], ['amb-creak', 0.22], ['amb-distant', 0.2], ['amb-tick', 0.14], ['whisper', 0.1]]
            : b === 'records' || b === 'guest' || b === 'safe' || b === 'corridor' || b === 'lobby'
              ? [['amb-creak', 0.44], ['amb-settle', 0.29], ['amb-distant', 0.14], ['amb-tick', 0.09], ['whisper', 0.04]]
              : [['amb-creak', 0.33], ['amb-distant', 0.33], ['amb-settle', 0.26], ['whisper', 0.08]];
        let r = Math.random(), cue = 'amb-creak';
        for (const [c, wgt] of table) { r -= wgt; if (r <= 0) { cue = c; break; } }
        const co = Math.cos(toneRoom.yaw), si = Math.sin(toneRoom.yaw);
        const lx = (Math.random() - 0.5) * (sp.width - 1), lz = (Math.random() - 0.5) * (sp.depth - 1);
        this.audio.play(cue, {
          x: toneRoom.origin.x + lx * co + lz * si,
          y: toneRoom.origin.y + 1.1 + Math.random() * 1.2,
          z: toneRoom.origin.z - lx * si + lz * co,
        });
      }
    }

    // Storm layer — every ~35–95s a strike flashes the hemisphere light for
    // a split second, rumble arriving a beat behind it. Only above ground.
    if (tA >= this.nextThunder && this.space !== 'under' && useGameStore.getState().phase === 'PLAYING') {
      this.nextThunder = tA + 35 + Math.random() * 60;
      this.lightning = 1;
      window.setTimeout(() => this.audio.play('thunder', null, '[distant thunder]'), 280);
    }
    if (this.hemi) {
      if (this.lightning > 0) {
        this.lightning = Math.max(0, this.lightning - dt * 3.4);
        const f = this.lightning;
        const pulse = Math.max(f, Math.max(0, f - 0.55) * 1.5); // forked double-flash
        this.hemi.intensity = 0.7 + pulse * 2.6;
      } else if (this.hemi.intensity !== 0.7) {
        this.hemi.intensity = 0.7;
      }
    }

    // Music-box sting — a few tinny notes drifting through domestic rooms,
    // rare and seeded. Played as staggered sine hits from the room's center.
    if (toneRoom && (toneRoom.biome === 'guest' || toneRoom.biome === 'lobby' || toneRoom.biome === 'gallery')
      && useGameStore.getState().phase === 'PLAYING' && tA >= this.nextMusicBox && this.streams.roomStream('scare', this.currentRoom).bool(0.1)) {
      this.nextMusicBox = tA + 90 + Math.random() * 120;
      const notes = [1, 0.841, 0.667, 0.561];
      notes.forEach((mul, i) => {
        window.setTimeout(() => {
          this.audio.play('mb-note',
            { x: toneRoom.origin.x, y: toneRoom.origin.y + 1.4, z: toneRoom.origin.z },
            i === 0 ? '[a music box plays, somewhere]' : '', 'info', 'sfx', mul);
        }, i * 620);
      });
    }

    // Door knock — a slow fist on the entry door. Rare per room, seeded.
    if (toneRoom && useGameStore.getState().phase === 'PLAYING' && tA >= this.nextKnock
      && this.streams.roomStream('scare', this.currentRoom + 999).bool(0.14)) {
      this.nextKnock = tA + 50 + Math.random() * 90;
      const ksp = toneRoom.spec;
      if (ksp) {
        const lp = portLocalPos(ksp.entry, ksp.width, ksp.depth);
        const kco = Math.cos(toneRoom.yaw), ksi = Math.sin(toneRoom.yaw);
        const kx = toneRoom.origin.x + lp.x * kco + lp.z * ksi;
        const kz = toneRoom.origin.z - lp.x * ksi + lp.z * kco;
        for (let i = 0; i < 3; i++) {
          window.setTimeout(() => this.audio.play('knock',
            { x: kx, y: toneRoom.origin.y + 1.1, z: kz }, i === 0 ? '[a knock at the door]' : ''), i * 340);
        }
      }
    }

    // Unseen footsteps — someone pacing a line across this room or the
    // one behind the wall. Seeded rare; five weighted steps in sequence.
    if (toneRoom && useGameStore.getState().phase === 'PLAYING' && tA >= this.nextSteps
      && this.streams.roomStream('scare', this.currentRoom + 131).bool(0.16)) {
      this.nextSteps = tA + 45 + Math.random() * 80;
      const fsp = toneRoom.spec;
      if (fsp) {
        const a = portLocalPos(fsp.entry, fsp.width, fsp.depth);
        const b = portLocalPos(fsp.exits[0] ?? fsp.entry, fsp.width, fsp.depth);
        const fco = Math.cos(toneRoom.yaw), fsi = Math.sin(toneRoom.yaw);
        for (let i = 0; i < 5; i++) {
          const f = (i + 1) / 6;
          const lx = a.x + (b.x - a.x) * f, lz = a.z + (b.z - a.z) * f;
          const wx = toneRoom.origin.x + lx * fco + lz * fsi;
          const wz = toneRoom.origin.z - lx * fsi + lz * fco;
          window.setTimeout(() => this.audio.play('footstep',
            { x: wx, y: toneRoom.origin.y + 0.1, z: wz }, i === 0 ? '[footsteps — slow]' : ''), i * 460);
        }
      }
    }

    // Piano wire — a single dissonant note struck somewhere in domestic
    // rooms, detuned so it reads as an old instrument, not a cue.
    if (toneRoom && (toneRoom.biome === 'guest' || toneRoom.biome === 'lobby' || toneRoom.biome === 'gallery')
      && useGameStore.getState().phase === 'PLAYING' && tA >= this.nextPiano
      && this.streams.roomStream('scare', this.currentRoom + 777).bool(0.12)) {
      this.nextPiano = tA + 80 + Math.random() * 140;
      const at = { x: toneRoom.origin.x, y: toneRoom.origin.y + 1.0, z: toneRoom.origin.z };
      this.audio.play('piano-wire', at, '[a piano string sounds, then dies]');
      window.setTimeout(() => this.audio.play('piano-wire', at, '', 'info', 'sfx', 1.06), 90);
      window.setTimeout(() => this.audio.play('piano-wire', at, '', 'info', 'sfx', 0.5), 180);
    }

    // The entry door swings open again on its own — queued like blackout.
    if (this.pendingDoorOpen && tA >= this.pendingDoorOpen.at) {
      const room = this.activeRooms()[this.pendingDoorOpen.room];
      this.pendingDoorOpen = null;
      const door = room?.doors.find((d) => !d.locked);
      if (door) {
        door.opening = true;
        this.cue('door-open', { x: door.pos.x, y: door.pos.y + 1, z: door.pos.z }, '[the door opens again]', 'warn');
        this.sound.emit({ x: door.pos.x, y: 1, z: door.pos.z, intensity: 0.5, category: 'door', caption: '[door]' });
      }
    }

    // Elsewhere sounds — queued on room entry; spatialized so they read distant.
    if (this.pendingFarSound && tA >= this.pendingFarSound.at) {
      const fs = this.pendingFarSound;
      this.pendingFarSound = null;
      this.cue(fs.cue, fs.pos, fs.caption, 'info');
    }

    // Wind-up alarms — tick loud enough to pull sound-hunters, then ring once.
    for (const lure of this.lures) {
      if (tA < lure.nextTick) continue;
      lure.nextTick = tA + 1.2;
      if (tA < lure.until) {
        this.cue('alarm-tick', lure.pos, '', 'info');
        this.sound.emit({ x: lure.pos.x, y: lure.pos.y, z: lure.pos.z, intensity: 0.9, category: 'distraction', caption: '' });
      } else if (!lure.rang) {
        lure.rang = true;
        this.cue('alarm-ring', lure.pos, '[the alarm rings — somewhere else]', 'info');
        this.sound.emit({ x: lure.pos.x, y: lure.pos.y, z: lure.pos.z, intensity: 1.6, category: 'distraction', caption: '[alarm ringing]' });
      } else {
        this.entityGroup.remove(lure.mesh);
      }
    }
    this.lures = this.lures.filter((l) => !l.rang || tA < l.until + 2.5);

    // Hollow off-hum — a trapped hiding spot is audible before it is legible.
    if (tA >= this.nextHollowHum) {
      for (const r of this.activeRooms()) {
        let heard = false;
        for (const spot of r.hidingSpots) {
          if (spot.trappedBy !== 'hollow') continue;
          if (v3dist(spot.exitPos, this.player.pos) < 4) {
            this.cue('hollow-hum', spot.exitPos, '', 'info');
            this.sound.emit({ x: spot.exitPos.x, y: 1, z: spot.exitPos.z, intensity: 0.15, category: 'entity-cue', caption: '' });
            heard = true;
            break;
          }
        }
        if (heard) break;
      }
      this.nextHollowHum = tA + 4.5;
    }

    // The sealed passage exhales — a cold draft pulls toward the gate room.
    if (this.space === 'main' && tA >= this.nextUnderDraft) {
      const room = this.activeRooms()[this.currentRoom];
      const sock = room?.sockets.find((s) => s.meta.underDoor === true);
      if (sock && v3dist(sock.pos, this.player.pos) < 4) {
        this.cue('under-draft', sock.pos, this.underDraftSeen ? '' : '[a cold draft seeps up — the door below breathes]');
        this.underDraftSeen = true;
        this.sound.emit({ x: sock.pos.x, y: 1.2, z: sock.pos.z, intensity: 0.18, category: 'ambient', caption: '' });
        this.nextUnderDraft = tA + 3.8;
      } else if (sock) {
        this.nextUnderDraft = tA + 0.5;
      } else {
        this.nextUnderDraft = tA + 2;
      }
    }

    // The piano plays itself — one muffled key, only while unwatched.
    if (this.pianoRoom === this.currentRoom && !this.pianoFired && tA >= this.pianoAt) {
      const room = this.activeRooms()[this.currentRoom];
      const prop = room?.spec?.props.find((p) => p.kind === 'pianoUpright');
      if (prop) {
        const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
        const wx = room.origin.x + prop.x * cs + prop.z * sn;
        const wz = room.origin.z - prop.x * sn + prop.z * cs;
        const dx = wx - this.player.pos.x, dz = wz - this.player.pos.z;
        const dd = Math.hypot(dx, dz);
        const facing = dd > 0.01 && (Math.sin(this.player.yaw) * dx + Math.cos(this.player.yaw) * dz) / dd > 0.4;
        if (!facing) {
          this.pianoFired = true;
          this.cue('piano-note', v3(wx, 1.1, wz), '[a single key — no one is at the piano]', 'warn');
          this.sound.emit({ x: wx, y: 1.1, z: wz, intensity: 0.35, category: 'distraction', caption: '' });
        } else {
          this.pianoAt = tA + 1.5;
        }
      } else {
        this.pianoRoom = -1;
      }
    }

    // Lit hearths — warm light flickers, nearby wounds knit slowly
    {
      const tc = this.clock.time;
      for (const h of this.hearths) {
        h.light.intensity = 1.9 + Math.sin(tc * 13.7 + h.seed) * 0.5 + Math.sin(tc * 31 + h.seed * 2.3) * 0.3;
        const arr = h.geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < h.data.length; i++) {
          const d = h.data[i];
          d.y += d.v * dt;
          if (d.y > 0.9) { d.y = 0.02; d.a = Math.random() * Math.PI * 2; d.r = Math.random() * 0.09; }
          arr.setXYZ(i, h.base.x + Math.cos(d.a) * d.r * (1 - d.y * 0.8), h.base.y + d.y, h.base.z + Math.sin(d.a) * d.r * (1 - d.y * 0.8));
        }
        arr.needsUpdate = true;
        h.mat.opacity = Math.min(0.55, (h.until - tc) * 0.12);
        if (tc >= h.nextCrackle) {
          h.nextCrackle = tc + 2.6 + Math.random() * 1.8;
          this.audio.play('fire-crackle', h.base, '');
          this.sound.emit({ x: h.base.x, y: h.base.y, z: h.base.z, intensity: 0.18, category: 'ambient', caption: '' });
        }
        if (v3dist(h.base, this.player.pos) < 3.2 && this.player.health < 100) {
          this.player.health = Math.min(100, this.player.health + 2.2 * dt);
        }
      }
      this.hearths = this.hearths.filter((h) => {
        if (tc < h.until) return true;
        this.scene.remove(h.pts); this.scene.remove(h.light);
        h.geo.dispose(); h.mat.dispose();
        return false;
      });
    }

    // Cracked valves — hiss masks your footstep emits while you stay near
    {
      const tc = this.clock.time;
      this.steamMasks = this.steamMasks.filter((m) => tc < m.until);
      let masked = false;
      let anyHiss = false;
      for (const m of this.steamMasks) {
        if (v3dist(m.pos, this.player.pos) < 7) masked = true;
        if (v3dist(m.pos, this.player.pos) < 13) anyHiss = true;
      }
      // running washers mask too — weaker, but the drum rings farther
      let washMask = 1;
      this.runningWashers = this.runningWashers.filter((w) => {
        if (tc < w.until) return true;
        if (!this.finishedWashers.has(w.key)) {
          this.finishedWashers.add(w.key);
          this.audio.play('washer-ding', w.pos, '[the machine stops — drum ready]');
        }
        return false;
      });
      this.activeWashKeys = new Set(this.runningWashers.map((w) => w.key));
      for (const w of this.runningWashers) {
        const d = v3dist(w.pos, this.player.pos);
        if (d < 6) washMask = 0.35;
        if (tc >= w.nextThump) {
          w.nextThump = tc + 1.15;
          this.audio.play('washer-thump', w.pos, '');
          this.sound.emit({ x: w.pos.x, y: w.pos.y, z: w.pos.z, intensity: 0.55, category: 'machine', caption: '[the machine thumps]' });
        }
      }
      this.player.maskMul = Math.min(masked ? 0.22 : 1, washMask);
      if (anyHiss && tc >= this.nextHiss) {
        this.nextHiss = tc + 2.4;
        const m = this.steamMasks[0];
        if (m) {
          this.audio.play('steam-hiss', m.pos, '');
          this.sound.emit({ x: m.pos.x, y: m.pos.y, z: m.pos.z, intensity: 0.45, category: 'machine', caption: '' });
        }
      }
      for (const j of this.steamJets) {
        const arr = j.geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < j.data.length; i++) {
          const d = j.data[i];
          d.y += d.v * dt;
          if (d.y > 1.7) { d.y = 0.05; d.a = Math.random() * Math.PI * 2; d.r = Math.random() * 0.14; }
          const spread = d.r * (1 + d.y * 1.4);
          arr.setXYZ(i, j.base.x + Math.cos(d.a) * spread, j.base.y + d.y, j.base.z + Math.sin(d.a) * spread);
        }
        arr.needsUpdate = true;
        j.mat.opacity = Math.min(0.3, (j.until - tc) * 0.1);
      }
      this.steamJets = this.steamJets.filter((j) => {
        if (tc < j.until) return true;
        this.scene.remove(j.pts);
        j.geo.dispose(); j.mat.dispose();
        return false;
      });
    }

    // Armed mousetraps — step on one and it snaps: loud, and it bites
    for (const tp of this.liveTraps) {
      const dx = tp.x - this.player.pos.x;
      const dz = tp.z - this.player.pos.z;
      if (dx * dx + dz * dz < 0.55 * 0.55) {
        this.snappedTraps.add(tp.key);
        const at = { x: tp.x, y: 0.05, z: tp.z };
        this.audio.play('trap-snap', at, '[metal snaps under your heel]', 'warn');
        this.sound.emit({ x: tp.x, y: 0.1, z: tp.z, intensity: 0.55, category: 'footstep', caption: '[a trap fires]' });
        this.player.health = Math.max(3, this.player.health - 4);
        this.player.panic = Math.min(1, this.player.panic + 0.08);
      }
    }

    // The pipes tick — ironwork answers a near threat, faster as it closes
    if (this.liveTickProps.length && tA >= this.pipeTickNext) {
      let nearest = Infinity;
      for (const e of this.entities) {
        const tp = e.threatPos();
        if (!tp) continue;
        const dx = tp.x - this.player.pos.x, dz = tp.z - this.player.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < nearest) nearest = d;
      }
      if (nearest < 12) {
        let bp = this.liveTickProps[0], bd = Infinity;
        for (const p of this.liveTickProps) {
          const dx = p.x - this.player.pos.x, dz = p.z - this.player.pos.z;
          const dd = dx * dx + dz * dz;
          if (dd < bd) { bd = dd; bp = p; }
        }
        const interval = 0.35 + nearest * 0.11;
        this.pipeTickNext = tA + interval;
        this.audio.play('pipe-tick', { x: bp.x, y: 1.1, z: bp.z }, interval < 0.75 ? '[the pipes tick — faster]' : '', 'warn');
      }
    }

    // The boards remember — upright strides creak in armed rooms
    if (this.creakyRooms.has(`${this.space}:${this.currentRoom}`) && !this.player.crouching && tA >= this.nextCreak) {
      const v = this.player.vel;
      if (v.x * v.x + v.z * v.z > 0.16) {
        this.creakParity++;
        this.nextCreak = tA + (this.creakParity % 2 ? 1.1 : 1.5);
        const at = { x: this.player.pos.x, y: 0.1, z: this.player.pos.z };
        this.audio.play('floor-creak', at, '');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.22, category: 'footstep', caption: '' });
      }
    }

    // Rest ends — breath restored, you're standing again
    if (this.resting && tA >= this.resting.until) {
      this.player.crouching = this.resting.crouch;
      this.resting = null;
      this.player.frozen = false;
      this.player.stamina = PLAYER.staminaMax;
      this.cue('heal', null, '[your breath comes back]');
    }

    // Loose rugs slide — one trip each, loud enough to cost you
    for (const rg of this.liveRugs) {
      const dx = rg.x - this.player.pos.x, dz = rg.z - this.player.pos.z;
      if (dx * dx + dz * dz < 0.85 * 0.85) {
        this.slippedRugs.add(rg.key);
        const at = { x: rg.x, y: 0.05, z: rg.z };
        this.audio.play('rug-slide', at, '[the rug slides out from under you]', 'warn');
        this.sound.emit({ x: at.x, y: 0.1, z: at.z, intensity: 0.3, category: 'footstep', caption: '[a stumble]' });
        if (this.player.speedMul === 1) {
          this.player.speedMul = 0.72;
          const p = this.player;
          window.setTimeout(() => { if (p.speedMul === 0.72) p.speedMul = 1; }, 1400);
        }
        this.player.panic = Math.min(1, this.player.panic + 0.05);
      }
    }

    // Chandeliers — standing under an armed one earns a creak (the tell);
    // a loud emit within earshot drops the glass on whoever is beneath
    if (!this.chanHooked) {
      this.chanHooked = true;
      this.sound.on((ev) => {
        if (ev.intensity < 0.6 || this.pendingChanDrop) return;
        for (const ch of this.liveChandeliers) {
          const ex = ch.x - ev.x, ez = ch.z - ev.z;
          if (ex * ex + ez * ez > 36) continue;
          const px = ch.x - this.player.pos.x, pz = ch.z - this.player.pos.z;
          if (px * px + pz * pz < 2.56) {
            this.pendingChanDrop = { key: ch.key, x: ch.x, z: ch.z, t: this.clock.time + 0.35 };
          }
          break;
        }
      });
    }
    for (const ch of this.liveChandeliers) {
      const dx = ch.x - this.player.pos.x, dz = ch.z - this.player.pos.z;
      if (dx * dx + dz * dz < 1.44 && !this.warnedChandeliers.has(ch.key)) {
        this.warnedChandeliers.add(ch.key);
        this.audio.play('chain-creak', { x: ch.x, y: 2.6, z: ch.z }, '[the chain overhead creaks]', 'warn');
      }
    }
    if (this.pendingChanDrop && tA >= this.pendingChanDrop.t) {
      const d = this.pendingChanDrop;
      this.pendingChanDrop = null;
      if (!this.droppedChandeliers.has(d.key)) {
        this.droppedChandeliers.add(d.key);
        this.audio.play('chandelier-fall', { x: d.x, y: 1.4, z: d.z }, '[the glass falls]', 'warn');
        this.sound.emit({ x: d.x, y: 0.1, z: d.z, intensity: 1.0, category: 'footstep', caption: '[a crash of glass]' });
        this.player.panic = Math.min(1, this.player.panic + 0.2);
        const pdx = d.x - this.player.pos.x, pdz = d.z - this.player.pos.z;
        if (pdx * pdx + pdz * pdz < 2.25) this.damagePlayer(18, 'hazard', 'The glass fell.');
        for (const b of this.streamer.builtIndices) {
          const bd = this.streamer.get(b);
          if (bd) this.ensureChandelier(b, bd);
        }
      }
    }

    // Cameras — armed units servo toward you inside their room; hold in
    // their glass for 1.2s and they ping the house with where you are
    {
      const builtSet = new Set(this.streamer.builtIndices);
      for (const [key, cm] of this.camObjs) {
        if (cm.fired || !builtSet.has(cm.i)) { cm.expo = 0; continue; }
        cm.o.getWorldPosition(this.tmpV3);
        const dx = this.player.pos.x - this.tmpV3.x, dz = this.player.pos.z - this.tmpV3.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 8 || dist < 0.4) { cm.expo = 0; continue; }
        // desired local yaw: world direction minus the room's own yaw
        const room = this.activeRooms()[cm.i];
        const yawOff = room ? room.yaw : 0;
        const want = Math.atan2(dx, dz) - yawOff - Math.PI / 2;
        let d = want - cm.o.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const maxTurn = 0.55 * this.clock.dt;
        cm.o.rotation.y += Math.abs(d) < maxTurn ? d : Math.sign(d) * maxTurn;
        if (!this.camTicked.has(key) && Math.abs(d) > 0.3) {
          this.camTicked.add(key);
          this.audio.play('cam-servo', { x: this.tmpV3.x, y: this.tmpV3.y, z: this.tmpV3.z }, '[something motorized turns]');
        }
        // in the glass: aligned with its forward and you are upright
        if (Math.abs(d) < 0.4) {
          cm.expo += this.clock.dt * (this.player.crouching ? 0.45 : 1);
          if (cm.expo >= 1.2 && !cm.fired) {
            cm.fired = true;
            this.audio.play('cam-lock', { x: this.tmpV3.x, y: this.tmpV3.y, z: this.tmpV3.z }, '[the camera finds you]', 'warn');
            this.sound.emit({ x: this.player.pos.x, y: 0.4, z: this.player.pos.z, intensity: 0.5, category: 'footstep', caption: '[a lens reports you]' });
            this.player.panic = Math.min(1, this.player.panic + 0.12);
          }
        } else cm.expo = Math.max(0, cm.expo - this.clock.dt * 1.5);
      }
    }

    // Wet floors — running feet lose the room; crouch-wading keeps you up
    if (!this.player.crouching) {
      for (const pd of this.livePuddles) {
        const dx = pd.x - this.player.pos.x, dz = pd.z - this.player.pos.z;
        if (dx * dx + dz * dz < 0.8 * 0.8) {
          this.slippedPuddles.add(pd.key);
          const at = { x: pd.x, y: 0.05, z: pd.z };
          this.audio.play('puddle-splash', at, '[the floor takes your feet — water everywhere]', 'warn');
          this.sound.emit({ x: at.x, y: 0.1, z: at.z, intensity: 0.45, category: 'footstep', caption: '[a splash]' });
          if (this.player.speedMul === 1) {
            this.player.speedMul = 0.6;
            const p = this.player;
            window.setTimeout(() => { if (p.speedMul === 0.6) p.speedMul = 1; }, 1800);
          }
          this.player.panic = Math.min(1, this.player.panic + 0.07);
        }
      }
    }

    // Flooded halls — standing water carries every upright stride; the
    // crouch-wade is quiet but slow, and the drain is the paid quiet.
    {
      const cur = this.activeRooms()[this.currentRoom];
      const floodKey = `${this.space}:${this.currentRoom}`;
      const wading = !!cur?.flooded && !this.drainedRooms.has(floodKey)
        && pointInRoom(cur, this.player.pos.x, this.player.pos.z);
      if (wading) {
        if (!this.drainNoted.has(floodKey)) {
          this.drainNoted.add(floodKey);
          this.cue('puddle-splash', this.player.pos, '[water covers the floor here — every step carries]', 'warn');
        }
        const spd = Math.hypot(this.player.vel.x, this.player.vel.z);
        if (!this.player.crouching) {
          this.player.speedMul = Math.min(this.player.speedMul, 0.7);
          this.wadeMul = true;
          this.wadeAcc += spd * dt;
          if (spd > 1.2 && this.wadeAcc > 1.7) {
            this.wadeAcc = 0;
            this.sound.emit({ x: this.player.pos.x, y: 0.1, z: this.player.pos.z, intensity: 0.55, category: 'impact', caption: '[water takes every step]' });
          }
        }
      } else if (this.wadeMul) {
        this.wadeMul = false;
        if (this.player.speedMul === 0.7) this.player.speedMul = 1;
        this.wadeAcc = 0;
      }
      // Opened drains sink their sheets over a few seconds.
      for (const [idx, el] of this.draining) {
        const t2 = el + dt;
        const sheet = this.streamer.get(idx)?.group.getObjectByName(`flood-${idx}`);
        if (sheet) sheet.position.y = Math.max(-0.06, 0.05 - t2 * 0.02);
        if (t2 > 6) this.draining.delete(idx); else this.draining.set(idx, t2);
      }
    }

    // The pages whisper — linger over written things and they answer, once
    {
      let near: { x: number; z: number; key: string } | null = null;
      for (const b of this.liveBooks) {
        if (this.bookWhispered.has(b.key)) continue;
        const dx = b.x - this.player.pos.x, dz = b.z - this.player.pos.z;
        if (dx * dx + dz * dz < 1.4 * 1.4) { near = b; break; }
      }
      if (near && this.bookTarget === near) {
        this.bookNear += this.clock.dt;
        if (this.bookNear >= 1.2) {
          this.bookWhispered.add(near.key);
          this.bookNear = 0;
          this.audio.play('whisper', { x: near.x, y: 1.3, z: near.z }, '[the pages say a title — yours]', 'warn');
        }
      } else {
        this.bookNear = 0;
        this.bookTarget = near;
      }
    }

    // The channel answers — some tuned sets whisper back a breath later
    while (this.tvAnswerQueue.length && this.tvAnswerQueue[0].at <= tA) {
      const q = this.tvAnswerQueue.shift()!;
      this.audio.play('whisper', q.pos, '[the channel knows you are here]', 'warn');
      this.sound.emit({ x: q.pos.x, y: q.pos.y, z: q.pos.z, intensity: 0.4, category: 'entity-cue', caption: '' });
    }

    // Something tries the handle — one rattle burst, then silence.
    if (this.doorTry) {
      if (!this.doorTry.rung && tA >= this.doorTry.at) {
        this.doorTry.rung = true;
        this.cue('door-rattle', this.doorTry.pos, '[the handle rattles — held]', 'warn');
        this.sound.emit({ x: this.doorTry.pos.x, y: 1.2, z: this.doorTry.pos.z, intensity: 0.45, category: 'door', caption: '' });
      }
      if (tA >= this.doorTry.until) this.doorTry = null;
    }

    // The payphone rings in short bursts, then gives up.
    if (this.phoneRing) {
      const pr = this.phoneRing;
      if (tA >= pr.at && tA >= pr.lastRing) {
        pr.lastRing = tA + 1.05;
        this.audio.play('phone-ring', { x: pr.pos.x, y: pr.pos.y, z: pr.pos.z },
          tA - pr.at < 0.2 ? '[a phone rings]' : '');
        this.sound.emit({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, intensity: 0.55, category: 'ambient', caption: '' });
      }
      if (tA >= pr.until) {
        this.cue('phone-stop', pr.pos, '[the ringing stopped]', 'warn');
        this.phoneRing = null;
      }
    }

    // The falling book — drops off the shelf, lands flat, stays behind.
    if (this.bookDrop && !this.bookDrop.landed && tA >= this.bookDrop.at) {
      const bd = this.bookDrop;
      if (!bd.mesh) {
        bd.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.28), MAT.ink());
        bd.mesh.position.set(bd.x, bd.y, bd.z);
        bd.mesh.rotation.set(0.2, 0.7, 0.3);
        this.entityGroup.add(bd.mesh);
      }
      bd.vy += 9.8 * dt;
      bd.y -= bd.vy * dt;
      bd.mesh.position.y = bd.y;
      bd.mesh.rotation.z += dt * 2.5;
      if (bd.y <= 0.05) {
        bd.mesh.position.y = 0.04;
        bd.mesh.rotation.set(0, bd.mesh.rotation.y, 0);
        bd.landed = true;
        this.cue('book-drop', v3(bd.x, 0.4, bd.z), '[a book drops from the shelf]', 'warn');
        this.sound.emit({ x: bd.x, y: 0.5, z: bd.z, intensity: 0.3, category: 'impact', caption: '' });
      }
    }

    // Doorway crossers — silent slide across the frame, then gone for good.
    for (const cr of this.crossers) {
      cr.t += dt;
      cr.rig?.update(dt);
      const u = Math.min(1, cr.t / cr.dur);
      cr.mesh.position.set(
        cr.from.x + (cr.to.x - cr.from.x) * u,
        cr.from.y,
        cr.from.z + (cr.to.z - cr.from.z) * u,
      );
      if (u >= 1) this.entityGroup.remove(cr.mesh);
    }
    this.crossers = this.crossers.filter((cr) => cr.t < cr.dur);

    // Ambient blackout — queued by room entry; sputter first, then dead dark.
    if (this.pendingBlackout && tA >= this.pendingBlackout.at) {
      const target = this.pendingBlackout.room;
      this.pendingBlackout = null;
      this.flickerRoom(target, 'dim');
      window.setTimeout(() => {
        this.blackoutRoom(target);
        const rm = this.activeRooms()[target];
        if (rm) {
          this.audio.play('amb-settle', { x: rm.origin.x, y: rm.origin.y + 2, z: rm.origin.z });
          this.cue('amb-settle', null, '[the lights die]', 'warn');
        }
      }, 420);
    }

    // Winded breathing — stamina under a third plays a soft breath whose
    // interval tightens as the tank empties.
    if (this.player.stamina < 34 && tA >= this.nextBreath && useGameStore.getState().phase === 'PLAYING') {
      const frac = this.player.stamina / 34;
      this.nextBreath = tA + 0.7 + frac * 0.9;
      this.audio.play('breath', null, this.player.stamina < 12 ? '[breathing hard]' : '');
    }

    // streamer + interactables
    this.streamer.update(this.activeRooms(), this.currentRoom, 1, this.space === 'main' ? this.route!.branchRooms : []);
    // Shadow budget: the eligible room light casts only in the player's room —
    // point-light shadows render the scene six times, so streaming several
    // shadowed rooms would multiply draw calls per frame.
    const shadowsOn = QUALITY[this.settings.quality].shadowMap;
    for (const i of this.streamer.builtIndices) {
      const b = this.streamer.get(i);
      if (!b) continue;
      for (const l of b.lights) {
        const want = shadowsOn && i === this.currentRoom && l.userData.shadowEligible === true;
        if (l.castShadow !== want) l.castShadow = want;
      }
    }
    this.rebuildInteractables();
    const eye = v3();
    this.player.eyePos(eye);
    const look = v3();
    this.player.lookDir(look);
    this.interaction.focus(eye, look, this.player.pos);
    const held = this.interaction.updateHold(dt, this.keys.has(this.keyFor('interact')));
    if (this.input.interactPressed) {
      this.input.interactPressed = false;
      this.tryInteract();
    }
    if (held) {
      if (held.kind === 'peek') this.startPeek(held);
      else if (held.kind === 'drawer' && (held.data as { meta?: Record<string, unknown> }).meta?.drawerLocked
        && !(held.data as { meta?: Record<string, unknown> }).meta?.picked) {
        this.forceDrawer(held);
      } else this.tryInteract();
    }
    // hold-type milestone interactions (pylons)
    if (this.interaction.focused && this.keys.has(this.keyFor('interact'))) {
      const ms = this.milestones.get(this.currentRoom);
      ms?.onHold(this.interaction.focused, dt);
    }

    // entities + director
    this.spawnScheduled();
    this.hazard.update(this.entityCtx(), dt);
    for (const e of [...this.entities]) {
      e.update(dt);
      if (e.state === 'done') {
        e.dispose();
        this.entities = this.entities.filter((x) => x !== e);
      }
    }
    // stillframe input tracking
    for (const e of this.entities) {
      if (e instanceof Stillframe) {
        e.inputHeld = this.keys.size > 0;
      }
      if (e instanceof Inkling || e instanceof Husk || e instanceof Lurker) {
        e.lightOnIt = (this.lampOn || this.pulseLampOn) ? 1 : 0;
      }
    }

    // milestone updates
    for (const [, ms] of this.milestones) ms.update(dt);

    // pulse lamp noise: humming attracts
    if (this.pulseLampOn && Math.random() < dt * 0.8) {
      this.sound.emit({ x: this.player.pos.x, y: 1, z: this.player.pos.z, intensity: 0.25, category: 'machine', caption: '[lamp hum]' });
    }

    this.updatePanic(dt);
    this.updateBraces();
    this.updateDoors(dt);
    this.updateAtmosphere(dt);
    this.updateMaelstrom(dt);
    this.updateRats(dt);
    this.updateCornerWatcher(dt);
    this.updateShade(dt);
    this.updateRelic(dt);
    this.updateMirrorFigure(dt);
    this.updateMoths(dt);

    // engine win already handled via milestone → victory()

    // camera + audio listener
    this.player.eyePos(eye);
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.player.yaw + Math.PI);
    this.camera.rotateX(this.player.pitch);
    this.updatePeek(dt);
    if (!this.fillLight) {
      this.fillLight = new THREE.PointLight(0x9a8f7a, 0.85, 6.5, 2);
      this.scene.add(this.fillLight);
    }
    this.fillLight.position.set(eye.x, eye.y, eye.z);
    if (this.lampOn || this.pulseLampOn) {
      if (!this.lampLight) {
        this.lampLight = new THREE.SpotLight(0xffd9a4, 9, 26, 0.55, 0.85, 1.8);
        if (QUALITY[this.settings.quality].shadowMap) {
          this.lampLight.castShadow = true;
          this.lampLight.shadow.mapSize.set(512, 512);
          this.lampLight.shadow.bias = -0.004;
        }
        this.scene.add(this.lampLight);
        this.scene.add(this.lampLight.target);
      }
      this.lampLight.visible = true;
      this.lampLight.position.set(eye.x, eye.y - 0.1, eye.z);
      const t = v3();
      this.player.lookDir(t);
      this.lampLight.target.position.set(eye.x + t.x * 6, eye.y + t.y * 6, eye.z + t.z * 6);
      // torch interference: something hidden nearby makes the beam sputter —
      // the only warning a closet gives before you open it.
      let cold = 0;
      for (const e of this.entities) {
        const tp = e.threatPos();
        if (!tp) continue;
        const d = v3dist(tp, this.player.pos);
        if (d < 7) cold = Math.max(cold, 1 - d / 7);
      }
      const sputter = cold * (0.28 + 0.22 * Math.max(0, Math.sin(this.clock.time * 13) + Math.sin(this.clock.time * 7.3) * 0.5));
      // dying battery thins the beam
      const batt = this.pulseLampOn
        ? (this.inventory.find((i) => i.id === 'pulseLamp')?.count ?? 0)
        : (this.inventory.find((i) => i.id === 'handLamp')?.count ?? 0);
      const battF = batt < 15 ? 0.55 + 0.35 * Math.max(0, Math.sin(this.clock.time * 11)) : 1;
      this.lampLight.intensity = (this.pulseLampOn ? 8 + Math.sin(this.clock.time * 9) * 3.5 : 9) * (1 - sputter) * battF;
      this.lampFade = (1 - sputter) * battF;
    } else if (this.lampLight) {
      this.lampLight.visible = false;
    }
    // Held-item viewmodel — the active slot's item carried low-right in
    // frame, gripped by a gloved hand. While a lamp beam is lit the lamp is
    // the in-hand item (the light needs a source); otherwise whatever the
    // player selected shows. Sway trails look, bob follows stride, and a
    // reach for a door/threshold lunges the item toward it.
    if (!this.heldView) this.heldView = new HeldView(this.scene);
    const slotItems = this.inventory.filter((i) => ITEM_DEFS[i.id]?.slotItem);
    // HUD hides count-0 entries — the hand should too, or a drained tonic
    // stays visibly held. Lamps stay equippable at 0 (their case reports
    // the dead battery).
    const slotEntry = slotItems[this.activeSlot];
    const equipped = slotEntry && (slotEntry.count > 0 || slotEntry.id === 'handLamp' || slotEntry.id === 'pulseLamp')
      ? slotEntry.id : null;
    const beamOn = this.lampOn || this.pulseLampOn;
    this.heldView.update(dt, this.camera, eye, {
      itemId: equipped,
      lampOn: this.lampOn,
      pulseLampOn: this.pulseLampOn,
      speed: Math.hypot(this.player.vel.x, this.player.vel.z),
      crouching: this.player.crouching,
      reducedMotion: this.settings.reducedMotion,
      hidden: this.peek !== null,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
    });
    if (beamOn) {
      // Fake-volumetric beam — two nested additive cones from the torch
      // head, alpha-ramped so the air carries light without a floor hit.
      if (!this.beamGroup) {
        this.beamGroup = new THREE.Group();
        for (const [r, len, o] of [[1.5, 5.5, 0.1], [0.45, 4.4, 0.13]] as const) {
          const mat = new THREE.MeshBasicMaterial({
            color: 0xffd9a4, transparent: true, opacity: o,
            alphaMap: beamTexture(), blending: THREE.AdditiveBlending,
            depthWrite: false, side: THREE.DoubleSide, fog: false,
          });
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 18, 1, true), mat);
          cone.position.y = -len / 2; // apex at the pivot
          cone.frustumCulled = false;
          const pivot = new THREE.Group();
          pivot.rotation.x = Math.PI / 2; // -Y (cone axis) → -Z (camera forward)
          pivot.add(cone);
          this.beamGroup.add(pivot);
          this.beamMats.push({ mat, base: o });
        }
        // Dust motes — a hundred points drifting inside the cone volume so
        // the beam reads as air, not geometry. beamGroup local space is
        // camera space: forward is -z.
        const n = 110;
        const pos = new Float32Array(n * 3);
        this.motesData = [];
        for (let i = 0; i < n; i++) {
          const d = 0.4 + Math.random() * 4.4;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * d * 0.17;
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = Math.sin(a) * r;
          pos[i * 3 + 2] = -d;
          this.motesData.push({ d, a, r, spin: (Math.random() - 0.5) * 0.7, fall: 0.06 + Math.random() * 0.14 });
        }
        this.motesGeo = new THREE.BufferGeometry();
        this.motesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.motesMat = new THREE.PointsMaterial({
          color: 0xffe2b8, size: 0.035, sizeAttenuation: true, transparent: true,
          opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        });
        const pts = new THREE.Points(this.motesGeo, this.motesMat);
        pts.frustumCulled = false;
        this.beamGroup.add(pts);
        this.scene.add(this.beamGroup);
      }
      this.beamGroup.visible = true;
      // beam pours from the held lamp's tip, not the eye
      const tip = this.heldView.tipWorld(Game.beamTip);
      this.beamGroup.position.set(tip.x, tip.y, tip.z).addScaledVector(Game.torchFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion), 0.12);
      // During look-lag swings the cone can cross the near plane and smear
      // across the whole screen — fade it by its distance from the eye.
      const beamFade = Math.min(1, Math.max(0, (Math.hypot(tip.x - eye.x, tip.y - eye.y, tip.z - eye.z) - 0.12) / 0.25));
      this.beamGroup.quaternion.copy(this.camera.quaternion);
      for (const { mat, base } of this.beamMats) mat.opacity = base * this.lampFade * beamFade;
      // motes orbit the beam axis slowly and fall toward the viewer
      if (this.motesGeo && this.motesMat) {
        const arr = this.motesGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < this.motesData.length; i++) {
          const m = this.motesData[i];
          m.a += m.spin * dt;
          m.d -= m.fall * dt;
          if (m.d < 0.35) { m.d = 5.0; m.a = Math.random() * Math.PI * 2; }
          const r = Math.min(m.r, m.d * 0.17);
          arr.setXYZ(i, Math.cos(m.a) * r, Math.sin(m.a) * r, -m.d);
        }
        arr.needsUpdate = true;
        this.motesMat.opacity = 0.4 * this.lampFade * beamFade;
      }
    } else if (this.beamGroup) {
      this.beamGroup.visible = false;
    }
    // Lamp batteries — hand lamp sips (~180s), pulse lamp gulps (~90s) and
    // cranks back loudly. HUD reads count as charge %.
    const lampItem = this.inventory.find((i) => i.id === 'handLamp');
    const pulseItem = this.inventory.find((i) => i.id === 'pulseLamp');
    if (this.lampOn && lampItem) {
      lampItem.count = Math.max(0, lampItem.count - dt * 0.55);
      if (lampItem.count <= 15 && !this.lowBattWarned) {
        this.lowBattWarned = true;
        this.cue('ui-click', null, '[battery low — beam thinning]', 'warn');
      }
      if (lampItem.count <= 0) {
        this.lampOn = false;
        this.cue('ui-click', null, '[the lamp dies]', 'warn');
      }
    }
    if (!this.lampOn) this.lowBattWarned = false;
    if (this.pulseLampOn && pulseItem) {
      pulseItem.count = Math.max(0, pulseItem.count - dt * 1.1);
      if (pulseItem.count <= 0) {
        this.pulseLampOn = false;
        this.cue('ui-click', null, '[the pulse lamp spins down]', 'warn');
      }
    }
    this.audio.setListener(this.player.pos, this.player.yaw);
    // zone reverb + door occlusion
    const zoneRoom = this.activeRooms()[this.currentRoom];
    const ZONE_MAP: Record<string, import('../audio/audio').ZoneKind> = {
      lobby: 'gallery', corridor: 'corridor', guest: 'suite', records: 'suite',
      maintenance: 'maintenance', gallery: 'gallery', unlit: 'under',
      milestone: 'gallery', safe: 'safe', underscript: 'under',
    };
    this.audio.setZone(ZONE_MAP[zoneRoom?.biome ?? 'corridor'] ?? 'corridor');
    // per-room wet trim — volume sets the tail's size, soft floors and paper
    // stacks eat it, darkness reads emptier.
    if (zoneRoom) {
      const vol = zoneRoom.width * zoneRoom.depth * zoneRoom.height;
      let wet = clamp(Math.sqrt(vol) / 9, 0.5, 1.5);
      if (zoneRoom.floorMaterial === 'carpet') wet *= 0.75;
      else if (zoneRoom.floorMaterial === 'paper') wet *= 0.7;
      if (zoneRoom.darkRoom) wet *= 1.15;
      this.audio.setWetMul(wet);
    }
    // occlusion: fraction of nearby doors closed — closed door behind muffles the world
    let closed = 0, total = 0;
    for (const d of this.doorsAt(this.player.pos)) { total++; if (!d.opening) closed++; }
    this.audio.setOcclusion(total === 0 ? 0 : closed / total);

    // adaptive music mood
    const inDanger = this.entities.some((e) => e.state === 'engage' && e.id !== 'hollow');
    // dread: eased proximity pressure from the nearest spatial threat —
    // drives the heartbeat layer so danger is audible before it's seen.
    let nearest = Infinity;
    for (const e of this.entities) {
      if (e.state !== 'engage' && e.state !== 'warn') continue;
      const tp = e.threatPos();
      if (!tp) continue;
      const d = v3dist(tp, this.player.pos);
      if (d < nearest) nearest = d;
    }
    const dreadTarget = nearest === Infinity ? 0 : Math.max(0, 1 - nearest / 18);
    this.dread += (dreadTarget - this.dread) * Math.min(1, dt * 1.5);
    this.audio.setDread(this.dread);
    const msActive = this.milestones.has(this.currentRoom);
    this.audio.setMood(
      this.space === 'under' ? 'under'
        : inDanger ? 'chase'
        : msActive ? 'milestone'
        : this.currentRoom > 85 ? 'tension'
        : 'calm',
    );

    // HUD publish ~15Hz
    if (this.clock.time - this.lastHud > 0.066) {
      this.lastHud = this.clock.time;
      this.publishHud();
    }
    this.renderFrame();
  };

  private lampLight: THREE.SpotLight | null = null;
  private fillLight: THREE.PointLight | null = null;
  private heldView: HeldView | null = null;
  private static watchPos = new THREE.Vector3();
  private static torchFwd = new THREE.Vector3();
  private static beamTip: Vec3 = v3();

  private publishHud(): void {
    const st = useGameStore.getState();
    const rooms = this.activeRooms();
    const room = rooms[this.currentRoom] ?? rooms[rooms.length - 1];
    const it = this.interaction.focused;
    const inv = this.inventory.filter((i) => i.count > 0);
    const ms = this.milestones.get(this.currentRoom);
    let extraPrompt = '';
    if (ms instanceof IndexEncounter) {
      extraPrompt = ms.cardsRemaining > 0 ? `Catalog cards: ${5 - ms.cardsRemaining}/5` : 'Read the Master Catalogue';
    }
    if (ms instanceof LensHallEncounter && !ms.solved) {
      extraPrompt = 'Tune all four pylons (hold E)';
    }
    if (ms instanceof EngineEncounter) {
      extraPrompt = `Engine: ${ms.phaseName}`;
    }
    useGameStore.setState({
      hud: {
        ...st.hud,
        health: Math.max(0, Math.round(this.player.health)),
        stamina: Math.round(this.player.stamina),
        panic: this.player.panic,
        roomLabel: room?.label ?? '',
        roomIndex: this.currentRoom,
        inUnderscript: this.space === 'under',
        floor: this.space,
        prompt: it ? (it.lockedPrompt && !it.enabled ? it.lockedPrompt : it.prompt) : extraPrompt,
        promptProgress: it?.holdTime ? Math.min(1, this.interaction.holdProgress / it.holdTime) : 0,
        interactable: it?.kind ?? null,
        imprints: this.imprints,
        marginalia: this.marginalia,
        inventory: inv,
        hidden: !!this.player.hiddenSpot,
        protection: this.player.hiddenSpot ? 'hidden' : this.player.protection === 'losSafe' ? 'losSafe' : 'exposed',
        vignette: clamp(1 - this.player.health / 100, 0, 0.8),
        stabilizeActive: !!this.stabilize,
        stabilizedNeedle: this.stabilize?.needle ?? 0,
        freezeFrame: this.entities.some((e) => e instanceof Stillframe && e.state === 'engage'),
      },
    });
  }

  /* ==================== boot ==================== */

  run(): void {
    this.raf = requestAnimationFrame(this.frame);
    this.audio.setMood('menu');
  }

  dispose(): void {
    this.audio.setRoomTone('off');
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('resize', this.onResize);
    this.streamer.clear();
    this.renderer.dispose();
  }
}
