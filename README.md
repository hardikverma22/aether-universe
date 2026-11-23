# Aether

**Make a universe with your hands.** Pinch stardust into stars, throw planets into orbit, feed a black hole — in the browser, with just a webcam (or a mouse). three.js WebGPU + TSL, MediaPipe hand tracking.

See [docs/PRODUCT.md](docs/PRODUCT.md) for what it is and why.

## Three places (top bar, or keys 1 · 2 · 3)
- **✦ Playground**: empty space full of stardust. Create anything. Open **Customise** (right) to choose what you make
  (auto, star, planet, black hole), star colour and planet type, bend time (pause to 4×) and gravity, recolour the
  stardust, start from a scene (solar system, binary stars, black hole feast, planet crash, star cluster, surprise me),
  and **share a link** that rebuilds your creation exactly.
- **☀ Solar System**: our real Solar System, explore-only. Planets and the Moon are where they really are today
  (astronomy-engine), on their true axes; Earth shows the real time of day. 8K/4K NASA-based textures, Moon crater
  relief from LRO, NASA spacecraft models (ISS, Hubble, James Webb at L2, Juno, Cassini, Voyager 1). Click anything for
  NASA fact-sheet numbers, live distance and light travel time, and facts. **True scale** (T) shows real sizes and
  distances; the legend on the right finds anything too small to see. Clock: live, 1 day/s, 1 month/s.
- **◌ Universe**: 110 procedural galaxies; fly into one, visit its star systems and create there.

## Hands
| Gesture | Does |
|---|---|
| 🤏 pinch & hold, let go | gather stardust → **star** (longer = bigger) |
| 🤏 quick pinch, let go | **planet** (move as you let go to throw; a golden line previews the orbit) |
| 🤏 pinch a world | grab it, move it, throw it |
| 🤏🤏 both hands on one star, pull apart | it swells… then **supernova** |
| ✌️ hold a peace sign (½ s) | **black hole** |
| 👉 point & hold | go closer (galaxy → system → planet close-up); on a button, presses it (Customise, legend, clock, tabs) |
| ✋✋ both palms still | go back |

## Mouse
Hold in space → star · click near a star → planet · drag a world → throw it · **B** → black hole · click a planet → close-up and info · **← →** next/previous body · **Esc** → back.

On battery, Chrome's Energy Saver caps pages at 30 fps — plug in or turn it off for 60 fps.

## Play gestures
- **Sweep**: blow the stars
- **Pinch**: gather a handful
- **Point**: draw a comet with your fingertip
- **Fist → open**: explode
- **Both hands together, then pull apart**: Big Bang

`V` toggles your camera feed, `R` records a 9:16 clip, `M` sound, `?` all shortcuts. Add `?debug` for frame time and tracking stats, `?lite` for lighter graphics (also switched on automatically if frames stay slow).

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5195 in a WebGPU browser (Chrome, Edge, Safari 26+).

## Stack
three.js r187 (`WebGPURenderer`, TSL compute), MediaPipe Tasks Vision (hand landmarker in a Web Worker), GSAP, Vite.
