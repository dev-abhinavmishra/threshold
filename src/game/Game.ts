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
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameClock } from '../engine/clock';
import { SoundEventBus } from '../engine/events';
import { SeedStreams, Rng } from '../engine/rng';
import { v3, v3dist, aabb, aabbContainsPoint, clamp, type Vec3, type Aabb } from '../engine/math';
import { generateRoute, type GeneratedRoute } from '../world/generator';
import { RoomStreamer } from '../world/streamer';
import { preloadModels, modelInstance } from '../world/modelLibrary';
import { preloadFigures, riggedFigure, type RiggedFigure } from '../entities/rigged';
import { portLocalPos } from '../world/spec';
import { MAT } from '../world/materials';
import { PlayerController, type MoveInput } from '../player/controller';
import { InteractionSystem, type Interactable } from '../player/interaction';
import { Entity, type EntityCtx } from '../entities/base';
import { CorridorRunner } from '../entities/corridor';
import { tickFigure, statueFigure, tallFigure } from '../entities/figure';
import { Witness, Whisper, Inkling, Redactor, EchoSkin, Margin, Stillframe, Hollow, Husk, HazardField, Lurker } from '../entities/room';
import { AudioManager, bindSoundBus } from '../audio/audio';
import {
  IndexEncounter, CustodianEncounter, ChaseEncounter, LensHallEncounter, EngineEncounter, UnderscriptGate,
  type MilestoneEvents, Milestone,
} from '../encounters/milestones';
import { Editor, Grafter } from '../entities/setpieces';
import { PANIC, DIFFICULTY, ITEM_DEFS, QUALITY } from '../game/config';
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

