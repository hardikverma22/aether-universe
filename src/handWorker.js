// Runs MediaPipe hand tracking off the main thread so rendering never waits on it.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let landmarker = null, lastT = -1;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const fileset = await FilesetResolver.forVisionTasks(m.wasmBase);
      // Module workers have no working importScripts, which MediaPipe uses to load its WASM glue.
      // Evaluate the glue ourselves (defines self.ModuleFactory), then make importScripts a no-op.
      const glue = await (await fetch(fileset.wasmLoaderPath)).text();
      (0, eval)(glue);
      self.importScripts = () => {};
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: m.numHands || 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      let delegate = m.delegate || 'CPU', gpuError = '';
      try { landmarker = await HandLandmarker.createFromOptions(fileset, opts(delegate)); }
      catch (err) { gpuError = String(err).slice(0, 200); delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
      self.postMessage({ type: 'ready', delegate, gpuError });
    } catch (err) { self.postMessage({ type: 'error', message: String(err) }); }
    return;
  }
  if (m.type === 'frame') {
    const t = Math.max(m.t, lastT + 1); lastT = t; // timestamps must strictly increase
    let res = null;
    const t0 = performance.now();
    try { res = landmarker.detectForVideo(m.bitmap, t); } catch (err) { /* skip frame */ }
    const ms = performance.now() - t0;
    m.bitmap.close();
    self.postMessage({ type: 'result', t: m.t, ms,
      landmarks: res?.landmarks ?? [], handedness: (res?.handedness ?? []).map((h) => h?.[0]?.categoryName) });
  }
};
