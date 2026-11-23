# Aether: the universe in your hands (design)

**One line:** a whole universe in the browser that you **navigate across scales**, **create in**, and **shape with your hands**. No install, no controller.

## Why this is new (research, 2026-11-23)

Each existing piece does one slice:
- [Galaxy Explorer](https://github.com/zjoooooo/galaxy-explorer) (103★): click from the Milky Way into a solar system, using a staged wormhole jump.
- [Gravity Simulator](https://gravitysimulator.org/version-2/about/): inject bodies into real N-body gravity, with mouse and menus.
- Gargantua demos on the three.js forum: ray-traced black holes with lensing.
- [Voidstruck](https://windowsforum.com/news/voidstruck-free-299-kb-browser-game-generates-150-million-star-systems.453176/): procedural universe of 150M systems.
- [gesture-lab](https://github.com/quiet-node/gesture-lab) (185★): one galaxy controlled by hands.

Nobody combines multi-scale navigation, creation, real gravity and hand control.

## Pillars

1. **Navigate**: a continuous journey across scales.
   - **Cosmic web:** hundreds of galaxies strung along glowing filaments.
   - **Galaxy:** the 240k-star interactive galaxy, unique per galaxy: spiral, barred, elliptical or ring, with its own palette.
   - **Star system:** a sun, planets, rings and orbits.
   - **Planet:** a procedural surface with atmosphere.
2. **Create**: gestures spawn things that obey real GPU gravity.
   - Pinch-hold-release makes a star; hold longer for a bigger one.
   - Fling a planet into orbit.
   - Two fists make a black hole that swallows stars.
   - Point and draw to paint nebula gas.
   - Fist-burst on a star makes a supernova.
3. **Interact**: gravity sandbox, collisions and mergers, time control, and sound that reacts to events.
4. **Customize**: galaxy shape, arm count, palettes (Aurora, Ember, Ice, Synthwave), physics strength, trails, camera-feed style. Everything is seeded so a universe can be shared as a link.

## Controls

| Where | Hands | Mouse / keys |
|---|---|---|
| Universe | open palm drag = orbit · point at a galaxy and hold = fly in | drag = orbit · wheel = zoom · click a galaxy = fly in |
| Galaxy | sweep, pinch, point-comet, fist→open, two-hand Big Bang · hold both palms still = back out | drag · wheel · `Esc` = back to universe |
| Create (Phase B) | pinch-hold-release = star · flick = planet · two fists = black hole · point-draw = nebula | `1–4` select tool, click/drag |

## Phases

- **A: Navigable universe**
  - procedural cosmic web of galaxies, each with its own seed, shape and palette
  - camera rig driven by hands and mouse
  - fly-to transitions
  - diving into any galaxy swaps the impostor for the full interactive simulation
- **B: Create**
  - GPU N-body bodies (stars, planets, black holes) with trails and mergers
  - creation gestures
  - nebula painting
- **C: Star systems & planets**
  - procedural planets with atmosphere
  - ray-marched black hole with lensing
- **D: Customize & share**
  - control panel
  - palettes
  - seed URLs
  - reactive audio
  - polished recording
