# Lessons

## 2026-09-18 — scoring metric assumed instead of asked
- **What happened:** I proposed centimetre-based "distance to nearest surface point" scoring (mirroring maptap's geographic distance). The user wanted **bones-away** (graph hops through articulations): e.g. target medial cuneiform, tap 1st proximal phalanx = 2 bones away.
- **Pattern:** when porting a mechanic from an inspiration game to a domain with *discrete named objects*, the natural score is topological (how many objects off), not metric. Metric distance punishes tapping the far end of a long bone and rewards tapping an unrelated neighbour.
- **Rule:** before designing scoring for a "guess the location" game, offer the user the discrete/topological option explicitly alongside the metric one, and make the discrete option the default when targets are named objects.
