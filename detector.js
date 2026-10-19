// On-device object detection: TensorFlow.js + COCO-SSD, loaded lazily on first use.
// The first load needs internet for the CDN scripts + model weights; after that the browser may cache them.
import { CONFIG } from './config.js';

let model = null, loading = null, timer = null, busy = false, prev = [];

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return i / (a[2] * a[3] + b[2] * b[3] - i || 1);
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load failed: ' + src));
    document.head.appendChild(s);
  });
}

export const Detector = {
  get ready() { return !!model; },

  async load() {
    if (model) return model;
    if (loading) return loading;
    loading = (async () => {
      await loadScript(CONFIG.TFJS_URL);
      await loadScript(CONFIG.COCO_URL);
      try { await window.tf.setBackend('webgl'); } catch (_) { /* cpu fallback */ }
      await window.tf.ready();
      model = await window.cocoSsd.load({ base: 'mobilenet_v2' }); // more accurate than lite
      try { await model.detect(document.createElement('canvas')); } catch (_) { /* warm-up */ }
      return model;
    })();
    try { return await loading; } finally { loading = null; }
  },

  /** One detection pass on the current video frame. Returns only what the model returned. */
  async detectOnce(videoEl) {
    if (!model || !videoEl.videoWidth) return [];
    const preds = (await model.detect(videoEl, 20, CONFIG.DETECT_MIN_SCORE)).filter(p => p.score >= CONFIG.DETECT_MIN_SCORE);
    // Temporal smoothing: keep a weak hit only if the same class overlapped in the previous pass.
    const out = preds.filter(p => p.score >= CONFIG.DETECT_STRONG_SCORE || prev.some(q => q.class === p.class && iou(q.bbox, p.bbox) > 0.3));
    prev = preds;
    return out;
  },

  /** Loop that always works on the latest frame; skips a tick if the previous is still running. */
  start(videoEl, onResult) {
    this.stop();
    timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { onResult(await this.detectOnce(videoEl)); }
      catch (e) { console.warn('detect error', e); }
      finally { busy = false; }
    }, CONFIG.DETECT_INTERVAL_MS);
  },
  stop() { clearInterval(timer); timer = null; busy = false; prev = []; }
};
