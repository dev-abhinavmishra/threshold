# Design calls waiting on Abhinav

_Three open calls from the sprint backlog — each is a one-line answer away
from being buildable. Options and a recommendation per call; strike or
amend as you like and the next sprint builds it._

---

## 1. Milestone-set hearing — should authored set pieces answer noise?

**Status quo**: since sprint 241, the Warden answers hearable noise in
*other* rooms when its patrol has carried it to that door — the corridor
itself is a threat vector. The four milestone encounters (Index @50,
Custodian @51, Lens Hall @75, Engine @100) do NOT hear anything outside
their authored room: they run their scripted beats regardless of what you
did next door.

**The question**: should the milestone entities join the hearing web — a
loud approach (sprinting, slammed doors, a machine fed nearby) winding up
the encounter before you cross the threshold — or stay hermetically
scripted?

**Options**

- **A — leave them scripted.** The milestones are the game's authored
  spine; their tension is choreographed, and outside noise bleeding in
  makes the set pieces less repeatable. Pursuer already proves the rule:
  a scripted chase can't "hear" — hearing doesn't fit its shape at all.
- **B — light touch: primed state only.** Noise next door doesn't change
  *what* the set piece does, only its opening tell — e.g. the Index is
  already "up" when you open 50, the Custodian's first stage runs hotter.
  Keeps the choreography, rewards quiet play in the approach rooms.
- **C — full hearing.** Milestone entities answer noise like the Warden —
  Custodian leaves its office to meet you in the corridor. Most
  systemic, most dangerous: the milestones are tuned for their rooms and
  could read as unfair in open space (and harder to test — authored
  beats assume room geometry).

**Recommendation: B.** The house feeling *aware* of you is THRESHOLD's
best trick and the milestones are the rooms where awareness would land
hardest — but the scripted beats shouldn't leave their authored stage.
A primed opening (hotter first tell, a line of caption text like
"[it heard you three doors back]") is a contained change that doesn't
touch fight tuning.

---

## 2. Shared-anchor double-verb — pick + strip on the same sledge

**Status quo**: the Hauler's sledge carries two verbs — `pick` (loot the
sledge stock) at `sledgePos`, `strip` (take its work-lamp) at `lampPos`.
Standing dead-on the lamp puts you inside BOTH radii (prox < 1.1), so
two prompts can light from one spot and focus arbitration decides which
you get.

**The question**: is the overlapping prompt zone intended (a rich spot —
two takeables on one cart), or does the double-light read as mush — you
can't tell which verb you're about to hold?

**Options**

- **A — leave it.** Both are priority 3, the focus system shows the
  nearest one, and holding E on the wrong verb costs you ~1s at most.
  The cart IS two takeables; overlap is honest.
- **B — tighten `strip` to a facing/lamp-side check.** Require the
  player's yaw to be within ~45° of the lamp arm for the strip prompt,
  so pick (body of the cart) and strip (the lamp head) separate by
  look-direction instead of overlapping by radius alone.
- **C — collapse to one verb.** 'Pick the sledge' rolls lamp-included
  when lit. Cleaner prompt, but destroys the strip-verb's fiction (the
  lamp as a distinct prize — and its scavenged-bulb relight state).

**Recommendation: B.** The overlap is only confusing because radius is
the sole discriminator — a yaw window on `strip` keeps both verbs live,
costs ~10 lines, and matches how 'pry' already disambiguates shared
anchors elsewhere.

---

## 3. The Auditor's wanted poster — how does a clerk share your face?

**Status quo**: the Detective (main route) escalates debtors by phone —
it reads the held-property register and calls ahead, so unpaid claims
follow you up the route. The Auditor (underscript clerk) has no
equivalent: its ledger is read-only, and the question left open was —
*how does a back-office clerk tell the rest of the under who you are?*

**The question**: what should the Auditor's escalation be, if any?

**Options**

- **A — wanted posters.** Dead-run your name onto the crew boards and
  cage doors ahead: sockets spawn 'wanted' notices on the next stretch's
  boards, and under crew entities (hauler/laundress/grafter) treat a
  named player as already-counted — hotter engagement ranges. Fiction:
  the clerks *post*, they don't phone.
- **B — the tally travels, not the face.** No poster prop — instead the
  unpaidHeld count itself primes under crew (they smell the debt). Less
  visual, same mechanical shape, zero new sockets.
- **C — nothing.** The Auditor already collects at his desk; giving a
  back-office entity forward pressure duplicates the Detective's beat
  on the same mechanic. Keep escalation main-route-only so the under's
  threat texture stays different (physical patrols > bureaucracy).

**Recommendation: A-lite** — the poster prop only, as evidence: wanted
notices appear on downstream boards naming the player's debt, raising
crew suspicion one tier (cheaper than full engagement changes). It gives
the under a visible "the house knows you're here" texture the main route
already has via the Detective, and props-not-behavior keeps the tuning
surface small. If you'd rather keep the under less bureaucratic, C is
the honest alternative — the duplication argument is real.

---

_Other parked ideas with verdicts already logged in HANDOFF (kept here
for completeness — no answer needed): counter-learning feed (skip —
pure cost), 'seen'-record echo (built as sprint 293), scrub-vs-ash (no
work needed), wetFloor second slip family (dormant — too same-y)._
