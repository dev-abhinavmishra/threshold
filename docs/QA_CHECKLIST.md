# QA Checklist

Run before every sprint lands: `npx tsc --noEmit && npm run lint && npm test && npm run sim && npm run build`. All five must be green; a red gate reverts, never force-ships.

## Every sprint
- [ ] Lint + typecheck clean, `--max-warnings 0`
- [ ] 52+ unit tests pass; new systems add tests
- [ ] `npm run sim` — 5 seeds, 101+121 rooms, encounters/locks/hides in band
- [ ] `npm run test:e2e` — 4 Playwright specs pass
- [ ] `npm run build` green; bundle size sanity (~560kB three chunk)
- [ ] New assets: license verified CC0/PD + ASSETS.md row + THIRD_PARTY_ATTRIBUTION.md
- [ ] New entity: tuning row, death hint, spawn switch case, cue table entries, docs/ENEMY_*
- [ ] Commit `sprint NN: <name>`; pushed to PR branch

## Per-release (before merge)
- [ ] Full sighted run rooms 1–101: no softlock, milestones work, chase survivable
- [ ] Underscript U-000..U-120 traversal, Editor finale, hatch chain
- [ ] Death → retry restores checkpoint state (ward consumed, position+inventory right)
- [ ] Settings persist across reload; captions live; all toggles function
- [ ] Loudness sanity — no painful spikes; mute works; subtitles on cues
- [ ] Perf: FPS ≥ 45 in cathedral/banquet/server on target GPU; draw calls in budget
- [ ] Save/load: reload mid-run resumes at checkpoint with correct world state
- [ ] Interaction sweep: every door, lock, drawer, hide, pickup, puzzle input
- [ ] Enemy sweep: every entity state observed at least once (use debug spawn)
- [ ] Accessibility: reduced-motion/reduced-flashes/captionSize/highContrast verified