const SAFE_ROOM_TEMPLATES = new Set(['ms-clinic', 'ms-custodian', 'ms-index-ante', 'ms-final-ante', 'ms-decompress']);

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
  private doorStates = new Map<string, { t: number; opening: boolean }>();
  /** Staged arrival captions for a fresh run (lobby cold-open). */
  private arrival: { t: number; text: string; sev: 'info' | 'warn' | 'danger'; fired: boolean }[] = [];
  private dread = 0;
  /** Keyhole peek: camera pushed through a locked door for a look beyond. */
  private peek: { eye: Vec3; dir: Vec3; t: number; baseFov: number } | null = null;
  private composer: EffectComposer | null = null;
  private grainUniforms: Record<string, THREE.IUniform> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.initThree();
    preloadModels();
    preloadFigures();
    this.bindInput();
    bindSoundBus(this.sound, this.audio);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));
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
    }
    if (q !== 'low') {
      const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.42, 0.93);
      composer.addPass(bloom);
    }
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
    this.clearRats();
    this.spawned.clear();
    this.milestones.clear();
    this.doorStates.clear();
    this.hazard = new HazardField();
    this.roomBounds.clear();
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
    const stock: { id: ItemId; price: number }[] = [
      { id: 'sparkFlash', price: 60 },
      { id: 'bandage', price: 25 },
      { id: 'latchpick', price: 50 },
      { id: 'windAlarm', price: 55 },
      { id: 'wardSeal', price: 90 },
    ];
    let slot = 0;
    for (const sock of room.sockets) {
      if (sock.meta.shop !== undefined && slot < stock.length) {
        sock.meta.shopItem = stock[slot].id;
        sock.meta.price = stock[slot].price;
        slot++;
      }
    }
    useGameStore.setState({ shopItems: stock.map((s, i) => ({ ...s, slot: i, sold: false })) });
  }

  /* ==================== entity context ==================== */

  private entityCtx(): EntityCtx {
    return {
      player: this.player,
      rooms: this.activeRooms(),
      currentRoomIndex: this.currentRoom,
      sound: this.sound,
      streams: this.streams,
      now: this.clock.time,
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
      difficulty: useGameStore.getState().difficulty,
      accessibility: {
        reducedMotion: this.settings.reducedMotion,
        captions: this.settings.captions,
        minigameAssist: this.settings.minigameAssist,
      },
      gameState: () => useGameStore.getState().phase,
    };
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
      case 'pursuer': case 'curator': case 'hazard': break; // milestone-triggered only
      default: break;
    }
  }

  /** Dev-only godmode flag — gates damagePlayer. */
  godMode = false;

  private cue(name: string, at: Vec3 | null, caption: string, severity: 'info' | 'warn' | 'danger' = 'info'): void {
    this.audio.play(name, at, caption, severity);
  }

  private flickerRoom(roomIndex: number, mode: 'sweep' | 'reprise' | 'dim' | 'break'): void {
    const built = this.streamer.get(roomIndex);
    if (!built) return;
    for (const l of built.lights) {
      if (mode === 'break') {
        l.userData.flicker = false;
        l.userData.baseIntensity = 0;
        l.intensity = 0;
        const lamp = l.userData.lampMesh as THREE.Mesh | undefined;
        if (lamp) {
          lamp.material = (lamp.material as THREE.MeshStandardMaterial).clone();
          (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04;
        }
      } else {
        const base = l.intensity;
        let f = 0;
        const iv = setInterval(() => {
          l.intensity = f++ % 2 ? base * 0.15 : base;
          if (f > (this.settings.reducedFlashes ? 2 : 8)) {
            clearInterval(iv);
            l.intensity = mode === 'dim' ? base * 0.5 : base;
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
    this.peek = { eye, dir, t: 0, baseFov: this.camera.fov };
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
  }

  private endPeek(): void {
    if (!this.peek) return;
    this.player.frozen = false;
    this.camera.fov = this.peek.baseFov;
    this.camera.updateProjectionMatrix();
    this.peek = null;
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
    // Crouched at a locked door: a keyhole-peek target outranks the lock.
    if (this.player.crouching) {
      for (const it of this.interaction.interactables) {
        const d = it.data as Door | undefined;
        if (it.kind !== 'door' || !d?.locked || d.falseDoor) continue;
        this.interaction.add({
          kind: 'peek', id: `peek-${it.id}`, pos: it.pos,
          prompt: `Peek Door ${d.label}`, holdTime: 0.9,
          data: d, enabled: true, priority: 4,
        });
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
        if (this.marginalia >= price) {
          this.marginalia -= price;
          sock.meta.sold = true;
          it.enabled = false;
          this.giveItem(item, 1);
          this.cue('purchase', it.pos, `[traded — ${price} marginalia]`, 'info');
        } else {
          this.cue('door-locked', it.pos, `[${price} marginalia required]`, 'warn');
        }
        return;
      }
      case 'exitHide': {
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
        if (cluster.some((d) => d.locked)) {
          const lockId = cluster.find((d) => d.locked)?.lockId ?? '';
          if (this.consumeKeyFor(lockId)) {
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
      case 'item':
      case 'lore':
      case 'card': {
        this.resolveSocketLoot(it);
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
      this.cue('ui-click', null, this.lampOn ? '[lamp on]' : '[lamp off]');
    }
  }

  private useActiveSlot(): void {
    const slotItems = this.inventory.filter((i) => ITEM_DEFS[i.id]?.slotItem);
    const item = slotItems[this.activeSlot];
    // lamps pass through at 0 charge so their case can report the dead battery
    if (!item || (item.count <= 0 && item.id !== 'handLamp' && item.id !== 'pulseLamp')) return;
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
    this.deathCount[source] = (this.deathCount[source] ?? 0) + 1;
    this.deathEcho = { room: this.currentRoom, space: this.space, fired: false };
    this.stats.deaths++;
    this.meta.deaths++;
    saveMeta(this.meta);
    this.audio.play('death', null, '', 'danger');
    this.audio.setMood('off');
    this.audio.setRoomTone('off');
    const hints: Record<string, string> = {
      sweep: 'Its cue is the pressure wave and the flicker. Conceal or break line of sight.',
      reprise: 'It returns — stay put through every pass.',
      witness: 'Look away. The pull is resistible; the regard is not.',
      whisper: 'In darkness, turn toward the voice until you see it.',
      inkling: 'It hates sustained light. Angle the beam away.',
      echoskin: 'It borrows your steps. Face it to fold it.',
      maelstrom: 'It remembers where you hide. Reach a physical safe spot.',
      redline: 'Printer cascade and red lamps — conceal before the pass.',
      stillframe: 'Release all input when the shutter sounds.',
      margin: 'Glance to freeze it; never hold it in view.',
      returner: 'It comes from ahead. Retreat to known cover.',
      redactor: 'Check the number, the seam, the hum. Real exits are even-tempered.',
      hollow: 'Warm cabinets lie. Check for the residue and the off-hum.',
      husk: 'It sleeps. Keep the beam off it, keep your distance, go quiet.',
      curator: 'It hunts sound. Crouch, go slow, and distract it.',
      pursuer: 'Sprint the sequence. Vaults and gates are the route.',
      orrery: 'Beams read the low floor. Crouch and time the gaps.',
      editor: 'Red-lined floor is already gone. Keep moving.',
      grafter: 'It is only rubble until it stands. Give it the berth it cannot give you.',
      hazard: 'Watch the floor — the building sets snares.',
    };
    const doc = DOCUMENTS.find((d) => d.id === `doc-${source}`);
    if (doc && !this.documents.some((d) => d.id === doc.id)) {
      this.documents.push({ ...doc, unlockedAt: Date.now() });
      this.meta.documents.push(doc.id);
      saveMeta(this.meta);
    }
    setTimeout(() => {
      useGameStore.setState({
        phase: 'DEAD', paused: true,
        deathInfo: { cause: source, hint: hints[source] ?? hint, entity: source },
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));
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

  private updateDoors(dt: number): void {
    const rooms = this.activeRooms();
    for (const i of this.streamer.builtIndices) {
      const r = rooms.find((x) => x.index === i) ?? this.route?.branchRooms.find((x) => x.index === i);
      if (!r) continue;
      for (const d of r.doors) {
        if (d.opening && d.openT < 1) {
          d.openT = Math.min(1, d.openT + dt * 1.8 * (d.openRate ?? 1));
        } else if (!d.opening && d.openT > 0) {
          d.openT = Math.max(0, d.openT - dt * 2.2);
        }
        // animate leaf(es)
        const built = this.streamer.get(r.index);
        if (built) {
          const leaf = built.doorLeaves.get(d.id);
          if (leaf) {
            const hinge = leaf.userData.hinge as THREE.Group | undefined;
            if (hinge) hinge.rotation.y = -d.openT * 1.9;
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

    for (const i of this.streamer.builtIndices) {
      const built = this.streamer.get(i);
      if (!built) continue;
      this.ensureChalkMarks(i, built);
      this.ensureBroker(i);
      const t = this.clock.time;
      const dead = this.blackedOut.has(i);
      for (const l of built.lights) {
        if (dead) { l.intensity = 0; continue; }
        if (!l.userData.flicker) continue;
        const s = (l.userData.flickerSeed as number) ?? 0;
        // Squared-off pseudo-noise: mostly steady with occasional deep dips.
        const n = Math.sin(t * 11.3 + s) * Math.sin(t * 5.7 + s * 1.7) * Math.sin(t * 2.9 + s * 0.6);
        const f = n > 0.82 ? 0.15 : n > 0.62 ? 0.55 : 1.0;
        l.intensity = (l.userData.baseIntensity as number) * f;
        const lamp = l.userData.lampMesh as THREE.Mesh | undefined;
        if (lamp) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 * f;
      }
      if (built.dust) {
        built.dust.rotation.y += dt * 0.02;
        built.dust.position.y = Math.sin(t * 0.13 + (built.dust.userData.phase as number)) * 0.12;
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
      for (const o of built.animated) {
        const kind = o.userData.anim as string;
        const s = (o.userData.animSeed as number) ?? 0;
        if (kind === 'blink') {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = (Math.sin(t * 1.7 + s * 3.1) + Math.sin(t * 4.3 + s)) > 0.9 ? 0.04 : 1.1;
        } else if (kind === 'screen') {
          const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const n = Math.sin(t * 13.7 + s) * Math.sin(t * 3.1 + s * 2.3);
          mat.emissiveIntensity = n > 0.55 ? 0.1 : 0.85 + Math.sin(t * 29 + s) * 0.12;
        } else if (kind === 'spin') {
          o.rotation.y += dt * ((o.userData.animSpeed as number) ?? 2.2);
        } else if (kind === 'sway') {
          const a = (o.userData.animAmp as number) ?? 0.03;
          o.rotation.z = Math.sin(t * 1.4 + s) * a;
          o.rotation.x = Math.cos(t * 1.1 + s * 0.7) * a * 0.6;
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
          // Clockwork — stepped second hand, smooth minute/hour.
          o.rotation.z = -Math.floor(t % 60) * (Math.PI / 30);
        } else if (kind === 'handM') {
          o.rotation.z = -((t / 60) % 60) * (Math.PI / 30);
        } else if (kind === 'handH') {
          o.rotation.z = -((t / 720) % 12) * (Math.PI / 6);
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
            const seen = (fx * dx + fz * dz) / dist > 0.6;
            if (!seen) {
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

    // Entity figure idle animation — breathing sway + eye pulse.
    const t = this.clock.time;
    this.entityGroup.traverse((o) => {
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

  private readonly visitedRooms = new Set<number>();
  private deathEcho: { room: number; space: 'main' | 'under'; fired: boolean } | null = null;
  private lures: { pos: Vec3; mesh: THREE.Object3D; until: number; nextTick: number; rang: boolean }[] = [];
  private lowBattWarned = false;

  /** The Broker: one robed figure per u-lobby, behind the counter, head that
   *  follows you. Spawned lazily when the room first builds. */
  private readonly brokerFigs = new Map<number, THREE.Object3D>();

  private ensureBroker(roomIndex: number): void {
    if (this.space !== 'under' || this.brokerFigs.has(roomIndex)) return;
    const room = this.activeRooms()[roomIndex];
    if (!room || room.templateId !== 'u-lobby') return;
    const fig = tallFigure({ height: 1.9, body: MAT.shadowFigure(), face: 'mask', eyes: 'white', hood: true });
    const yaw = room.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const lx = 0, lz = 3.0; // behind the counter at local z 2.2
    const wx = room.origin.x + lx * cos + lz * sin;
    const wz = room.origin.z - lx * sin + lz * cos;
    fig.position.set(wx, room.origin.y, wz);
    fig.rotation.y = Math.atan2(room.entryPos.x - wx, room.entryPos.z - wz);
    fig.userData.broker = true;
    this.entityGroup.add(fig);
    this.brokerFigs.set(roomIndex, fig);
    // first sighting — the building has staff down here too
    const greet = this.streams.roomStream('scare', roomIndex + 881);
    if (greet.bool(0.75)) {
      this.cue('custodian-bell', fig.position as unknown as Vec3, '[something stands behind the counter]', 'info');
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
      const lamp = l.userData.lampMesh as THREE.Mesh | undefined;
      if (lamp) {
        lamp.material = (lamp.material as THREE.MeshStandardMaterial).clone();
        (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05;
      }
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
    const st = useGameStore.getState();
    const running = st.phase === 'PLAYING' || st.phase === 'MINIGAME';
    if (!running || !this.clock.tick(performance.now())) {
      this.renderFrame();
      return;
    }
    const dt = this.clock.dt;

    // input → player
    const moveIn = this.readMoveInput();
    const blockers = this.collectBlockers();
    this.player.update(dt, moveIn, blockers, this.settings, this.sound, this.activeRooms()[this.currentRoom] ?? null, this.clock.time);
    this.player.refreshProtection(this.activeRooms()[this.currentRoom]?.safeZones ?? []);

    // room tracking
    const prev = this.currentRoom;
    this.currentRoom = this.currentRoomIndex();
    if (this.currentRoom !== prev && this.space === 'main') {
      this.stats.roomsVisited = Math.max(this.stats.roomsVisited, this.currentRoom);
      const revisit = this.visitedRooms.has(this.currentRoom);
      this.visitedRooms.add(this.currentRoom);
      if (revisit) {
        this.maybeShiftDoor(this.currentRoom);
        if (this.currentRoom === 0) this.maybeReSignature();
      }
      this.maybeSpawnRat();
      this.maybeBlackout(this.currentRoom);
      this.maybeRelocateRelic(prev);
      this.maybeHauntDoor();
      this.maybeFarSound();
    }
    if (this.space === 'under') {
      this.stats.underscriptDeepest = Math.max(this.stats.underscriptDeepest, this.currentRoom);
      this.maybeSpawnRat();
      if (this.currentRoom !== prev) {
        const revisit = this.visitedRooms.has(-this.currentRoom - 1);
        this.visitedRooms.add(-this.currentRoom - 1);
        if (revisit) this.maybeShiftDoor(this.currentRoom);
        this.maybeFarSound();
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
    this.updateDoors(dt);
    this.updateAtmosphere(dt);
    this.updateMaelstrom(dt);
    this.updateRats(dt);
    this.updateCornerWatcher(dt);
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
    } else if (this.lampLight) {
      this.lampLight.visible = false;
    }
    // Handheld torch — a real vendored flashlight model held low-right in
    // frame whenever a lamp source is on; sways with movement.
    if (this.lampOn || this.pulseLampOn) {
      if (!this.heldTorch) {
        const m = modelInstance('flashlight', 0.35);
        if (m) {
          this.heldTorch = m;
        } else {
          const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.22, 10), MAT.steel());
          fallback.rotation.x = Math.PI / 2;
          this.heldTorch = fallback;
        }
        this.scene.add(this.heldTorch);
      }
      this.heldTorch.visible = true;
      this.camera.getWorldDirection(Game.torchFwd);
      Game.torchRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      Game.torchUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.heldTorch.position.set(eye.x, eye.y, eye.z)
        .addScaledVector(Game.torchRight, 0.24)
        .addScaledVector(Game.torchUp, -0.19)
        .addScaledVector(Game.torchFwd, 0.38);
      this.heldTorch.quaternion.copy(this.camera.quaternion);
      this.heldTorch.rotateY(-0.06);
      this.heldTorch.rotateX(0.05);
      if (!this.settings.reducedMotion) {
        const sway = Math.sin(this.clock.time * 5.2) * 0.012 + Math.sin(this.clock.time * 1.7) * 0.008;
        this.heldTorch.rotateZ(sway);
        this.heldTorch.position.addScaledVector(Game.torchUp, Math.sin(this.clock.time * 5.2) * 0.004);
      }
    } else if (this.heldTorch) {
      this.heldTorch.visible = false;
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
  private heldTorch: THREE.Object3D | null = null;
  private static watchPos = new THREE.Vector3();
  private static torchFwd = new THREE.Vector3();
  private static torchRight = new THREE.Vector3();
  private static torchUp = new THREE.Vector3();

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
