# Enemy: Collector

- **Narrative function**: the toll-taker — blocks the route and asks a price; pays back in intelligence
- **Visual / silhouette**: hooded tall figure (procedural `tallFigure`, paper mask, amber eyes, tattered) carrying a rattling brass tin (`collector-tin` mesh)
- **Audio cues**: tin rattle (`collector-rattle`), payment accepted (`collector-paid`), refusal chase (`collector-refuse`), departure (`collector-leave`)
- **Spawn / rules**: plants itself ~4m ahead on the player's facing, walks to 1.9m, then demands via a `toll` interactable (`holdTime` 0.8s)
- **Counterplay**: pay — 2 imprints, or 1 marginalia if short — and it whispers how far the nearest living threat is; or simply walk away and carry the noise
- **Failure outcome**: refusing or leaving makes it *follow* you, trailing ~4.5m behind your facing, rattling every ~3.2s — each rattle emits a `footstep` sound event (intensity 0.45) that sound-hunters track, plus a small Panic creep. Never lethal itself: its danger is the attention it draws.
- **Fairness safeguards**: non-lethal by design; gives up after following across 2 room changes or ~6s with the player hidden, then walks home; the toll re-offers if you come back within 1.9m; paid satisfaction gives real information (nearest threat distance)
- **Debug**: `spawn collector`; tuning row `ENTITY_TUNING.collector`
- **Compatible rooms**: minRoom 18, scheduled like any tier-2 entity
- **Pacing**: tier 2; foreshadowed by coin-spill floor stains + low handprints (`foreshadow` mark) and a discarded lantern / papers
