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
import { MAT } from '../world/materials';
import { PlayerController, type MoveInput } from '../player/controller';
import { InteractionSystem, type Interactable } from '../player/interaction';
import { Entity, type EntityCtx } from '../entities/base';
import { CorridorRunner } from '../entities/corridor';
import { tickFigure } from '../entities/figure';
import { Witness, Whisper, Inkling, Redactor, EchoSkin, Margin, Stillframe, Hollow, HazardField } from '../entities/room';
import { AudioManager, bindSoundBus } from '../audio/audio';
import {
  IndexEncounter, CustodianEncounter, ChaseEncounter, LensHallEncounter, EngineEncounter, UnderscriptGate,
  type MilestoneEvents, Milestone,
} from '../encounters/milestones';
import { Editor } from '../entities/setpieces';
import { PANIC, DIFFICULTY, ITEM_DEFS, QUALITY } from '../game/config';
import type {
  Difficulty, EntityId, ItemId, RoomInstance, SettingsData, RunStats, Document,
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
  private doorStates = new Map<string, { t: number; opening: boolean }>();
  private composer: EffectComposer | null = null;
  private grainUniforms: Record<string, THREE.IUniform> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.initThree();
    preloadModels();
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
    const hemi = new THREE.HemisphereLight(0x3a342c, 0x0c0a08, 0.7);
    this.scene.add(hemi);
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
  }

  private populateShop(room: RoomInstance): void {
    const stock: { id: ItemId; price: number }[] = [
      { id: 'sparkFlash', price: 60 },
      { id: 'bandage', price: 25 },
      { id: 'latchpick', price: 50 },
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

  private cue(name: string, at: Vec3 | null, caption: string, severity: 'info' | 'warn' | 'danger' = 'info'): void {
    this.audio.play(name, at, caption, severity);
  }

  private flickerRoom(roomIndex: number, mode: 'sweep' | 'reprise' | 'dim' | 'break'): void {
    const built = this.streamer.get(roomIndex);
    if (!built) return;
    for (const l of built.lights) {
      if (mode === 'break') {
        l.intensity = 0;
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
  }

  /* ==================== interactions ==================== */

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
    // Redactor false doors become interactable
    for (const e of this.entities) {
      if (e instanceof Redactor && e.state === 'engage') {
        const pos = (e as Redactor)['falseDoorPos'] as Vec3;
        this.interaction.add({
          kind: 'door', id: 'redactor-false', pos,
          prompt: `Open Door ${(this.activeRooms()[this.currentRoom]?.index ?? 0) + 1}`,
          data: { id: 'redactor-false', falseDoor: true, openT: 0 } as never,
          enabled: true, priority: 2,
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
        for (const d of cluster) d.opening = true;
        this.cue('door-open', it.pos, '');
        this.sound.emit({ x: it.pos.x, y: 1, z: it.pos.z, intensity: 0.4, category: 'door', caption: '[door]' });
        return;
      }
      case 'drawer': {
        const sock = it.data as { meta: Record<string, unknown>; pos: Vec3; filled?: boolean };
        sock.meta.opened = true;
        it.enabled = false;
        this.cue('drawer', it.pos, '');
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
      this.pulseLampOn = !this.pulseLampOn;
      this.cue('ui-click', null, this.pulseLampOn ? '[pulse lamp humming]' : '');
      return;
    }
    if (hasLamp) {
      this.lampOn = !this.lampOn;
      this.cue('ui-click', null, this.lampOn ? '[lamp on]' : '[lamp off]');
    }
  }

  private useActiveSlot(): void {
    const slotItems = this.inventory.filter((i) => ITEM_DEFS[i.id]?.slotItem);
    const item = slotItems[this.activeSlot];
    if (!item || item.count <= 0) return;
    switch (item.id) {
      case 'handLamp':
        this.lampOn = !this.lampOn;
        return;
      case 'pulseLamp':
        this.pulseLampOn = !this.pulseLampOn;
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
      case 'chalkSpool':
        item.count--;
        this.cue('afterglow-hint', null, '[chalk marks will guide your memory]');
        return;
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
      curator: 'It hunts sound. Crouch, go slow, and distract it.',
      pursuer: 'Sprint the sequence. Vaults and gates are the route.',
      orrery: 'Beams read the low floor. Crouch and time the gaps.',
      editor: 'Red-lined floor is already gone. Keep moving.',
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
      switch (sch.entity) {
        case 'sweep': this.spawnEntity(new CorridorRunner('sweep')); break;
        case 'reprise': this.spawnEntity(new CorridorRunner('reprise', { passes: sch.passes ?? 2 })); break;
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
        case 'editor': this.spawnEntity(new Editor()); break;
        case 'pursuer': break; // milestones only
        default: break;
      }
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
          d.openT = Math.min(1, d.openT + dt * 1.8);
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
      const t = this.clock.time;
      for (const l of built.lights) {
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
              if (dist > 2.0 && creep < 0.7) {
                const step = Math.min(dt * 0.22, 0.7 - creep, dist - 2.0);
                const cy = Math.cos(parentYaw), sy = Math.sin(parentYaw);
                o.position.x += ((dx * cy + dz * sy) / dist) * step;
                o.position.z += ((-dx * sy + dz * cy) / dist) * step;
                o.userData.creep = creep + step;
              }
            }
          }
        }
      }
    }

    // Entity figure idle animation — breathing sway + eye pulse.
    const t = this.clock.time;
    this.entityGroup.traverse((o) => {
      if (o.userData.figureParts) tickFigure(o, t);
    });
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
      this.maybeSpawnRat();
    }
    if (this.space === 'under') {
      this.stats.underscriptDeepest = Math.max(this.stats.underscriptDeepest, this.currentRoom);
      this.maybeSpawnRat();
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
            ? [['amb-drip', 0.38], ['amb-creak', 0.24], ['amb-distant', 0.22], ['amb-tick', 0.16]]
            : b === 'records' || b === 'guest' || b === 'safe' || b === 'corridor' || b === 'lobby'
              ? [['amb-creak', 0.45], ['amb-settle', 0.3], ['amb-distant', 0.15], ['amb-tick', 0.1]]
              : [['amb-creak', 0.35], ['amb-distant', 0.35], ['amb-settle', 0.3]];
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
    if (held) this.tryInteract();
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
      if (e instanceof Inkling) {
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
    this.updateMoths(dt);

    // engine win already handled via milestone → victory()

    // camera + audio listener
    this.player.eyePos(eye);
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.player.yaw + Math.PI);
    this.camera.rotateX(this.player.pitch);
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
      this.lampLight.intensity = this.pulseLampOn ? 8 + Math.sin(this.clock.time * 9) * 3.5 : 9;
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
    this.audio.setListener(this.player.pos, this.player.yaw);

    // adaptive music mood
    const inDanger = this.entities.some((e) => e.state === 'engage' && e.id !== 'hollow');
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
        promptProgress: this.interaction.holdProgress,
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
