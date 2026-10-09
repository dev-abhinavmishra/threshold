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
import { CrewCount } from '../engine/crewCount';
import { CrewChecker, roomOf as underRoomOf, type CheckerHooks } from '../entities/crewChecker';
import { pointInRoom, shutLeafBlockers } from '../engine/doorGeo';
import { SeedStreams, Rng } from '../engine/rng';
import { v3, v3copy, v3dist, aabb, aabbContainsPoint, clamp, hasLineOfSight, type Vec3, type Aabb } from '../engine/math';
import { generateRoute, type GeneratedRoute } from '../world/generator';
import { plateMaterial } from '../world/builder';
import { wantedNotice, thresholdSpill } from '../world/decals';
import { pickWantedHosts } from './wanted';
import { Reposter, type ReposterHooks } from '../entities/reposter';
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

/** The count's locker: an unclaimed tag rots — the count fences the
 *  goods when the ink dries. Fading is told a minute out. */
const SEIZED_FUSE_S = 300;
const SEIZED_FADE_S = 60;

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
  private crewCount = new CrewCount();
  private checker = new CrewChecker();

  private checkerHooks(): CheckerHooks {
    return {
      addMesh: (o) => this.entityGroup.add(o),
      removeMesh: (o) => this.entityGroup.remove(o),
      cue: (name, at, caption, opts) => this.cue(name, at, caption, opts?.severity),
      emit: (e) => this.sound.emit(e),
      // the lamp held a face — the find enters the house book as a witness
      witnessed: () => {
        this.unpaidHeld += 1;
        this.cue('chalk-mark', this.player.pos, '[the lamp holds your face — the register gains a witness]', 'warn');
      },
      // and the marks on your back — the count receipts them into its
      // locker on the same find
      seizeMarked: () => this.entityCtx().seizeMarked?.() ?? false,
      // sprint 484 — the lamp counts the floor too: loose spill in a
      // swept room is unguarded goods. Coin folds into the tag's coin
      // line; wire joins the tag as claimable coil. Unguarded means
      // yours to lose — the count's paper doesn't ask whose it was.
      seizeFloor: (room) => this.seizeFloorDrops(room),
    };
  }
  private reposterHooks(): ReposterHooks {
    return {
      addMesh: (o) => this.entityGroup.add(o),
      removeMesh: (o) => this.entityGroup.remove(o),
      cue: (name, at, caption, opts) => this.cue(name, at, caption, opts?.severity),
      // a sheet went back up mid-walk — the board carries the name again
      repost: (roomIdx, host) => { this.wantedRooms.set(roomIdx, { x: host.x, z: host.z }); this.bareBoards.delete(roomIdx); },
      // the boards name the face he carries — seeing it stills the walk
      wanted: () => this.wantedActive,
      // the cry down the spine is a real sound — the under rouses to it
      emit: (e) => this.sound.emit(e),
      // sprint 495 — the clerk reads paper, not floor: a pile in his
      // stride is booted aside like any walker's (same scatter the
      // knocker puts on a chock).
      scatterSpill: (x, z) => this.entityCtx().scatterSpill?.(x, z) ?? false,
    };
  }
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
  private spillMeshes = new Map<number, THREE.Mesh>();
  private primedStingDone = new Set<number>();
  /** Staged arrival captions for a fresh run (lobby cold-open). */
  private arrival: { t: number; text: string; sev: 'info' | 'warn' | 'danger'; fired: boolean }[] = [];
  /** First-exposure lessons already taught — the house teaches each verb
   *  once; rides the checkpoint so a death doesn't re-lecture. */
  private taught = new Set<string>();
  private teach(key: string, text: string): void {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.cue('arrival', null, text, 'info');
  }
  private dread = 0;
  /** Keyhole peek: camera pushed through a locked door for a look beyond. */
  private peek: { eye: Vec3; dir: Vec3; t: number; baseFov: number; doorKey: string; eyeDone: boolean } | null = null;
  private peekEyeDecisions = new Map<string, boolean>();
  private peekEyeUsed = new Set<string>();
  /** Per-door 'was an eye already at the crack' roll for the stoop (s448). */
  private stoopEyeUsed = new Set<string>();
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
    this.droppedCoils = [];
    this.wireStrains.clear();
    for (const cr of this.crossers) this.entityGroup.remove(cr.mesh);
    this.crossers = [];
    if (this.bookDrop?.mesh) this.entityGroup.remove(this.bookDrop.mesh);
    this.bookDrop = null;
    this.echoRoom = -1;
    this.echoQueue.length = 0;
    this.phoneRing = null;
    for (const fig of this.brokerFigs.values()) this.entityGroup.remove(fig);
    this.brokerFigs.clear();
    for (const fig of this.clerkFigs.values()) this.entityGroup.remove(fig);
    this.clerkFigs.clear();
    // sprint 414 — the grafter's work clears with the run; a checkpoint
    // restore re-lays it below
    for (const gm of this.graftedMeshes) this.entityGroup.remove(gm);
    this.graftedMeshes = [];
    this.clearRats();
    this.spawned.clear();
    this.milestones.clear();
    this.doorStates.clear();
    this.hazard = new HazardField();
    this.crewCount.reset();
    this.checker.reset(this.checkerHooks());
    this.reposter.reset(this.reposterHooks());
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
    this.stoopEyeUsed.clear();
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
    this.deadTVs.clear();
    this.tvAnswerQueue.length = 0;
    this.woundClocks.clear();
    this.crackedVents.clear();
    this.litHearths.clear();
    this.answeredPhones.clear();
    this.offHookPhones.clear();
    this.spentPhones.clear();
    this.hookRings.length = 0;
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
    // the books keep your name past a death — restored from the
    // checkpoint, zeroed for a fresh run (fields aren't implicit state)
    this.unpaidTheft = cp?.unpaidTheft ?? 0;
    this.unpaidHeld = cp?.unpaidHeld ?? 0;
    this.paperTrail = cp?.paperTrail ?? 0;
    this.wantedActive = false;
    this.wantedRooms.clear();
    this.spillMeshes.clear();
    this.primedStingDone.clear();
    this.hotImprints = cp?.hotImprints ?? 0;
    this.hotMarginalia = cp?.hotMarginalia ?? 0;
    this.hotItems.clear();
    for (const id of cp?.hotItems ?? []) this.hotItems.add(id);
    // the wanted episode rides the checkpoint too — torn boards stay
    // torn, an armed repost keeps its remaining seconds on this clock
    this.wantedActive = cp?.wantedActive ?? false;
    this.wantedRooms = new Map(cp?.wantedRooms ?? []);
    this.bareBoards = new Map(cp?.bareBoards ?? []);
    const repostS = cp?.wantedRepostS ?? 0;
    this.wantedRepostT = repostS > 0 ? this.clock.time + repostS : 0;
    this.deadLines = new Set(cp?.deadLines ?? []);
    // the house only teaches once — taught lessons ride the checkpoint
    this.taught = new Set(cp?.taught ?? []);
    // the sign stays written — fresh marks the hunters already smelled
    // ride the checkpoint; authored 'old' sign re-derives from sockets
    for (const e of cp?.evidence ?? []) {
      this.hazard.evidence.push({
        pos: v3(e.x, 0, e.z), room: e.room, kind: e.kind, t: e.t,
        readBy: [...e.readBy], weak: e.weak, wiped: e.wiped,
      });
    }
    // the dead stay dead — disarmed/bled/choked/killed hazards don't
    // resurrect; positions key the match within a room
    for (const h of cp?.deadHazards ?? []) {
      const near = (p: { x: number; z: number }) =>
        Math.hypot(p.x - h.x, p.z - h.z) < 0.35;
      if (h.kind === 'snare') {
        const s = this.hazard.snares.find((x) => x.room === h.room && near(x.pos));
        if (s) s.armed = false;
      } else if (h.kind === 'steam') {
        const s = this.hazard.steams.find((x) => x.room === h.room && near(x.pos));
        if (s) s.dead = true;
      } else if (h.kind === 'fan') {
        const f = this.hazard.fans.find((x) => x.room === h.room && near(x.pos));
        if (f) f.dead = true;
      } else {
        const w = this.hazard.watchers.find((x) => x.room === h.room && near(x.pos));
        if (w) { if (h.dead === true) w.dead = true; if (h.filed === true) w.filed = true; }
      }
    }
    this.drainedRooms = new Set(cp?.drainedRooms ?? []);
    this.stockFiled = new Set(cp?.stockFiled ?? []);
    // the rifled till stays rifled — cold counters + the stock-reads
    // already testified ride the checkpoint with the debt that priced them
    this.closedCounters.clear();
    for (const ci of cp?.closedCounters ?? []) {
      this.closedCounters.add(ci);
      const tillSock = this.route.rooms[ci]?.sockets
        .find((s) => s.meta.clerk === 'slot0');
      if (tillSock) tillSock.meta.tillTaken = true;
    }
    this.stockSeen.clear();
    for (const si of cp?.stockSeen ?? []) this.stockSeen.add(si);
    // answered + dangling receivers ride the checkpoint too — a reload
    // can't re-offer the read or un-ring the line you left open
    for (const ap of cp?.answeredPhones ?? []) this.answeredPhones.add(ap);
    for (const oh of cp?.offHook ?? []) {
      this.offHookPhones.add(oh.key);
      this.answeredPhones.add(oh.key);
      if (oh.fuse > 0) {
        const until = this.clock.time + oh.fuse;
        const at = oh.fuse > 6.5 ? until - 6.5 : this.clock.time;
        this.hookRings.push({ key: oh.key, pos: { x: oh.x, y: 1.4, z: oh.z }, at, until, lastRing: 0 });
      } else this.spentPhones.add(oh.key);
    }
    // sprint 403 — paid calls restore armed: the far phone still rings
    // after a reload (dur 7s — same fuse convention as offHook)
    for (const dr of cp?.dialedRings ?? []) {
      if (dr.fuse <= 0) { this.spentPhones.add(dr.key); continue; }
      const until = this.clock.time + dr.fuse;
      const at = dr.fuse > 7 ? until - 7 : this.clock.time;
      this.hookRings.push({ key: dr.key, pos: { x: dr.x, y: 1.4, z: dr.z }, at, until, lastRing: 0, dial: true });
    }
    // sprint 404 — a spent or pried spring stays down across a reload
    for (const st of cp?.snappedTraps ?? []) this.snappedTraps.add(st);
    for (const pt of cp?.priedTraps ?? []) this.priedTraps.add(pt);
    // sprint 406 — a slid rug or splashed puddle is spent too
    for (const sr of cp?.slippedRugs ?? []) this.slippedRugs.add(sr);
    for (const sp of cp?.slippedPuddles ?? []) this.slippedPuddles.add(sp);
    // the count's locker keeps its tag — seized goods stay claimable
    // at the cage across a reload (a fresh run mints nothing)
    this.seizedTake = cp?.seizedTake?.items.map((s) => ({ ...s })) ?? [];
    this.seizedAt = cp?.seizedTake
      ? { x: cp.seizedTake.x, y: cp.seizedTake.y, z: cp.seizedTake.z } : null;
    // the fuse rides too — a reload can't launder a rotting tag
    this.seizedFuse = cp?.seizedTake?.fuse ?? 0;
    this.seizedFading = false;
    // what the count fenced stays fenced — the shelf survives a reload
    this.fencedTake = cp?.fencedTake?.map((s) => ({ ...s })) ?? [];
    // and the tag's listed coin rides with it
    this.seizedCoin = cp?.seizedTake?.coin ?? 0;
    // the count's running tally of swallowed coin persists too
    this.coinKept = cp?.coinKept ?? 0;
    this.mintSeizedClaim();
    // kicked wedges stay kicked — floor loot doesn't respawn in your
    // pocket on a reload any more than the till does
    this.kickedWedges = cp?.kickedWedges?.map((w) => ({ ...w })) ?? [];
    this.mintWedgeDrops();
    this.droppedWraps = cp?.droppedWraps?.map((w) => ({ ...w })) ?? [];
    this.mintWrapDrops();
    this.droppedCoils = cp?.droppedCoils?.map((w) => ({ ...w })) ?? [];
    this.mintCoilDrops();
    // sprint 477 — a spilled pouch keeps its spill: floor coin doesn't
    // respawn in your pocket either
    this.droppedPouches = cp?.droppedPouches?.map((w) => ({ ...w })) ?? [];
    this.mintPouchDrops();
    // the grafter's grafts stay grafted — planted wire survives a
    // reload wearing the same face it was laid with; a graft that
    // died stays dead like any wire (its mark rides deadHazards)
    for (const gw of cp?.graftedWires ?? []) {
      if (gw.planted) {
        // your own laid wire restores wearing your flag and its face —
        // silently: the laying signed when you laid it
        const snare = { pos: v3(gw.x, 0, gw.z), room: gw.room, armed: gw.armed, planted: true,
          claimed: gw.claimed, mesh: undefined as THREE.Object3D | undefined };
        this.hazard.snares.push(snare);
        snare.mesh = this.buildSnareProp(snare.pos, gw.room);
        continue;
      }
      if (gw.armed === false) {
        // a spilled coil restores as dead work — same slack face dead
        // snares keep, no fresh sign; its mark was written when it
        // dropped (the splice signs a live laying, never a rehydration)
        const dead = { pos: v3(gw.x, 0, gw.z), room: gw.room, armed: false, grafted: true,
          mesh: undefined as THREE.Object3D | undefined };
        this.hazard.snares.push(dead);
        dead.mesh = this.buildSnareProp(dead.pos, gw.room);
        continue;
      }
      this.plantSnare(v3(gw.x, 0, gw.z), gw.room);
    }
    // wound clocks restore mid-fuse — a paid alarm doesn't die unrung
    // on a reload; `t` was the fuse left, re-timed onto the live clock
    for (const al of cp?.armedLures ?? []) {
      const pos = v3(al.x, al.y, al.z);
      const mesh = modelInstance('wallClock', 0.6) ?? new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x8a6d4a, roughness: 0.8 }));
      mesh.position.copy(pos);
      this.entityGroup.add(mesh);
      this.lures.push({ pos, mesh, until: this.clock.time + al.t,
        // a fuse shorter than the tick floor must still ring — nextTick
        // past `until` skips the ring outright
        nextTick: this.clock.time + Math.min(0.8, al.t), rang: false });
    }
    this.lampOn = false;
    this.pulseLampOn = false;
    // the seal stays armed — it was paid for and hasn't refused yet
    this.wardArmed = cp?.wardArmed ?? false;
    // chalk tally marks are authored by the player, not consumable —
    // a reload keeps what they drew (a fresh run clears it at 581)
    this.chalkMarks = new Map((cp?.chalkMarks ?? []).map(
      ([k, v]): [string, { pos: Vec3; yaw: number; label: string }] =>
        [k, { pos: v3(v.x, v.y, v.z), yaw: v.yaw, label: v.label }]));
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
        if (this.imprints >= n) {
          this.chargedImprints(n, this.player.pos.x, this.player.pos.z);
          return true;
        }
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
      if (r.sockets.some((s) => s.meta.clerk !== undefined)) this.populateClerk(r);
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
      // sprint 428 — the under sells its own pre-coiled wire: scrap
      // cheaper than a latchpick because every grafter carries it —
      // and it smells like their stock either way you came by it.
      { id: 'wireCoil', price: rng.int(16, 24) },
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

  /** The night clerk sells the house's own shelf — priced in imprints,
   *  not marginalia, the upstairs twin of the Broker's counter. */
  private populateClerk(room: RoomInstance): void {
    const rng = this.streams.roomStream('clerk', room.index + 733);
    const stock: { id: ItemId; price: number }[] = [
      { id: 'bandage', price: rng.int(8, 14) },
      { id: 'doorChock', price: rng.int(6, 10) },
      { id: 'latchpick', price: rng.int(16, 24) },
      { id: 'feltWrap', price: rng.int(12, 20) },
    ];
    const first = rng.int(0, stock.length - 1);
    let second = rng.int(0, stock.length - 2);
    if (second >= first) second++;
    const picks = [stock[first], stock[second]];
    let slot = 0;
    for (const sock of room.sockets) {
      if (sock.meta.clerk !== undefined && slot < picks.length) {
        sock.meta.clerkItem = picks[slot].id;
        sock.meta.clerkPrice = picks[slot].price;
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
      playerCarries: (id) => this.inventory.some((i) => i.id === id && i.count > 0),
      heldOwed: () => this.unpaidHeld,
      wanted: () => this.wantedActive && this.wantedRooms.size > 0,
      wordFiled: () => { this.unpaidHeld += 1; }, // the courier's card lands in the register
      lineCut: () => { this.unpaidHeld += 1; }, // the dead wire goes in his book as damages
      lineDeadFor: (r) => this.deadLines.has(r), // a pulled box stays pulled past a checkpoint
      eyeFiled: () => { this.unpaidHeld += 1; }, // a held settle is a witness line in the register
      stockSighted: (r) => { // he knows marked stock — once per register, even past a checkpoint
        if (this.stockFiled.has(r)) return;
        this.stockFiled.add(r);
        this.unpaidHeld += 1;
      },
      carriesMarked: () => this.inventory.some((i) => this.hotItems.has(i.id) && i.count > 0),
      seizeMarked: () => {
        const take = this.inventory.filter((i) => this.hotItems.has(i.id) && i.count > 0);
        if (take.length === 0 && this.hotImprints <= 0 && this.hotMarginalia <= 0) return false;
        const seized = take.map((i) => ({ id: i.id, count: i.count }));
        for (const i of take) { this.hotItems.delete(i.id); i.count = 0; }
        this.inventory = this.inventory.filter((i) => i.count > 0);
        // the take doesn't vanish — the count locks it in the nearest
        // claim cage under a fresh tag, claimable back like any bag.
        // The coin is itemized on the same tag — the count's paper
        // lists what it swallowed (sprint 382), marked pages too (s409).
        this.stashSeized(seized, this.hotImprints + this.hotMarginalia);
        this.hotImprints = 0;
        this.hotMarginalia = 0;
        return true;
      },
      // sprint 393 — the kicked wedge rides under the leaf: the bellman's
      // boot doesn't eat the chock, it slides to the player's side of the
      // seam and waits as gatherable loot.
      wedgeKicked: (doorPos, fromPos) => this.dropKickedWedge(doorPos, fromPos),
      // sprint 413 — confiscation is carried, and carried means it can
      // be lost: a staggered floorkeeper spills pocketed felt as loot.
      dropWraps: (pos, n) => this.dropWraps(pos, n),
      // sprint 414 — the under's version of maintenance: its scavenger
      // strips dead wire and grafts it fresh where the living walk.
      stripSnare: (x, z) => {
        const i = this.hazard.snares.findIndex((hz) =>
          !hz.armed && Math.hypot(hz.pos.x - x, hz.pos.z - z) < 1.2);
        if (i < 0) return false;
        this.hazard.snares.splice(i, 1);
        return true;
      },
      plantSnare: (pos, room, planterKey) => this.plantSnare(pos, room, planterKey),
      spillSnare: (pos, room) => this.spillSnare(pos, room),
      // sprint 477 — a paid hand keeps the coin in its pouch: a staggered
      // grafter drops it where it goes down, gatherable like any spill.
      spillPouch: (pos, n, hot) => this.spillPouch(pos, n, hot),
      // sprint 481 — the under reclaims its spill: quiet hands drag back
      // for dropped coin and wire. The spill window is a race, not a
      // timer — the pile is safe only while no scavenger is in reach.
      nearestSpill: (x, z, maxD, kinds = ['pouch', 'coil', 'wrap']) => {
        let best: { x: number; z: number; kind: 'pouch' | 'coil' | 'wrap' | 'wedge'; bait?: boolean } | null = null;
        let bd = maxD;
        if (kinds.includes('pouch')) for (const w of this.droppedPouches) {
          const d = Math.hypot(w.x - x, w.z - z);
          if (d < bd) { bd = d; best = { x: w.x, z: w.z, kind: 'pouch', bait: w.bait }; }
        }
        if (kinds.includes('coil')) for (const w of this.droppedCoils) {
          const d = Math.hypot(w.x - x, w.z - z);
          if (d < bd) { bd = d; best = { x: w.x, z: w.z, kind: 'coil' }; }
        }
        if (kinds.includes('wrap')) for (const w of this.droppedWraps) {
          const d = Math.hypot(w.x - x, w.z - z);
          if (d < bd) { bd = d; best = { x: w.x, z: w.z, kind: 'wrap' }; }
        }
        if (kinds.includes('wedge')) for (const w of this.kickedWedges) {
          const d = Math.hypot(w.x - x, w.z - z);
          if (d < bd) { bd = d; best = { x: w.x, z: w.z, kind: 'wedge' }; }
        }
        return best;
      },
      scavengeSpill: (x, z, take) => {
        const pi = this.droppedPouches.findIndex((w) => Math.hypot(w.x - x, w.z - z) < 0.55);
        if (pi >= 0) {
          const pile = this.droppedPouches.splice(pi, 1)[0];
          this.mintPouchDrops();
          return { kind: 'pouch', n: pile.n, hot: pile.hot, bait: pile.bait };
        }
        if (take.coil) {
          const ci = this.droppedCoils.findIndex((w) => Math.hypot(w.x - x, w.z - z) < 0.55);
          if (ci >= 0) {
            this.droppedCoils.splice(ci, 1);
            this.mintCoilDrops();
            return { kind: 'coil' };
          }
        }
        if (take.wrap) {
          const wi = this.droppedWraps.findIndex((w) => Math.hypot(w.x - x, w.z - z) < 0.55);
          if (wi >= 0) {
            const pile = this.droppedWraps.splice(wi, 1)[0];
            this.mintWrapDrops();
            return { kind: 'wrap', n: pile.n };
          }
        }
        if (take.wedge) {
          const wi = this.kickedWedges.findIndex((w) => Math.hypot(w.x - x, w.z - z) < 0.55);
          if (wi >= 0) {
            this.kickedWedges.splice(wi, 1);
            this.mintWedgeDrops();
            return { kind: 'wedge' };
          }
        }
        return null;
      },
      // sprint 489 — a pocketed chock spills back as kicked-wedge drop
      // sprint 494 — the knocker doesn't read the floor, it boots it:
      // a chock or felt in a walker's stride scatters further along —
      // the warden's tidy-read chases a moving pile (floor pinball).
      scatterSpill: (x, z) => {
        let hit = false;
        const boot = (w: { x: number; z: number }, r: number) => {
          const ang = ((w.x * 12.9898 + w.z * 78.233) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const to = this.scatterSpot(w.x, w.z, ang, r);
          if (!to) return;
          w.x = to.x; w.z = to.z;
          hit = true;
        };
        for (const w of this.kickedWedges)
          if (Math.hypot(w.x - x, w.z - z) < 0.35) boot(w, 0.55);
        for (const w of this.droppedWraps)
          if (Math.hypot(w.x - x, w.z - z) < 0.35) boot(w, 0.45);
        for (const w of this.droppedPouches)
          if (Math.hypot(w.x - x, w.z - z) < 0.35) boot(w, 0.5);
        for (const w of this.droppedCoils)
          if (Math.hypot(w.x - x, w.z - z) < 0.35) boot(w, 0.5);
        if (hit) {
          this.mintWedgeDrops(); this.mintWrapDrops();
          this.mintPouchDrops(); this.mintCoilDrops();
          this.sound.emit({ x, y: 0.3, z, intensity: 0.34,
            category: 'item', caption: '[a boot finds the loose goods]' });
        }
        return hit;
      },
      spillChocks: (pos, n) => {
        for (let i = 0; i < n; i++) this.kickedWedges.push({ x: pos.x + i * 0.18, z: pos.z });
        this.mintWedgeDrops();
        this.sound.emit({ x: pos.x, y: 0.3, z: pos.z, intensity: 0.28,
          category: 'item', caption: '[chocks scatter on the boards]' });
      },
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
      // sprint 410-411 — the house re-lays its own work: a reader that
      // reached a dead hazard's sign brings it back — wire re-tied, bled
      // lines re-pressurized, wheels re-engaged, felt stripped off its
      // eyes. Death flags are the source of truth: a restored hazard
      // simply leaves the deadHazards checkpoint list, and the
      // tug-of-war is symmetric — restored work threatens walkers too.
      rearmHazard: (kind, x, z) => {
        const near = (p: { x: number; z: number }) => Math.hypot(p.x - x, p.z - z) < 1.4;
        if (kind === 'wire') {
          const s = this.hazard.snares.find((hz) => !hz.armed && near(hz.pos));
          if (!s) return null;
          s.armed = true;
          // sprint 429 — the warden re-ties your wire as the house's:
          // maintenance is a claim — the coil you left dead stops being
          // yours. 'Pull the wire free' reads 'Cut the seal' now, and
          // cutting yields no coil: the house already took it.
          // sprint 454 — the claim is a flag, not a re-flag: clearing
          // `planted` dropped it from the graftedWires checkpoint list
          // and a reload made the re-lay vanish entirely
          s.claimed = true;
          return 'snare';
        }
        if (kind === 'line') {
          const s = this.hazard.steams.find((st) => st.dead && near(st.pos));
          if (!s) return null;
          s.dead = false;
          return 'steam';
        }
        if (kind === 'fan') {
          const f = this.hazard.fans.find((ff) => ff.dead && near(ff.pos));
          if (!f) return null;
          f.dead = false;
          return 'fan';
        }
        if (kind === 'blind') {
          const w = this.hazard.watchers.find((ww) => ww.dead && near(ww.pos));
          if (!w) return null;
          w.dead = false; // the felt is confiscated — the house pockets your wrap
          return 'eye';
        }
        return null;
      },
      strainWire: (x, z) => {
        // sprint 433 — the warden's answer to your bind: he works it
        // over two contacts (a kicked chock is seconds; wire is work),
        // then it parts and the coil drops where it was cut
        const cluster = this.doorsAt(v3(x, 0, z));
        if (!cluster.some((d) => d.heldBy === 'wired')) return null;
        const key = `wire:${Math.round(x * 7)}x${Math.round(z * 7)}`;
        const n = (this.wireStrains.get(key) ?? 0) + 1;
        this.wireStrains.set(key, n);
        if (n < 2) {
          this.cue('floor-creak', { x, y: 0.6, z },
            '[it works at the wire on the leaf]', 'warn');
          this.sound.emit({ x, y: 0.6, z, intensity: 0.3, category: 'item', caption: '[wire strained]' });
          return 'strained';
        }
        this.wireStrains.delete(key);
        for (const d of cluster) if (d.heldBy === 'wired') d.heldBy = undefined;
        this.droppedCoils.push({ x, z });
        this.mintCoilDrops();
        this.cue('door-creak', { x, y: 0.6, z },
          '[the wire parts under its hands — the leaf swings free]', 'warn');
        this.sound.emit({ x, y: 0.6, z, intensity: 0.3, category: 'item', caption: '[wire worked loose]' });
        return 'freed';
      },
    };
  }

  /** Interactable points registered by living entities (e.g. the
   *  Collector's toll) — re-applied after every stream rebuild. */
  private dynamicInteractables: import('../player/interaction').Interactable[] = [];

  /** Door chocks the bellman kicked loose — they slid under the leaf
   *  and lie as gatherable loot until walked back for. */
  private kickedWedges: { x: number; z: number }[] = [];
  /** Coils the house worked off a bound leaf — same drop convention:
   *  wire isn't destroyed by the strain, it lands as loot. */
  private droppedCoils: { x: number; z: number }[] = [];
  /** First-touch strains on bound leaves, keyed by door pos — the
   *  second contact parts the wire (a kick is fast; wire is work). */
  private wireStrains = new Map<string, number>();

  /** The Auditor's tally — each marginalia claim drawn, sledge pick, and
   *  basket steal below is pilferage the under's clerks can read. Settled
   *  at an auditor's desk; refused, it walks. */
  private unpaidTheft = 0;

  /** The Detective's register — each imprint claim drawn on the main
   *  route is a debt the house keeps. Settled at his desk; walking out
   *  owed puts your face on the wire. */
  private unpaidHeld = 0;
  /** The Auditor's wanted sheet — true while the crew boards ahead carry
   *  your face. The under-crew notices a tier harder until you settle. */
  private wantedActive = false;
  private wantedRooms = new Map<number, { x: number; z: number }>();
  /** The clerk has more paper — once the boards stand bare this clock
   *  starts a repost window (fresh sheets downstream). */
  private wantedRepostT = 0;
  /** The count's locker — goods a named catch stripped hang under a
   *  fresh tag at the nearest claim cage. Taking them back is a fresh
   *  claim on crew-held effects: priced, filed, counted like any bag. */
  private seizedTake: { id: ItemId; count: number }[] = [];
  private seizedAt: { x: number; y: number; z: number } | null = null;
  // sprint 379 — the tag rots: the count fences an unclaimed locker
  // after a fuse. Honest to a fault: the ink fading is cued and the
  // book readout says so while it can still be answered
  private seizedFuse = 0;
  private seizedFading = false;
  /** Sprint 382 — the tag itemizes: marked coin the seize strips is
   *  held under the same tag, priced into the claim at par. The cut
   *  can't hand back coin — the count swallowed it outright. */
  private seizedCoin = 0;
  /** Sprint 383 — the running count of coin the count kept outright
   *  (a cut tag's forfeit, a rotted tag's loss) — never comes back,
   *  so the books remember it at the end. */
  private coinKept = 0;
  /** Sprint 381 — what the count kept: a rotted tag's goods get fenced
   *  to the Broker's shelf, buyable back at the house's markup. */
  private fencedTake: { id: ItemId; count: number }[] = [];
  /** Boards the player tore mid-episode — the clerk re-pins THESE
   *  slots, so a partial tear is answered like a clean sweep. */
  private bareBoards = new Map<number, { x: number; z: number }>();
  /** The reposter — the repost walk made flesh: a clerk carries fresh
   *  sheets to the bare boards one room at a time. Catchable. */
  private reposter = new Reposter();
  /** Detective rooms whose house line was pulled — the dead wire is a
   *  physical state (box gone, no re-mint) and it rides the checkpoint. */
  private deadLines = new Set<number>();
  /** Detective rooms whose register already filed a marked-stock
   *  sighting — the once-per-detective flag survives a reload. */
  private stockFiled = new Set<number>();

  /** The Filer's consult ledger — each paid read of the under's own
   *  paper (work order, crew board, claim register) is a question the
   *  index logs. Squared at her station; carrying questions into her
   *  room puts your name on a card. */
  private paperTrail = 0;
  /** A consult of the under's paper files a question — while the
   *  boards name you, every ask counts double: the wanted sheets
   *  carry your face to the index too. */
  private fileQuestion() { this.paperTrail += this.wantedActive ? 2 : 1; }

  /** The count's locker — seized goods hang under a fresh claim tag at
   *  the nearest under claim cage instead of vanishing. A seed with no
   *  cage keeps the take (the count swallowed it whole). */
  private stashSeized(items: { id: ItemId; count: number }[], coin = 0): void {
    if (items.length === 0 && coin <= 0) return;
    // the tag itemizes — the count's paper lists the coin it swallowed
    this.seizedCoin += coin;
    // one locker per run — a second catch doesn't re-hang the tag at a
    // nearer cage while the first still claims; the take just joins it
    // a fresh catch hangs fresh ink — the fuse restarts even when the
    // take joins a locker that already stands
    this.seizedFuse = SEIZED_FUSE_S;
    this.seizedFading = false;
    if (this.seizedAt) {
      this.seizedTake.push(...items);
      // the tag's price reads what it now lists
      const v = this.dynamicInteractables.find((x) => x.id.startsWith('seized-claim'));
      if (v) v.prompt = `Claim your seized take — ${8 + this.seizedCoin} marginalia`;
      return;
    }
    let cage: { x: number; y: number; z: number } | null = null;
    let best = Infinity;
    for (const r of this.route?.underRooms ?? []) {
      for (const s of r.sockets) {
        if (s.meta.claim === undefined || s.meta.marginalia !== true) continue;
        const d = Math.hypot(s.pos.x - this.player.pos.x, s.pos.z - this.player.pos.z);
        if (d < best) {
          best = d;
          // the fresh tag hangs on the cage's FRONT edge — toward the
          // room's approach — so it's always the nearer claim verb and
          // never hidden behind the cage's own tag under aim
          const rx = r.origin.x - s.pos.x, rz = r.origin.z - s.pos.z;
          const rl = Math.hypot(rx, rz) || 1;
          cage = { x: s.pos.x + (rx / rl) * 0.45, y: s.pos.y, z: s.pos.z + (rz / rl) * 0.45 };
        }
      }
    }
    if (!cage) { this.seizedTake.push(...items); return; }
    this.seizedTake.push(...items);
    this.seizedAt = cage;
    this.mintSeizedClaim();
  }

  /** Mint the claim-back verb at the tag — replayed like restock so a
   *  room rebuild keeps it, removed on claim. Sprint 380: the tag
   *  offers a second way back — cutting is free but the count's paper
   *  had already claimed them: your take returns marked and filed
   *  deeper. The cut hangs a hand's breadth off the honest tag. */
  private mintSeizedClaim(): void {
    if (!this.seizedAt || (this.seizedTake.length === 0 && this.seizedCoin <= 0)) return;
    const id = `seized-claim-${this.space}`;
    const cutId = `seized-cut-${this.space}`;
    if (this.dynamicInteractables.some((x) => x.id === id || x.id === cutId)) return;
    this.dynamicInteractables.push({
      kind: 'seizedClaim', id,
      pos: { x: this.seizedAt.x, y: this.seizedAt.y, z: this.seizedAt.z },
      prompt: `Claim your seized take — ${8 + this.seizedCoin} marginalia`,
      // priority 3 — YOUR tag outranks the cage's own claim wares
      // under aim; a stranger's bag shouldn't shadow your name
      holdTime: 0.8, enabled: true, priority: 3, data: {},
    });
    // the cut hangs beside the tag — offset along the cage's front
    // tangent (perpendicular to the tag's roomward face)
    let d = { x: 1, z: 0 };
    let bd = Infinity;
    for (const r of this.route?.underRooms ?? []) {
      const dd = Math.hypot(r.origin.x - this.seizedAt.x, r.origin.z - this.seizedAt.z);
      if (dd < bd) { bd = dd; d = { x: r.origin.x - this.seizedAt.x, z: r.origin.z - this.seizedAt.z }; }
    }
    const dl = Math.hypot(d.x, d.z) || 1;
    const px = -(d.z / dl), pz = d.x / dl;
    this.dynamicInteractables.push({
      kind: 'seizedCut', id: cutId,
      pos: { x: this.seizedAt.x + px * 0.3, y: this.seizedAt.y, z: this.seizedAt.z + pz * 0.3 },
      prompt: 'Cut the tag free — your take comes back marked',
      holdTime: 0.6, enabled: true, priority: 3, data: {},
    });
  }

  /** sprint 484 — the checker's lamp counts the floor with the till:
   *  loose spill in the swept room is receipted into the locker. Coin
   *  folds into the tag's coin line (marked or not — the paper lists
   *  coin as coin); a dropped coil joins the tag as claimable wireCoil.
   *  Returns what the floor yielded, null when nothing lay there. */
  private seizeFloorDrops(room: number): { pouch: number; coils: number } | null {
    const rooms = this.route?.underRooms ?? [];
    const inRoom = (x: number, z: number) => underRoomOf(rooms, { x, z }) === room;
    let pouch = 0, coils = 0;
    const keepP = this.droppedPouches.filter((p) => {
      if (!inRoom(p.x, p.z)) return true;
      pouch += p.n + p.hot;
      return false;
    });
    if (keepP.length !== this.droppedPouches.length) {
      this.droppedPouches = keepP;
      this.mintPouchDrops();
    }
    const keepC = this.droppedCoils.filter((w) => {
      if (!inRoom(w.x, w.z)) return true;
      coils++;
      return false;
    });
    if (keepC.length !== this.droppedCoils.length) {
      this.droppedCoils = keepC;
      this.mintCoilDrops();
    }
    if (pouch === 0 && coils === 0) return null;
    this.stashSeized(
      coils > 0 ? [{ id: 'wireCoil' as ItemId, count: coils }] : [],
      pouch,
    );
    return { pouch, coils };
  }

  /** The kicked wedge lands on the player's side of the seam — the boot
   *  sends it skidding under the leaf toward the room it was guarding. */
  private dropKickedWedge(doorPos: Vec3, fromPos: Vec3): void {
    const dx = doorPos.x - fromPos.x, dz = doorPos.z - fromPos.z;
    const dl = Math.hypot(dx, dz) || 1;
    this.kickedWedges.push({ x: doorPos.x + (dx / dl) * 0.45, z: doorPos.z + (dz / dl) * 0.45 });
    this.mintWedgeDrops();
  }

  /** Mint the gather verbs for kicked wedges — rebuilt like restock so a
   *  room rebuild keeps the drops; indices stay in `data.i`. The filter
   *  is space-agnostic: `this.space` may still carry the dead run's floor
   *  at checkpoint-restore time, and a mismatched prefix would strand
   *  stale verbs alongside fresh ones. */
  private mintCoilDrops(): void {
    this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('coil-drop-'));
    this.droppedCoils.forEach((w, i) => {
      this.dynamicInteractables.push({
        kind: 'coilDrop', id: `coil-drop-${this.space}-${i}`,
        pos: { x: w.x, y: 0.15, z: w.z },
        prompt: 'Gather the wire',
        holdTime: 0.6, enabled: true, priority: 1,
        // pos-keyed: the array shifts on gather, the pos doesn't
        data: { x: Number(w.x.toFixed(2)), z: Number(w.z.toFixed(2)) },
      });
      this.mintDragVerb('coil', `coil-drop-drag-${this.space}-${i}`, w);
    });
  }

  /** sprint 497 — 'Drag the pile': the deliberate twin of the kick.
   *  Crouched within reach, a pile offers an anchor a third of a metre
   *  TOWARD you — aim past the pile to pull it a step per hold, instead
   *  of pocketing it. Quiet work: a faint scrape, no sign left. */
  private mintDragVerb(list: 'pouch' | 'wrap' | 'wedge' | 'coil',
    id: string, w: { x: number; z: number }): void {
    if (!this.player.crouching) return;
    const dx = this.player.pos.x - w.x, dz = this.player.pos.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5 || d > 1.6) return;
    this.dynamicInteractables.push({
      kind: 'dragPile', id,
      pos: { x: w.x + (dx / d) * 0.34, y: 0.18, z: w.z + (dz / d) * 0.34 },
      prompt: 'Drag the pile closer', holdTime: 0.5, enabled: true, priority: 1,
      data: { list, x: Number(w.x.toFixed(2)), z: Number(w.z.toFixed(2)) },
    });
  }

  private mintWedgeDrops(): void {
    this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('wedge-drop-'));
    this.kickedWedges.forEach((w, i) => {
      this.dynamicInteractables.push({
        kind: 'wedgeDrop', id: `wedge-drop-${this.space}-${i}`, 
        pos: { x: w.x, y: 0.15, z: w.z },
        prompt: 'Gather the loose chock',
        holdTime: 0.6, enabled: true, priority: 1, data: { i },
      });
      this.mintDragVerb('wedge', `wedge-drop-drag-${this.space}-${i}`, w);
    });
  }

  /** sprint 413 — felt the floorkeeper pocketed, spilled where he went
   *  down. One pile per spill, `data.n` counts the wraps in it. Same
   *  re-mint/space-agnostic rules as the wedge drops. */
  private droppedWraps: { x: number; z: number; n: number }[] = [];
  private dropWraps(pos: Vec3, n: number): void {
    this.droppedWraps.push({ x: pos.x, z: pos.z, n });
    this.mintWrapDrops();
  }

  /** sprint 477 — a paid hand keeps the coin: a grafter fed under the
   *  leaf carries the pouch until it staggers, then spills it where it
   *  went down. Marked coin comes back still marked — the under doesn't
   *  launder what it pockets. Same re-mint/space-agnostic rules. */
  private droppedPouches: { x: number; z: number; n: number; hot: number; bait?: boolean }[] = [];
  private spillTickT = 0;
  private spillTickI = 0;
  private spillKickCd = 0;   // sprint 493 — one kick per beat
  private spillTideT = 0;    // sprint 498 — the water pulls slow
  private spillTideCueT = 0;
  private drainedSpots = new Map<number, { x: number; z: number }>(); // sprint 499 — where the water left
  private spillPouch(pos: Vec3, n: number, hot: number): void {
    this.droppedPouches.push({ x: pos.x, z: pos.z, n, hot });
    this.mintPouchDrops();
    this.sound.emit({ x: pos.x, y: 0.3, z: pos.z, intensity: 0.3,
      category: 'item', caption: '[a pouch of coin drops]' });
  }
  private mintPouchDrops(): void {
    this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('pouch-drop-'));
    this.droppedPouches.forEach((w, i) => {
      this.dynamicInteractables.push({
        kind: 'pouchDrop', id: `pouch-drop-${this.space}-${i}`,
        pos: { x: w.x, y: 0.15, z: w.z },
        prompt: w.bait ? 'Gather the baited coin' : 'Gather the spilled coin',
        holdTime: 0.6, enabled: true, priority: 1, data: { i },
      });
      this.mintDragVerb('pouch', `pouch-drop-drag-${this.space}-${i}`, w);
    });
  }
  private mintWrapDrops(): void {
    this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('wrap-drop-'));
    this.droppedWraps.forEach((w, i) => {
      this.dynamicInteractables.push({
        kind: 'wrapDrop', id: `wrap-drop-${this.space}-${i}`,
        pos: { x: w.x, y: 0.15, z: w.z },
        prompt: w.n === 1 ? 'Gather the scattered felt' : `Gather the scattered felt (${w.n})`,
        holdTime: 0.6, enabled: true, priority: 1, data: { i },
      });
      this.mintDragVerb('wrap', `wrap-drop-drag-${this.space}-${i}`, w);
    });
  }

  /** sprint 424 — a live planted alarm still ticks for you: picking it
   *  up before the ring takes the lure back whole. Re-minted per frame
   *  — a ringing lure stops offering itself the moment it spends. */
  private mintAlarmDrops(): void {
    this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('alarm-drop-'));
    this.lures.forEach((l, i) => {
      if (l.rang) return;   // a sprung clock is scrap, not a coil you wind back
      this.dynamicInteractables.push({
        kind: 'alarmDrop', id: `alarm-drop-${this.space}-${i}`,
        pos: { x: l.pos.x, y: 0.15, z: l.pos.z },
        prompt: 'Pick the alarm up', holdTime: 0.8, enabled: true, priority: 1,
        data: { x: Number(l.pos.x.toFixed(2)), z: Number(l.pos.z.toFixed(2)) },
      });
    });
  }

  /** sprint 414 — the grafter lays a stripped coil where the living
   *  walk. The graft is a normal armed snare wearing the same paper-
   *  and-amber face the seed ones do, tagged `grafted` so the
   *  checkpoint can rebuild it after a reload. */
  private graftedMeshes: THREE.Object3D[] = [];
  /** The paper-and-amber face a laid wire wears (graft or planted).
   *  Bound to the snare so pulling the wire takes its face with it. */
  private buildSnareProp(pos: Vec3, room: number): THREE.Object3D {
    const built = buildProp({ kind: 'snare', x: 0, z: 0 }, new Rng(0x6fa1f + this.hazard.snares.length * 97));
    const fy = this.activeRooms()[room]?.origin.y ?? 0;
    built.group.position.set(pos.x, fy, pos.z);
    built.group.rotation.y = ((pos.x * 7.31 + pos.z * 13.7) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    this.entityGroup.add(built.group);
    this.graftedMeshes.push(built.group);
    return built.group;
  }

  /** A snare leaving the floor takes its prop face with it — a pulled
   *  or reclaimed wire can't leave a ghost visual lying there. */
  private removeSnare(hz: { pos: Vec3; room: number; armed: boolean; grafted?: boolean; planted?: boolean; mesh?: THREE.Object3D }): void {
    if (hz.mesh) {
      this.entityGroup.remove(hz.mesh);
      const gi = this.graftedMeshes.indexOf(hz.mesh);
      if (gi >= 0) this.graftedMeshes.splice(gi, 1);
    }
    this.hazard.snares.splice(this.hazard.snares.indexOf(hz), 1);
  }

  private plantSnare(pos: Vec3, room: number, planterKey?: string): void {
    const snare = { pos: v3(pos.x, 0, pos.z), room, armed: true, grafted: true,
      mesh: undefined as THREE.Object3D | undefined };
    this.hazard.snares.push(snare);
    // sprint 418 — the splice signs itself: fresh work marks the floor for
    // the under's other hunters, the way a rifled till does. The planter
    // gets it pre-read under its own key so it doesn't chase its own coil.
    // Only a live planting signs — checkpoint restores pass no key and
    // re-mint the wire silently (the mark was written when it was laid).
    if (planterKey) {
      this.hazard.evidence.push({ pos: v3(pos.x, 0, pos.z), room, kind: 'work',
        t: this.clock.time, readBy: [planterKey] });
    }
    snare.mesh = this.buildSnareProp(pos, room);
  }

  /** sprint 419 — a dropped coil is dead wire again: the splice-sign a
   *  tripped one would leave, reclaimable by the next scavenger.
   *  sprint 427 — and it lies there visible like every fallen wire:
   *  same slack face dead snares keep, plus the small clatter of the
   *  drop so the room knows the coil slipped. */
  private spillSnare(pos: Vec3, room: number): void {
    const snare = { pos: v3(pos.x, 0, pos.z), room, armed: false, grafted: true,
      mesh: undefined as THREE.Object3D | undefined };
    this.hazard.snares.push(snare);
    snare.mesh = this.buildSnareProp(pos, room);
    this.hazard.evidence.push({ pos: v3(pos.x, 0, pos.z), room, kind: 'wire',
      t: this.clock.time, readBy: [] });
    this.sound.emit({ x: pos.x, y: 0.3, z: pos.z, intensity: 0.3,
      category: 'item', caption: '[a coil of wire drops]' });
  }

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
    const roam = this.activeRooms();
    // sprint 468 — the breath at the crack: a live watcher pressed
    // against THIS leaf is the most door-specific fact the ear can
    // give — it outranks whatever else the room holds. The ear hears
    // the camp your own call created, before you call twice into it.
    let atLeaf = Infinity;
    for (const e of this.entities) {
      if (e.state === 'done') continue;
      const tp = e.threatPos();
      if (!tp) continue;
      const ri = underRoomOf(roam, tp);
      if (ri < 0 || roam[ri] !== target) continue;
      const d = v3dist(tp, door.pos);
      if (d < atLeaf) atLeaf = d;
    }
    if (atLeaf <= 1.5) {
      return { sfx: 'floor-creak', text: '[breath at the crack — it is listening back]', sev: 'danger' as const };
    }
    const sched = target.scheduled[0];
    if (sched) {
      const base = LISTEN_CUES[sched.entity] ?? { sfx: 'floor-creak', text: '[something moves beyond]', sev: 'warn' as const };
      return sched.roused
        ? { sfx: base.sfx, text: ROUSED_LINES[sched.entity] ?? '[pacing — it heard you]', sev: 'danger' as const }
        : base;
    }
    // the count's lamp carries through the seam too — ears tell you
    // which room the sweep is in before you ever see the glow
    if (this.space === 'under') {
      if (this.checker.active) {
        const ci = underRoomOf(this.route?.underRooms ?? [], this.checker.position);
        if (ci >= 0 && this.route?.underRooms[ci] === target) {
          return { sfx: 'floor-creak', text: this.checker.lampLit
            ? '[the count’s lamp is lit in there — the sweep is inside]'
            : '[the count walks blind in there — stripped, but still sweeping]', sev: 'danger' as const };
        }
      }
      // and its paper-runner: hearing fresh sheets move tells you which
      // boards get re-pinned before you round the corner on him
      if (this.reposter.active) {
        const ri = underRoomOf(this.route?.underRooms ?? [], this.reposter.position);
        if (ri >= 0 && this.route?.underRooms[ri] === target) {
          return { sfx: 'floor-creak', text: '[paper moves beyond — a runner carries the count’s fresh sheets]', sev: 'warn' as const };
        }
      }
    }
    // a primed set piece runs already — its work carries through the seam
    const ms = this.milestones.get(target.index);
    if (ms?.primed && ms.primedAudible) {
      return { sfx: 'floor-creak', text: '[a mechanism already mid-count — it heard you]', sev: 'danger' as const };
    }
    // roving threats carry through the seam too — the spine's walkers
    // answer by tread before you ever see them; the loudest wins
    let roverBest: { sfx: string; text: string; sev?: 'info' | 'warn' | 'danger' } | null = null;
    let roverRank = 0;
    for (const e of this.entities) {
      if (e.state === 'done') continue;
      const tp = e.threatPos();
      if (!tp) continue;
      const ri = underRoomOf(roam, tp);
      if (ri < 0 || roam[ri] !== target) continue;
      const cue = LISTEN_CUES[e.id];
      if (!cue) continue;
      const rank = cue.sev === 'danger' ? 3 : cue.sev === 'warn' ? 2 : 1;
      if (rank > roverRank) { roverRank = rank; roverBest = cue; }
    }
    if (roverBest) return roverBest;
    // a line left open hums through the seam too — the ear tells you which
    // room carries your own armed lure (lower than any live tread)
    const armedLine = this.hookRings.find((hr) => {
      const ri = underRoomOf(roam, hr.pos);
      return ri >= 0 && roam[ri] === target;
    });
    if (armedLine) {
      return { sfx: 'printer-whir', sev: 'info' as const,
        text: armedLine.dial ? '[a phone rings beyond — the line you paid for]' : '[a line hums beyond — somebody left it off the hook]' };
    }
    // sprint 426 — and the seam carries the tick: your own wound clock
    // counts down behind a closed leaf — the ear knows its lure's room
    // before the ring ever pays it out
    const ticking = this.lures.find((l) => {
      const ri = underRoomOf(roam, l.pos);
      return ri >= 0 && roam[ri] === target;
    });
    if (ticking) {
      return { sfx: 'printer-whir', sev: 'info' as const,
        text: ticking.rang ? '[an alarm rings beyond — the clock you wound]'
          : '[a small clock counts down beyond — the lure you planted]' };
    }
    // sprint 435 — and the seam reads your own bind: a leaf you wired
    // reports its hold at the lowest tier, warn when the house is
    // mid-strain on it — you hear your denial being dismantled
    if (door.heldBy === 'wired') {
      const strained = (this.wireStrains.get(
        `wire:${Math.round(door.pos.x * 7)}x${Math.round(door.pos.z * 7)}`) ?? 0) > 0;
      return { sfx: 'floor-creak', sev: strained ? 'warn' as const : 'info' as const,
        text: strained ? '[hands work your wire beyond — the bind strains]'
          : '[your wire still holds — nothing else moves]' };
    }
    if (SAFE_ROOM_TEMPLATES.has(target.templateId)) return { sfx: 'fire-crackle', text: '[still air — a resting place]' };
    if (target.darkRoom) return { sfx: 'hollow-wake', text: '[stale air — dark beyond]', sev: 'warn' };
    return { sfx: 'floor-creak', text: '[nothing moves]' };
  }

  /** Ear to the seam's sight-twin (sprint 445): stooped at the crack under a
   *  shut leaf you read the far floor itself — only what passes close to the
   *  threshold shows. Answers 'is it right there', never 'what is it': a
   *  deep walker and a threshold one both read as shadow, so the crack
   *  complements the listen instead of repeating it. Honest limits: a room
   *  too dark gives the crack nothing, a staged (unspawned) threat casts no
   *  shadow yet, and a lurking readout can't tell you it saw you. */
  private stoopUnder(door: Door): { text: string; sev?: 'info' | 'warn' | 'danger' } {
    if (door.falseDoor) return { text: '[solid plaster — the crack is painted on]', sev: 'warn' };
    if (door.deep) return { text: '[a draught, far too cold — the gap drinks the warmth]', sev: 'warn' };
    const target = this.roomBeyondDoor(door);
    if (!target) return { text: '[dead dark — nothing behind it]' };
    const roam = this.activeRooms();
    // The nearest live thing in the far room, measured to the leaf — the
    // crack shows floor, so only proximity to the threshold matters.
    let best = Infinity;
    let bestE: Entity | null = null;
    for (const e of this.entities) {
      if (e.state === 'done') continue;
      const tp = e.threatPos();
      if (!tp) continue;
      const ri = underRoomOf(roam, tp);
      if (ri < 0 || roam[ri] !== target) continue;
      const d = v3dist(tp, door.pos);
      if (d < best) { best = d; bestE = e; }
    }
    // sprint 448 — the crack watches back: when a live thing is already
    // close to the leaf, a seeded per-door decision can put ITS eye to the
    // gap instead of its shadow. One roll per door — the eye either was
    // there or it wasn't.
    if (best <= 2.6 && !this.stoopEyeUsed.has(door.id)) {
      // sprint 454 — the roll keys on the door's own id, not only the
      // room: one seed for every leaf in the room decided all their
      // eyes the same way
      const eyeSeed = this.currentRoom * 131 + 97
        + [...door.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
      const eye = this.streams.roomStream('scare', eyeSeed).bool(0.22);
      this.stoopEyeUsed.add(door.id);
      if (eye) {
        // sprint 450 — and the eye TELLS: the watcher that met you through
        // the gap now knows where you knelt; mobile things walk their own
        // door-work to reach your side (block, knock, strain, shoulder).
        bestE?.eyeTell?.(this.player.pos, door.pos);
        // the flinch is real: your scramble back off the crack is genuine
        // noise at YOUR position — unsourced, so the house can rouse on it
        this.sound.emit({ x: this.player.pos.x, y: 0.3, z: this.player.pos.z, intensity: 0.6 * this.wantedPull, category: 'impact', caption: '' });
        return { text: '[a low eye meets yours at the crack — it was watching]', sev: 'danger' as const };
      }
    }
    // sprint 454 — a room too dark gives the crack nothing: no shadow
    // reads reach black glass. The count's lamp is the one exception —
    // it IS the light, so it still reads through the crack
    if (target.darkRoom) {
      if (this.space === 'under' && this.checker.active && this.checker.lampLit) {
        const ci = underRoomOf(roam, this.checker.position);
        if (ci >= 0 && roam[ci] === target) {
          const d = v3dist(this.checker.position, door.pos);
          return { text: d < 2.0
            ? '[the count’s lamp glows at the crack — the sweep is at this door]'
            : '[a low light moves beyond — the count’s lamp is working that room]', sev: 'danger' as const };
        }
      }
      return { text: '[black glass — no light reaches the crack]', sev: 'warn' };
    }
    // and the count's own lamp — its low glow reads through the crack,
    // and even stripped the lamp's bulk still moves the floor-light
    if (this.space === 'under' && this.checker.active) {
      const ci = underRoomOf(roam, this.checker.position);
      if (ci >= 0 && roam[ci] === target) {
        const d = v3dist(this.checker.position, door.pos);
        if (this.checker.lampLit) {
          return { text: d < 2.0
            ? '[the count’s lamp glows at the crack — the sweep is at this door]'
            : '[a low light moves beyond — the count’s lamp is working that room]', sev: 'danger' as const };
        }
        if (d < best) best = d;
      }
    }
    if (best <= 1.7) return { text: '[a shadow holds at the threshold — it is right there]', sev: 'danger' as const };
    if (best <= 4.2) return { text: '[a shadow crosses the floor-light — something is working that room]', sev: 'warn' as const };
    if (best < Infinity) return { text: '[a lit seam — something stirs deep in that room]' };
    if (SAFE_ROOM_TEMPLATES.has(target.templateId)) return { text: '[still floor — a resting place]' };
    return { text: '[a lit seam — nothing crosses it]' };
  }

  /** Doors that already pre-spawned their roused encounters (one-shot). */
  private rousedSpawned = new Set<string>();
  /** Under doors that already announced their named-face stick. */
  private readonly stuckAnnounced = new Set<string>();
  /** sprint 506 — doors that already broomed their threshold this swing;
   *  cleared when the leaf comes fully shut again. */
  private readonly leafSwept = new Set<string>();
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
    // ...and the set pieces hear it too: loud work within three doors
    // of a milestone means it opens already primed, not cold.
    for (let i = cur.index + 1; i <= cur.index + 3; i++) {
      this.milestones.get(i)?.prime();
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

  /** sprint 470 — the seam reaches. The crack is a two-way aperture,
   *  not a one-way keyhole: while you hold a crack verb (stoop, slip,
   *  call — face or hand at the gap) on a leaf a grab-capable watcher
   *  is pressed against, its fingers work under. A warn beat first —
   *  release the hold and the hand withdraws. Keep holding and the
   *  yank takes your sleeve: the hold breaks, you're dragged off the
   *  kneel, and the scuffle is loud enough to rouse the house.
   *  Grab-capable today: the rubble — loose masonry already lives at
   *  cracks; shoulders and knocks belong to door-work watchers, not
   *  fingers. */
  private updateSeamReach(): void {
    const ht = this.interaction.holdTarget;
    const held = ht ? this.interaction.interactables.find((i) => i.id === ht) : null;
    const heldDoor = held && (held.kind === 'stoop' || held.kind === 'slip' || held.kind === 'call')
      ? (held.data as Door) : null;
    let reacher: Entity | null = null;
    if (heldDoor && this.player.crouching) {
      for (const e of this.entities) {
        if (e.state === 'done' || e.id !== 'grafter') continue;
        const tp = e.threatPos();
        if (!tp) continue;
        // either lip — the fingers come under whichever side it presses
        if (v3dist(tp, heldDoor.pos) < 1.15) { reacher = e; break; }
      }
    }
    const now = this.clock.time;
    if (!heldDoor || !reacher || now < (this.seamReachCd.get(heldDoor.id) ?? 0)) {
      // no seam hand under this leaf (or you stamped it off) — but a
      // warned hand lingers a breath after you let go: it is still
      // there, feeling, long enough to answer with a stamp
      if (this.seamReach && now <= this.seamReach.lingerUntil) return;
      this.seamReach = null; return;
    }
    if (!this.seamReach || this.seamReach.key !== held!.id || this.seamReach.doorId !== heldDoor.id) {
      // the fingers are slower than a thrown stone but faster than a
      // read or a whisper: they close at holdTime - 0.1 (min 0.9), so
      // a slip finishes first and a stoop or call lands AS they take
      // you — your verb goes under, then the hand does
      this.seamReach = { key: held!.id, doorId: heldDoor.id, door: heldDoor, t: now + Math.max(0.9, (held!.holdTime ?? 1) - 0.1), lingerUntil: now + 1.6, reacher };
      this.cue('door-locked', heldDoor.pos, '[fingers work under the leaf — grey, and wider than a hand]', 'warn');
      this.sound.emit({ x: heldDoor.pos.x, y: 0.1, z: heldDoor.pos.z, intensity: 0.3 * this.wantedPull, category: 'impact', caption: '' });
      return;
    }
    this.seamReach.lingerUntil = now + 1.6; // a held verb keeps the hand under
    if (now < this.seamReach.t) return;
    this.seamReach = null;
    // the verb lands first — your whisper or your read goes under the
    // leaf in the same breath the hand takes your sleeve
    if (this.interaction.focused === held) this.tryInteract();
    // the yank: break the hold and drag you off the kneel — you wrench
    // free a step back along your own lip of the seam
    this.interaction.holdTarget = null;
    this.interaction.holdProgress = 0;
    this.player.rootedUntil = now + 0.9;
    const nX = Math.sin(heldDoor.yaw), nZ = Math.cos(heldDoor.yaw);
    const side = Math.sign((this.player.pos.x - heldDoor.pos.x) * nX + (this.player.pos.z - heldDoor.pos.z) * nZ) || 1;
    this.player.teleport(this.player.pos.x + nX * side * 0.45, 0, this.player.pos.z + nZ * side * 0.45);
    // sprint 480 — the grab takes, not just yanks: fingers that close
    // on your sleeve pick the loosest coin off your hip into the same
    // pouch the feed fills. Theft, not a spend — no register line —
    // but the marked coins go first, and staggering the hand spills
    // every coin it ever took. A hand you fed grabs like a hand you
    // didn't; it keeps no debt.
    if (this.imprints > 0) {
      const hot = this.hotImprints > 0 ? 1 : 0;
      this.imprints -= 1;
      this.hotImprints -= hot;
      reacher.takeCoin?.(hot, heldDoor.pos);
      this.cue('door-locked', heldDoor.pos, '[the hand takes your sleeve — and a coin off your hip]', 'danger');
    } else {
      this.cue('door-locked', heldDoor.pos, '[the hand takes your sleeve — you wrench free]', 'danger');
    }
    // the struggle is real noise AT the leaf — the house hears you fight
    this.sound.emit({ x: heldDoor.pos.x, y: 0.3, z: heldDoor.pos.z, intensity: 0.75 * this.wantedPull, category: 'impact', caption: '' });
    // a grab is contact, not a glimpse — the watcher that took your
    // sleeve has where you knelt cold, and it stays on the seam
    reacher.eyeTell?.(this.player.pos, heldDoor.pos);
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
    // The Broker's fix — a staffed service on the man himself, a second
    // anchor beside 'Trade wares': he makes a call and one line comes
    // off your deepest ledger, priced by how deep it runs.
    for (const [roomIndex, fig] of this.brokerFigs) {
      this.interaction.add({
        kind: 'fix', id: `fix-${this.space}:${roomIndex}`,
        pos: { x: fig.position.x, y: fig.position.y + 1.4, z: fig.position.z },
        prompt: 'Ask the Broker for a fix',
        holdTime: 1.2, enabled: true, priority: 3,
      });
      // The purse — the Broker changes coin: imprints into marginalia.
      // Anchored off the counter's near end, NOT mid-counter: the
      // Broker's fig stands ~0.7m behind the socks, so a mid anchor
      // sits on the fig's own line and the priority-3 fix shadows it.
      // A lateral offset gives ~40°+ separation from every anchor.
      const bRoom = this.activeRooms()[roomIndex];
      const bSocks = bRoom?.sockets.filter((s) => s.meta.broker !== undefined) ?? [];
      if (bSocks.length >= 2) {
        const midX = (bSocks[0].pos.x + bSocks[1].pos.x) / 2;
        const midZ = (bSocks[0].pos.z + bSocks[1].pos.z) / 2;
        const bx = fig.position.x - midX, bz = fig.position.z - midZ;
        const bl = Math.hypot(bx, bz) || 1;
        const lx = bSocks[1].pos.x - bSocks[0].pos.x;
        const lz = bSocks[1].pos.z - bSocks[0].pos.z;
        const ll = Math.hypot(lx, lz) || 1;
        this.interaction.add({
          kind: 'purse', id: `purse-${this.space}:${roomIndex}`,
          pos: {
            x: midX - (lx / ll) * 1.2 + (bx / bl) * 0.4,
            y: 1.05,
            z: midZ - (lz / ll) * 1.2 + (bz / bl) * 0.4,
          },
          prompt: 'Change the purse — 6 imprints',
          holdTime: 0.8, enabled: true, priority: 1,
          data: { roomIndex },
        });
        // The fence — the Broker takes marked stock off your hands on
        // the counter's other flank (the purse's mirror). The under's
        // second wash: goods out for a pittance, the book opens a line.
        this.interaction.add({
          kind: 'fence', id: `fence-${this.space}:${roomIndex}`,
          pos: {
            x: midX + (lx / ll) * 1.2 + (bx / bl) * 0.4,
            y: 1.05,
            z: midZ + (lz / ll) * 1.2 + (bz / bl) * 0.4,
          },
          prompt: 'Fence the take',
          holdTime: 0.9, enabled: true, priority: 1,
          data: { roomIndex },
        });
        // The book — the under's book reads YOU back: a cheap consult
        // on the man's own ledger, hung LOW on his flank (waist level
        // at 0.8·lateral): the fix is a look-UP at the same fig and the
        // counter's verbs own the mid line, so a chest-height anchor
        // ~0.35m off the fix loses the in-band priority fight. Pitch
        // down-left disambiguates. The asking is itself a filed question.
        this.interaction.add({
          kind: 'book', id: `book-${this.space}:${roomIndex}`,
          pos: {
            x: fig.position.x + (lx / ll) * 0.8,
            y: fig.position.y + 0.55,
            z: fig.position.z + (lz / ll) * 0.8,
          },
          prompt: 'Ask what the book says — 3 marginalia',
          holdTime: 0.8, enabled: true, priority: 2,
          data: { roomIndex },
        });
        // The fenced take — what a rotted tag fed the count resurfaces
        // on HIS shelf, priced at the house's margin. Mirrors 'book'
        // on the fig's other flank, waist-level: the pitch band keeps
        // it off the fix/read lines.
        const fencedUnits = this.fencedTake.reduce((n, s) => n + s.count, 0);
        this.interaction.add({
          kind: 'buyback', id: `buyback-${this.space}:${roomIndex}`,
          pos: {
            x: fig.position.x - (lx / ll) * 0.8,
            y: fig.position.y + 0.55,
            z: fig.position.z - (lz / ll) * 0.8,
          },
          prompt: `Buy back the fenced take — ${10 + 6 * fencedUnits} marginalia`,
          holdTime: 0.9, enabled: fencedUnits > 0, priority: 2,
          data: { roomIndex },
        });
      }
    }
    // The clerk's page — a question desk on the figure itself: each
    // clerk holds one seeded query (staff on duty, faults on file, or
    // the house's held-file). priority 3 so facing the clerk outranks
    // the counter's priority-1 wares.
    for (const [roomIndex, fig] of this.clerkFigs) {
      this.interaction.add({
        kind: 'ask', id: `ask-${this.space}:${roomIndex}`,
        pos: { x: fig.position.x, y: fig.position.y + 1.4, z: fig.position.z },
        prompt: 'Ask the clerk',
        holdTime: 1.0, enabled: true, priority: 3,
        data: { roomIndex },
      });
      // The register readout — the house's mirror of the Broker's book.
      // Same figure, waist-height: the pitch band separates it from
      // 'ask' at head height (a same-height second anchor would lose
      // every focus frame to the higher priority).
      this.interaction.add({
        kind: 'askReg', id: `askReg-${this.space}:${roomIndex}`,
        pos: { x: fig.position.x, y: fig.position.y + 0.85, z: fig.position.z },
        prompt: 'Ask what the register says — 3 imprints',
        holdTime: 0.8, enabled: true, priority: 2,
        data: { roomIndex },
      });
      // The till sits mid-counter, between the wares laterally but a
      // half-step back toward the clerk — inside the focus band an
      // interactable needs ~0.86 aim-alignment, and a same-line anchor
      // 0.55m off a ware stays in-band at counter standoff. Offsetting
      // the till back onto the counter surface puts it ~40° off either
      // ware, so aim picks cleanly.
      const tillRoom = this.activeRooms()[roomIndex];
      const tillSocks = tillRoom?.sockets.filter((s) => s.meta.clerk !== undefined) ?? [];
      if (tillSocks.length === 2) {
        const midX = (tillSocks[0].pos.x + tillSocks[1].pos.x) / 2;
        const midZ = (tillSocks[0].pos.z + tillSocks[1].pos.z) / 2;
        const bx = fig.position.x - midX, bz = fig.position.z - midZ;
        const bl = Math.hypot(bx, bz) || 1;
        if (tillSocks[0].meta.tillTaken !== true) {
          this.interaction.add({
            kind: 'till', id: `till-${this.space}:${roomIndex}`,
            pos: { x: midX + (bx / bl) * 0.5, y: 1.05, z: midZ + (bz / bl) * 0.5 },
            prompt: 'Rifle the till',
            // priority 1 — same tier as the wares; priority dominates inside
            // the focus band, so a higher rank would shadow 'Buy at the
            // counter' even when aimed dead at a ware. At par, the 0.55m
            // offset (~20°) lets aim pick cleanly between them.
            holdTime: 0.9, enabled: true, priority: 1,
            data: { roomIndex },
          });
        }
        // The desk bell — a positional lure on the counter's far end:
        // the only noise in the house that isn't at your position.
        // Offset past slot1 (~0.9m lateral + back onto the counter) so
        // its aim never shadows the till or the wares.
        const lx = tillSocks[1].pos.x - tillSocks[0].pos.x;
        const lz = tillSocks[1].pos.z - tillSocks[0].pos.z;
        const ll = Math.hypot(lx, lz) || 1;
        this.interaction.add({
          kind: 'bell', id: `bell-${this.space}:${roomIndex}`,
          pos: {
            x: midX + (lx / ll) * 1.5 + (bx / bl) * 0.45,
            y: 1.05,
            z: midZ + (lz / ll) * 1.5 + (bz / bl) * 0.45,
          },
          prompt: 'Ring the desk bell',
          holdTime: 0.5, enabled: true, priority: 1,
          data: { roomIndex },
        });
        // The purse's other direction — the clerk changes marginalia
        // into imprints at the counter's near end (mirror of the
        // Broker's: the spread between the two counters is the cut).
        this.interaction.add({
          kind: 'purse', id: `purse-${this.space}:${roomIndex}`,
          pos: {
            x: midX - (lx / ll) * 1.2 + (bx / bl) * 0.4,
            y: 1.05,
            z: midZ - (lz / ll) * 1.2 + (bz / bl) * 0.4,
          },
          prompt: 'Change the purse — 8 marginalia',
          holdTime: 0.8, enabled: true, priority: 1,
          data: { roomIndex },
        });
      }
    }
    // Cut the seal — an armed paper wire is a quiet thing you can cut;
    // under live floodwater the wire only shows itself to a wader
    // crouched low enough to feel for it.
    for (const hz of this.hazard.snares) {
      // sprint 423 — your own laid wire mints too, live or dead: pull it
      // free for the coil back, or gather the spent trip-line
      // sprint 431 — a dead graft mints too: the under's slack wire is
      // scrap anyone can take — the grafter strips it for the splice,
      // you gather it for the coil. Dead wire is contested loot.
      if (!hz.armed && !hz.planted && !hz.grafted) continue;
      const rm = rooms.find((r) => r.index === hz.room) ?? this.route?.branchRooms.find((r) => r.index === hz.room);
      if (!rm) continue;
      const submerged = !!rm.flooded && !this.drainedRooms.has(`${this.space}:${rm.index}`);
      if (submerged && !this.player.crouching) continue;
      const dx = hz.pos.x - this.player.pos.x, dz = hz.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 4.6 * 4.6) continue;
      this.interaction.add({
        kind: 'snip', id: `snip-${this.space}:${rm.index}:${Math.round(hz.pos.x * 7)}x${Math.round(hz.pos.z * 7)}`,
        pos: { x: hz.pos.x, y: 0.06, z: hz.pos.z },
        prompt: hz.planted && !hz.claimed ? (hz.armed ? 'Pull the wire free' : 'Gather the wire')
          : hz.grafted ? (hz.armed ? 'Cut the splice' : 'Gather the wire')
          : submerged ? 'Feel for the wire — cut it' : 'Cut the seal',
        holdTime: hz.planted && !hz.claimed ? 0.9 : 1.4, enabled: true, priority: 2,
        data: { room: rm.index, sx: hz.pos.x, sz: hz.pos.z },
      });
    }
    // Read the wanted sheet — once the clerk's ledger names you, the
    // boards ahead print your tally on their faces. Reading is free;
    // the naming stays until the tally settles.
    if (this.wantedActive) {
      const host = this.wantedRooms.get(this.currentRoom);
      if (host) {
        const dx = host.x - this.player.pos.x, dz = host.z - this.player.pos.z;
        if (dx * dx + dz * dz <= 2.2 * 2.2) {
          this.interaction.add({
            kind: 'wanted', id: `wanted-${this.space}:${this.currentRoom}`,
            pos: { x: host.x, y: 0.75, z: host.z },
            prompt: 'Read the wanted sheet',
            holdTime: 0.8, enabled: true, priority: 1,
            data: {},
          });
          // Tear the sheet down — the reach reads the boards, not the
          // flag: each torn sheet deafens the crew's wider ear a share,
          // and the last one ends it outright (the ledger still names
          // you until the tally settles). Aimed off-center so the
          // lighter 'read' verb stays the ambient touch.
          const tox = this.player.pos.x - host.x, toz = this.player.pos.z - host.z;
          const trm = this.activeRooms()[this.currentRoom];
          const tx0 = (trm ? trm.origin.x : this.player.pos.x + tox) - host.x;
          const tz0 = (trm ? trm.origin.z : this.player.pos.z + toz) - host.z;
          const tl = Math.hypot(tx0, tz0) || 1;
          this.interaction.add({
            kind: 'wantedTear', id: `wantedTear-${this.space}:${this.currentRoom}`,
            pos: { x: host.x - (tz0 / tl) * 0.55, y: 0.75, z: host.z + (tx0 / tl) * 0.55 },
            prompt: 'Tear the sheet down',
            holdTime: 1.1, enabled: true, priority: 3,
            data: {},
          });
        }
      }
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
    // Crouched in the under with coin: 'Bait the floor — 1 imprint' —
    // plant a coin pile where you kneel. It ticks (s483), pulls the
    // scavenger if its room is this one (s481), and the count's lamp
    // receipts it should a sweep land here (s484) — bait or donation,
    // whoever reads the floor first. Marked coin is placed marked —
    // a drop, not a spend: the ledger only files coin fed to a till.
    if (this.player.crouching && this.space === 'under' && this.imprints > 0
      && !this.droppedPouches.some((p) =>
        Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < 1.2)) {
      const blk = v3(); this.player.lookDir(blk);
      const bbx = this.player.pos.x + blk.x * 0.6, bbz = this.player.pos.z + blk.z * 0.6;
      this.interaction.add({
        kind: 'baitFloor', id: `bait-${this.space}:${this.currentRoom}`,
        pos: { x: bbx, y: 0.3, z: bbz },
        prompt: 'Bait the floor — 1 imprint',
        holdTime: 0.8, enabled: true, priority: 1,
        data: {},
      });
    }
    // Crouched upstairs with a felt wrap: 'Bait the floor — felt wrap' —
    // the under's lure, house-side. A placed wrap reads exactly like
    // spilled felt to the floorkeeper's fold-back (s482 can't tell a
    // plant from a spill): you spend the wrap to pull it off your line.
    if (this.player.crouching && this.space === 'main'
      && this.inventory.some((i) => i.id === 'feltWrap' && i.count > 0)
      && !this.droppedWraps.some((w) =>
        Math.hypot(w.x - this.player.pos.x, w.z - this.player.pos.z) < 1.2)) {
      // the lure lands where you reach, not under you — a scuff is
      // rubbed underfoot, a bait is set out in front
      const lk = v3(); this.player.lookDir(lk);
      const bx = this.player.pos.x + lk.x * 0.6, bz = this.player.pos.z + lk.z * 0.6;
      this.interaction.add({
        kind: 'baitWrap', id: `baitwrap-${this.space}:${this.currentRoom}`,
        pos: { x: bx, y: 0.3, z: bz },
        prompt: 'Bait the floor — felt wrap',
        holdTime: 0.8, enabled: true, priority: 1,
        data: {},
      });
    }
    // sprint 492 — and a chock is loose goods too (s489): set one down
    // and the floorkeeper walks to tidy it. The whole spill grammar is
    // baitable now — coin under, felt and chock above.
    if (this.player.crouching && this.space === 'main'
      && this.inventory.some((i) => i.id === 'doorChock' && i.count > 0)
      && !this.kickedWedges.some((w) =>
        Math.hypot(w.x - this.player.pos.x, w.z - this.player.pos.z) < 1.2)) {
      const lk = v3(); this.player.lookDir(lk);
      this.interaction.add({
        kind: 'baitWedge', id: `baitwedge-${this.space}:${this.currentRoom}`,
        pos: { x: this.player.pos.x + lk.x * 0.6, y: 0.3, z: this.player.pos.z + lk.z * 0.6 },
        prompt: 'Leave a chock out',
        holdTime: 0.8, enabled: true, priority: 1,
        data: {},
      });
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
    // A jammed wheel offers the way back instead: work the chock free
    // and the blades remember how to spin — the recovery is priced in
    // the live hazard, not the tool.
    for (const f of this.hazard.fans) {
      if (!this.streamer.builtIndices.includes(f.room)) continue;
      const dx = f.pos.x - this.player.pos.x, dz = f.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 2.6 * 2.6) continue;
      if (f.dead) {
        this.interaction.add({
          kind: 'unchock', id: `unchock-${this.space}:${f.room}:${Math.round(f.pos.x * 7)}x${Math.round(f.pos.z * 7)}`,
          pos: { x: f.pos.x, y: 1.15, z: f.pos.z },
          prompt: 'Work the chock free — the wheel spins up',
          holdTime: 1.4, enabled: true, priority: 4,
          data: f,
        });
        continue;
      }
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
        const ld = Math.hypot(lx, lz);
        // a small yaw window — grazing the pile while looking away
        // doesn't strip it; you have to mean the lamp
        const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
        if (ld <= 1.9 && (ld < 0.5 || (fx * lx + fz * lz) / ld >= 0.6)) {
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
    // Beside the reposter: 'Cut the reposter' — grab the bundle and this
    // walk dies; the boards it never reached stay bare.
    if (this.reposter.active) {
      const rp = this.reposter.position;
      const dx = rp.x - this.player.pos.x, dz = rp.z - this.player.pos.z;
      if (dx * dx + dz * dz <= 1.9 * 1.9) {
        this.interaction.add({
          kind: 'cutRepost', id: `cutRepost-${this.space}:reposter`,
          pos: { x: rp.x, y: 0.9, z: rp.z },
          prompt: 'Cut the reposter',
          holdTime: 1.0, enabled: true, priority: 3,
          data: { reposter: this.reposter as unknown as Record<string, unknown> },
        });
      }
    }
    // Beside the checker's lamp: 'Strip the lamp' — take its light mid-
    // count. The boldest pilfer in the under: it is HOLDING the light.
    if (this.checker.active && this.checker.lampLit) {
      const cp = this.checker.position;
      const dx = cp.x - this.player.pos.x, dz = cp.z - this.player.pos.z;
      if (dx * dx + dz * dz <= 1.9 * 1.9) {
        this.interaction.add({
          kind: 'stripCheck', id: 'stripCheck',
          pos: { x: cp.x, y: 0.9, z: cp.z },
          prompt: 'Strip the lamp',
          holdTime: 1.1, enabled: true, priority: 3,
          data: this.checker as unknown as Record<string, unknown>,
        });
      }
    }
    // Cut the keyring — while the bellman stands yielded under a close
    // stare, the ring on his belt is reachable (sprint 396). The close
    // gaze holds him — the fold clock only runs at range — and the cut
    // scatters the house's keys for good, then staggers him: your one
    // beat to be gone.
    for (const ent of this.entities) {
      if (ent.id !== 'bellman') continue;
      const b = ent as unknown as { cuttable: boolean; pos: Vec3; cutKeys: () => void };
      if (!b.cuttable) continue;
      const dx = b.pos.x - this.player.pos.x, dz = b.pos.z - this.player.pos.z;
      if (dx * dx + dz * dz > 1.7 * 1.7) continue;
      this.interaction.add({
        kind: 'keyring', id: `keyring-${this.space}`,
        pos: { x: b.pos.x, y: 1.0, z: b.pos.z },
        prompt: 'Cut the keyring — hold the gaze',
        holdTime: 1.8, enabled: true, priority: 5,
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
    if (this.player.crouching) addCrouchedDoorInteracts(this.interaction, this.inventory.some((i) => i.id === 'doorChock' && i.count > 0), this.player.pos, this.inventory.some((i) => i.id === 'wireCoil' && i.count > 0));
    // sprint 474 — while the fingers are under (warned, or lingering
    // after you let go), the seam offers the stamp: answer the reach
    // with your boot. p6 so it outranks the seam lattice it sits on —
    // but never mid-hold: a stamp minted over a held verb would steal
    // focus, break the hold, and hijack every reach into a stamp loop.
    // Letting go is what frees your boot.
    const seamHeldId = this.interaction.holdTarget;
    const seamHeld = seamHeldId
      ? this.interaction.interactables.find((i) => i.id === seamHeldId && (i.kind === 'stoop' || i.kind === 'slip' || i.kind === 'call'))
      : null;
    if (this.player.crouching && !seamHeld && this.seamReach && this.clock.time <= this.seamReach.lingerUntil) {
      const sd = this.seamReach.door;
      const nX = Math.sin(sd.yaw), nZ = Math.cos(sd.yaw);
      const side = Math.sign((this.player.pos.x - sd.pos.x) * nX + (this.player.pos.z - sd.pos.z) * nZ) || 1;
      this.interaction.add({
        kind: 'stampSeam', id: `stampSeam-${sd.id}`,
        pos: { x: sd.pos.x + nX * side * 0.25, y: sd.pos.y + 0.95, z: sd.pos.z + nZ * side * 0.25 },
        prompt: `Stamp the fingers under Door ${sd.label}`,
        holdTime: 0.5, enabled: true, priority: 6, data: sd,
      });
      // sprint 476 — the seam sells too: pay the hand off. A coin under
      // the crack is the warm option beside the free loud stamp — low
      // at the crack itself, out on the slip flank so the stamp
      // (p6, centre, knee height) and the feed (p5, low-left) split on
      // aim instead of the stamp always shadowing it. No coin, no mint.
      if (this.imprints > 0) {
        const latX = Math.cos(sd.yaw), latZ = -Math.sin(sd.yaw);
        this.interaction.add({
          kind: 'feedSeam', id: `feedSeam-${sd.id}`,
          pos: { x: sd.pos.x + nX * side * 0.55 - latX * 0.2, y: sd.pos.y + 0.5, z: sd.pos.z + nZ * side * 0.55 - latZ * 0.2 },
          prompt: `Feed the hand under Door ${sd.label} — 1 imprint`,
          holdTime: 0.35, enabled: true, priority: 5, data: sd,
        });
      }
    }
    // sprint 479 — the seam sells cold too: no fingers needed, the coin
    // itself is the lure. Slip one under any shut leaf in the grafter's
    // room and its smell drags the camp to that leaf — a paid pin, the
    // pebble slip's priced twin. While a reach lives on a leaf, that
    // leaf's feed verb mints up in the reach block instead (one slot,
    // one coin, whichever hand is there).
    if (this.player.crouching && this.imprints > 0) {
      for (const it of this.interaction.interactables) {
        const d = it.data as Door | undefined;
        if (it.kind !== 'door' || !d || d.falseDoor || d.openT > 0.4) continue;
        if (this.seamReach?.doorId === d.id && this.clock.time <= this.seamReach.lingerUntil) continue;
        if (!this.entities.some((e) => e.seamBaitable?.(it.pos))) continue;
        const nX = Math.sin(d.yaw), nZ = Math.cos(d.yaw);
        const latX = Math.cos(d.yaw), latZ = -Math.sin(d.yaw);
        const side = Math.sign((this.player.pos.x - it.pos.x) * nX + (this.player.pos.z - it.pos.z) * nZ) || 1;
        this.interaction.add({
          kind: 'feedSeam', id: `feedSeam-${d.id}`,
          pos: { x: it.pos.x + nX * side * 0.55 - latX * 0.2, y: it.pos.y + 0.5, z: it.pos.z + nZ * side * 0.55 - latZ * 0.2 },
          prompt: `Slip a coin under Door ${d.label} — 1 imprint`,
          holdTime: 0.35, enabled: true, priority: 5, data: d,
        });
      }
    }
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
          } else if (p.kind === 'television' && this.litTVs.has(key)) {
            // sprint 397 — a lit set is yours to kill. The prompt tells the
            // truth: if the channel already flagged this room, the off is
            // your only out — kill the set before it answers back.
            const flagged = this.tvAnswerQueue.some((q) => Math.hypot(q.pos.x - wx, q.pos.z - wz) < 0.6);
            this.interaction.add({
              kind: 'tvoff', id: `tvoff-${key}`,
              pos: { x: wx, y: 1, z: wz },
              prompt: flagged ? 'Turn the set off — the channel knows you are here' : 'Turn the set off',
              holdTime: 0.6, enabled: true, priority: 2,
            });
          } else if (p.kind === 'television' && !this.deadTVs.has(key)) {
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
            // A TAPED eye (w.dead — only felt sets that flag) offers the
            // felt back: tape is a parked tool, not a consumed one.
            const wy = p.y ?? (p.kind === 'securityCam' ? 2.35 : 1.4);
            const wHere = this.hazard.watchers.find((w) =>
              w.room === pr.index && Math.hypot(w.pos.x - wx, w.pos.z - wz) < 0.6);
            if (wHere && !wHere.dead && !pr.darkRoom) this.interaction.add({
              kind: 'tape', id: `tape-${key}`, pos: { x: wx, y: wy, z: wz },
              prompt: p.kind === 'securityCam' ? 'Tape the eye — felt wrap' : 'Smother the beam — felt wrap',
              holdTime: 1.6, enabled: true, priority: 2, data: { watchPos: { x: wx, z: wz } },
            });
            else if (wHere?.dead) this.interaction.add({
              kind: 'untape', id: `untape-${key}`, pos: { x: wx, y: wy, z: wz },
              prompt: 'Take the felt back — it wakes',
              holdTime: 1.0, enabled: true, priority: 2, data: { watchPos: { x: wx, z: wz } },
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
          } else if (isHearth && this.hearths.some((h) => Math.hypot(h.base.x - wx, h.base.z - wz) < 0.6)) {
            // sprint 398 — the rest you bought is loud on purpose; when a
            // threat walks in, the douse is the take-back. Spent either way:
            // lighting spent the wood, so a drowned hearth mints nothing.
            this.interaction.add({
              kind: 'douse', id: `douse-${key}`,
              pos: { x: wx, y: 0.8, z: wz },
              prompt: 'Douse the hearth', holdTime: 0.9, enabled: true, priority: 2,
            });
          } else if (isPhone && !this.answeredPhones.has(key)) {
            this.interaction.add({
              kind: 'phone', id: `phone-${key}`,
              pos: { x: wx, y: 1.4, z: wz },
              prompt: 'Lift the receiver', holdTime: 1.0, enabled: true, priority: 2,
            });
          } else if (isPhone && !this.offHookPhones.has(key) && !this.spentPhones.has(key)) {
            // sprint 400 — an answered phone can be left dangling: the line
            // rings it back 20-34s later, loud enough to pull whoever listens
            // — a planted lure on a fuse, priced by the walk-away.
            this.interaction.add({
              kind: 'offHook', id: `offHook-${key}`,
              pos: { x: wx, y: 1.4, z: wz },
              prompt: 'Leave it off the hook — it will ring', holdTime: 1.2, enabled: true, priority: 2,
            });
          } else if (isPhone && this.offHookPhones.has(key) && !this.spentPhones.has(key)) {
            // sprint 401 — walk the plant back: hang the receiver up before
            // the fuse (or mid-ring) and the lure dies quiet — the phone is
            // spent either way, the decision is only whether it ever rang.
            this.interaction.add({
              kind: 'hangUp', id: `hangUp-${key}`,
              pos: { x: wx, y: 1.4, z: wz },
              prompt: 'Hang the receiver up — the ring dies with it', holdTime: 0.8, enabled: true, priority: 2,
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
          // sprint 403 — the keypad still works on a live line: dialing
          // costs a coin and rings the farthest phone the floor has left —
          // a pull you aim at a room you're not in. Busy lines (off the
          // hook, rung out, already ringing) can't dial out.
          if (isPhone && !this.offHookPhones.has(key) && !this.spentPhones.has(key)
            && !this.hookRings.some((r) => r.key === key)) {
            this.interaction.add({
              kind: 'dial', id: `dial-${key}`,
              pos: { x: wx, y: 1.12, z: wz },
              prompt: this.space === 'under' ? 'Dial the far line — 1 marginalia' : 'Dial the far line — 1 imprint',
              holdTime: 0.9, enabled: true, priority: 2,
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
        // The night clerk's till — imprints, and a filed face pays the
        // register's rate: the same reading the Detective's desk makes.
        if (sock.meta.clerk !== undefined) {
          if (sock.meta.sold) return;
          // The counter goes cold: a clerk that watched you rifle its
          // till folds its hands — no wares, no page, not at any rate.
          const cRoom = this.activeRooms().findIndex((r) =>
            r.sockets.includes(sock));
          if (cRoom >= 0 && this.clerkRefuses(cRoom, it.pos)) return;
          const cItem = sock.meta.clerkItem as ItemId | undefined;
          const cPrice = (sock.meta.clerkPrice as number) ?? 12;
          if (!cItem) return;
          const filed = this.unpaidHeld > 0;
          const cEff = filed ? cPrice + Math.min(3 + this.unpaidHeld * 2, 10) : cPrice;
          if (this.imprints >= cEff) {
            this.chargedImprints(cEff, it.pos.x, it.pos.z);
            sock.meta.sold = true;
            it.enabled = false;
            this.giveItem(cItem, 1);
            this.cue('purchase', it.pos,
              filed ? `[traded at the register's rate — ${cEff} imprints]` : `[the clerk's till rings — ${cEff} imprints]`, 'info');
          } else {
            this.cue('door-locked', it.pos,
              filed ? `[the register's rate is ${cEff} imprints — settle your claims]` : `[${cEff} imprints required]`, 'warn');
          }
          return;
        }
        if (sock.meta.broker === undefined) return;
        if (sock.meta.sold) return;
        // the floor shutters while the count walks — the Broker will not
        // trade under the crew's own lamp
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        // The tally's deep tier reaches the under's own counter: at six
        // tallied the Broker holds his stock — the desk is the only
        // answer. The purse, the fence, the fix and the book stay open:
        // laundering and settling aren't commerce.
        if (this.unpaidTheft >= 6) {
          this.cue('door-locked', it.pos,
            '[he reads the tally — the till holds its stock · the desk is the only answer]', 'warn');
          return;
        }
        const item = sock.meta.brokerItem as ItemId;
        const price = (sock.meta.brokerPrice as number) ?? 20;
        // the clerks' score is on your hands — an unpaid tally trades at
        // the marked rate, the same reading the Auditor's desk makes
        const marked = this.unpaidTheft > 0;
        const effPrice = marked ? price + Math.min(4 + this.unpaidTheft * 2, 14) : price;
        if (this.marginalia >= effPrice) {
          this.chargedMarginalia(effPrice, it.pos.x, it.pos.z);
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
      case 'fix': {
        // The Broker is a fixer: he makes a call and one line comes off
        // your deepest ledger — priced by depth, shuttered with the floor.
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        const worst = Math.max(this.unpaidTheft, this.unpaidHeld, this.paperTrail);
        if (worst <= 0) {
          this.cue('door-locked', it.pos, '[your slate is clean — nothing to fix]', 'info');
          return;
        }
        // The boards tax the call too — a named face pays two more.
        const price = Math.min(6 + worst * 3, 18) + (this.wantedActive ? 2 : 0);
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos,
            `[the fix runs ${price} marginalia — the crew does not write on credit]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        if (this.unpaidTheft >= this.unpaidHeld && this.unpaidTheft >= this.paperTrail) {
          this.unpaidTheft -= 1;
          this.cue('purchase', it.pos, `[the broker makes a call — a line comes off the tally · ${price} marginalia]`, 'info');
        } else if (this.unpaidHeld >= this.paperTrail) {
          this.unpaidHeld -= 1;
          this.cue('purchase', it.pos, `[the broker makes a call — a line comes off the register · ${price} marginalia]`, 'info');
        } else {
          this.paperTrail -= 1;
          this.cue('purchase', it.pos, `[the broker makes a call — a line comes off your file · ${price} marginalia]`, 'info');
        }
        return;
      }
      case 'ask': {
        // The clerk's page — one seeded question per staffed counter,
        // priced in imprints at the register's rate, one-shot. The page
        // lives on the room's slot0 socket; the verb anchors the figure.
        const roomIndex = (it.data as { roomIndex: number }).roomIndex;
        const room = this.activeRooms()[roomIndex];
        const page = room?.sockets.find((s) => s.meta.clerk === 'slot0');
        if (!room || !page || page.meta.clerkQ === undefined) return;
        // A rifled counter serves nothing — the clerk watched your hands.
        if (this.clerkRefuses(roomIndex, it.pos)) return;
        if (this.clerkAsked.has(roomIndex)) {
          this.cue('door-locked', it.pos, '[the clerk has said what it knows]', 'info');
          return;
        }
        const price = (page.meta.clerkQPrice as number) ?? 6;
        const filed = this.unpaidHeld > 0;
        const eff = filed ? price + Math.min(2 + this.unpaidHeld, 6) : price;
        if (this.imprints < eff) {
          this.cue('door-locked', it.pos,
            filed ? `[the clerk wants ${eff} imprints for the page — the register's rate, settle your claims]`
              : `[the clerk wants ${eff} imprints for the page — ${eff - this.imprints} short]`, 'warn');
          return;
        }
        this.chargedImprints(eff, it.pos.x, it.pos.z);
        this.clerkAsked.add(roomIndex);
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        const q = page.meta.clerkQ as string;
        const mains = this.route?.rooms ?? [];
        const door = (i: number) => `Door ${String(i).padStart(3, '0')}`;
        if (q === 'staff') {
          const STAFF: Record<string, string> = {
            bellman: 'a valet', warden: 'a watchman', inspector: 'a clerk',
            commissionaire: 'a doorman', porter: 'a porter', detective: 'a detective',
            redactor: 'a forger', collector: 'a toll-taker',
          };
          const marks: string[] = [];
          for (const r of mains) {
            if (r.index <= this.currentRoom || r.index > this.currentRoom + 8 || marks.length >= 4) continue;
            for (const s of r.scheduled) {
              const noun = STAFF[s.entity];
              if (noun && marks.length < 4) marks.push(`${door(r.index)} — ${noun}`);
            }
          }
          this.cue('whisper', it.pos, marks.length
            ? `[the clerk turns the duty sheet: ${marks.join(' · ')}]`
            : '[the clerk turns the duty sheet — the next stretch stands unstaffed]');
        } else if (q === 'hazard') {
          const FAULT: Record<string, string> = {
            snare: 'a live wire', steamVent: 'a vent about to breathe', fan: 'a wheel that chews',
            puddle: 'a floor standing wet', securityCam: 'the eye pans', searchlight: 'the light sweeps',
          };
          const marks: string[] = [];
          for (const r of mains) {
            if (r.index <= this.currentRoom || r.index > this.currentRoom + 8 || marks.length >= 4) continue;
            for (const p of r.spec?.props ?? []) {
              const noun = FAULT[p.kind];
              if (noun && marks.length < 4) marks.push(`${door(r.index)} — ${noun}`);
            }
          }
          this.cue('whisper', it.pos, marks.length
            ? `[the clerk's ledger of faults: ${marks.join(' · ')}]`
            : '[the clerk\'s ledger of faults — nothing filed ahead]');
        } else {
          const entries: string[] = [];
          for (const r of mains) {
            if (r.index <= this.currentRoom || r.index > this.currentRoom + 10 || entries.length >= 5) continue;
            for (const s of r.sockets ?? []) {
              if (entries.length >= 5) break;
              if (!s.meta.claim || s.meta.marginalia === true) continue;
              const tag = (s.meta.claimTag as string) ?? 'unsigned';
              entries.push(`${door(r.index)} — '${tag}' ${s.meta.taken ? 'drawn' : 'still held'}`);
            }
          }
          this.cue('whisper', it.pos, entries.length
            ? `[the clerk's held-file: ${entries.join(' · ')}]`
            : '[the clerk\'s held-file — the house holds nothing ahead]');
        }
        return;
      }
      case 'askReg': {
        // The register readout — the house's mirror of the Broker's
        // 'Ask what the book says'. Repeatable (standing changes), flat
        // price: reading your own file isn't a thing the register
        // surcharges. A cold counter folds it with the rest.
        const rIdx = (it.data as { roomIndex: number }).roomIndex;
        if (this.closedCounters.has(rIdx)) {
          this.cue('door-locked', it.pos,
            "[the clerk folds its hands — the counter is closed to you]", 'warn');
          return;
        }
        if (this.imprints < 3) {
          this.cue('door-locked', it.pos,
            `[the clerk wants 3 imprints to open the register — ${3 - this.imprints} short]`, 'warn');
          return;
        }
        this.chargedImprints(3, it.pos.x, it.pos.z);
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, this.unpaidHeld > 0
          ? `[the register on you — ${this.unpaidHeld} claims held · your face is in it${this.unpaidHeld >= 6 ? ' — the counters are closed to you' : ''}]`
          : '[the register has no line on you — your face isn\'t in it]');
        return;
      }
      case 'till': {
        // Hands in the staffed register — the loudest claim the house
        // books: two lines of held-goods while the clerk watches.
        const roomIndex = (it.data as { roomIndex: number }).roomIndex;
        const room = this.activeRooms()[roomIndex];
        const till = room?.sockets.find((s) => s.meta.clerk === 'slot0');
        if (!room || !till || till.meta.tillTaken === true) { it.enabled = false; return; }
        till.meta.tillTaken = true;
        this.closedCounters.add(roomIndex);
        // sprint 328 — the unfiled hands: rifled inside the bell's look
        // window (~3.5s), the clerk's eye is on the ringing bell, not
        // your hands — the till still opens and still smells, but the
        // register never writes you. The lure is a real steal-window.
        // sprint 359 — the window is for strangers: once the register
        // holds your face the bell can't buy his eye off it.
        const rung = this.bellRung.get(roomIndex);
        const unfiled = rung !== undefined && this.clock.time - rung.t < 3.5 && this.unpaidHeld === 0;
        if (!unfiled) this.unpaidHeld += 2;
        it.enabled = false;
        // sprint 333 — the take goes back: the emptied till takes its
        // own stock back — a free, quiet return that clears your marks
        // while the register's file stays written. Minted on rifle and
        // replayed via dynamicInteractables so a room rebuild keeps the
        // offer while the counter stays cold.
        const restock = {
          kind: 'restock' as const, id: `restock-${this.space}:${roomIndex}`,
          pos: { x: it.pos.x, y: it.pos.y, z: it.pos.z },
          prompt: 'Slip the take back — it never left',
          holdTime: 0.9, priority: 1, enabled: true,
          data: { roomIndex },
        };
        this.dynamicInteractables.push(restock);
        this.interaction.add(restock);
        // the till smells of hands — hands in a staffed register leave
        // fresh sign at the counter: substantive work, not ash, so the
        // warden pulls to it like any kill or mounted wrap (and weighs
        // it toward learning). The rifle's third price after the file
        // and the cold counter: scent.
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: room.index,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 8);
          this.imprints += amt;
          this.stats.imprintsEarned += amt;
          // sprint 329 — the till's coin is marked: every imprint it pays
          // out testifies when it lands in a house till (the under washes)
          this.hotImprints += amt;
          this.cue('pickup', it.pos, `[+${amt} imprints — off the till — the coin is marked]`);
        } else {
          const pool = ['bandage', 'doorChock', 'feltWrap', 'latchpick'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          // sprint 331 — the till's stock is marked too: carry it past a
          // warm clerk and its own stock tells (the Broker fences it)
          this.hotItems.add(item as ItemId);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the till — the stock is marked]`);
        }
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        this.cue('drawer', it.pos, unfiled
          ? '[it was watching the bell — your hands go unfiled]'
          : rung !== undefined && this.clock.time - rung.t < 3.5
            ? '[the register already holds your face — the bell can\'t buy his eye off it]'
            : '[the clerk watches your hands — the register writes you twice]', 'warn');
        return;
      }
      case 'coilDrop': {
        // pos-keyed: the drop list shifts on gather, the pos doesn't
        const dd = it.data as { x: number; z: number };
        const ci = this.droppedCoils.findIndex((w) =>
          Math.abs(w.x - dd.x) < 0.05 && Math.abs(w.z - dd.z) < 0.05);
        if (ci < 0) { it.enabled = false; return; }
        this.droppedCoils.splice(ci, 1);
        this.giveItem('wireCoil', 1);
        this.cue('item', it.pos, '[the coil comes back to your hand]');
        this.mintCoilDrops();
        return;
      }
      case 'wedgeDrop': {
        // sprint 393 — walk the chock back: the kicked wedge returns to
        // the pocket, free — the price was the leaf it stopped holding.
        const wi = (it.data as { i?: number }).i ?? -1;
        if (wi >= 0) this.kickedWedges.splice(wi, 1);
        it.enabled = false;
        this.mintWedgeDrops();   // re-index the survivors
        this.giveItem('doorChock', 1);
        this.cue('pickup', it.pos, '[door chock — back off the floor]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.2, category: 'item', caption: '' });
        return;
      }
      case 'wrapDrop': {
        // sprint 413 — what the floorkeeper pocketed comes back off the
        // floor: the felt is yours again, free — the price was tripping
        // him (or the glass doing it for you).
        const wi = (it.data as { i?: number }).i ?? -1;
        const n = wi >= 0 ? this.droppedWraps[wi]?.n ?? 1 : 1;
        if (wi >= 0) this.droppedWraps.splice(wi, 1);
        it.enabled = false;
        this.mintWrapDrops();
        this.giveItem('feltWrap', n);
        this.cue('pickup', it.pos, `[felt wrap${n > 1 ? ` ×${n}` : ''} — back off the floor]`);
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.2, category: 'item', caption: '' });
        return;
      }
      case 'dragPile': {
        // sprint 497 — pull the pile a step toward you instead of
        // pocketing it. Quiet work: the pile slides, scrapes faintly,
        // and stays a pile — bait you can reposition without reclaiming.
        const dd = it.data as { list: string; x: number; z: number };
        const arr = dd.list === 'pouch' ? this.droppedPouches
          : dd.list === 'wrap' ? this.droppedWraps
          : dd.list === 'wedge' ? this.kickedWedges
          : this.droppedCoils;
        const w = arr.find((p) => Math.abs(p.x - dd.x) < 0.06 && Math.abs(p.z - dd.z) < 0.06);
        if (!w) { it.enabled = false; return; }
        const dx = this.player.pos.x - w.x, dz = this.player.pos.z - w.z;
        const d = Math.hypot(dx, dz);
        const step = Math.min(0.38, d - 0.45);
        if (step > 0.02) {
          const to = this.scatterSpot(w.x, w.z, Math.atan2(dz, dx), step);
          if (to) { w.x = to.x; w.z = to.z; }
        }
        this.mintPouchDrops(); this.mintWrapDrops();
        this.mintWedgeDrops(); this.mintCoilDrops();
        this.sound.emit({ x: w.x, y: 0.2, z: w.z, intensity: 0.14 * this.wantedPull,
          category: 'item', caption: '[the pile scrapes across the boards]' });
        return;
      }
      case 'pouchDrop': {
        // sprint 477 — the pouch comes back off the floor: what you fed
        // the hand is yours again — the price was putting it down.
        // Marked coin returns still marked.
        const pi = (it.data as { i?: number }).i ?? -1;
        const pouch = pi >= 0 ? this.droppedPouches[pi] : undefined;
        if (pi >= 0) this.droppedPouches.splice(pi, 1);
        it.enabled = false;
        this.mintPouchDrops();
        if (pouch) {
          this.imprints += pouch.n;
          this.hotImprints += pouch.hot;
          this.cue('pickup', it.pos, `[your coin back — ${pouch.n} imprint${pouch.n > 1 ? 's' : ''}${pouch.hot > 0 ? ' still marked' : ''}]`);
        }
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.2, category: 'item', caption: '' });
        return;
      }
      case 'alarmDrop': {
        // sprint 424 — un-plant the clock: a live alarm comes back to
        // the pocket whole. It was never heard, never spent — the lure
        // you meant to place is yours to place again.
        const dx = (it.data as { x?: number }).x ?? 0;
        const dz = (it.data as { z?: number }).z ?? 0;
        const li = this.lures.findIndex((l) => !l.rang
          && Math.abs(l.pos.x - dx) < 0.05 && Math.abs(l.pos.z - dz) < 0.05);
        if (li < 0) { it.enabled = false; this.mintAlarmDrops(); return; }
        const l = this.lures.splice(li, 1)[0];
        this.entityGroup.remove(l.mesh);
        it.enabled = false;
        this.mintAlarmDrops();
        this.giveItem('windAlarm', 1);
        this.cue('pickup', it.pos, '[the alarm winds down into your hand]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.2, category: 'item', caption: '' });
        return;
      }
      case 'restock': {
        // sprint 333 — the take goes back: slip the marked goods into
        // the emptied till. Free, no profit, and the books keep your
        // file — the register's witness doesn't unwrite for a wrap.
        const cIdx = (it.data as { roomIndex: number }).roomIndex;
        if (!this.closedCounters.has(cIdx)) { it.enabled = false; return; }
        const take = this.inventory.filter((i) => this.hotItems.has(i.id) && i.count > 0);
        if (take.length === 0) {
          it.enabled = false;
          this.cue('drawer', it.pos, '[the drawer is empty — nothing of his on you]', 'info');
          return;
        }
        for (const i of take) { this.hotItems.delete(i.id); i.count = 0; }
        this.inventory = this.inventory.filter((i) => i.count > 0);
        it.enabled = false;
        this.cue('drawer', it.pos, take.length === 1
          ? '[the till takes its own back — the wrap never left the shelf]'
          : `[the till takes its own back — ${take.length} wraps never left the shelf]`);
        return;
      }
      case 'buyback': {
        // sprint 381 — the count resells what it kept: your own take
        // on the Broker's shelf at the house's margin. Through the
        // fence it launders — the take returns unmarked, like his stock.
        if (this.space !== 'under') return;
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        // sprint 384 — the tally's deep tier reaches the shelf too:
        // fenced take is his stock now, and his stock stays held at six
        if (this.unpaidTheft >= 6) {
          this.cue('door-locked', it.pos,
            '[he reads the tally — the shelf holds your take · the desk is the only answer]', 'warn');
          return;
        }
        const units = this.fencedTake.reduce((n, s) => n + s.count, 0);
        if (units === 0) return;
        const bPrice = 10 + 6 * units;
        if (this.marginalia < bPrice) {
          this.cue('door-locked', it.pos,
            `[the fenced take costs ${bPrice} marginalia — the house's margin was the point]`, 'warn');
          return;
        }
        this.chargedMarginalia(bPrice, it.pos.x, it.pos.z);
        const back = this.fencedTake
          .map((s) => `${s.count > 1 ? `${s.count}×` : ''}${ITEM_DEFS[s.id]?.name.toLowerCase() ?? s.id}`)
          .join(' · ');
        for (const s of this.fencedTake) this.giveItem(s.id, s.count);
        this.fencedTake = [];
        this.cue('purchase', it.pos,
          `[the broker sells your own take back without a word — the house's margin was the point · ${back}]`);
        return;
      }
      case 'book': {
        // sprint 334 — the book answers back: the under's two ledgers
        // read out loud for a pittance. The asking is itself a filed
        // question — the numbers it reads already count this one.
        if (this.space !== 'under') return;
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        const bPrice = 3;
        if (this.marginalia < bPrice) {
          this.cue('door-locked', it.pos, `[the book wants ${bPrice} marginalia — even questions have a price]`, 'warn');
          return;
        }
        this.chargedMarginalia(bPrice, it.pos.x, it.pos.z);
        this.fileQuestion();
        const t = this.paperTrail, th = this.unpaidTheft;
        // the book knows the locker too — a pending seize tag reads
        // through the same paid readout instead of only at the cage
        const locker = this.seizedTake.reduce((n, s) => n + s.count, 0);
        const lockerBit = (locker > 0 || this.seizedCoin > 0)
          ? ` · a tag keeps ${locker > 0 ? `${locker} of yours` : 'your coin'} at the cages${this.seizedCoin > 0 ? ` — ${this.seizedCoin} coin itemized` : ''}${this.seizedFuse <= SEIZED_FADE_S ? ' · the ink is fading' : ''}`
          : '';
        // sprint 385 — and the book knows the tag's tail ends: the
        // shelf a rotted tag fed, and the coin the count keeps outright
        const fenced = this.fencedTake.reduce((n, s) => n + s.count, 0);
        const shelfBit = fenced > 0 ? ` · the shelf keeps ${fenced} of yours` : '';
        const tillBit = this.coinKept > 0 ? ` · ${this.coinKept} of your coin sits in the count's till` : '';
        // sprint 412 — and the book names its own pages: torn edges it
        // can still smell riding in your purse
        const pagesBit = this.hotMarginalia > 0 ? ` · ${this.hotMarginalia} torn ${this.hotMarginalia === 1 ? 'page rides' : 'pages ride'} in your purse` : '';
        this.cue('whisper', it.pos, t === 1 && th === 0 && locker === 0 && fenced === 0 && this.coinKept === 0 && this.hotMarginalia === 0
          ? '[the book holds one line on you — this one]'
          : `[the book on you — ${t} question${t === 1 ? '' : 's'} filed · ${th} theft${th === 1 ? '' : 's'} tallied — the asking files too${th >= 6 ? ' · the tills are closed to you' : ''}${lockerBit}${shelfBit}${tillBit}${pagesBit}]`);
        return;
      }
      case 'askTally': {
        // sprint 408 — the tally answers back too: the Auditor's own
        // ledger reads you out loud, priced like the other two books.
        // The asking is itself a filed question (the index counts this
        // one) — and the readout knows what the tally's book cares
        // about: the thefts owed, whether the boards still listen, and
        // the tag the count keeps.
        if (this.space !== 'under') return;
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        if (this.marginalia < 3) {
          this.cue('door-locked', it.pos, '[the tally wants 3 marginalia — even questions have a price]', 'warn');
          return;
        }
        this.chargedMarginalia(3, it.pos.x, it.pos.z);
        this.fileQuestion();
        const th2 = this.unpaidTheft;
        const tagN = this.seizedTake.reduce((n, s) => n + s.count, 0);
        const boardsBit = this.wantedActive ? ' · the boards still listen' : '';
        const deepBit = th2 >= 6 ? ' · the tills hold their stock' : '';
        const tagBit = tagN > 0 ? ` · the count keeps ${tagN} of yours tagged` : '';
        this.cue('whisper', it.pos, th2 === 0 && !this.wantedActive && tagN === 0
          ? '[the tally keeps no line on you — clean hands]'
          : `[the tally on you — ${th2} theft${th2 === 1 ? '' : 's'} owed${boardsBit}${deepBit}${tagBit}]`);
        return;
      }
      case 'purse': {
        if (this.space !== 'under') {
          // The clerk changes the other way — 8 marginalia for
          // imprints. A rifled counter folds its hands; a filed face
          // pays the register's sour rate (the house reads ITS book —
          // the register, not the under's tallies).
          const cRoom = (it.data as { roomIndex: number }).roomIndex;
          if (this.clerkRefuses(cRoom, it.pos)) return;
          if (this.marginalia < 8) {
            this.cue('door-locked', it.pos,
              `[the purse wants 8 marginalia — you're ${8 - this.marginalia} short]`, 'warn');
            return;
          }
          const filed = this.unpaidHeld > 0;
          const gain = filed ? 4 : 6;
          this.marginalia -= 8;
          // sprint 412 — the tear means nothing to the house's till:
          // marked under-pages launder through the exchange silently —
          // the mark dies at the jurisdiction line, same as a hot
          // imprint dies at the Broker's purse below.
          const torn = Math.min(8, this.hotMarginalia);
          this.hotMarginalia -= torn;
          this.imprints += gain;
          this.stats.imprintsEarned += gain;
          this.cue('purchase', it.pos, torn > 0
            ? `[the till can't read the under's torn edges — the pages pass · 8 marginalia → ${gain} imprints]`
            : filed
              ? `[the clerk counts your coins twice — the register's rate sours · 8 marginalia → ${gain} imprints]`
              : `[the purse changes — 8 marginalia → ${gain} imprints]`, 'info');
          return;
        }
        // The Broker changes coin — 6 imprints for marginalia. The only
        // bridge between the two currencies; his rate sours when your
        // ledgers show (any of the three books open reads as risk).
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        if (this.imprints < 6) {
          this.cue('door-locked', it.pos,
            `[the purse wants 6 imprints — you're ${6 - this.imprints} short]`, 'warn');
          return;
        }
        const dirty = this.unpaidTheft > 0 || this.unpaidHeld > 0 || this.paperTrail > 0;
        // The boards carry your face to the counter too — while the
        // wanted sheets stand, the Broker's rate drops two steps:
        // named and clean pays the dirty price; named and dirty pays
        // the register's sour.
        const gain = Math.max(4, (dirty ? 6 : 8) - (this.wantedActive ? 2 : 0));
        this.imprints -= 6;
        // sprint 329 — the under launders: the Broker takes the till's
        // marked coin without asking — hot imprints die here, silent.
        // sprint 330 — but the wash isn't free: the under's book reads
        // the marked coin too, and the purse files the question.
        const washed = Math.min(6, this.hotImprints);
        this.hotImprints -= washed;
        if (washed > 0) this.fileQuestion();
        this.marginalia += gain;
        this.stats.marginaliaEarned += gain;
        this.cue('purchase', it.pos, washed > 0
          ? `[the purse weighs the marked coin — the under's book opens a line · 6 imprints → ${gain} marginalia${this.wantedActive ? ' · the boards sour it too' : ''}]`
          : this.wantedActive
            ? `[the broker reads the boards, not just your coin — 6 imprints → ${gain} marginalia]`
            : dirty
              ? `[the broker reads your books — the rate sours · 6 imprints → ${gain} marginalia]`
              : `[the purse changes — 6 imprints → ${gain} marginalia]`, 'info');
        return;
      }
      case 'fence': {
        // sprint 331 — the Broker takes marked stock off your hands:
        // the goods-side wash. The take leaves your bag at an insult
        // rate and the under's book opens a line for the question —
        // the same price the purse charges for the coin.
        if (this.space !== 'under') return;
        if (this.checker.active) {
          this.cue('door-locked', it.pos, '[the floor is closed for the count]', 'warn');
          return;
        }
        const take = this.inventory.filter((i) => this.hotItems.has(i.id) && i.count > 0);
        if (take.length === 0) {
          this.cue('whisper', it.pos,
            "[the broker glances at your bag — nothing he'd touch]", 'info');
          return;
        }
        const count = take.reduce((n, i) => n + i.count, 0);
        // Named hands move marked goods slower — the boards tax the
        // take a step while they stand.
        const pay = Math.max(2, 4 - (this.wantedActive ? 1 : 0)) * count;
        for (const i of take) {
          this.hotItems.delete(i.id);
          i.count = 0;
        }
        this.inventory = this.inventory.filter((i) => i.count > 0);
        this.marginalia += pay;
        this.stats.marginaliaEarned += pay;
        this.fileQuestion();
        this.cue('purchase', it.pos,
          `[the broker takes the marked stock without a word — the under's book opens a line · +${pay} marginalia]`);
        return;
      }
      case 'bell': {
        // The desk bell — the house's only noise that isn't at your
        // position. One ring rolls down the hall as a 'distraction'
        // (rouse category, intensity 0.8 ≈ 11m reach): anything
        // listening answers the counter, not you. Per-room cooldown
        // keeps a rung-out bell a spent tool, not a spammable siren.
        const roomIndex = (it.data as { roomIndex: number }).roomIndex;
        const last = this.bellRung.get(roomIndex)?.t ?? -Infinity;
        if (this.clock.time - last < 25) {
          this.cue('door-locked', it.pos, '[the bell gives a tired click — the house has heard enough]', 'info');
          return;
        }
        this.bellRung.set(roomIndex, { t: this.clock.time, x: it.pos.x, z: it.pos.z });
        this.sound.emit({ x: it.pos.x, y: it.pos.y, z: it.pos.z, intensity: 0.8 * this.wantedPull, category: 'distraction', caption: '' });
        this.cue('phone-ring', it.pos, "[the bell's note rolls down the hall]", 'info');
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
          this.teach('hide', '[the spot holds you — a thing passing close still smells you]');
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
      case 'stoop': {
        const door = it.data as Door;
        const c = this.stoopUnder(door);
        this.cue('door-peek', it.pos, c.text, c.sev);
        this.teach('stoop', '[the crack shows only what passes close — the seam still hears further]');
        return;
      }
      case 'slip': {
        // sprint 447 — the free toss, aimed: the pebble skips under the
        // leaf and lands ~1.3m into the far room, on the far side of your
        // cover. Same cooldown, same weak pull — but it works a room you
        // never opened, and what it calls comes looking at YOUR door.
        if (this.clock.time < this.nextToss) {
          this.cue('door-locked', it.pos, '[your hand finds no pebble — give it a breath]', 'warn');
          return;
        }
        this.nextToss = this.clock.time + 8;
        const door = it.data as Door;
        const nX = Math.sin(door.yaw), nZ = Math.cos(door.yaw);
        const side = Math.sign((this.player.pos.x - door.pos.x) * nX + (this.player.pos.z - door.pos.z) * nZ) || 1;
        const x = door.pos.x - nX * side * 1.3;
        const z = door.pos.z - nZ * side * 1.3;
        this.audio.play('pebble', { x, y: 0.1, z }, '');
        this.cue('pebble', it.pos, '[the pebble skips under — a tap on the far side]');
        this.sound.emit({ x, y: 0.1, z, intensity: 0.45 * this.wantedPull, category: 'distraction', caption: '' });
        // sprint 471 — the stone comes back: anything with hands standing
        // where the pebble lands can nudge it under the leaf again. The
        // returned tap is the tell you paid for — you learn something is
        // AT this door, and the roll is a real sound on YOUR lip of it.
        for (const e of this.entities) {
          if (e.state === 'done') continue;
          const tp = e.threatPos();
          if (!tp) continue;
          if (v3dist(tp, { x, y: 0.1, z }) < 1.4) {
            this.pebbleBack = { t: this.clock.time + 1.2 + Math.random() * 0.8, x: door.pos.x + nX * side * 0.3, z: door.pos.z + nZ * side * 0.3 };
            break;
          }
        }
        return;
      }
      case 'call': {
        // sprint 465 — the seam speaks: your voice goes under the leaf and
        // lands AT the shared door — a tighter pull than the pebble's toss.
        // It is heard in BOTH rooms: the far side hears a whisper at its
        // door, and your own side hears you talking to the seam. Shares the
        // free-lure channel's breath with the pebble.
        if (this.clock.time < this.nextToss) {
          this.cue('door-locked', it.pos, '[your breath needs a moment — the seam heard you already]', 'warn');
          return;
        }
        this.nextToss = this.clock.time + 8;
        const door = it.data as Door;
        this.cue('whisper-voice', door.pos, '[your voice goes under the leaf — a whisper at its foot]', 'warn');
        // The whisper is heard under the leaf's far edge, not on the seam
        // itself — room-gated hearing owns an emit to one room, and the
        // leaf's own line resolves to YOUR side. A hand's-depth under the
        // far lip keeps the voice in the room you called into.
        const nX = Math.sin(door.yaw), nZ = Math.cos(door.yaw);
        const side = Math.sign((this.player.pos.x - door.pos.x) * nX + (this.player.pos.z - door.pos.z) * nZ) || 1;
        const fx = door.pos.x - nX * side * 0.3, fz = door.pos.z - nZ * side * 0.3;
        this.sound.emit({ x: fx, y: 0.15, z: fz, intensity: 0.6 * this.wantedPull, category: 'distraction', caption: '' });
        // — and it carries back: your own room hears you talk to the door.
        this.sound.emit({ x: it.pos.x, y: 0.15, z: it.pos.z, intensity: 0.45 * this.wantedPull, category: 'distraction', caption: '' });
        // sprint 466 — the voice tells: whisper into a leaf a watcher is
        // already pressed against and the seam betrays the knee for real.
        // Same surface the crack's watching eye uses — but no seeded roll:
        // a voice that comes out of the crack under its ear IS the tell.
        // Both sides count — the seam carries a whisper each way.
        let told: Entity | null = null;
        let toldD = 1.4;
        for (const e of this.entities) {
          if (e.state === 'done' || !e.eyeTell) continue;
          const tp = e.threatPos();
          if (!tp) continue;
          const d = v3dist(tp, door.pos);
          if (d < toldD) { toldD = d; told = e; }
        }
        if (told) {
          told.eyeTell?.(this.player.pos, door.pos);
          this.cue('whisper-voice', door.pos, '[it takes the whisper from your mouth — the seam told it where you kneel]', 'danger');
        }
        // sprint 467 — it mouths back: a watcher the whisper reached in
        // the far room answers through the same crack a breath later.
        // The answer is the confirmation you bought with your voice —
        // now you KNOW something came to your door.
        const callRoom = this.roomBeyondDoor(door);
        if (callRoom) {
          const roam = this.activeRooms();
          const heard = { x: fx, y: 0.15, z: fz, intensity: 0.6 * this.wantedPull, category: 'distraction' as const, caption: '' };
          let inEar = false;
          for (const e of this.entities) {
            if (e.state === 'done') continue;
            const tp = e.threatPos();
            if (!tp) continue;
            const ri = underRoomOf(roam, tp);
            if (ri < 0 || roam[ri] !== callRoom) continue;
            if (withinRouseRadius(heard, tp.x, tp.z)) { inEar = true; break; }
          }
          if (inEar) {
            this.seamAnswer = { t: this.clock.time + 1.2 + Math.random() * 0.9, x: door.pos.x, z: door.pos.z };
          }
        }
        return;
      }
      case 'stampSeam': {
        // sprint 474 — stamp the fingers: the seam's counter to the
        // reach. Your boot comes down on the hand under the leaf — it
        // lets go and stays gone ~8s at this door (the rubble's mass
        // still presses the leaf; it just stops reaching under). The
        // stamp is a real stomp — loud enough for the house to hear.
        const door = it.data as Door;
        this.seamReachCd.set(door.id, this.clock.time + 8);
        if (this.seamReach?.doorId === door.id) this.seamReach = null;
        this.cue('door-locked', door.pos, '[you stamp the fingers — they twist, and let go for now]', 'warn');
        this.sound.emit({ x: door.pos.x, y: 0.3, z: door.pos.z, intensity: 0.7 * this.wantedPull, category: 'impact', caption: '' });
        return;
      }
      case 'feedSeam': {
        // sprint 476 — feed the hand: pay the fingers off under the
        // crack. The coin rolls under, the leaf stays quiet ~12s —
        // longer than the stamp (the hand is PAID, not chased), and
        // all it costs the room is a rolling coin's whisper. A marked
        // coin testifies the same as at any till — the ledger reads
        // the mark wherever it lands.
        const door = it.data as Door;
        const armed = this.seamReach?.doorId === door.id && this.clock.time <= this.seamReach.lingerUntil;
        const hotBefore = this.hotImprints;
        this.chargedImprints(1, door.pos.x, door.pos.z);
        if (armed) {
          // sprint 477 — the hand keeps what you paid it: the pouch rides
          // the reacher, and a staggered grafter spills it back as loot.
          this.seamReach?.reacher?.takeCoin?.(hotBefore - this.hotImprints, door.pos);
          this.seamReachCd.set(door.id, this.clock.time + 12);
          if (this.seamReach?.doorId === door.id) this.seamReach = null;
          this.cue('door-locked', door.pos, '[the fingers close over the coin — the leaf goes quiet]', 'info');
        } else {
          // sprint 479 — the cold slide: bait, not ransom. The coin goes
          // to whichever hand can reach this leaf; it pockets the pouch
          // the same way, camps the leaf for more — and its smell now
          // follows the payer. No quiet window bought: the reach can
          // still come when YOU hold this seam. You paid for its place.
          this.entities.find((e) => e.seamBaitable?.(it.pos))
            ?.takeCoin?.(hotBefore - this.hotImprints, door.pos);
          this.cue('door-locked', door.pos, '[the coin slips under — stone drags to the leaf]', 'info');
        }
        this.sound.emit({ x: door.pos.x, y: 0.3, z: door.pos.z, intensity: 0.25, category: 'item', caption: '[a coin rolls under the crack]' });
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
      case 'wireDoor': {
        // sprint 432 — the wire is a brace you can leave: the coil binds
        // the leaf shut for both sides until it's cut. Walkers read it
        // 'blocked' like any held leaf and route elsewhere; nobody kicks
        // wire loose — it takes a blade.
        const cluster = this.doorsAt((it.data as RoomInstance['doors'][number]).pos);
        if (cluster.some((d) => d.heldBy)) {
          this.cue('door-locked', it.pos, '[something already holds it]', 'warn');
          return;
        }
        const coil = this.inventory.find((i) => i.id === 'wireCoil');
        if (!coil || coil.count <= 0) return;
        coil.count--;
        for (const d of cluster) d.heldBy = 'wired';
        // sprint 439 — a fresh knot counts fresh: unwire-and-rewire
        // doesn't inherit the work the house already put into the
        // last bind on this leaf (keyed on the leaf pos like strainWire)
        const bindDoor = it.data as RoomInstance['doors'][number];
        this.wireStrains.delete(`wire:${Math.round(bindDoor.pos.x * 7)}x${Math.round(bindDoor.pos.z * 7)}`);
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z),
          room: this.currentRoom, kind: 'work', t: this.clock.time,
          readBy: ['player'] });
        this.cue('door-creak', it.pos, '[you work the coil around the leaf — the wire holds it]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.3, category: 'door', caption: '' });
        return;
      }
      case 'unwireDoor': {
        const cluster = this.doorsAt((it.data as RoomInstance['doors'][number]).pos);
        for (const d of cluster) if (d.heldBy === 'wired') d.heldBy = undefined;
        this.giveItem('wireCoil', 1);
        this.cue('door-creak', it.pos, '[the coil comes back to your hand]');
        this.audio.play('trap-click', { x: it.pos.x, y: 0.4, z: it.pos.z }, '[a quiet snip]');
        this.sound.emit({ x: it.pos.x, y: 0.6, z: it.pos.z, intensity: 0.25, category: 'item', caption: '' });
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
        if (cluster.some((d) => d.heldBy === 'wired')) {
          this.cue('door-locked', it.pos, '[the wire binds it — cut it free first]', 'warn');
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
              this.chargedImprints(3, it.pos.x, it.pos.z);
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
        // opening onto a primed set piece earns its sting once — the work
        // was already mid-count behind that seam
        for (const d of cluster) {
          const ms = this.milestones.get(d.roomIndex);
          if (!ms?.primed || this.primedStingDone.has(d.roomIndex) || this.currentRoom === d.roomIndex) continue;
          this.primedStingDone.add(d.roomIndex);
          this.cue('floor-creak', it.pos, '[the work was already running — it heard you]', 'danger');
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
        // The deep tier reaches the machines too — six lines in the
        // floor's own book and the machine holds its stock: the
        // register's face upstairs, the tally's name below. Papers,
        // desks and the Broker stay open — only the machines refuse.
        const deep = this.space === 'under' ? this.unpaidTheft >= 6 : this.unpaidHeld >= 6;
        if (deep) {
          this.cue('door-locked', it.pos, this.space === 'under'
            ? "[the machine reads the boards — it holds its stock]"
            : "[the machine reads the register — it holds its stock]", 'warn');
          return;
        }
        const price = (sock.meta.price as number) ?? 5;
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the machine wants ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.chargedImprints(price, it.pos.x, it.pos.z);
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
        if (cur) this.chargedMarginalia(price, it.pos.x, it.pos.z);
        else this.chargedImprints(price, it.pos.x, it.pos.z);
        if (cur) this.unpaidTheft += this.wantedActive ? 2 : 1; // a claim on somebody else's effects — the crew keeps score; named, the tag writes double
        else this.unpaidHeld += 1; // the house keeps its own book — the detective reads it
        sock.meta.taken = true;
        it.enabled = false;
        // under cages are crew property — the books below count them on a
        // slow cycle, and the till rings ~75s later where the tag hung
        if (cur) this.queueLoss(it.pos.x, it.pos.z,
          '[a tag reads drawn early — the count is short]');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'machine', caption: '' });
        const contains = sock.meta.contains as string | undefined;
        if (contains === 'marginalia') {
          const amt = (sock.meta.amount as number) ?? 8;
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.hotMarginalia += amt; // crew's purse — torn edges testify at the under's tills
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
      case 'seizedClaim': {
        // The count's locker — what a named catch stripped hangs under
        // a fresh tag at this cage. Claiming it back is a fresh claim
        // on crew-held effects: priced, filed, and the till rings late.
        const sPrice = 8 + this.seizedCoin;
        if (this.marginalia < sPrice) {
          this.cue('door-locked', it.pos,
            `[the tag reads ${sPrice} marginalia — your own take costs what any bag costs]`, 'warn');
          return;
        }
        this.chargedMarginalia(sPrice, it.pos.x, it.pos.z);
        // like the index's asks — while the boards name you, the tag
        // reads in your own name and files double
        this.unpaidTheft += this.wantedActive ? 2 : 1;
        this.queueLoss(it.pos.x, it.pos.z,
          '[a tag reads drawn early — the count is short]');
        const back = this.seizedTake
          .map((s) => `${s.count > 1 ? `${s.count}×` : ''}${ITEM_DEFS[s.id]?.name.toLowerCase() ?? s.id}`)
          .join(' · ');
        for (const s of this.seizedTake) this.giveItem(s.id, s.count);
        // the coin rides back at par — the tag itemized it
        this.imprints += this.seizedCoin;
        this.seizedCoin = 0;
        this.seizedTake = [];
        this.seizedAt = null;
        this.seizedFuse = 0;
        this.seizedFading = false;
        this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('seized-'));
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'machine', caption: '' });
        this.cue('pickup', it.pos,
          `[the tag tears — your take hangs on your back again · ${back}${this.wantedActive ? ' · the sheets write your name twice' : ''}]`, 'info');
        return;
      }
      case 'seizedCut': {
        // The tag's second answer — cut it free: no price, but the
        // count's paper had claimed them. Your take returns marked in
        // the count's hand (warm clerks read it like rifled stock) and
        // the book files the theft deeper — the brazen road back.
        this.unpaidTheft += this.wantedActive ? 4 : 2;
        this.queueLoss(it.pos.x, it.pos.z,
          '[a cut tag swings empty — the count is short]');
        const back = this.seizedTake
          .map((s) => `${s.count > 1 ? `${s.count}×` : ''}${ITEM_DEFS[s.id]?.name.toLowerCase() ?? s.id}`)
          .join(' · ');
        for (const s of this.seizedTake) { this.giveItem(s.id, s.count); this.hotItems.add(s.id); }
        // the cut can't hand back coin — the count swallowed it outright
        this.coinKept += this.seizedCoin;
        this.seizedCoin = 0;
        this.seizedTake = [];
        this.seizedAt = null;
        this.seizedFuse = 0;
        this.seizedFading = false;
        this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('seized-'));
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.5, category: 'machine', caption: '' });
        this.cue('chalk-mark', it.pos,
          `[the tag's paper tears — your take hangs on your back, marked in the count's hand · ${back} · the coin stays with the count${this.wantedActive ? ' · the sheets write your name twice' : ''}]`, 'warn');
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
        this.chargedImprints(price, it.pos.x, it.pos.z);
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
        this.chargedImprints(price, it.pos.x, it.pos.z);
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
        this.chargedImprints(price, it.pos.x, it.pos.z);
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
        if (this.indexClosed(it.pos)) return;
        const price = (sock.meta.price as number) ?? 5;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the order costs ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        this.fileQuestion();
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
        if (this.indexClosed(it.pos)) return;
        const price = (sock.meta.price as number) ?? 5;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the board wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        this.fileQuestion();
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
        if (this.indexClosed(it.pos)) return;
        const price = (sock.meta.price as number) ?? 4;
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the register wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        this.fileQuestion();
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
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        sock.meta.taken = true;
        it.enabled = false;
        this.paperTrail = Math.max(0, this.paperTrail - 2) + 1;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, '[the clerk strikes two lines from your file — and logs the asking]');
        return;
      }
      case 'returnSlip': {
        // The return slip — the theft ledger's relief valve. You can't
        // bring the goods back, so you return them in writing: strikes
        // two thefts off the Auditor's tally, then the filing is itself
        // a petty claim — net −1. Never cleans the book; only his desk
        // settles it. Blank ledgers shrug, like the counter-claim.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 5;
        if (this.unpaidTheft <= 0) {
          this.cue('door-locked', it.pos, '[nothing owed — the cage clerk waves the slip away]', 'warn');
          return;
        }
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the return slip wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        sock.meta.taken = true;
        it.enabled = false;
        this.unpaidTheft = Math.max(0, this.unpaidTheft - 2) + 1;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, '[two thefts struck from the tally — the filing itself is claimed]');
        return;
      }
      case 'misfile': {
        // The quiet amendment — the count's relief valve. The other
        // filings settle ledgers; this buries the count itself: every
        // pending loss-report leaves the books — no ring, no checker.
        // A timing play, not a pardon: file it BEFORE the ring lands,
        // and a walker already out keeps walking. Dearest paper below.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 8;
        if (this.crewCount.pending <= 0) {
          this.cue('door-locked', it.pos, '[the tally is already honest — the clerk waves the slip away]', 'warn');
          return;
        }
        if (this.marginalia < price) {
          this.cue('door-locked', it.pos, `[the amendment wants ${price} marginalia — ${price - this.marginalia} short]`, 'warn');
          return;
        }
        this.chargedMarginalia(price, it.pos.x, it.pos.z);
        sock.meta.taken = true;
        it.enabled = false;
        const buried = this.crewCount.pending;
        this.crewCount.reset();
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, buried === 1
          ? '[a line item leaves the count — it never reaches the books]'
          : `[${buried} line items leave the count — they never reach the books]`);
        return;
      }
      case 'affidavit': {
        // The affidavit — the held ledger's relief valve, priced in
        // imprints on the main route (its under twins run on marginalia).
        // A sworn statement that the held goods reached their owner:
        // strikes two claims off the detective's register, then the
        // filing itself enters his book — net −1. Only his desk settles
        // for real. Blank register → shrug, like the under filings.
        const sock = it.data as Socket;
        const price = (sock.meta.price as number) ?? 6;
        if (this.unpaidHeld <= 0) {
          this.cue('door-locked', it.pos, '[your name is not in the register — the clerk waves the form away]', 'warn');
          return;
        }
        if (this.imprints < price) {
          this.cue('door-locked', it.pos, `[the affidavit asks ${price} imprints — ${price - this.imprints} short]`, 'warn');
          return;
        }
        this.chargedImprints(price, it.pos.x, it.pos.z);
        sock.meta.taken = true;
        it.enabled = false;
        this.unpaidHeld = Math.max(0, this.unpaidHeld - 2) + 1;
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.35, category: 'entity-cue', caption: '' });
        this.cue('whisper', it.pos, '[two claims sworn away — the filing itself enters his book]');
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
        this.chargedImprints(price, it.pos.x, it.pos.z);
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
        this.chargedMarginalia(toll, it.pos.x, it.pos.z);
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
        this.chargedMarginalia(toll, it.pos.x, it.pos.z);
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
        this.chargedImprints(toll, it.pos.x, it.pos.z);
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
        if (this.imprints >= price) {
          this.chargedImprints(price, it.pos.x, it.pos.z); paid = true;
        }
        else if (this.marginalia >= 1) { this.chargedMarginalia(1, it.pos.x, it.pos.z); paid = true; }
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
        // sprint 402 — the answer cuts the ring: a live scare-ring at this
        // phone ends the moment the receiver lifts — the house can't ring
        // a phone that's already in your hand.
        if (this.phoneRing && Math.hypot(this.phoneRing.pos.x - at.x, this.phoneRing.pos.z - at.z) < 0.8) {
          this.cue('phone-stop', at, '[the ringing stops — dead line]', 'warn');
          this.phoneRing = null;
        }
        // sprint 403 — a phone ringing because you dialed it dies the same
        // way: the call dies in your hand, paid or not.
        const pk = it.id.replace(/^phone-/, '');
        const hi = this.hookRings.findIndex((r) => r.key === pk);
        if (hi >= 0) {
          this.hookRings.splice(hi, 1);
          this.cue('phone-stop', at, '[the call dies in your hand]', 'warn');
        }
        return;
      }
      case 'offHook': {
        // sprint 400 — leave the receiver dangling: the line rings the
        // phone back on a 20-34s fuse, ~6.5s of 'distraction' bursts at its
        // spot — a lure you planted and aren't standing next to. The clack
        // of the arm itself is the only cost up front.
        it.enabled = false;
        const key = it.id.replace(/^offHook-/, '');
        this.offHookPhones.add(key);
        const at = { x: it.pos.x, y: 1.4, z: it.pos.z };
        const scare = this.streams.roomStream('scare', this.currentRoom * 823 + 17);
        const ringAt = this.clock.time + 20 + scare.range(0, 14);
        this.hookRings.push({ key, pos: at, at: ringAt, until: ringAt + 6.5, lastRing: 0 });
        this.cue('phone-stop', at, '[the receiver dangles — the line stays open]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.25, category: 'item', caption: '' });
        return;
      }
      case 'hangUp': {
        // sprint 401 — un-plant your own lure: an armed fuse or a live ring
        // both end here — the phone is spent either way, the choice was only
        // whether the pull ever sounded.
        it.enabled = false;
        const key = it.id.replace(/^hangUp-/, '');
        const at = { x: it.pos.x, y: 1.4, z: it.pos.z };
        this.hookRings = this.hookRings.filter((r) => r.key !== key);
        this.spentPhones.add(key);
        this.cue('phone-stop', at, '[the line goes quiet — you hung it up]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.2, category: 'item', caption: '' });
        return;
      }
      case 'dial': {
        // sprint 403 — the aimed lure: a coin rings the farthest live phone
        // on this floor. The pull lands where you aren't; the touch-tones
        // are a sound where you are. The s402 rule holds — the line only
        // reaches a phone that was never lifted, left open, or rung out.
        const key = it.id.replace(/^dial-/, '');
        const at = { x: it.pos.x, y: 1.4, z: it.pos.z };
        const under = this.space === 'under';
        const purse = under ? this.marginalia : this.imprints;
        if (purse < 1) {
          this.cue('door-locked', it.pos,
            `[the phone wants a ${under ? 'page' : 'coin'} — 1 ${under ? 'marginalia' : 'imprint'} short]`, 'warn');
          return;
        }
        let target: { key: string; pos: Vec3 } | null = null;
        let best = -1;
        for (const r of this.activeRooms()) {
          if (!r.spec || SAFE_ROOM_TEMPLATES.has(r.templateId)) continue;
          const rc = Math.cos(r.yaw), rs = Math.sin(r.yaw);
          let pn2 = 0;
          for (const p of r.spec.props) {
            if (p.kind !== 'payphone') continue;
            const pkey = `${this.space}:${r.index}:${pn2++}`;
            if (pkey === key || this.answeredPhones.has(pkey) || this.offHookPhones.has(pkey)
              || this.spentPhones.has(pkey) || this.hookRings.some((hr) => hr.key === pkey)) continue;
            const pos = { x: r.origin.x + p.x * rc + p.z * rs, y: 1.4, z: r.origin.z - p.x * rs + p.z * rc };
            const d = Math.hypot(pos.x - at.x, pos.z - at.z);
            if (d > best) { best = d; target = { key: pkey, pos }; }
          }
        }
        if (!target) {
          this.cue('phone-stop', it.pos, '[the line finds no live phone]', 'warn');
          return;
        }
        // a marked coin testifies in the slot like at any till (s335);
        // under, the page is just a page
        if (under) this.chargedMarginalia(1, at.x, at.z); else this.chargedImprints(1, at.x, at.z);
        const scare = this.streams.roomStream('scare', this.currentRoom * 397 + 29);
        const ringAt = this.clock.time + 3.5 + scare.range(0, 3);
        this.hookRings.push({ key: target.key, pos: target.pos, at: ringAt, until: ringAt + 7, lastRing: 0, dial: true });
        this.cue('phone-stop', at, under ? '[you feed it a page — the far phone rings rooms away]' : '[you dial — the far phone rings rooms away]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.35, category: 'item', caption: '' });
        // the receiver lifts to dial — a live scare-ring here dies with it
        if (this.phoneRing && Math.hypot(this.phoneRing.pos.x - at.x, this.phoneRing.pos.z - at.z) < 0.8) {
          this.cue('phone-stop', at, '[the ringing stops — dead line]', 'warn');
          this.phoneRing = null;
        }
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
        const rm = this.activeRooms()[this.currentRoom];
        const sub = !!rm?.flooded && !this.drainedRooms.has(`${this.space}:${rm.index}`);
        if (hsn?.planted && !hsn.claimed) {
          // your own wire is re-deployable — pull or gather returns the
          // coil whole; it leaves no dead scrap for the under to strip.
          // a warden-claimed wire fails this and falls to the plain cut
          this.removeSnare(hsn);
          this.giveItem('wireCoil', 1);
          this.audio.play('trap-click', { x: d.sx, y: 0.1, z: d.sz },
            '[the wire comes back to your hand]');
          this.sound.emit({ x: d.sx, y: 0.2, z: d.sz, intensity: 0.3, category: 'item', caption: '[a quiet snip]' });
          return;
        }
        if (hsn?.grafted) {
          // cutting the splice severs the under's coil loose — the wire
          // leaves the floor and rides your pack instead of lying as scrap
          this.removeSnare(hsn);
          this.giveItem('wireCoil', 1);
          this.hazard.evidence.push({ pos: v3(d.sx, 0, d.sz), room: d.room, kind: 'work',
            t: this.clock.time, readBy: ['player'] });
          this.audio.play('trap-click', { x: d.sx, y: 0.1, z: d.sz },
            '[the splice parts — the coil is yours]');
          this.sound.emit({ x: d.sx, y: 0.2, z: d.sz, intensity: 0.3, category: 'item', caption: '[a quiet snip]' });
          return;
        }
        if (hsn) {
          hsn.armed = false;
          this.hazard.evidence.push({ pos: v3(hsn.pos.x, 0, hsn.pos.z), room: hsn.room, kind: 'wire', t: this.clock.time, readBy: [] });
        }
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
      case 'unchock': {
        // sprint 394 — the jam isn't welded: work the chock free and the
        // wheel spins back up. The blades' wake is a real sound — the
        // recovery prices the noise and the live hazard, not the tool.
        const f = it.data as { pos: Vec3; room: number; dead: boolean };
        f.dead = false;
        it.enabled = false;
        this.giveItem('doorChock', 1);
        this.cue('item', it.pos, '[the chock works free — the blades remember how to spin]');
        this.sound.emit({ x: f.pos.x, y: 1.1, z: f.pos.z, intensity: 0.45, category: 'machine', caption: '[the wheel grinds back to life]' });
        return;
      }
      case 'keyring': {
        it.enabled = false;
        (it.data as unknown as { cutKeys?: () => void }).cutKeys?.();
        return;
      }
      case 'basket': {
        const w = it.data as unknown as { basketFull: boolean };
        if (!w.basketFull) { it.enabled = false; return; }
        w.basketFull = false;
        this.unpaidTheft += this.wantedActive ? 2 : 1; // her wash, your pockets — the clerks mark it, double while the boards name you
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
          this.hotMarginalia += amt; // pilfered pages — torn edges testify at the under's tills
          this.cue('pickup', it.pos, `[+${amt} marginalia — pins in the hem]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.5, z: it.pos.z, intensity: 0.3, category: 'item', caption: '[linen lifted]' });
        return;
      }
      case 'pick': {
        const h = it.data as unknown as { stock: number; sledgePos: Vec3 };
        if (h.stock <= 0) { it.enabled = false; return; }
        h.stock--;
        this.unpaidTheft += this.wantedActive ? 2 : 1; // off the sledge, into the tally — double while the boards name you
        it.enabled = false;
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 9);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.hotMarginalia += amt; // pilfered pages testify at the under's tills
          this.cue('pickup', it.pos, `[+${amt} marginalia — off the sledge]`);
        } else {
          const pool = ['latchpick', 'doorChock', 'feltWrap', 'bandage', 'tonic'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the sledge]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        // the drag's cargo is crew property — the count finds it short later
        this.queueLoss(it.pos.x, it.pos.z,
          '[the drag reads light — the count is short]');
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
        this.unpaidTheft += this.wantedActive ? 2 : 1; // out of her drawer, into the tally — double while the boards name you
        this.paperTrail += 2;  // the index logs the rummage as two questions
        it.enabled = false;
        // hands in a staffed book leave the same smell as hands in a
        // till — the rifle's third price after the ledgers: sign the
        // under's own scent-reader drags to.
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: this.currentRoom,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 9);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.hotMarginalia += amt; // its own pages — the index files the hands that spend them
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
      case 'tallyDrawer': {
        // Rifling the Auditor's own drawer — the loudest claim in the
        // under: two lines in his book, and he's standing at the desk —
        // the rummage opens the ledger at your name on the spot.
        const h = it.data as unknown as { stock: number; keeper?: { rifledTally?: () => void } };
        if (h.stock <= 0) { it.enabled = false; return; }
        h.stock--;
        // While the boards name you the book slaps open twice as hard —
        // same named-filing rule the index asks and the seize tag follow.
        this.unpaidTheft += this.wantedActive ? 4 : 2;
        it.enabled = false;
        // hands in a staffed book leave the same smell as hands in a
        // till — sign the under's scent-reader drags to.
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: this.currentRoom,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(4, 9);
          this.marginalia += amt;
          this.stats.marginaliaEarned += amt;
          this.hotMarginalia += amt; // off HIS book — the torn edge testifies at the under's tills
          this.cue('pickup', it.pos, `[+${amt} marginalia — off the tally]`);
        } else {
          const pool = ['latchpick', 'doorChock', 'feltWrap', 'bandage', 'tonic'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the tally]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        this.cue('drawer', it.pos, this.wantedActive
          ? '[the tally writes four — the boards make hands cost double]'
          : '[the tally notes your hands — the book slaps open]', 'warn');
        h.keeper?.rifledTally?.();
        return;
      }
      case 'registerDrawer': {
        // Rifling the Detective's register — imprints off the house book,
        // two lines onto yours, and he doesn't need the slow look: your
        // face files itself while your hands are in his drawer.
        const h = it.data as unknown as { stock: number; keeper?: { rifledRegister?: () => void } };
        if (h.stock <= 0) { it.enabled = false; return; }
        h.stock--;
        this.unpaidHeld += 2;
        it.enabled = false;
        // hands in a staffed book leave the same smell as hands in a
        // till — a main-route pilfer in warden territory; the warden
        // pulls to it like any kill or mounted wrap.
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: this.currentRoom,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        const roll = this.streams.stream('loot').range(0, 1);
        if (roll < 0.6) {
          const amt = this.streams.stream('loot').int(6, 10);
          this.imprints += amt;
          this.stats.imprintsEarned += amt;
          this.cue('pickup', it.pos, `[+${amt} imprints — off the register]`);
        } else {
          const pool = ['latchpick', 'doorChock', 'feltWrap', 'handLamp', 'sparkFlash'] as const;
          const item = pool[this.streams.stream('loot').int(0, pool.length - 1)];
          this.giveItem(item as ItemId, 1);
          this.cue('pickup', it.pos, `[${ITEM_DEFS[item].name} — off the register]`);
        }
        this.sound.emit({ x: it.pos.x, y: 0.4, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        this.cue('drawer', it.pos, '[the register notes your hands — your face files itself]', 'warn');
        h.keeper?.rifledRegister?.();
        return;
      }
      case 'cutRepost': {
        // Spilling the paper bundle — this walk dies and the clerk
        // reaches for fresh stock again after another beat. The grab
        // is work like any pilfer: the spilled sheets smell of hands
        // and the spill itself is a sound at your position.
        const r = it.data as unknown as { reposter: { active: boolean; cutBy(h: ReposterHooks): void } };
        if (!r.reposter.active) { it.enabled = false; return; }
        r.reposter.cutBy(this.reposterHooks());
        it.enabled = false;
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: this.currentRoom,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'distraction',
          caption: '[paper scattering in the corridor]' });
        this.wantedRepostT = this.clock.time + 30;
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
        this.hotMarginalia += amt; // the crew's coin — torn edges testify at the under's tills
        this.cue('pickup', it.pos, `[+${amt} marginalia — off the courier]`);
        return;
      }
      case 'houseLine': {
        // Pulling the Detective's junction box — the broadcast dies on the
        // spot (or never starts), but the dead wire is damages he files
        // in his book. Sabotage is a price, not a trick.
        const d = it.data as unknown as { keeper?: { pulledLine(): void; lineDead: boolean }; roomIdx?: number };
        if (d.keeper?.lineDead) { it.enabled = false; return; }
        it.enabled = false;
        d.keeper?.pulledLine();
        if (d.roomIdx !== undefined) this.deadLines.add(d.roomIdx);
        return;
      }
      case 'strip': {
        const h = it.data as unknown as { lampLit: boolean; relit: boolean; stripLamp(): void };
        if (!h.lampLit) { it.enabled = false; return; }
        const scavenged = h.relit;
        h.stripLamp();
        this.unpaidTheft += this.wantedActive ? 2 : 1; // off the sledge, into the tally — double while the boards name you
        it.enabled = false;
        // the lamp IS the loot — a hooded hand lamp at half battery, or a
        // top-up for the one you carry (count is charge). A scavenged bulb
        // is second-hand: less charge, and the strip point re-registers
        // the moment the team wires a replacement on.
        this.giveItem('handLamp', scavenged ? 30 : 55);
        this.cue('pickup', it.pos, scavenged ? '[the scavenged bulb is yours — charge for a walk]' : '[the work-lamp comes free — hooded, half a battery]');
        this.sound.emit({ x: it.pos.x, y: 0.5, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        // its lamp is crew property too — stripped or scavenged, it counts
        this.queueLoss(it.pos.x, it.pos.z,
          '[the drag\'s lamp is marked gone — the count is short]');
        return;
      }
      case 'wanted': {
        // the sheet prints what the tally says about you — the boards'
        // readout of the clerk's book, free to read, still named
        this.cue('chalk-mark', null, `[the sheet names your hands — ${this.unpaidTheft} theft${this.unpaidTheft === 1 ? '' : 's'} tallied · the crew listens harder, every counter reads the boards, and its doors stick until the count settles]`, 'warn');
        return;
      }
      case 'wantedTear': {
        // the boards carry the wider ear — pull the sheet and the room
        // forgets your face; the last sheet ends the reach everywhere.
        // The ledger itself is untouched: the tally still wants a settle.
        const tornHost = this.wantedRooms.get(this.currentRoom);
        this.wantedRooms.delete(this.currentRoom);
        if (tornHost) this.bareBoards.set(this.currentRoom, { x: tornHost.x, z: tornHost.z });
        it.enabled = false;
        const built = this.streamer.get(this.currentRoom);
        const notice = built?.group.getObjectByName('wanted-notice');
        if (built && notice) built.group.remove(notice);
        this.hazard.evidence.push({ pos: v3(it.pos.x, 0, it.pos.z), room: this.currentRoom,
          kind: 'work', t: this.clock.time, readBy: ['player'] });
        this.cue('chalk-mark', it.pos, this.wantedRooms.size === 0
          ? '[the last sheet comes down — the boards forget your face]'
          : '[the sheet comes down — the boards have one fewer name for you]', 'warn');
        // the clerk notices a bare board — every tear is answered,
        // not just the last: the repost arms on any pull
        this.wantedRepostT = this.clock.time + 30;
        return;
      }
      case 'stripCheck': {
        // Stealing the light mid-count — it feels it die instantly, and
        // the lamp is crew property: the strip files ANOTHER loss-report.
        const ch = it.data as unknown as { lampLit: boolean; stripLamp(h: CheckerHooks): number };
        if (!ch.lampLit) { it.enabled = false; return; }
        const charge = ch.stripLamp(this.checkerHooks());
        this.unpaidTheft += this.wantedActive ? 2 : 1; // off the crew's hands, into the tally — double while the boards name you
        it.enabled = false;
        this.giveItem('handLamp', charge);
        this.cue('pickup', it.pos, '[the count\'s lamp comes free — warm, still swinging]');
        this.sound.emit({ x: it.pos.x, y: 0.5, z: it.pos.z, intensity: 0.35, category: 'item', caption: '[pilfered]' });
        this.queueLoss(it.pos.x, it.pos.z,
          '[the count\'s lamp is marked gone — the count is short]');
        return;
      }
      case 'baitFloor': {
        // sprint 485 — plant a coin pile where you kneel: a paid placed
        // lure the scavenger, the ticking clock, or the count's lamp
        // reads first. A drop, not a spend — no ledger line; marked
        // coin is placed marked and comes back marked.
        if (this.imprints < 1) { it.enabled = false; return; }
        const hot = Math.min(1, this.hotImprints);
        this.imprints -= 1;
        this.hotImprints -= hot;
        this.droppedPouches.push({ x: it.pos.x, z: it.pos.z, n: 1 - hot, hot, bait: true });
        this.mintPouchDrops();
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 0.3, z: it.pos.z, intensity: 0.28,
          category: 'item', caption: '[a coin rings soft on the stones]' });
        this.cue('pickup', it.pos,
          '[the bait is set — whatever reads the floor reads this first]');
        return;
      }
      case 'baitWrap': {
        // sprint 490 — the upstairs bait: leave a felt wrap where you
        // kneel. The floorkeeper's fold-back can't tell a plant from
        // its own stagger's spill — it walks to fold it back in. The
        // pull is the service; the wrap is the price.
        const w0 = this.inventory.find((i) => i.id === 'feltWrap' && i.count > 0);
        if (!w0) { it.enabled = false; return; }
        w0.count--;
        this.inventory = this.inventory.filter((i) => i.count > 0);
        this.droppedWraps.push({ x: it.pos.x, z: it.pos.z, n: 1 });
        this.mintWrapDrops();
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 0.3, z: it.pos.z, intensity: 0.22,
          category: 'item', caption: '[felt lands soft on the boards]' });
        this.cue('pickup', it.pos,
          '[the bait is set — the floor will come fold it in]');
        return;
      }
      case 'baitWedge': {
        // sprint 492 — the chock lure: a set-down wedge reads exactly
        // like a kicked one to the floorkeeper's tidying (s489).
        const wd0 = this.inventory.find((i) => i.id === 'doorChock' && i.count > 0);
        if (!wd0) { it.enabled = false; return; }
        wd0.count--;
        this.inventory = this.inventory.filter((i) => i.count > 0);
        this.kickedWedges.push({ x: it.pos.x, z: it.pos.z });
        this.mintWedgeDrops();
        it.enabled = false;
        this.sound.emit({ x: it.pos.x, y: 0.3, z: it.pos.z, intensity: 0.24,
          category: 'item', caption: '[a chock knocks the boards]' });
        this.cue('pickup', it.pos,
          '[the chock is out — the floor will come tidy it]');
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
        if (w) {
          w.dead = true;
          // the tape is testimony — a mounted felt patch reads as your
          // work to every hunter that smells it. Fresh sign, not ash:
          // unlike a forged lie this pulls both readers once.
          this.hazard.evidence.push({ pos: v3(w.pos.x, 0, w.pos.z), room: w.room,
            kind: 'blind', t: this.clock.time, readBy: [] });
        }
        this.cue('item', it.pos, '[the eye goes blind under the felt — and the felt smells of your work]');
        this.sound.emit({ x: it.pos.x, y: 1.2, z: it.pos.z, intensity: 0.25, category: 'item', caption: '[felt over the lens]' });
        return;
      }
      case 'untape': {
        // Take the felt back: the eye wakes, the wrap is yours again —
        // and the sign the tape left stays smelled (it already went out).
        const wp = (it.data as { watchPos?: { x: number; z: number } }).watchPos;
        const w = wp && this.hazard.watchers.find((x) =>
          x.dead && Math.hypot(x.pos.x - wp.x, x.pos.z - wp.z) < 0.6);
        if (!w) return;
        w.dead = false;
        it.enabled = false;
        this.giveItem('feltWrap', 1);
        this.cue('item', it.pos, '[the felt is yours again — the eye blinks awake]', 'warn');
        this.sound.emit({ x: it.pos.x, y: 1.2, z: it.pos.z, intensity: 0.15, category: 'item', caption: '[felt pulled free]' });
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
        // sprint 499 — the surge pulls the spill to the crank: remember
        // where the water left so the tide has somewhere to take it
        this.drainedSpots.set(rIdx, { x: it.pos.x, z: it.pos.z });
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
      case 'douse': {
        // sprint 398 — kill the fire early: the crackle stops murmuring and
        // the warm circle closes. The wood was spent at lighting either way,
        // so a drowned hearth is dead — no relight, no second buy.
        it.enabled = false;
        const at = { x: it.pos.x, y: 0.6, z: it.pos.z };
        this.hearths = this.hearths.filter((h) => {
          if (Math.hypot(h.base.x - at.x, h.base.z - at.z) >= 0.6) return true;
          this.scene.remove(h.pts); this.scene.remove(h.light);
          h.geo.dispose(); h.mat.dispose();
          return false;
        });
        this.audio.play('inkling-hiss', at, '[the fire drowns — the room goes quiet]');
        this.sound.emit({ x: at.x, y: at.y, z: at.z, intensity: 0.15, category: 'ambient', caption: '' });
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
      case 'tvoff': {
        // sprint 397 — kill the set. Going dark is terminal (the channel got
        // your attention once), and it cancels the answer-back if the channel
        // flagged this room but hasn't spoken yet. The light and hiss die too.
        it.enabled = false;
        const offKey = it.id.replace(/^tvoff-/, '');
        this.litTVs.delete(offKey);
        this.deadTVs.add(offKey);
        this.untuneTVAt(this.currentRoom, Number(offKey.split(':')[2] ?? 0));
        const at = { x: it.pos.x, y: 1.2, z: it.pos.z };
        const flagged = this.tvAnswerQueue.some((q) => Math.hypot(q.pos.x - at.x, q.pos.z - at.z) < 0.6);
        if (flagged) {
          this.tvAnswerQueue = this.tvAnswerQueue.filter((q) => Math.hypot(q.pos.x - at.x, q.pos.z - at.z) >= 0.6);
        }
        this.cue('trap-click', at, flagged
          ? '[the set goes dark — the channel forgets the room]'
          : '[the set goes dark]');
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
      case 'wireCoil': {
        // sprint 423 — lay the stolen coil where the living walk. The
        // wire is honest scrap: armed wire trips whoever steps on it,
        // you included; the laying is real work that signs for hunters.
        // It lands just past the trip radius on the horizontal — a level
        // lay never snaps shut under the hand that paid it out, but step
        // into it and it takes your foot like anyone's.
        const rm = this.activeRooms()[this.currentRoom];
        if (!rm) return;
        const fwd = v3();
        this.player.lookDir(fwd);
        const hl = Math.hypot(fwd.x, fwd.z) || 1;
        const pos = v3(this.player.pos.x + (fwd.x / hl) * 1.05, 0,
          this.player.pos.z + (fwd.z / hl) * 1.05);
        item.count--;
        const snare = { pos, room: rm.index, armed: true, planted: true,
          mesh: undefined as THREE.Object3D | undefined };
        this.hazard.snares.push(snare);
        snare.mesh = this.buildSnareProp(pos, rm.index);
        this.hazard.evidence.push({ pos: v3(pos.x, 0, pos.z), room: rm.index, kind: 'work',
          t: this.clock.time, readBy: ['player'] });
        this.audio.play('trap-click', { x: pos.x, y: 0.1, z: pos.z },
          '[the coil unwinds at your feet — fresh wire]');
        this.sound.emit({ x: pos.x, y: 0.2, z: pos.z, intensity: 0.4, category: 'item', caption: '[wire laid]' });
        return;
      }
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

  /** The clerk's ledger named you — wanted sheets go up on the crew
   *  boards downstream, and the under-crew listens a tier harder until
   *  the tally is settled (ctx.wanted widens their notice reach).
   *  Tear every sheet and he reaches for fresh paper: `repost` re-arms
   *  the same raise on new downstream boards after a beat. */
  /** The index's deep tier — a file six questions deep stops answering
   *  the asks that dig it: the asking papers (work order, crew board,
   *  claim register) hold their pages. Relief papers and the desk stay
   *  open — closing the file's own valves would strand the player. */
  private indexClosed(pos: Vec3 | null): boolean {
    if (this.paperTrail < 6) return false;
    this.cue('door-locked', pos,
      '[the index closes to you — six questions is a file, not a curiosity]', 'warn');
    return true;
  }

  /** Service refusal at a staffed counter — a cold counter folds its
   *  hands; a face six lines deep in the register buys nothing at any
   *  counter (the desk is the only answer, and the affidavit's rate).
   *  askReg and the slip-back stay open: a readout is information, and
   *  undoing the crime isn't commerce. */
  private clerkRefuses(roomIndex: number, pos: Vec3 | null): boolean {
    if (this.closedCounters.has(roomIndex)) {
      this.cue('door-locked', pos,
        "[the clerk folds its hands — the counter is closed to you]", 'warn');
      return true;
    }
    if (this.unpaidHeld >= 6) {
      this.cue('door-locked', pos,
        "[she reads the register — the face buys nothing past six lines · the desk is the only answer]", 'warn');
      return true;
    }
    return false;
  }

  private raiseWanted(repost = false): void {
    this.wantedActive = true;
    for (const h of pickWantedHosts(this.activeRooms(), this.currentRoom)) {
      this.wantedRooms.set(h.roomIdx, { x: h.x, z: h.z });
    }
    this.cue('chalk-mark', null, repost
      ? '[fresh sheets go up on the boards ahead — the clerk has more paper]'
      : '[sheets go up on the boards ahead — your hands are named]', 'warn');
  }

  private lowerWanted(): void {
    this.wantedActive = false;
    this.wantedRooms.clear();
    this.bareBoards.clear();
    for (const i of this.streamer.builtIndices) {
      const built = this.streamer.get(i);
      const m = built?.group.getObjectByName('wanted-notice');
      if (built && m) built.group.remove(m);
    }
  }

  private static wantedMat: THREE.MeshBasicMaterial | null | undefined;
  private static wantedMaterial(): THREE.MeshBasicMaterial | null {
    if (typeof document === 'undefined') return null;
    if (Game.wantedMat === undefined) {
      const tex = wantedNotice(new Rng(0x5eed));
      Game.wantedMat = tex
        ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
        : null;
    }
    return Game.wantedMat;
  }

  private static spillMat: THREE.MeshBasicMaterial | null | undefined;
  /** Under-door light spill — warm strip a primed set piece leaks into the
   *  hall. Additive so it reads as light escaping, not a decal. */
  private static spillMaterial(): THREE.MeshBasicMaterial | null {
    if (typeof document === 'undefined') return null;
    if (Game.spillMat === undefined) {
      const tex = thresholdSpill();
      Game.spillMat = tex
        ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
        : null;
    }
    return Game.spillMat;
  }

  /** Room-local position for a world point — children added to a built
   *  room group live in the room's yaw frame, not the world's. */
  private roomLocal(built: { group: THREE.Group }, x: number, y: number, z: number): THREE.Vector3 {
    built.group.updateWorldMatrix(true, false);
    return built.group.worldToLocal(new THREE.Vector3(x, y, z));
  }

  /** A wanted sheet pinned to the face of a crew-board prop, turned to
   *  the room's middle so it reads on approach. */
  /** A primed milestone is mid-work before the door opens — its entry door
   *  leaks light under the seam. Reads "it heard you" from the hall. */
  private ensurePrimedSpill(roomIndex: number, built: { group: THREE.Group }): void {
    const ms = this.milestones.get(roomIndex);
    if (!ms?.primed) return;
    if (built.group.getObjectByName('primed-spill')) return;
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    const mat = Game.spillMaterial();
    if (!mat) return;
    let door: Door | null = null;
    let bd = Infinity;
    for (const d of room.doors) {
      const dd = (d.pos.x - room.entryPos.x) ** 2 + (d.pos.z - room.entryPos.z) ** 2;
      if (dd < bd) { bd = dd; door = d; }
    }
    if (!door) return;
    // push the strip just inside the room, across the threshold
    const ix = room.origin.x - door.pos.x, iz = room.origin.z - door.pos.z;
    const il = Math.hypot(ix, iz) || 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.55), mat.clone());
    this.spillMeshes.set(roomIndex, m);
    m.name = 'primed-spill';
    m.rotation.x = -Math.PI / 2;
    // flat quads take in-plane yaw on z; long axis lies along the door's width
    m.rotation.z = room.yaw - door.yaw - Math.PI / 2;
    m.position.copy(this.roomLocal(built, door.pos.x + (ix / il) * 0.1, 0.03, door.pos.z + (iz / il) * 0.1));
    m.renderOrder = 2;
    built.group.add(m);
  }

  private ensureWanted(roomIndex: number, built: { group: THREE.Group }): void {
    const host = this.wantedRooms.get(roomIndex);
    if (!this.wantedActive || !host) return;
    if (built.group.getObjectByName('wanted-notice')) return;
    const room = this.activeRooms()[roomIndex];
    if (!room) return;
    const mat = Game.wantedMaterial();
    if (!mat) return;
    const ox = room.origin.x - host.x, oz = room.origin.z - host.z;
    const ol = Math.hypot(ox, oz) || 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), mat);
    m.name = 'wanted-notice';
    m.position.copy(this.roomLocal(built, host.x + (ox / ol) * 0.14, 1.35, host.z + (oz / ol) * 0.14));
    m.rotation.y = Math.atan2(ox, oz) - room.yaw;
    m.renderOrder = 2;
    built.group.add(m);
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
    m.position.copy(this.roomLocal(built, sock.pos.x, 0.03, sock.pos.z + 0.55));
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
      m.position.copy(this.roomLocal(built, d.pos.x - Math.sin(d.yaw) * 0.4, 1.15, d.pos.z - Math.cos(d.yaw) * 0.4));
      m.rotation.y = d.yaw + Math.PI - room.yaw;
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
      m.rotation.y = inward - room.yaw;
      const off = 0.07;
      m.position.copy(this.roomLocal(built,
        d.pos.x + Math.sin(inward) * off,
        d.pos.y + 1.62,
        d.pos.z + Math.cos(inward) * off,
      ));
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
      unpaidTheft: this.unpaidTheft,
      unpaidHeld: this.unpaidHeld,
      paperTrail: this.paperTrail,
      hotImprints: this.hotImprints,
      hotMarginalia: this.hotMarginalia,
      hotItems: [...this.hotItems],
      wantedActive: this.wantedActive,
      wantedRooms: [...this.wantedRooms].map(([k, v]) => [k, { x: v.x, z: v.z }]),
      bareBoards: [...this.bareBoards].map(([k, v]) => [k, { x: v.x, z: v.z }] as [number, { x: number; z: number }]),
      wantedRepostS: Math.max(0, this.wantedRepostT - this.clock.time),
      taught: [...this.taught],
      deadLines: [...this.deadLines],
      wardArmed: this.wardArmed,
      seizedTake: this.seizedAt && (this.seizedTake.length > 0 || this.seizedCoin > 0)
        ? { items: this.seizedTake.map((s) => ({ ...s })),
            x: this.seizedAt.x, y: this.seizedAt.y, z: this.seizedAt.z,
            fuse: this.seizedFuse, coin: this.seizedCoin }
        : undefined,
      coinKept: this.coinKept > 0 ? this.coinKept : undefined,
      fencedTake: this.fencedTake.length > 0
        ? this.fencedTake.map((s) => ({ ...s })) : undefined,
      chalkMarks: [...this.chalkMarks].map(
        ([k, v]): [string, { x: number; y: number; z: number; yaw: number; label: string }] =>
          [k, { x: v.pos.x, y: v.pos.y, z: v.pos.z, yaw: v.yaw, label: v.label }]),
      deadHazards: [
        ...this.hazard.snares.filter((s) => !s.armed).map((s) => ({ room: s.room, kind: 'snare' as const, x: s.pos.x, z: s.pos.z })),
        ...this.hazard.steams.filter((s) => s.dead).map((s) => ({ room: s.room, kind: 'steam' as const, x: s.pos.x, z: s.pos.z })),
        ...this.hazard.fans.filter((f) => f.dead).map((f) => ({ room: f.room, kind: 'fan' as const, x: f.pos.x, z: f.pos.z })),
        ...this.hazard.watchers.filter((w) => w.dead || w.filed).map((w) => ({
          room: w.room, kind: 'eye' as const, x: w.pos.x, z: w.pos.z,
          dead: w.dead || undefined, filed: w.filed || undefined })),
      ],
      drainedRooms: [...this.drainedRooms],
      stockFiled: [...this.stockFiled],
      kickedWedges: this.kickedWedges.length > 0
        ? this.kickedWedges.map((w) => ({ ...w })) : undefined,
      droppedWraps: this.droppedWraps.length > 0
        ? this.droppedWraps.map((w) => ({ ...w })) : undefined,
      droppedCoils: this.droppedCoils.length > 0
        ? this.droppedCoils.map((w) => ({ ...w })) : undefined,
      droppedPouches: this.droppedPouches.length > 0
        ? this.droppedPouches.map((w) => ({ ...w })) : undefined,
      graftedWires: this.hazard.snares.some((s) => s.grafted || s.planted)
        ? this.hazard.snares.filter((s) => s.grafted || s.planted)
          .map((s) => ({ x: s.pos.x, z: s.pos.z, room: s.room, armed: s.armed, planted: s.planted,
            claimed: s.claimed })) : undefined,
      // sprint 430 — a live lure keeps its fuse through the save:
      // `t` is seconds left on the clock, re-timed at restore
      armedLures: this.lures.some((l) => !l.rang)
        ? this.lures.filter((l) => !l.rang)
          .map((l) => ({ x: l.pos.x, y: l.pos.y, z: l.pos.z,
            t: Math.max(0.5, l.until - this.clock.time) }))
        : undefined,
      closedCounters: [...this.closedCounters],
      stockSeen: [...this.stockSeen],
      answeredPhones: this.answeredPhones.size > 0 ? [...this.answeredPhones] : undefined,
      // the dangling receiver keeps its remaining fuse — a reload can't
      // un-arm a lure already planted (fuse = seconds until the line dies)
      offHook: this.offHookPhones.size > 0
        ? [...this.offHookPhones].map((key) => {
            const hr = this.hookRings.find((r) => r.key === key);
            return { key, x: hr?.pos.x ?? 0, z: hr?.pos.z ?? 0,
              fuse: hr ? Math.max(0, hr.until - this.clock.time) : 0 };
          })
        : undefined,
      dialedRings: this.hookRings.some((r) => r.dial)
        ? this.hookRings.filter((r) => r.dial).map((hr) => ({
            key: hr.key, x: hr.pos.x, z: hr.pos.z,
            fuse: Math.max(0, hr.until - this.clock.time),
          }))
        : undefined,
      snappedTraps: this.snappedTraps.size > 0 ? [...this.snappedTraps] : undefined,
      priedTraps: this.priedTraps.size > 0 ? [...this.priedTraps] : undefined,
      slippedRugs: this.slippedRugs.size > 0 ? [...this.slippedRugs] : undefined,
      slippedPuddles: this.slippedPuddles.size > 0 ? [...this.slippedPuddles] : undefined,
      evidence: this.hazard.evidence.filter((e) => !e.old).map((e) => ({
        room: e.room, kind: e.kind, t: e.t, x: e.pos.x, z: e.pos.z,
        readBy: [...e.readBy], weak: e.weak, wiped: e.wiped,
      })),
    };
  }

  /** Queue a loss-report with the count — while the boards name you,
   *  the books don't wait for the slow cycle: the ring answers on the
   *  spot (~4s, so a named face is still mid-exit when the lamp comes). */
  private queueLoss(x: number, z: number, caption: string): void {
    this.crewCount.push(x, z, this.clock.time,
      caption + (this.wantedActive ? ' — the boards already named you' : ''),
      this.wantedActive ? 4 : undefined);
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
    if (this.godMode) return; // insta-kills obey the flag too — entity kills bypass damagePlayer
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
        deathInfo: {
          cause: source, hint: DEATH_HINTS[source] ?? hint, entity: source,
          // the books stay open on a death — the tally outlives you
          books: {
            thefts: this.unpaidTheft, held: this.unpaidHeld, asks: this.paperTrail,
            hotCoin: this.hotImprints, hotGoods: this.hotItems.size,
            hotPages: this.hotMarginalia,
            seized: [...this.seizedTake, ...this.fencedTake].reduce((n, s) => n + s.count, 0),
            // dead — the live tag rots, so its listed coin is kept too
            coinKept: this.coinKept + this.seizedCoin,
            // sprint 500 — the floor keeps the loose take too: every
            // pile left lying reads at the end
            spilled: this.droppedPouches.reduce((n, w) => n + w.n + w.hot, 0)
              + this.droppedWraps.reduce((n, w) => n + w.n, 0)
              + this.kickedWedges.length + this.droppedCoils.length,
          },
        },
        documents: this.loadDocs(),
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
    useGameStore.setState({ phase: 'COMPLETE', victoryInfo: {
      stats: this.stats,
      // sprint 336 — the books close at the door: the ledgers accrue
      // all run and the exit reads them back. Nothing forgives at the
      // threshold — what you leave owing leaves with you as text.
      books: {
        thefts: this.unpaidTheft,
        held: this.unpaidHeld,
        asks: this.paperTrail,
        seized: [...this.seizedTake, ...this.fencedTake].reduce((n, s) => n + s.count, 0),
        // a live tag's listed coin rots with the goods at the door too
        coinKept: this.coinKept + this.seizedCoin,
        hotCoin: this.hotImprints,
        hotGoods: this.hotItems.size,
        hotPages: this.hotMarginalia,
        // sprint 500 — and what the floor kept: every pile left lying
        spilled: this.droppedPouches.reduce((n, w) => n + w.n + w.hot, 0)
          + this.droppedWraps.reduce((n, w) => n + w.n, 0)
          + this.kickedWedges.length + this.droppedCoils.length,
      },
    }, paused: true });
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
    // A hidden player is inside the spot's room — the AABB skirt overlaps
    // at seams and can pin them to the neighbour, which silences that
    // room's spawnScheduled forever (sprint 399).
    const hid = this.player.hiddenSpot;
    if (hid) {
      const hr = this.activeRooms().find((r) => r.index === hid.roomIndex);
      if (hr) return hr.index;
    }
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

  /** sprint 493-494 — a scatter target that lands inside a collider is
   *  an unreachable pile an entity could seek forever. Try the spray
   *  angle, then the three rotations; null means it stays put. */
  private scatterSpot(x: number, z: number, ang: number, r: number): { x: number; z: number } | null {
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const nx = x + Math.cos(ang + a) * r, nz = z + Math.sin(ang + a) * r;
      let blocked = false;
      for (const rm of this.activeRooms()) {
        for (const cb of rm.colliders) {
          if (cb.minY < 0.45 && aabbContainsPoint(cb, nx, 0.2, nz)) { blocked = true; break; }
        }
        if (blocked) break;
      }
      if (!blocked) return { x: nx, z: nz };
    }
    return null;
  }

  /** sprint 506 — a swinging leaf is a broom: loose goods inside its arc
   *  slide out along the leaf's own axis, away from the side they were
   *  already on. One shove per swing (the caller gates on `leafSwept`),
   *  collider-guarded like every other spill move. Space-keyed: under
   *  doors sweep coin and coils, main doors sweep felt and chocks. */
  private sweepSpillAtLeaf(d: Door): void {
    const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw);   // wall normal
    const tx = nz, tz = -nx;                            // the leaf's axis
    const lists: { x: number; z: number }[][] = this.space === 'under'
      ? [this.droppedPouches, this.droppedCoils]
      : [this.droppedWraps, this.kickedWedges];
    let moved = false;
    for (const list of lists) {
      for (const w of list) {
        const px = w.x - d.pos.x, pz = w.z - d.pos.z;
        const lat = px * tx + pz * tz;
        const thru = px * nx + pz * nz;
        if (Math.abs(lat) > 0.85 || Math.abs(thru) > 0.65) continue;
        const side = lat >= 0 ? 1 : -1;
        const ang = Math.atan2(tz * side, tx * side);
        const to = this.scatterSpot(w.x, w.z, ang, Math.max(0.2, 0.95 - Math.abs(lat)));
        if (!to) continue;
        w.x = to.x; w.z = to.z; moved = true;
      }
    }
    if (moved) {
      this.mintPouchDrops(); this.mintCoilDrops();
      this.mintWrapDrops(); this.mintWedgeDrops();
      this.sound.emit({ x: d.pos.x, y: 0.25, z: d.pos.z, intensity: 0.16,
        category: 'item', caption: '[the leaf sweeps the spill aside]' });
    }
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
          // The crew's doors read the boards — a named face's under
          // doors stick to three-fifths their swing. Once per door.
          let stick = this.space === 'under' && this.wantedActive ? 0.6 : 1;
          let pressed = false;
          // sprint 472 — a camped leaf is a held leaf: a watcher whose
          // posture at the crack is a lean puts its weight on the swing
          // too. Slower than the boards' stick — masonry is heavier
          // than paperwork.
          if (stick === 1) {
            for (const e of this.entities) {
              if (e.state === 'done' || !e.seamCamped?.(d.pos)) continue;
              stick = 0.45; pressed = true; break;
            }
          }
          if (pressed && !this.stuckAnnounced.has(`${d.id}-press`)) {
            this.stuckAnnounced.add(`${d.id}-press`);
            this.cue('door-locked', d.pos, '[the leaf drags — something is pressed against the far side]', 'warn');
          } else if (stick < 1 && !this.stuckAnnounced.has(d.id)) {
            this.stuckAnnounced.add(d.id);
            this.cue('door-locked', d.pos, '[the crew\'s door reads the boards — it sticks]', 'warn');
          }
          d.openT = Math.min(1, d.openT + dt * 1.8 * (d.openRate ?? 1) * stick);
          // Roused encounters pre-spawn as soon as the leaf has swung —
          // the thing beyond is live before the player crosses in.
          if (d.openT >= 0.6 && !this.rousedSpawned.has(d.id)) {
            this.rousedSpawned.add(d.id);
            this.spawnRousedThrough(d);
          }
          // sprint 506 — the leaf sweeps the pile: a swinging leaf is a
          // broom — loose goods in its arc slide laterally clear, one
          // shove per swing, never into a collider.
          if (d.openT >= 0.35 && !this.leafSwept.has(d.id)) {
            this.leafSwept.add(d.id);
            this.sweepSpillAtLeaf(d);
          }
        } else if (!d.opening && d.openT > 0) {
          d.openT = Math.max(0, d.openT - dt * 2.2);
          if (d.openT <= 0) this.leafSwept.delete(d.id); // re-arm for the next swing
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
    // The house teaches — first-exposure captions on the verbs nothing
    // tells you about: soft feet, loud feet, cover, nerves, the dark.
    if (this.player.crouching) this.teach('crouch', '[low and slow — soft feet, quiet doors]');
    if (this.keys.has(this.keyFor('sprint')) && !this.player.crouching) this.teach('sprint', '[running is loud — the house hears fast feet]');
    if (this.player.panic > 0.5) this.teach('panic', '[your hands are shaking — panic throws you out of cover]');
    const curTeach = this.activeRooms()[this.currentRoom];
    if (curTeach?.darkRoom) this.teach('dark', '[the dark keeps its own things — some of them are places to hide]');
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

    // the wanted sheets: once a clerk's ledger names you the boards
    // downstream take your face; settling pulls them back down
    if (this.wantedActive && this.unpaidTheft <= 0) this.lowerWanted();
    else if (!this.wantedActive && this.unpaidTheft > 0 && this.space === 'under') {
      for (const e of this.entities) {
        if (e instanceof Auditor && e.demanded) { this.raiseWanted(); break; }
      }
    }
    // the boards stand bare — the clerk reaches for fresh paper and the
    // sheets go back up on new boards downstream (the tug-of-war: every
    // repost is another trip to another board for the tearer)
    else if (this.wantedActive && this.bareBoards.size > 0 && this.space === 'under'
      && this.clock.time >= this.wantedRepostT && this.wantedRepostT > 0) {
      // the repost walks now — a clerk carries the fresh paper to each
      // torn board and re-pins the same slot; only an impossible path
      // posts instantly, and a walk already out answers on the next round
      const hosts = [...this.bareBoards.entries()].map(([roomIdx, h]) => ({ roomIdx, x: h.x, z: h.z }));
      if (this.route && this.reposter.dispatch(this.route.underRooms, hosts, this.reposterHooks())) {
        this.wantedRepostT = 0;
      } else if (this.reposter.active) {
        this.wantedRepostT = this.clock.time + 12;
      } else {
        for (const [roomIdx, h] of this.bareBoards) this.wantedRooms.set(roomIdx, { x: h.x, z: h.z });
        this.bareBoards.clear();
        this.wantedRepostT = 0;
        this.cue('chalk-mark', null, '[fresh sheets go up on the boards ahead — the clerk has more paper]', 'warn');
      }
    }

    // the tag rots — the count fences an unclaimed locker when its
    // ink dries. The fading is told while it can still be answered
    if (this.seizedTake.length > 0) {
      this.seizedFuse -= dt;
      if (!this.seizedFading && this.seizedFuse <= SEIZED_FADE_S) {
        this.seizedFading = true;
        this.cue('chalk-mark', this.seizedAt, "[the tag's ink is fading — the count prices patience]", 'warn');
      }
      if (this.seizedFuse <= 0) {
        // the count doesn't eat them — they reach the Broker's shelf,
        // buyable back at the house's own margin. Coin doesn't fence —
        // it's fungible; the count simply keeps it.
        this.fencedTake.push(...this.seizedTake);
        this.coinKept += this.seizedCoin;
        this.seizedCoin = 0;
        this.seizedTake = [];
        this.seizedAt = null;
        this.seizedFading = false;
        this.dynamicInteractables = this.dynamicInteractables.filter((x) => !x.id.startsWith('seized-'));
        this.cue('chalk-mark', null, '[the tag reads settled — the count keeps the goods for its shelf]', 'warn');
      }
    }

    for (const i of this.streamer.builtIndices) {
      const built = this.streamer.get(i);
      if (!built) continue;
      this.ensureWanted(i, built);
      this.ensurePrimedSpill(i, built);
      const spill = this.spillMeshes.get(i);
      if (spill?.parent) (spill.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(this.clock.time * 1.6 + i * 1.9);
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
      this.ensureClerk(i);
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
      // Draft motes — the seam blows cold air under a watched door:
      // particles slide inward along the door's inward axis, wrapping a
      // short run, swaying slightly across the gap.
      if (built.draft) {
        const pos = built.draft.geometry.getAttribute('position') as THREE.BufferAttribute;
        const dirx = built.draft.userData.dirx as number;
        const dirz = built.draft.userData.dirz as number;
        const ox = built.draft.userData.ox as number;
        const oz = built.draft.userData.oz as number;
        const speeds = built.draft.userData.speeds as Float32Array;
        const phases = built.draft.userData.phases as Float32Array;
        const spread = built.draft.userData.spread as Float32Array;
        const px = -dirz, pz = dirx;
        for (let pi = 0; pi < pos.count; pi++) {
          const dist = (t * speeds[pi] + phases[pi] * 0.55) % 0.55;
          const lat = spread[pi] * (1 + 0.3 * Math.sin(t * 3 + pi));
          pos.setX(pi, ox + dirx * dist + px * lat);
          pos.setZ(pi, oz + dirz * dist + pz * lat);
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
        } else if (kind === 'spinZ') {
          // wall-mounted rotors — the face axis, not the floor normal;
          // powered on the room's mains like any fixture
          o.rotation.z += dt * ((o.userData.animSpeed as number) ?? 2.2) * deviceMul;
        } else if (kind === 'ember') {
          // a banked coal — breathes slow enough to doubt: long low swells,
          // the odd brighter lick, no rhythm a watch can settle into
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const breath = Math.sin(t * 0.6 + s) * 0.5 + Math.sin(t * 0.23 + s * 1.7) * 0.5;
          const lick = Math.max(0, Math.sin(t * 2.9 + s * 3.3)) ** 4 * 0.35;
          mat.emissiveIntensity = 0.55 + Math.max(0, breath) * 0.55 + lick;
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
        if (o.userData.broker || o.userData.clerk) {
          const head = (o.userData.figureParts as Record<string, THREE.Object3D>).head;
          // The clerk only turns its head for the house's own sounds:
          // a fresh ring draws its eye to the bell for ~3.5s (the lure
          // landing visibly), and after the rifle it ignores the bell
          // entirely — the cold counter's face finds your hands.
          let tx = this.player.pos.x, tz = this.player.pos.z;
          // sprint 359 — a filed face is a known face: warm clerks
          // watch the register's mark, not their own bell
          let watches = o.userData.broker === true
            || this.closedCounters.has(o.userData.clerkRoomIndex as number)
            || (o.userData.clerk === true && this.unpaidHeld > 0);
          if (o.userData.clerk === true && !watches) {
            const rung = this.bellRung.get(o.userData.clerkRoomIndex as number);
            if (rung && this.clock.time - rung.t < 3.5 && this.unpaidHeld === 0) {
              tx = rung.x; tz = rung.z; watches = true;
            } else if (this.hotItems.size > 0
                && this.inventory.some((i) => this.hotItems.has(i.id) && i.count > 0)) {
              // sprint 331 — the till's stock testifies: carried goods
              // still read as the clerk's own shelf — its eye finds the
              // take on you, and the first read pings where you stand.
              watches = true;
              const rIdx = o.userData.clerkRoomIndex as number;
              if (!this.stockSeen.has(rIdx)) {
                this.stockSeen.add(rIdx);
                this.sound.emit({ x: this.player.pos.x, y: 1, z: this.player.pos.z,
                  intensity: 0.4, category: 'distraction',
                  caption: "[the till's stock answers for itself]" });
                this.cue('drawer', this.player.pos,
                  '[the clerk reads its own stock on you — the till wares tell]', 'warn');
              }
            }
          }
          if (head && watches) {
            const dx = tx - o.position.x;
            const dz = tz - o.position.z;
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
  /** Rooms each book has already muttered in — once per room per book. */
  private readonly murmured = new Set<string>();
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
  /** sprint 467 — a called leaf mouths back a breath later, once the
   *  whisper has had time to reach whatever heard it in the far room. */
  private seamAnswer: { t: number; x: number; z: number } | null = null;
  /** sprint 470 — the seam reaches: while you hold a crack verb on a
   *  leaf a grab-capable watcher is pressed against, fingers work
   *  under. Key = the held verb id; t = when the warn becomes a yank.
   *  s474 — the hand lingers a breath after the warn so the seam can
   *  offer the stamp. */
  private seamReach: { key: string; doorId: string; door: Door; t: number; lingerUntil: number; reacher: Entity } | null = null;
  /** sprint 474 — doors whose fingers you stamped off, until they
   *  reach under again (a stamp buys ~8s of leaf, not the room). */
  private seamReachCd = new Map<string, number>();
  /** sprint 471 — the stone comes back: a slipped pebble that lands
   *  within reach of a live watcher gets rolled under the leaf again,
   *  a breath later, at your lip of the seam. */
  private pebbleBack: { t: number; x: number; z: number } | null = null;
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

  /** The boards' noise tax — every lure-sound you control pulls half
   *  again as far while the sheets name you (s434; planted lures and
   *  thrown/rung lures alike, s436). */
  private get wantedPull(): number {
    return this.wantedActive ? 1.5 : 1;
  }

  private tossPebble(): void {
    if (this.clock.time < this.nextToss) return;
    this.nextToss = this.clock.time + 8;
    const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
    const x = this.player.pos.x + fx * 3.5;
    const z = this.player.pos.z + fz * 3.5;
    this.audio.play('pebble', { x, y: 0.1, z }, '');
    this.sound.emit({ x, y: 0.1, z, intensity: 0.45 * this.wantedPull, category: 'distraction', caption: '' });
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

  /** Kill the n-th television group in room i — the channel goes dark. */
  private untuneTVAt(i: number, n: number): void {
    let seen = -1;
    this.worldGroup.traverse((o) => {
      if (o.name !== `tv-${i}`) return;
      seen += 1;
      if (seen === n) o.traverse((x) => { if (x.userData.anim === 'tv-live') x.userData.anim = 'screen'; });
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
  private deadTVs = new Set<string>();
  private woundClocks = new Set<string>();
  private crackedVents = new Set<string>();
  private steamMasks: { pos: Vec3; until: number }[] = [];
  private steamJets: { pts: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.PointsMaterial; base: THREE.Vector3; until: number; data: { a: number; r: number; y: number; v: number }[] }[] = [];
  private nextHiss = 0;
  private litHearths = new Set<string>();
  private answeredPhones = new Set<string>();
  // sprint 400 — the receiver stays off: an answered phone can be left
  // dangling; the line rings it back loud enough to pull whoever listens.
  // The player's only planted lure besides the desk bell — longer fuse,
  // placed wherever the house hung a phone.
  private offHookPhones = new Set<string>();
  private spentPhones = new Set<string>();
  private hookRings: { key: string; pos: Vec3; at: number; until: number; lastRing: number; dial?: boolean }[] = [];
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
    // sprint 402 — the house rings live phones only: a receiver already
    // answered, off the hook, or rung out has nothing left to ring.
    const phoneOrd = (room.spec?.props.slice(0, room.spec.props.indexOf(prop))
      .filter((p) => p.kind === 'payphone').length) ?? 0;
    const pkey = `${this.space}:${room.index}:${phoneOrd}`;
    if (this.answeredPhones.has(pkey) || this.offHookPhones.has(pkey) || this.spentPhones.has(pkey)
      || this.hookRings.some((hr) => hr.key === pkey)) return;
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

  /** The books mutter — a deep ledger makes its home rooms whisper. Once per
   *  room per book: the register rustles where its desks live (a clerked
   *  counter or a desk-family room), the tally/index murmur in the under
   *  halls, and a named face makes the boards themselves lean. Fiction only
   *  — every murmur is gated on real book state, never invented. */
  private maybeMutter(under: boolean): void {
    const room = this.activeRooms()[this.currentRoom];
    if (!room || !room.spec || room.spec.special) return;
    if (this.currentRoom < 6) return;
    const mutter = (book: string, text: string) => {
      const k = `${under ? 'u' : 'm'}:${this.currentRoom}:${book}`;
      if (this.murmured.has(k)) return;
      this.murmured.add(k);
      this.cue('whisper', null, text, 'info');
    };
    if (under) {
      if (this.unpaidTheft >= 2) {
        mutter('tally', "[the tally's ink hasn't dried — the under counts you]");
      }
      if (this.paperTrail >= 3) {
        mutter('index', "[the index keeps your questions — the clerks' hands stop when you pass]");
      }
      if (this.wantedActive) {
        mutter('boards', '[the boards have your face — the halls lean when you pass]');
      }
    } else if (this.unpaidHeld >= 2
      && (room.sockets.some((s) => s.meta.clerk !== undefined)
        || room.biome === 'records' || room.biome === 'lobby')) {
      mutter('register', "[the register's pages rustle at the desks — your name is in them]");
    }
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

  /** The night clerk — a masked house-staff figure behind reception
   *  counters, the Broker's upstairs twin: porcelain service-face,
   *  amber eyes, no hood. Spawned lazily when a clerked room builds. */
  private readonly clerkFigs = new Map<number, THREE.Object3D>();
  /** Counters that already read you their page — one ask per clerk. */
  private readonly clerkAsked = new Set<number>();
  /** Desk-bell cooldowns: roomIndex -> clock.time of the last ring. */
  private readonly bellRung = new Map<number, { t: number; x: number; z: number }>();
  /** Staffed counters that watched you rifle the till — closed to you. */
  private readonly closedCounters = new Set<number>();
  /** sprint 329 — the till's coin is marked: rifled imprints testify
   *  each time a hot coin lands in a house till. The under's trades
   *  (the Broker's purse) take marked coin without asking — a wash. */
  private hotImprints = 0;
  /** sprint 331 — the till's stock is marked too: the ids a rifled
   *  till paid out in goods. A warm clerk reads its own stock on you
   *  (the eye finds the take); the Broker fences it clean off. */
  private readonly hotItems = new Set<ItemId>();
  /** Rooms whose clerk already read the marked stock — one ping each. */
  private readonly stockSeen = new Set<number>();

  /** Spend imprints at a house service — the marked coin goes first,
   *  and each hot coin that lands testifies twice: it rings where it
   *  fell AND the till files the hands that fed it into the register.
   *  Only the house's services testify; the under answers to different
   *  books (the purse launders silently, for the asking's price). */
  private chargedImprints(n: number, x: number, z: number): void {
    this.imprints -= n;
    const hot = Math.min(n, this.hotImprints);
    if (hot <= 0) return;
    this.hotImprints -= hot;
    this.unpaidHeld += 1;
    this.sound.emit({ x, y: 1, z, intensity: 0.5, category: 'distraction',
      caption: '[a marked coin rings where it lands]' });
    this.cue('machine', v3(x, 1, z),
      '[the till knows its own coin — the register files the hands that fed it]', 'warn');
  }

  /** sprint 409 — the under's coin is marked too: marginalia off a
   *  pilfered book or satchel is torn-edged, and every hot page that
   *  lands in an under till testifies — the index files the hands that
   *  fed it, the way the house's register files a marked imprint. */
  private hotMarginalia = 0;

  /** Spend marginalia at an under service — the marked pages go first,
   *  and each one that lands files a question at the index. */
  private chargedMarginalia(n: number, x: number, z: number): void {
    this.marginalia -= n;
    const hot = Math.min(n, this.hotMarginalia);
    if (hot <= 0) return;
    this.hotMarginalia -= hot;
    this.fileQuestion();
    this.sound.emit({ x, y: 1, z, intensity: 0.45, category: 'distraction',
      caption: '[a torn edge lands where it fell]' });
    this.cue('machine', v3(x, 1, z),
      '[the book knows its own pages — the index files the hands that fed it]', 'warn');
  }

  /** The marked-stock pool only testifies while its units are still
   *  carried — the last unit consumed drops the mark, so a fresh clean
   *  ware of that id is never the take. Pruned per frame; the pool is
   *  a handful of ids, the scan is trivial. */
  private pruneHotMarks(): void {
    for (const id of this.hotItems) {
      if (!this.inventory.some((i) => i.id === id && i.count > 0)) this.hotItems.delete(id);
    }
  }

  private ensureClerk(roomIndex: number): void {
    if (this.space !== 'main' || this.clerkFigs.has(roomIndex)) return;
    const room = this.activeRooms()[roomIndex];
    if (!room || !room.sockets.some((s) => s.meta.clerk !== undefined)) return;
    const counter = room.spec?.props.find((p) => p.kind === 'counter');
    if (!counter) return;
    const fig = tallFigure({ height: 1.85, body: MAT.shadowFigure(), face: 'mask', eyes: 'amber' });
    const yaw = room.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const lx = counter.x, lz = counter.z + 1.15;
    const wx = room.origin.x + lx * cos + lz * sin;
    const wz = room.origin.z - lx * sin + lz * cos;
    fig.position.set(wx, room.origin.y, wz);
    fig.rotation.y = Math.atan2(room.entryPos.x - wx, room.entryPos.z - wz);
    fig.userData.clerk = true;
    fig.userData.clerkRoomIndex = roomIndex;
    this.entityGroup.add(fig);
    this.clerkFigs.set(roomIndex, fig);
    // first sighting — the house has staff too, and they wear the same face
    const greet = this.streams.roomStream('scare', roomIndex + 883);
    if (greet.bool(0.5)) {
      this.cue('custodian-bell', fig.position as unknown as Vec3,
        '[a clerk stands behind the counter — it was not there a moment ago]', 'info');
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
    this.pruneHotMarks();

    // sprint 483 — the spill advertises: coin is the loud material. A
    // dropped pouch ticks on stone on a slow cadence — an unsourced,
    // house-hearable sound: your spill can rouse what sleeps, and the
    // scavenger race is run against a clock you can hear. Wire, felt
    // and wood stay silent; piles take turns ticking.
    this.spillTickT -= dt;
    if (this.spillTickT <= 0) {
      this.spillTickT = 2.6;
      const piles = this.droppedPouches;
      if (piles.length) {
        this.spillTickI = (this.spillTickI + 1) % piles.length;
        const pile = piles[this.spillTickI];
        this.sound.emit({ x: pile.x, y: 0.3, z: pile.z, intensity: pile.bait ? 0.3 : 0.22,
          category: 'item', caption: pile.bait
            ? '[the bait rings a touch louder than the spill]' : '[your coin ticks somewhere]' });
      }
    }

    // sprint 493 — a pile is physical: sprint through your own spill and
    // the coin kicks apart. It splits into two scatter-piles and rings —
    // a REAL sound the house can hear. Careless speed spends your floor.
    // sprint 496 — the boot works upstairs too: loose felt and chocks
    // scatter under the same stride, and the scuff leaves 'work' sign
    // the floorkeeper reads (a kicked pile still wants tidying).
    this.spillKickCd -= dt;
    if (this.spillKickCd <= 0
      && this.player.lastMoveSpeed > PLAYER.walkSpeed + 0.5
      && !this.player.crouching) {
      const px = this.player.pos.x, pz = this.player.pos.z;
      const kickAng = (w: { x: number; z: number }) =>
        ((w.x * 12.9898 + w.z * 78.233) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (this.space === 'under') {
        for (let i = 0; i < this.droppedPouches.length; i++) {
          const w = this.droppedPouches[i];
          if (Math.hypot(w.x - px, w.z - pz) < 0.4) {
            this.droppedPouches.splice(i, 1);
            this.spillKickCd = 0.7;
            // deterministic scatter — the pile's own coords pick the spray
            const ang = kickAng(w);
            const hot0 = w.hot, clean0 = w.n;
            const mk = (a: number, r: number, n: number, hot: number) => {
              if (n <= 0 && hot <= 0) return;
              const to = this.scatterSpot(w.x, w.z, a, r);
              if (!to) { this.droppedPouches.push({ ...w, n, hot }); return; }
              this.droppedPouches.push({ x: to.x, z: to.z, n, hot, bait: w.bait });
            };
            if (clean0 + hot0 <= 1) mk(ang, 0.55, clean0, hot0); // a lone coin slides
            else {
              mk(ang, 0.45, Math.ceil(clean0 / 2), Math.ceil(hot0 / 2));
              mk(ang + Math.PI, 0.6, Math.floor(clean0 / 2), Math.floor(hot0 / 2));
            }
            this.mintPouchDrops();
            this.sound.emit({ x: w.x, y: 0.3, z: w.z, intensity: 0.4 * this.wantedPull,
              category: 'item', caption: '[your coin scatters across the boards]' });
            this.cue('pickup', v3(w.x, 0.3, w.z), '[you kick through your own spill]', 'warn');
            break;
          }
        }
      } else if (this.space === 'main'
        && (this.droppedWraps.length || this.kickedWedges.length)) {
        let kicked: { x: number; z: number } | null = null;
        for (const w of this.droppedWraps) {
          if (Math.hypot(w.x - px, w.z - pz) < 0.4) {
            kicked ??= { x: w.x, z: w.z };
            const to = this.scatterSpot(w.x, w.z, kickAng(w), 0.5);
            if (to) { w.x = to.x; w.z = to.z; }
          }
        }
        for (const w of this.kickedWedges) {
          if (Math.hypot(w.x - px, w.z - pz) < 0.4) {
            kicked ??= { x: w.x, z: w.z };
            const to = this.scatterSpot(w.x, w.z, kickAng(w), 0.6);
            if (to) { w.x = to.x; w.z = to.z; }
          }
        }
        if (kicked) {
          this.spillKickCd = 0.7;
          this.mintWrapDrops(); this.mintWedgeDrops();
          this.hazard.evidence.push({ pos: v3(px, 0, pz), room: this.currentRoom,
            kind: 'work', t: this.clock.time, readBy: ['player'] });
          this.sound.emit({ x: kicked.x, y: 0.3, z: kicked.z, intensity: 0.38 * this.wantedPull,
            category: 'item', caption: '[the loose goods scatter under your stride]' });
          this.cue('pickup', v3(kicked.x, 0.3, kicked.z), '[you boot the pile as you pass]', 'warn');
        }
      }
    }

    // sprint 498 — the tide takes the spill: a pile left in a flooded
    // room drifts with the water. Slow, deterministic per-room pull,
    // collider-guarded, and it stops at the dry edge. Drain the room
    // and the spill settles where the water left it — the under reclaims
    // slowly, never re-lays.
    this.spillTideT -= dt;
    if (this.spillTideT <= 0 && (this.droppedPouches.length || this.droppedCoils.length)) {
      this.spillTideT = 0.5;
      let drifted: { x: number; z: number } | null = null;
      // sprint 504 — the tide takes the coil too: every loose kind on the
      // under floor rides the water, not just the coin.
      for (const w of [...this.droppedPouches, ...this.droppedCoils]) {
        const rm = this.route?.underRooms.find((r) =>
          Math.abs(w.x - r.origin.x) <= r.width / 2 && Math.abs(w.z - r.origin.z) <= r.depth / 2);
        if (!rm?.flooded || this.drainedRooms.has(`under:${rm.index}`)) continue;
        // the room's own coords pick the pull — deterministic like the kick
        const ang = ((rm.origin.x * 12.9898 + rm.origin.z * 78.233) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const nx = w.x + Math.cos(ang) * 0.028, nz = w.z + Math.sin(ang) * 0.028;
        // it stops at the dry edge and never drifts into furniture
        if (Math.abs(nx - rm.origin.x) > rm.width / 2 || Math.abs(nz - rm.origin.z) > rm.depth / 2) continue;
        let blocked = false;
        for (const cb of rm.colliders)
          if (cb.minY < 0.45 && aabbContainsPoint(cb, nx, 0.2, nz)) { blocked = true; break; }
        if (blocked) continue;
        w.x = nx; w.z = nz;
        drifted ??= { x: nx, z: nz };
      }
      if (drifted) {
        this.mintPouchDrops(); this.mintCoilDrops(); // the verbs ride the moving pile
        // the water tells on it — faint, near-ear only
        if (v3dist(v3(drifted.x, 0, drifted.z), this.player.pos) < 4 && this.spillTideCueT <= 0) {
          this.spillTideCueT = 2.6;
          this.sound.emit({ x: drifted.x, y: 0.15, z: drifted.z, intensity: 0.12,
            category: 'item', caption: '[coin slides in the water]' });
        }
      }
    }
    this.spillTideCueT -= dt;

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
      this.maybeMutter(false);
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
        this.maybeMutter(true);
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
      // a held leaf answers the tug too — your wire or chock is real
      // cover against the haunting, not just the crew
      const door = room?.doors.find((d) => !d.locked && !d.heldBy);
      if (door) {
        door.opening = true;
        this.cue('door-open', { x: door.pos.x, y: door.pos.y + 1, z: door.pos.z }, '[the door opens again]', 'warn');
        this.sound.emit({ x: door.pos.x, y: 1, z: door.pos.z, intensity: 0.5, category: 'door', caption: '[door]' });
      } else if (room?.doors.some((d) => d.heldBy && !d.locked)) {
        this.cue('door-locked', { x: room.origin.x, y: 1, z: room.origin.z },
          '[something tugs at the leaf — your work holds]', 'warn');
      }
    }

    // Elsewhere sounds — queued on room entry; spatialized so they read distant.
    if (this.pendingFarSound && tA >= this.pendingFarSound.at) {
      const fs = this.pendingFarSound;
      this.pendingFarSound = null;
      this.cue(fs.cue, fs.pos, fs.caption, 'info');
    }

    // sprint 467 — the seam mouths back: the answer comes a breath after
    // the call, an entity-cue whisper at the leaf that nothing can hear
    // but you — the scare is the information.
    if (this.seamAnswer && tA >= this.seamAnswer.t) {
      const sa = this.seamAnswer;
      this.seamAnswer = null;
      this.cue('whisper', { x: sa.x, y: 0.15, z: sa.z }, '[something mouths back through the crack — it heard the whisper]', 'warn');
      this.sound.emit({ x: sa.x, y: 0.15, z: sa.z, intensity: 0.3, category: 'entity-cue', caption: '' });
    }

    // sprint 471 — the stone comes back: the pebble returns a breath
    // after the slip, tapped under YOUR lip of the seam — a real tap
    // in your room: you learn the leaf is pressed, the room hears it too
    if (this.pebbleBack && tA >= this.pebbleBack.t) {
      const pb = this.pebbleBack;
      this.pebbleBack = null;
      this.cue('pebble', { x: pb.x, y: 0.1, z: pb.z }, '[a stone rolls back under the crack — the far side did not want the gift]', 'warn');
      this.sound.emit({ x: pb.x, y: 0.1, z: pb.z, intensity: 0.45 * this.wantedPull, category: 'distraction', caption: '' });
    }

    // Wind-up alarms — tick loud enough to pull sound-hunters, then ring once.
    // sprint 434 — the boards listen for YOUR noise too: while the
    // sheets name you, every sound you planted pulls half again as
    // far — a lure works better and betrays you harder, same tax the
    // filings take.
    const wantedPull = this.wantedPull;
    for (const lure of this.lures) {
      if (tA < lure.nextTick) continue;
      lure.nextTick = tA + 1.2;
      if (tA < lure.until) {
        this.cue('alarm-tick', lure.pos, '', 'info');
        this.sound.emit({ x: lure.pos.x, y: lure.pos.y, z: lure.pos.z, intensity: 0.9 * wantedPull, category: 'distraction', caption: '' });
      } else if (!lure.rang) {
        lure.rang = true;
        this.cue('alarm-ring', lure.pos, '[the alarm rings — somewhere else]', 'info');
        this.sound.emit({ x: lure.pos.x, y: lure.pos.y, z: lure.pos.z, intensity: 1.6 * wantedPull, category: 'distraction', caption: '[alarm ringing]' });
      } else {
        this.entityGroup.remove(lure.mesh);
      }
    }
    this.lures = this.lures.filter((l) => !l.rang || tA < l.until + 2.5);
    this.mintAlarmDrops();

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

    // sprint 404 — the trap doesn't care whose foot: a walker crossing a
    // live trap eats the same snap — staggered mid-stride, loud enough
    // that everything else hears the room has teeth.
    for (const tp of this.liveTraps) {
      if (this.snappedTraps.has(tp.key)) continue;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - tp.x, edz = epos.z - tp.z;
        if (edx * edx + edz * edz >= 0.55 * 0.55) continue;
        this.snappedTraps.add(tp.key);
        ent.stagger(1.7);
        const at = { x: tp.x, y: 0.05, z: tp.z };
        this.audio.play('trap-snap', at, '[the trap fires — it found a foot that was not yours]', 'warn');
        this.sound.emit({ x: tp.x, y: 0.1, z: tp.z, intensity: 0.55, category: 'footstep', caption: '[a trap fires]' });
        break;
      }
    }

    // sprint 405 — the wire doesn't care whose foot either: a walker
    // crossing an armed paper seal trips it like you would — rooted a
    // beat, loud, and the sprung wire leaves fresh sign where it fell.
    // Entities have no crouch: a submerged wire trips an upright stride
    // it could never feel for.
    for (const hz of this.hazard.snares) {
      if (!hz.armed) continue;
      let tripper: Entity | null = null;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - hz.pos.x, edz = epos.z - hz.pos.z;
        if (edx * edx + edz * edz < 0.7 * 0.7) { tripper = ent; break; }
      }
      if (!tripper) continue;
      hz.armed = false;
      this.hazard.evidence.push({ pos: v3(hz.pos.x, 0, hz.pos.z), room: hz.room, kind: 'wire', t: this.clock.time, readBy: [] });
      tripper.stagger(1.6);
      this.audio.play('trap-snap', { x: hz.pos.x, y: 0.2, z: hz.pos.z },
        '[paper screams — a foot that was not yours]', 'warn');
      this.sound.emit({ x: hz.pos.x, y: 0.4, z: hz.pos.z, intensity: 0.8, category: 'impact', caption: '[paper snare]' });
    }

    // sprint 406 — the floor slides under his stride too: a walker
    // crossing a loose rug or a wet floor loses his footing like you
    // do — one trip each, and the stumble carries to the next room.
    for (const rg of this.liveRugs) {
      if (this.slippedRugs.has(rg.key)) continue;
      let tripped = false;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - rg.x, edz = epos.z - rg.z;
        if (edx * edx + edz * edz >= 0.85 * 0.85) continue;
        this.slippedRugs.add(rg.key);
        ent.stagger(1.2);
        this.audio.play('rug-slide', { x: rg.x, y: 0.05, z: rg.z },
          '[the rug slides — a stride that was not yours]', 'warn');
        this.sound.emit({ x: rg.x, y: 0.1, z: rg.z, intensity: 0.3, category: 'footstep', caption: '[a stumble]' });
        tripped = true;
        break;
      }
      if (tripped) continue;
    }
    for (const pd of this.livePuddles) {
      if (this.slippedPuddles.has(pd.key)) continue;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - pd.x, edz = epos.z - pd.z;
        if (edx * edx + edz * edz >= 0.8 * 0.8) continue;
        this.slippedPuddles.add(pd.key);
        ent.stagger(1.5);
        this.audio.play('puddle-splash', { x: pd.x, y: 0.05, z: pd.z },
          '[the floor takes his feet — water everywhere]', 'warn');
        this.sound.emit({ x: pd.x, y: 0.1, z: pd.z, intensity: 0.45, category: 'footstep', caption: '[a splash]' });
        break;
      }
    }

    // sprint 407 — the blast, the blades, and the amber water don't
    // check whose shoulders they take either: a walker inside a firing
    // steam vent, under a live belt-wheel, or wading live water is
    // staggered like standing flesh is cut — one lurch per source, and
    // the bite carries to the next room.
    const curRoomIdx = this.activeRooms()[this.currentRoom]?.index;
    for (const pu of this.hazard.puddles) {
      if (pu.room !== curRoomIdx) continue;
      const rm = this.activeRooms().find((r) => r.index === pu.room);
      if (!rm?.flooded || this.drainedRooms.has(`${this.space}:${pu.room}`)) continue;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - pu.pos.x, edz = epos.z - pu.pos.z;
        if (edx * edx + edz * edz >= pu.radius * pu.radius) continue;
        ent.stagger(0.4);
        if (tA - (pu.entT ?? -10) > 3) {
          pu.entT = tA;
          this.audio.play('steam-hiss', { x: pu.pos.x, y: 0.2, z: pu.pos.z },
            '[the water crackles — something else is in it]', 'warn');
          this.sound.emit({ x: pu.pos.x, y: 0.2, z: pu.pos.z, intensity: 0.45, category: 'machine', caption: '[the water arcs]' });
        }
        break;
      }
    }
    for (const st of this.hazard.steams) {
      if (st.dead || st.room !== curRoomIdx || st.phase >= 1.8) continue;
      if (tA - (st.entT ?? -1) <= 1.6) continue;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - st.pos.x, edz = epos.z - st.pos.z;
        if (edx * edx + edz * edz >= 1.3 * 1.3) continue;
        st.entT = tA;
        ent.stagger(0.9);
        this.audio.play('steam-hiss', { x: st.pos.x, y: 0.5, z: st.pos.z },
          '[the blast takes his shoulders — a scalding that was not yours]', 'warn');
        this.sound.emit({ x: st.pos.x, y: 0.5, z: st.pos.z, intensity: 0.5, category: 'machine', caption: '[a line vents]' });
        break;
      }
    }
    for (const f of this.hazard.fans) {
      if (f.dead || f.room !== curRoomIdx) continue;
      if (tA - (f.entT ?? -1) <= 1.4) continue;
      for (const ent of this.entities) {
        if (ent.state === 'done') continue;
        const epos = ent.threatPos();
        if (!epos) continue;
        const edx = epos.x - f.pos.x, edz = epos.z - f.pos.z;
        if (edx * edx + edz * edz >= 1.0) continue;
        f.entT = tA;
        ent.stagger(1.2);
        this.audio.play('steam-hiss', { x: f.pos.x, y: 1.2, z: f.pos.z },
          '[the wheel bites — a shoulder that was not yours]', 'warn');
        this.sound.emit({ x: f.pos.x, y: 1.2, z: f.pos.z, intensity: 0.55, category: 'machine', caption: '[the wheel bites]' });
        break;
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
        // sprint 395 — the glass answers both ways: any walker under the
        // fall staggers mid-stride while it gathers itself. Bait a threat
        // under a live chain, ring the room, and dodge the 0.35s beat —
        // you share the same glass if you're still beneath it.
        let glassed = 0;
        for (const ent of this.entities) {
          if (ent.state === 'done') continue;
          const tp = ent.threatPos();
          if (!tp) continue;
          const edx = tp.x - d.x, edz = tp.z - d.z;
          if (edx * edx + edz * edz >= 2.25) continue;
          ent.stagger(5);
          glassed++;
        }
        if (glassed > 0) this.cue('chandelier-fall', v3(d.x, 1.4, d.z), "[the house's own glass finds him]", 'warn');
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
        // sprint 441 — the lens is in the room, not the walls: a shut leaf
        // (or the wall itself) between it and you is cover. Cameras never
        // sight-checked before — an adjacent room's eye reported you
        // through the party wall.
        {
          // sprint 454 — the mount sits 0.07 inside the room edge while
          // the wall collider's inner face reaches ~0.12 in: the ray
          // starts inside its own wall and never clears it. The lens
          // reads from just off the wall — a dome's glass is forward of
          // its bracket, not inside the plaster.
          const cx = room ? room.origin.x - this.tmpV3.x : 0;
          const cz = room ? room.origin.z - this.tmpV3.z : 0;
          const cl = Math.hypot(cx, cz) || 1;
          const camFrom = v3(this.tmpV3.x + (cx / cl) * 0.18, this.tmpV3.y,
            this.tmpV3.z + (cz / cl) * 0.18);
          const pEye = v3();
          this.player.eyePos(pEye);
          const blockers = (room ? room.losBlockers : []).concat(
            shutLeafBlockers(this.activeRooms(), camFrom, pEye));
          if (!hasLineOfSight(camFrom, pEye, blockers)) { cm.expo = 0; continue; }
        }
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
        if (t2 > 6) { this.draining.delete(idx); this.drainedSpots.delete(idx); }
        else this.draining.set(idx, t2);
      }
      // sprint 499 — the surge: while the water leaves, it takes what
      // it was keeping afloat. Spilled coin drags toward the crank and
      // settles there — the drain is where the tide ends.
      if (this.droppedPouches.length || this.droppedCoils.length) {
        for (const [idx] of this.draining) {
          const spot = this.drainedSpots.get(idx);
          if (!spot) continue;
          const rm = this.route?.underRooms.find((r) => r.index === idx);
          if (!rm) continue;
          let surged = false;
          // sprint 504 — the surge drags coils too: loose wire on the
          // floor slides to the crank with the coin.
          for (const w of [...this.droppedPouches, ...this.droppedCoils]) {
            if (Math.abs(w.x - rm.origin.x) > rm.width / 2
              || Math.abs(w.z - rm.origin.z) > rm.depth / 2) continue;
            const dx = spot.x - w.x, dz = spot.z - w.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.5) continue;
            const nx = w.x + (dx / d) * Math.min(0.6 * dt, d - 0.5);
            const nz = w.z + (dz / d) * Math.min(0.6 * dt, d - 0.5);
            let blocked = false;
            for (const cb of rm.colliders)
              if (cb.minY < 0.45 && aabbContainsPoint(cb, nx, 0.2, nz)) { blocked = true; break; }
            if (blocked) continue;
            w.x = nx; w.z = nz; surged = true;
          }
          if (surged) {
            this.mintPouchDrops(); this.mintCoilDrops();
            if (v3dist(v3(spot.x, 0, spot.z), this.player.pos) < 6 && this.spillTideCueT <= 0) {
              this.spillTideCueT = 2.2;
              this.sound.emit({ x: spot.x, y: 0.15, z: spot.z, intensity: 0.2,
                category: 'item', caption: '[the surge drags the spill toward the drain]' });
            }
          }
        }
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

    // sprint 400 — off-the-hook receivers ring back: 'distraction' bursts
    // at the phone's spot (a planted lure, not the house's ambient scare),
    // then the line goes dead for good.
    for (const hr of this.hookRings) {
      if (tA < hr.at || tA < hr.lastRing) continue;
      hr.lastRing = tA + 1.05;
      this.audio.play('phone-ring', hr.pos,
        tA - hr.at < 0.2 ? '[a phone rings — somebody left it off the hook]' : '');
      this.sound.emit({ x: hr.pos.x, y: hr.pos.y, z: hr.pos.z, intensity: 0.85 * wantedPull, category: 'distraction', caption: '' });
    }
    for (let i = this.hookRings.length - 1; i >= 0; i--) {
      if (tA < this.hookRings[i].until) continue;
      const hr = this.hookRings[i];
      this.cue('phone-stop', hr.pos, '[the ringing stopped — the line went dead]', 'warn');
      this.spentPhones.add(hr.key);
      this.hookRings.splice(i, 1);
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

    this.updateSeamReach();

    // entities + director
    this.spawnScheduled();
    this.hazard.update(this.entityCtx(), dt);
    // the count — due loss-reports ring where the crew property stood:
    // loud enough to rouse the dormant AND pull the room's own listeners
    this.crewCount.tick(this.clock.time, (l) => {
      this.sound.emit({ x: l.x, y: 0.6, z: l.z, intensity: 0.6, category: 'item', caption: l.caption });
      // ...and the books send somebody to look — at every till they marked
      if (this.route) {
        const extra = this.crewCount.pendingSockets();
        const sent = this.checker.dispatch(this.route.underRooms, [l, ...extra], this.checkerHooks());
        if (sent && extra.length)
          this.cue('chalk-mark', null, '[the books marked them together — the lamp has more than one till]', 'warn');
      }
    });
    // the checker walks: inbound → sweep the rung socket → outbound
    if (this.checker.active && this.route) {
      const p = this.player.pos;
      this.checker.update(dt, this.route.underRooms, {
        pos: p,
        room: this.space === 'under' ? underRoomOf(this.route.underRooms, p) : -1,
        exposed: !this.player.hiddenSpot && this.player.protection !== 'hidden',
      }, this.checkerHooks());
    }
    // the reposter walks when the boards stand bare: pin by pin
    if (this.reposter.active && this.route) {
      this.reposter.update(dt, this.route.underRooms, {
        pos: this.player.pos, room: this.currentRoom,
        hidden: this.player.protection === 'hidden',
      }, this.reposterHooks());
    }
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
        // sprint 444 — the beam needs air: the flag was lamp-on-OR-off,
        // so the beam repelled, agitated, and woke things through shut
        // leaves and walls alike. Now it means the beam actually covers
        // it: lamp on, in the cone, in reach, and sight clear.
        e.lightOnIt = 0;
        if (this.lampOn || this.pulseLampOn) {
          const tp = e.threatPos();
          if (tp) {
            const dx = tp.x - this.player.pos.x, dz = tp.z - this.player.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 11) {
              const dir = v3();
              this.player.lookDir(dir);
              const dn = dist || 1;
              if ((dir.x * dx + dir.z * dz) / dn > 0.4) {
                const eye = v3();
                this.player.eyePos(eye);
                const rooms = this.activeRooms();
                const inRoom = rooms.find((r) => pointInRoom(r, tp.x, tp.z)) ?? rooms[this.currentRoom];
                const blockers = (inRoom ? inRoom.losBlockers : []).concat(
                  shutLeafBlockers(rooms, this.player.pos, tp));
                if (hasLineOfSight(eye, v3(tp.x, 1.2, tp.z), blockers)) e.lightOnIt = 1;
              }
            }
          }
        }
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
