# Bone Tag

A daily anatomy guessing game: five bones, one at a time, on a rotatable 3D
skeleton. Inspired by [maptap.gg](https://maptap.gg/), but for bones.

## 1. What it is

Each day presents the same 5 bones to every player, in order:

- **Rounds 1-3 (easy, 1x multiplier):** large, easily recognized bones.
- **Rounds 4-5 (hard, 3x multiplier):** small or obscure bones (individual
  vertebrae, carpals, phalanges, etc.).

For each round you're shown the name of a bone, then rotate/pan/zoom a 3D
skeleton to find it and **hold-to-tap** to drop a marker at your guess.

Scoring is based on graph distance, not literal 3D distance: the mesh you
tapped and the target bone's mesh(es) are nodes in an articulation graph
(bones connected by real or near-real joints), and your score depends on the
BFS **hop count** between them:

| Hops away | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|-----------|-----|-----|-----|-----|-----|----|----|
| Points    | 1000 | 700 | 450 | 250 | 120 | 50 | 0 |

Hard rounds multiply that points value by 3x. A perfect day is 5,000 points
(1000 x 3 easy + 1000 x 3 x 2 hard).

## 2. Quick start

```bash
pnpm install
pnpm dev              # local dev server (Vite)
pnpm build            # tsc -b && vite build -> dist/
pnpm preview          # preview the production build
pnpm test             # vitest run (unit/data tests)
pnpm exec playwright install chromium   # one-time, before running e2e
pnpm e2e              # playwright test (e2e smoke test)
pnpm build:skeleton   # regenerate public/skeleton.glb + src/data/bones.generated.json
```

`build:skeleton` downloads the Human-Atlas dataset (cached under
`.cache/human-atlas/`), filters it to skeletal parts, and re-emits the
compressed GLB and the bone catalog JSON. Re-runs after cache warm-up do no
network I/O.

## 3. How it works

```
src/data/   bones.ts (curated catalog: id, name, difficulty, meshNames, hint,
            group), bones.generated.json (slug -> {fma, name, bbox, tris} for
            all 201 meshes, output of build-skeleton.ts), boneGraph.ts
            (BONE_EDGES/BONE_GRAPH adjacency over all 201 meshes), types.ts

src/game/   pure logic, no rendering: scoring.ts (BFS hop distance,
            POINTS_BY_HOP, scoreGuess), daily.ts (daily bone selection, see
            below), state.ts (zustand store + debug handle), storage.ts
            (localStorage persistence), share.ts (emoji result string)

src/three/  3D scene/interaction: Scene.tsx, Skeleton.tsx, CameraRig.tsx,
            Marker.tsx, Reveal.tsx, useHoldGesture.ts/HoldToPlace.tsx
            (hold-to-tap gesture), boneRegistry.ts, bvhSetup.ts, cameraFly.ts

src/ui/     panels/HUD: Hud.tsx, RoundResult.tsx, Summary.tsx, HowToPlay.tsx,
            About.tsx, NewDayBanner.tsx, MissHint.tsx, HoldRing.tsx
```

**Daily seeding** (`src/game/daily.ts`): the epoch date `2026-09-18` is day
#1. A date key (`YYYY-MM-DD`, local calendar day) is hashed (FNV-1a) to seed
a `mulberry32` PRNG. The catalog is split into sorted easy/hard pools (sorted
by id, so pool order never depends on iteration order); the PRNG shuffles
the easy pool for 3 picks, then shuffles the hard pool's *groups* (e.g.
`vertebra`, `rib`, `other`) and picks one distinct bone from each of two
different groups, so the two hard rounds never both land in the same family
(e.g. two ribs).

**Scoring** (`src/game/scoring.ts`): `hopsToTarget` runs a BFS over the
`BoneGraph` from the tapped mesh to the nearest mesh belonging to the target
bone; `pointsForHops` looks up the points table above, and `roundPoints`
applies the round's multiplier.

**Persistence**: all state lives in `localStorage` under keys prefixed
`bonetag:v1:` (`day:<dateKey>`, `progress:<dateKey>`, `stats`, `howto`) — see
`src/game/storage.ts`.

**Debugging**: appending `?debug=1` to the URL (checked via
`installDebugHandle` in `state.ts`) exposes `window.__boneTag` (the zustand
store), `window.__boneTagRaycast`, and `window.__boneTagGetMesh` in the
console.

## 4. Editing content

- **Adding a bone:** add an entry to `src/data/bones.ts` referencing an
  existing mesh slug from `bones.generated.json`, then add edges for it in
  `src/data/boneGraph.ts` so it's reachable in the articulation graph.
- **Never rename an existing bone's `id`.** Daily seeding sorts by id and
  scoring/persistence key off it; renaming shifts every future daily puzzle
  and breaks replay of past results.
- **Adding graph edges:** edges are plain `[meshA, meshB]` tuples in
  `BONE_EDGES`; `buildGraph` rejects self-loops and malformed tuples.

Automated tests enforce catalog/asset consistency:
- `bones.test.ts` — every mesh name exists in `bones.generated.json`, no mesh
  is claimed twice, ids are unique/unprefixed, left/right pairs are complete,
  and exactly the 4 sesamoid meshes are intentionally unreferenced.
- `boneGraph.test.ts` — every edge references a real mesh slug, no
  self-loops/duplicates, all 201 slugs are reachable from `sacrum` in one
  connected component, plus spot-checked hop distances.
- `glb.test.ts` — `public/skeleton.glb` has exactly the mesh nodes listed in
  `bones.generated.json`, identity transforms, matching triangle
  counts/bounding boxes, and stays within triangle/file-size budgets.

## 5. Deploying

Bone Tag is a static single-page app; `pnpm build` outputs everything to
`dist/`.

- **Vercel:** zero config — framework preset auto-detects Vite.
- **Netlify:** set the publish directory to `dist` (build command
  `pnpm build`).
- **GitHub Pages:** set `base: '/<repo>/'` in `vite.config.ts` (it currently
  has no `base` override, i.e. root-relative), then build and publish `dist/`
  via a GitHub Actions workflow using `actions/upload-pages-artifact` +
  `actions/deploy-pages`.

The skeleton asset (`public/skeleton.glb`) is about 2.4 MB and uses
`EXT_meshopt_compression`; the meshopt decoder is bundled in the app
(`three-stdlib`'s `MeshoptDecoder`), not loaded from a CDN, so the game works
fully offline after first load.

## 6. Attribution / licensing

The skeleton geometry is derived from **BodyParts3D 4.0** (© The Database
Center for Life Science), licensed
[CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/),
obtained via the [Human-Atlas project](https://github.com/slorksmo/Human-Atlas)
(code MIT, data CC BY 4.0). The geometry has been filtered to skeletal parts
only, simplified, and quantized/compressed. See `public/ATTRIBUTION.md` for
the full notice.

Because the source data is CC BY-SA, the derived `skeleton.glb` asset
**inherits the share-alike obligation** — redistributing it (as-is or
modified) requires the same license and attribution.

## 7. Known limitations / next steps

- No coccyx or ossicles (auditory bones) in the source dataset.
- Sesamoid bones exist in the model (visible, physically present) but are
  deliberately excluded as guess targets.
- Hop-based scoring means a guess in a completely different region or on the
  opposite side of the body can score 0, even if the guess is anatomically
  "close" in absolute 3D distance.
- No server/backend: daily results and streaks live only in the browser's
  `localStorage`, so progress is per-device and does not sync across
  devices or browsers.
