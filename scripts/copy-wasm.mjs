// Copies MediaPipe's WASM runtime into public/ so the hand-tracking worker can load it locally.
import { cpSync, existsSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
if (existsSync(src)) cpSync(src, 'public/mediapipe-wasm', { recursive: true });
