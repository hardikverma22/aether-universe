# Aether

A universe in your hands. Fly through a cosmic web of 110 procedural galaxies, dive into any of them (240,000 GPU particles each), and create stars, planets, black holes and nebulae with real gravity, controlled live by webcam hand tracking (MediaPipe) or the mouse. Built on three.js WebGPU.

## The journey
One continuous trip with a breadcrumb at the top and a panel saying what you can do at each level:

1. **Universe**: 110 procedural galaxies on the cosmic web. Drag/scroll, or open palm / two palms; click or point-and-hold a galaxy to fly in.
2. **Galaxy**: 240k-particle galaxy you can play with (sweep, pinch, fist→open, two-hand Big Bang), plus glowing star systems. Aether Prime contains **Sol**.
3. **Star system**: our real **Solar System** (NASA-based textures: Sun, 8 planets, Moon, Saturn's rings, Milky Way sky, real tilts, Kepler orbits) or a procedural exoplanet system built from the same real surfaces. **✦ Create** (C) lives here: launch planets into orbit, add stars, black holes, nebulae.
4. **Close-up**: click or point-and-hold any planet, moon or the Sun.

Esc, scrolling out, holding both palms still, or the breadcrumb takes you back up. `?seed=42` generates a different universe.

Textures: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0), see `public/textures/CREDITS.md`.

## Play gestures
- **Sweep**: blow the stars
- **Pinch**: gather a handful
- **Point**: draw a comet with your fingertip
- **Fist → open**: explode
- **Both hands together, then pull apart**: Big Bang

`V` toggles your camera feed, `R` records a 9:16 clip. Add `?debug` for render/tracking stats.

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5195 in a WebGPU browser (Chrome, Edge, Safari 26+).

## Stack
three.js r187 (`WebGPURenderer`, TSL compute), MediaPipe Tasks Vision (hand landmarker in a Web Worker), GSAP, Vite.
