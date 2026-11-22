# Aether

Hold a galaxy in your hands. ~240,000 GPU particles in three.js WebGPU, controlled live by webcam hand tracking (MediaPipe), with a mouse fallback.

## Gestures
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
