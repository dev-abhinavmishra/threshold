import { expect, Page } from '@playwright/test';

// Shared e2e harness — seeded run bootstrap + the debug handle types
// every themed spec drives through page.evaluate. See props.spec.ts
// for the ambient layer, doors.spec.ts, entities.spec.ts, books.spec.ts.

export async function seededRun(page: Page, seed = 's'): Promise<void> {
  await page.goto('/?debug');
  const input = page.locator('.seed-input');
  await input.evaluate((el: HTMLInputElement, s: string) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, s);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, seed);
  await page.getByRole('button', { name: 'Seeded Run' }).click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => (window as unknown as { __thresholdGame?: unknown }).__thresholdGame, undefined, { timeout: 90_000 });
}

export interface ThresholdG {
  renderFrame(): void;
  clock: { tick(): boolean; dt: number; time: number };
  frame(): void;
  godMode: boolean;
  currentRoom: number;
  player: {
    pos: { x: number; y: number; z: number };
    yaw: number; pitch: number; eyeHeight: number; health: number; dead: boolean;
    teleport(x: number, y: number, z: number, yaw?: number): void;
    hiddenSpot: { id: string } | null;
    crouching: boolean;
  };
  input: { interactPressed: boolean };
  keys: Set<string>;
  audio: { onCaption(fn: (c: { text: string; severity?: string }) => void): unknown };
  sound: { emit(e: { x: number; y: number; z: number; intensity: number; category: string; caption: string }): void };
  spawned: Set<string>;
  doorTry: { id: string } | null;
  interaction: {
    focused?: { prompt: string; holdTime?: number; id?: string } | null;
    interactables: { kind: string; id: string; pos: { x: number; y: number; z: number }; prompt: string; enabled?: boolean; data?: { meta?: Record<string, number | string | boolean> } }[];
  };
  entities: { id: string; state: string }[];
  route: { rooms: GRoom[]; branchRooms?: GRoom[]; underRooms: GRoom[] };
  // interact journals (private fields — reachable at runtime)
  litTVs: Set<string>;
  woundClocks: Set<string>;
  litHearths: Set<string>;
  lookedWindows: Set<string>;
  drunkCoolers: Set<string>;
  typedKeys: Set<string>;
  printedPages: Set<string>;
  answeredPhones: Set<string>;
  satSeats: Set<string>;
  ranWashers: Set<string>;
  finishedWashers: Set<string>;
  emptiedWashers: Set<string>;
  priedTraps: Set<string>;
  liveTraps: { key: string; x: number; z: number }[];
  documents: { id: string }[];
  marginalia: number;
}

export interface GRoom {
  index: number;
  templateId?: string;
  origin: { x: number; z: number };
  yaw: number;
  width?: number;
  depth?: number;
  n: { x: number; z: number };
  entryPos: { x: number; z: number };
  exitPos: { x: number; z: number };
  doors: { id: string; pos: { x: number; z: number }; yaw: number; label: string; falseDoor?: boolean; deep?: boolean; openT?: number; opening?: boolean; heldBy?: string; locked?: boolean }[];
  scheduled?: { entity: string; roused?: boolean; triggerRoom: number; seed: number }[];
  darkRoom?: boolean;
  flooded?: boolean;
  spec?: { width?: number; depth?: number; w?: number; d?: number; props: { kind: string; x: number; z: number; y?: number }[] };
  hidingSpots: { id: string; exitPos: { x: number; y: number; z: number }; trappedBy?: string }[];
  sockets?: { meta?: Record<string, unknown>; pos: { x: number; y: number; z: number } }[];
}
