// Live GPS via Geolocation. Nothing is stored or transmitted; only held in memory.
import { CONFIG } from './config.js';

let watchId = null;
let last = null;

export const GPS = {
  supported: 'geolocation' in navigator,
  get active() { return watchId !== null; },
  get last() { return last; },

  start(onUpdate, onError) {
    if (!this.supported) { onError({ code: 'unsupported' }); return; }
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      pos => {
        last = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, hdg: pos.coords.heading, spd: pos.coords.speed, at: pos.timestamp };
        onUpdate(last);
      },
      err => onError({ code: err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout', message: err.message }),
      { enableHighAccuracy: true, maximumAge: CONFIG.GPS_MAX_AGE_MS, timeout: 15000 }
    );
  },

  stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    last = null; // do not keep location after stopping
  },

  /** One-shot fix (used by tests / voice command when watch is off). */
  getOnce() {
    return new Promise((resolve, reject) => {
      if (!this.supported) return reject({ code: 'unsupported' });
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
        e => reject({ code: e.code === 1 ? 'denied' : 'unavailable' }),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  },

  mapUrl(p) { return `https://www.google.com/maps?q=${p.lat},${p.lon}`; },

  speakText(p) {
    const acc = Math.round(p.acc);
    return `Your location is latitude ${p.lat.toFixed(4)}, longitude ${p.lon.toFixed(4)}. Accuracy is about ${acc} meters.`;
  }
};
