# Aether

A universe in your hands. Fly through a cosmic web of 110 procedural galaxies, dive into any of them (240,000 GPU particles each), and create stars, planets, black holes and nebulae with real gravity, controlled live by webcam hand tracking (MediaPipe) or the mouse. Built on three.js WebGPU.

## Universe
- **Mouse:** drag to turn, scroll to zoom, click a galaxy to fly in. `Esc` / scroll out to return.
- **Hands:** open palm turns the sky, two palms spread to zoom, point at a galaxy and hold to fly in. Hold both palms still inside a galaxy to zoom back out.
- `?seed=42` generates a different universe.

## Create (`C`)
- **Hands:** pinch & release = planet (auto-orbits), pinch & hold = star (bigger the longer), two fists together = black hole, point = paint nebula, fist → open next to a star = supernova.
- **Mouse:** `1` star (hold), `2` planet (click to orbit, drag to fling), `3` black hole, `4` nebula (drag), `5` supernova (click a star).
- Bodies attract each other and the galaxy's stars; black holes swallow stars and merge with what they catch; massive supernovae collapse into black holes.

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
