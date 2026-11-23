# Aether

**Make a universe with your hands.** Pinch stardust into stars, throw planets into orbit, feed a black hole — in the browser, with just a webcam (or a mouse). three.js WebGPU + TSL, MediaPipe hand tracking.

See [docs/PRODUCT.md](docs/PRODUCT.md) for what it is and why.

## Three places (top bar, or keys 1 · 2 · 3)
- **✦ Playground** — empty space full of stardust. Create anything.
- **☀ Solar System** — our real Sun and planets (NASA-based textures). You can add worlds here too.
- **◌ Universe** — 110 procedural galaxies; fly into one, visit its star systems and create there.

## Hands
| Gesture | Does |
|---|---|
| 🤏 pinch & hold, let go | gather stardust → **star** (longer = bigger) |
| 🤏 quick pinch, let go | **planet** (move as you let go to throw; a golden line previews the orbit) |
| 🤏 pinch a world | grab it, move it, throw it |
| 🤏🤏 both hands on one star, pull apart | it swells… then **supernova** |
| ✊✊ two fists together | **black hole** |
| 👉 point & hold | go closer (galaxy → system → planet close-up) |
| ✋✋ both palms still | go back |

## Mouse
Hold in space → star · click near a star → planet · drag a world → throw it · **B** → black hole · click/double-click a planet → close-up · **Esc** → back.

On battery, Chrome's Energy Saver caps pages at 30 fps — plug in or turn it off for 60 fps.

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
