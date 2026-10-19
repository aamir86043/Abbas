// Camera-based distance ESTIMATE (pinhole model: distance = real height x focal / pixel height).
// Needs a known object class and a fully visible object. Accuracy roughly +/-30%. Not a measurement.
import { CONFIG } from './config.js';

export const Depth = {
  /** Returns { cm, state } where state: 'ok' | 'far' (beyond max range) | 'cut' (object cut by frame) | 'unknown' (no known size). */
  estimate(d, frameW, frameH) {
    const D = CONFIG.DEPTH;
    const real = D.HEIGHTS_CM[d.class];
    if (!real) return { cm: null, state: 'unknown' };
    const [, y, , h] = d.bbox;
    if (y <= 4 || y + h >= frameH - 4 || h < 8) return { cm: null, state: 'cut' };
    const f = Math.hypot(frameW, frameH) / (2 * Math.tan(D.DIAG_FOV_DEG * Math.PI / 360));
    const cm = (real * f) / h;
    return cm > CONFIG.THRESHOLDS.max ? { cm: null, state: 'far' } : { cm: Math.round(cm), state: 'ok' };
  },

  /** Average brightness 0-255 of the current frame. Low value = detection and estimates less reliable. */
  brightness(video) {
    if (!video.videoWidth) return 255;
    const c = Depth._c || (Depth._c = document.createElement('canvas'));
    c.width = 32; c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(video, 0, 0, 32, 24);
    const px = x.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    return sum / (px.length / 4);
  }
};
