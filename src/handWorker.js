// Runs MediaPipe hand tracking off the main thread so rendering never waits on it.
// Uses the Gesture Recognizer (hand landmarks + reliable built-in gestures such as ✌️ Victory and ✊ Closed_Fist);
// falls back to the plain Hand Landmarker if it can't load.
import { FilesetResolver, GestureRecognizer, HandLandmarker } from '@mediapipe/tasks-vision';

const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let task = null, kind = '', lastT = -1;

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
      const conf = { runningMode: 'VIDEO', numHands: m.numHands || 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
      const make = async (Cls, model, delegate) => Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: model, delegate }, ...conf });
      let delegate = m.delegate || 'CPU', gpuError = '';
      const tryBoth = async (Cls, model) => { try { return await make(Cls, model, delegate); } catch (err) { gpuError = String(err).slice(0, 200); delegate = 'CPU'; return make(Cls, model, 'CPU'); } };
      try { task = await tryBoth(GestureRecognizer, GESTURE_MODEL); kind = 'gesture'; }
      catch (err) { task = await tryBoth(HandLandmarker, HAND_MODEL); kind = 'landmarks'; }
      self.postMessage({ type: 'ready', delegate, gpuError, kind });
    } catch (err) { self.postMessage({ type: 'error', message: String(err) }); }
    return;
  }
  if (m.type === 'frame') {
    const t = Math.max(m.t, lastT + 1); lastT = t; // timestamps must strictly increase
    let res = null;
    const t0 = performance.now();
    try { res = kind === 'gesture' ? task.recognizeForVideo(m.bitmap, t) : task.detectForVideo(m.bitmap, t); } catch (err) { /* skip frame */ }
    const ms = performance.now() - t0;
    m.bitmap.close();
    const hd = res?.handedness ?? res?.handednesses ?? [];
    self.postMessage({ type: 'result', t: m.t, ms,
      landmarks: res?.landmarks ?? [], handedness: hd.map((h) => h?.[0]?.categoryName),
      // per hand: the top built-in gesture and its score (None / Closed_Fist / Open_Palm / Pointing_Up / Thumb_Down / Thumb_Up / Victory / ILoveYou)
      gestures: (res?.gestures ?? []).map((g) => ({ name: g?.[0]?.categoryName || 'None', score: g?.[0]?.score || 0 })) });
  }
};
