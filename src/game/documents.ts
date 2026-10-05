/**
 * Collectible documents — all original in-world writing. Death to an
 * entity unlocks its entry in the Archive (the Afterglow codex).
 */
import type { Document } from './types';

export const DOCUMENTS: Document[] = [
  {
    id: 'doc-meridian', title: 'Welcome to The Meridian', category: 'lore', unlockedAt: 0,
    body: 'The Meridian is not a hotel. It is a filing system for thresholds — every door you have ever crossed exists here, catalogued. If you are reading this, you are inside the catalogue. The doors go one way. The numbers are wrong on purpose.',
  },
  {
    id: 'doc-sweep', title: 'Entity: Sweep', category: 'entity', unlockedAt: 0,
    body: 'A pressure wave with intent. It travels the corridor at speed, killing whatever it can see. Its warning is unmistakable: lights gutter in its wake and the air rushes to meet it. Concealment or broken sight-lines. It does not stop.',
  },
  {
    id: 'doc-reprise', title: 'Entity: Reprise', category: 'entity', unlockedAt: 0,
    body: 'Sweep’s colleague, and worse for the encore. It passes, pauses — long enough for hope — then returns. Hold your hiding place through every pass. Watch the lamp rhythm: two pulses, then silence, then the return.',
  },
  {
    id: 'doc-witness', title: 'Entity: Witness', category: 'entity', unlockedAt: 0,
    body: 'It occupies reflective surfaces — windows, mirrors, portrait glass. Its regard is a hook; meeting it costs you. Resist the pull, break the line, keep moving.',
  },
  {
    id: 'doc-whisper', title: 'Entity: Whisper', category: 'entity', unlockedAt: 0,
    body: 'A voice in the unlit rooms. It cannot abide being seen. Turn toward the sound until the shape resolves; your regard is the weapon. It will not wait politely.',
  },
  {
    id: 'doc-inkling', title: 'Entity: Inkling', category: 'entity', unlockedAt: 0,
    body: 'A clot of dark that gathers in corners. Held light enrages it — but darkness hides it from you. Angle your lamp away, or go dark and move on.',
  },
  {
    id: 'doc-redactor', title: 'Entity: Redactor', category: 'entity', unlockedAt: 0,
    body: 'It forges exits. The fake is readable: wrong number, wrong seam, a hum pitched just off. Trust the sequence. When a threshold smells like paper, do not cross it.',
  },
  {
    id: 'doc-echoskin', title: 'Entity: Echo-Skin', category: 'entity', unlockedAt: 0,
    body: 'It walks where you have already walked, wearing the sound of your own footsteps — one pair too many. Stop. Listen for the extra step. Hold it in view and it folds.',
  },
  {
    id: 'doc-maelstrom', title: 'Entity: Maelstrom', category: 'entity', unlockedAt: 0,
    body: 'The corridor’s verdict. If it sees where you hide, it holds the cabinet shut and drains the air from it — keep the needle centered or it will have you. A physical safe spot it cannot read is the better answer.',
  },
  {
    id: 'doc-pursuer', title: 'Entity: Pursuer', category: 'entity', unlockedAt: 0,
    body: 'It does not stalk. It runs. Reserved for the Meridian’s authored sequences — when it starts, the route is the puzzle: sprint, vault, duck. It is slightly slower than you. Do not stop.',
  },
  {
    id: 'doc-curator', title: 'Entity: Curator', category: 'entity', unlockedAt: 0,
    body: 'The archivist of the lower gallery. Blind, but it files every sound — footsteps, drawers, slammed doors, your breath if you are careless. Crouch. Move slowly. Drop distractions far from your route.',
  },
  {
    id: 'doc-hollow', title: 'Entity: Hollow', category: 'entity', unlockedAt: 0,
    body: 'A thing that lives inside warm hiding places. Its tells: a cabinet warmer than the room, residue on the hinges, a hum pitched wrong. If it wakes with you inside, struggle — it is strong but not patient.',
  },
  {
    id: 'doc-redline', title: 'Entity: Redline', category: 'entity', unlockedAt: 0,
    body: 'Underscript only. A printed verdict that travels faster than Sweep, announced by cascading printers and red lamps. Hide deeper; it reads shallow cover.',
  },
  {
    id: 'doc-stillframe', title: 'Entity: Stillframe', category: 'entity', unlockedAt: 0,
    body: 'A shutter in the air. When it sounds, everything that moves is recorded — and punished. Release all input and be still until the frame develops.',
  },
  {
    id: 'doc-returner', title: 'Entity: Returner', category: 'entity', unlockedAt: 0,
    body: 'It comes from ahead, not behind — the doors latch in reverse order as it nears. Turn back to cover you have already passed. Its second pass is faster; its third is myth.',
  },
  {
    id: 'doc-margin', title: 'Entity: Margin', category: 'entity', unlockedAt: 0,
    body: 'It exists in peripheral vision. Unseen, it approaches. Seen fully, it strains the room around itself. Glance — never stare.',
  },
  {
    id: 'doc-editor', title: 'Entity: Editor', category: 'entity', unlockedAt: 0,
    body: 'The Underscript’s last authority. It deletes what it marks — floor, doors, you. Watch for the red line spreading. The floor it writes over is already gone.',
  },
  {
    id: 'doc-underscript', title: 'The Underscript', category: 'lore', unlockedAt: 0,
    body: 'Below the catalogue lies the draft the Meridian corrected out of existence. One hundred twenty thresholds, seamed by landings. Amendments apply below: the rules change. Pay is in Marginalia — coin of the unrevised.',
  },
  {
    id: 'doc-index', title: 'The Index', category: 'lore', unlockedAt: 0,
    body: 'At the fiftieth threshold the catalogue keeps its heart. The Curator files runners here. Five cards hold the order; the Catalogue speaks it; the console accepts it. Loud mistakes are heard.',
  },
  {
    id: 'doc-engine', title: 'The Engine', category: 'lore', unlockedAt: 0,
    body: 'The hundredth threshold is a machine for crossing. It stalled. The relays scatter it; the routing board reorders it; the lift at its heart is the last door you will ever open.',
  },
  {
    id: 'doc-guest-chalk', title: 'Note — “mark your doors”', category: 'lore', unlockedAt: 0,
    body: 'I carry chalk now. One stroke on the frame of every threshold I take. When I come back through — and you always come back through — a marked door means it was me, not them. Unmarked doors I did not take are the ones I worry about. — a previous guest',
  },
  {
    id: 'doc-guest-alarm', title: 'Note — “let it ring somewhere else”', category: 'lore', unlockedAt: 0,
    body: 'The thing downstairs files every sound you make. I stopped being quiet and started being elsewhere: wind the clock, set it down, walk away slow. It rings where you are not. Everything that hunts noise goes to the noise. — a previous guest',
  },
  {
    id: 'doc-guest-broker', title: 'Note — “the staff below”', category: 'lore', unlockedAt: 0,
    body: 'There is a counter in the service rooms where something stands all night. It is not friendly and it is not cruel. It takes only Marginalia — the coin this place pays out — and it will watch you the whole time you browse. Buy what you need and do not linger. — a previous guest',
  },
  {
    id: 'doc-guest-register', title: 'Note — “the ledger”', category: 'lore', unlockedAt: 0,
    body: 'I signed the register at the counter because the lobby asks you to. Yesterday I walked back through and there were two signatures. The second one is mine. I did not write it. — a previous guest',
  },
  {
    id: 'doc-guest-drawers', title: 'Note — “splinters carry”', category: 'lore', unlockedAt: 0,
    body: 'Locked drawers hold more — I have seen the tally. But the sound of a forced lock carries further than the loot is worth. Spend a pick or walk away. Whatever is down the hall heard me learn that. — a previous guest',
  },
  {
    id: 'doc-guest-torch', title: 'Note — “the beam stutters”', category: 'lore', unlockedAt: 0,
    body: 'My lamp is honest. When it stutters near a wardrobe, a vent, a gap under a bed — something is in there deciding whether to be hungry. The flicker is the only warning a hiding place gives. — a previous guest',
  },
  {
    id: 'doc-guest-bier', title: 'Note — “the bier was answered”', category: 'lore', unlockedAt: 0,
    body: 'It knocked when I leaned in — I swear it knocked. I lifted the lid anyway because of course I did. No body. The pillow was still warm and there was a brass name tag on the satin and the name was mine. I put the lid back gently, like manners would save me, and I did not stop walking for three rooms. Do not open it. Or do, and tell me if the name is yours too. — a previous guest',
  },
];
