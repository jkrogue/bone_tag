# Bone Tag — todo

Plan: ~/.claude/plans/implement-bone-tag-harmonic-quilt.md

- [x] 1. Scaffold Vite + React + TS project, deps, scripts, git init
- [x] 2. Asset pipeline `scripts/build-skeleton.ts` -> public/skeleton.glb (2.4 MB, 201 meshes) + bones.generated.json + ATTRIBUTION.md
- [x] 3. `daily.ts` + tests
- [x] 4. `scoring.ts` (BFS hops + points table) + tests
- [x] 5. `storage.ts` + tests
- [x] 6. `bones.ts` catalog (31 easy / 85 hard) + consistency test
- [x] 7. `boneGraph.ts` (319 edges, connected) + tests
- [x] 8. `Skeleton.tsx` + `boneRegistry.ts` + `bvhSetup.ts`
- [x] 9. `CameraRig.tsx` + Canvas/CSS mobile setup
- [x] 10. Hold gesture + HoldToPlace + HoldRing + MissHint
- [x] 11. `state.ts` store + `share.ts`; Hud/HowToPlay/LoadingScreen/Summary/About/NewDayBanner
- [x] 12. Reveal (target/path highlight, camera fly) + `RoundResult.tsx`
- [x] 13. Integration in App/Scene; restore flows verified by e2e
- [x] 14. `glb.test.ts` + Playwright smoke (`pnpm e2e`)
- [x] 15. README + deploy notes
- [ ] 16. Perf pass on a real phone (needs a device); optional: code-split the 1.29 MB (358 kB gzip) JS bundle

## Review
- Verified: `pnpm build`, `pnpm test` (145 tests / 12 files), `pnpm lint` (0 errors), `pnpm e2e` (2 specs) all green as of 2026-09-18.
- Not verified: real-device touch behaviour (iOS long-press callout, pinch), FPS on a phone.
- Open judgment calls for the user: adjacent ribs linked as graph neighbours; easy pool includes C1/C2/C7/T1/T12/L1/L5.
- Nothing committed yet (git initialised, no commits).
- [x] 17. Enable panning (two-finger / right-drag) with target clamp; update how-to text
- [ ] 18. Replay today + Practice modes (non-persistent) from Summary
