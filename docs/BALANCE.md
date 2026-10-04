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
