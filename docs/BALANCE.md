# Balance — sprint 93 measurement pass

Method: per-entity + per-decile encounter histograms over the 5 QA seeds via
`generateRoute`, before/after tuning. Sim results gate every change.

## Findings (pre-tune)

- Redactor dominated: 32 spawns / 5 seeds (~40% over-weight vs roster peers) —
  spawnChance 0.4, cooldown 6.
- Husk nearly absent: 4/5 seeds — cooldown 20 was the choke (max ~4 possible).
- Behemoth rare by design (minRoom 55, tier-3, survival gate): keep at ~0-1/seed.
- Dead stretches: longest scheduled-encounter gap was 12 rooms (seed ash-vault,
  rooms 35–47) — pacing valleys + unlucky rolls.
- Decile curve was sound: nothing in 0–9 (safe start), light 10–19, even after.

## Tunes applied

- `redactor`: spawnChance 0.4 → 0.28, cooldown 6 → 9 (now 19/5 seeds).
- `husk`: cooldown 20 → 16, spawnChance 0.3 → 0.38 (now 9/5 seeds — rare threat).
- Pacing: calm-beat runs capped at 8 rooms (tier forced ≥1 past that).
- Density floor: after scheduling, any >10-room void between encounters gets a
  low-tier presence (whisper/inkling/redactor/hollow, eligibility-checked) at
  its midpoint.

## Post-tune (5 seeds)

- Max scheduled gap: ≤10 rooms on every seed.
- Distribution: sweep 24 · hollow 21 · redactor 19 · whisper 18 · witness 14 ·
  grafter 14 · lurker 14 · reprise 13 · echoskin 12 · husk 9 · inkling 7 ·
  maelstrom 6 · behemoth 1 — signature chases stay frequent, apex threats rare.

## Roster update (sprint 179, standard seeds)

- Main floor: sweep 22 · hollow 23 · redactor 19 · whisper 18 · witness 16 ·
  reprise 15 · inkling 14 · lurker 13 · grafter 12 · echoskin 11 · husk 10 ·
  maelstrom 6 · collector 4 · singer 3 · behemoth 1 — the two additions stay
  rare on purpose: the Collector's toll is a negotiation, the Singer a
  slow-burn tail; either one more often would read as noise.
- Underscript: redline 63 · margin 54 · stillframe 44 · returner 39 ·
  grafter 36 · editor 5 — dense by design; the subfloor is the gauntlet.
- shortRun/'qa' caveat: guarantee windows (reprise@31+, maelstrom@55+,
  echoskin@63+) don't exist under ~31 rooms, so a qa route shows ~3
  scheduled encounters — sparse is the mode, not the balance.

## Scripted playtest (sprint 286 — "the counted run")

`e2e/playtest.spec.ts` sim-drives the real game (renderFrame stubbed,
dt=1/30) room-by-room through a full 101-room 'standard' route under three
playstyles — walker (never hides or fights), hider (enters the room's first
spot when a live entity is present), looter (hider + clears every loot/
drawer socket). `g.lastDeathCause` stamps the killer for the report.
Milestone/authored rooms run under godMode — their deaths are scripted
beats a teleporter can't fight fairly.

### Measured (ash-vault-101 / gilt-spine-777 / wax-bell-256)

| style  | deaths           | top killers                                          | economy |
|--------|------------------|------------------------------------------------------|---------|
| walker | 16 / 15 / 17     | sweep×3-4, witness×3-4, pursuer×2, reprise, grafter, warden, maelstrom, whisper | — |
| hider  | 8 / 10 / 9       | sweep×2-3, reprise×1-3, maelstrom, whisper, husk×2 (wax-bell), hazard×3 (wax-bell) | — |
| looter | 8 / 8 / 7        | same shape as hider minus un-hideable entries        | imp net +5 / +23 / +0 (after vend/toll spend) |

Re-measured after the harness fixes (review on PR #12): the looter now
holds E through hold-verbs — 'Feed the machine' included — and economy
earned before a death is banked past the checkpoint restore, so income
no longer depends on death timing. The sprint-286 looter row (+121/+33/+103)
over-read: it never fed a machine and dropped loot earned since the last
checkpoint. Net-of-spend is the honest figure — vend prices int(12,20)/
int(14,24) now roughly balance a full-route looter's income (≈0-25 net),
so the old '~5x coverage' read was inflated by unspent wealth, not just
cheap prices.

### Read

- The no-react floor is ~1 death per 6-7 rooms — punishing on purpose.
- Hiding halves deaths but never zeroes them: maelstrom reads spots,
  witness punishes sight-holds on entry, hazards bite mid-loot, and
  corridor sweeps land in rooms without a spot. Intended per entity docs.
- pursuer×2 everywhere = the two scripted chases — teleporter noise, not a
  balance signal.
- Economy was ~5x coverage: vend prices were int(4,9)/int(5,11) while sim
  income is 379-592 imprints and vend totals Σ37-95. Partial-route loot
  alone (+33..+121) already out-earns buying every machine.

### Tune applied

- Vend price bands: main int(4,9) → int(12,20); under int(5,11) →
  int(14,24). ~2.5x cost against unchanged income — a real spend point,
  still affordable at partial loot coverage. Toll/claim/ledger/broker
  prices untouched (crew economy has its own books + test pins).
- Open: looted vendables also drop free at decent rates — if playtests
  still read rich, trim loot weights next, not payouts.

## Underscript legs (sprint 297 — "the subfloor counts too")

The same spec now walks `route.underRooms` (121 rooms) after calling
`enterUnderscript()` — the subfloor had never been measured. Fresh page
per seed: back-to-back under runs in one page slow to a crawl and wedge
the renderer (~45min stall observed); solo walks are ~30s each.

### Measured (ash-vault-101 / gilt-spine-777 / wax-bell-256)

| style  | deaths           | top killers                                                | economy |
|--------|------------------|------------------------------------------------------------|---------|
| walker | 23 / 23 / 24     | redline×11-12, grafter×6-7, returner×2-4, editor, pursuer×2 | — |
| hider  | 17 / 16 / 16     | redline×11-12, grafter×1-2, returner×1-2, margin, editor    | — |
| looter | 11 / 9 / 13      | redline×4-5, grafter×2-3, margin×2-3, stillframe, editor    | marg +30 / +18 / +24; imp +0 / +5 / +17 |

### Read

- The subfloor is ~1.5x the main route's ambient pressure for the walker
  (23-24 vs 15-17) and ~2x for the hider (16-17 vs 8-9). Intended — the
  optional floor is meaner by design — but the margin is worth watching.
- Deaths concentrate on redline (~50% of all under deaths): a persistent
  alarm line that hiding cannot solve — you must not cross it. That's
  consistent pressure, not un-hideable luck; the hider's margin/returner
  deaths are the real "hid and still died" residue (~3-5/121).
- Editor deaths (1/seed) = the marginalia-ledger tax on looting under —
  reads as intended pressure.
- Marginalia flows: +18-30 per full looter walk against register/work-
  order/crew-board/claim prices of int(3-16). Income out-earns a full
  shopping trip — the under's papers are affordable, not free.
- inv=0 on all legs: under caches resolve to currency/lore/consumables
  that don't sit in the inventory list — expected, not a loot failure.
