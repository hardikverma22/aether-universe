# Aether: research on the best hand-controlled particle work (2026-11-23)

Sources: GitHub search (8+ queries), X search (top posts) on your logged-in account, plus reading the code of the leaders.

## Who's doing it best

| Project | Signal | What makes it work | Tech |
|---|---|---|---|
| **quiet-node/gesture-lab** ("Interactive Galaxy" + 5 other modes), gesturelab.icu | 185★, the top GitHub repo for this | **Same concept as Aether:** a galaxy between your hands. Spread hands to resize, pinch for star bursts, close hands for a "Big Bang". Shows the **dimmed camera feed**, so you see yourself. | three.js r160 WebGL, ~20k particles, MediaPipe on the main thread, **One Euro filter** and EMA smoothing, **gesture hysteresis + cooldowns**, an explosion **state machine** (implode → singularity → explode → fade), bloom, chromatic aberration, color grading, gravitational lensing |
| **measure_plan / collidingScopes** | X posts with 1.7K–1.9K likes; repos at 188–265★ | Simple tech with great presentation: short loopable clips of a **real person** shaping 3D things with their hands, plus tutorials and open code. Later added **Depth-Anything** for real Z movement. | Legacy MediaPipe Hands plus plain lerp smoothing (0.15). Technically simpler than Aether. |
| **chirovisuals, Elemental Sandbox** | 488 likes, 23K views (Sep 2026), open source | Gestures cast **abilities**: open palm aims, fist casts, point does something else. 6–9 elemental VFX, "everything generated". | Hand-written GLSL, GPU-simulated instanced particles |
| **MariuszMitkow** (no hands) | 547 likes (Nov 2026) | "150,000 fragments, one invisible boundary": a single light pushes everything away | Compute-shader physics, custom depth of field, soft shadows. The visual quality bar. |
| **thomasauros, Particle Faces** | 1.4K likes (Nov 2026) | Particles forming faces, WebGPU + R3F | WebGPU particles |

## What this means for Aether

1. **Aether as built is not novel.** gesture-lab's Interactive Galaxy is the same idea. Our only edges right now are 10× more particles (WebGPU compute) and smoother rendering.
2. **The viral clips show the person.** Every high-engagement post shows a real human with magic around their hands. Aether hides the camera, which kills the "it's really me" moment and makes weaker videos.
3. **Polish techniques the leaders use that Aether lacks:**
   - **One Euro filter** (adaptive: smooth when still, responsive when fast) instead of fixed lerp
   - **gesture hysteresis + cooldowns**, so pinch and fist don't flicker
   - an **event arc** for big moments: implode → singularity → explosion → fade, plus screen-space lensing and chromatic aberration
4. **Interaction depth:** gestures that *cast* distinct effects (chirovisuals) are more fun than one force per hand.
5. **Performance:** nobody else runs tracking in a worker. Our speed fix (render cap + 1.25× DPR + GPU tracker in a worker, 54–60 Hz) is already ahead of the field.

## Upgrade plan (to stand out, not just match)

1. **Show the person:** a dimmed, stylized camera feed (duotone or edge-glow), with the stars wrapping your *actual* hands.
2. **Whole-hand physics:** all 21 hand points act as colliders or attractors, and stars stream off your fingertips. Leaders use one point per hand.
3. **One Euro filter + gesture hysteresis.**
4. **A cinematic "Big Bang"** with a state machine, lensing and chromatic aberration.
5. **Three to four "spells"** mapped to clear gestures (palm push, pinch-grab, fist-charge-release, two-hand stretch).
6. **One-tap 9:16 clip recording** for sharing.
