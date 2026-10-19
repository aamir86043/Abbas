// Testing panel. Each test reports what actually happened: pass | warn | fail.
import { SAY } from './phrases.js';
import { Speech } from './speech.js';
import { classify } from './alerts.js';
import { Sensor } from './sensor.js';
import { GPS } from './gps.js';
import { Voice } from './voice.js';

Speech.init();

const CASES = [
  [200, 'clear'], [101, 'clear'], [100, 'caution'], [61, 'caution'], [60, 'warning'],
  [36, 'warning'], [35, 'critical'], [20, 'critical']
];

const tests = [
  {
    id: 'camera', name: 'Camera permission test',
    async run() {
      if (!navigator.mediaDevices?.getUserMedia) return ['fail', 'This browser has no camera API (HTTPS or localhost is required).'];
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        const t = s.getVideoTracks()[0];
        const info = `${t.label || 'camera'} (${t.getSettings().width}x${t.getSettings().height})`;
        s.getTracks().forEach(x => x.stop());
        return ['pass', 'Camera found: ' + info];
      } catch (e) { return ['fail', `${e.name}: ${e.message}`]; }
    }
  },
  {
    id: 'mic', name: 'Microphone test',
    async run() {
      const rec = Voice.supported ? 'SpeechRecognition available' : 'SpeechRecognition is NOT available (voice commands will not work)';
      if (!navigator.mediaDevices?.getUserMedia) return ['fail', 'No microphone API. ' + rec];
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(x => x.stop());
        return [Voice.supported ? 'pass' : 'warn', 'Microphone permission granted. ' + rec];
      } catch (e) { return ['fail', `${e.name}: ${e.message}. ${rec}`]; }
    }
  },
  {
    id: 'tts', name: 'Speech test',
    run() {
      return new Promise(resolve => {
        if (!Speech.supported) return resolve(['fail', 'SpeechSynthesis is not available.']);
        const hasHi = Speech.hasVoice();
        const u = new SpeechSynthesisUtterance('Hello, I am Saathi AI. Can you hear my voice?');
        u.lang = 'en-US';
        let started = false;
        u.onstart = () => { started = true; };
        u.onend = () => resolve([hasHi ? 'pass' : 'warn',
          `Speech ran (started=${started}). English voice ${hasHi ? 'found' : 'NOT found, default voice used'}. Please confirm yourself whether you heard it.`]);
        u.onerror = e => resolve(['fail', 'Speech error: ' + e.error]);
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setTimeout(() => { if (!started) resolve(['warn', 'Speech did not start (the browser may need a tap first).']); }, 6000);
      });
    }
  },
  {
    id: 'gps', name: 'GPS permission and accuracy test',
    async run() {
      try {
        const p = await GPS.getOnce();
        const a = Math.round(p.acc);
        return [a <= 100 ? 'pass' : 'warn', `Location found. Accuracy ±${a} m` + (a > 100 ? ' (weak, try outdoors)' : '') + '. (Coordinates are not shown or stored.)'];
      } catch (e) { return ['fail', 'Location not found: ' + e.code]; }
    }
  },
  {
    id: 'vib', name: 'Vibration test',
    run() {
      if (!Speech.vibrationSupported) return ['fail', 'Vibration API is not available on this device/browser (usually not on iPhone).'];
      const ok = navigator.vibrate([300, 100, 300]);
      return [ok ? 'warn' : 'fail', ok ? 'Vibrate command accepted. Please confirm yourself whether you felt it.' : 'The browser refused the vibrate command.'];
    }
  },
  {
    id: 'sim', name: 'Simulated obstacle distance test',
    run() {
      const bad = CASES.filter(([cm, exp]) => classify(cm, 'connected') !== exp).map(([cm, exp]) => `${cm}cm -> ${classify(cm, 'connected')} (expected ${exp})`);
      const extra = [
        classify(null, 'connected') === 'unavailable', classify(NaN, 'connected') === 'unavailable',
        classify(50, 'stale') === 'unavailable', classify(50, 'invalid') === 'unavailable', classify(50, 'disconnected') === 'unavailable'
      ];
      if (bad.length || extra.includes(false)) return ['fail', 'Wrong: ' + bad.join('; ') + (extra.includes(false) ? ' | invalid/stale handling wrong' : '')];
      return ['pass', `${CASES.length} distance cases + invalid/stale/disconnected classified correctly (simulation, not a real sensor).`];
    }
  },
  {
    id: 'ble', name: 'BLE connection test (you must choose a device)', manual: true,
    async run() {
      if (!Sensor.bleSupported) return ['fail', 'Web Bluetooth is not available in this browser.'];
      try { const n = await Sensor.connectBle(); Sensor.disconnectBle(); return ['pass', `Connected and disconnected: ${n}`]; }
      catch (e) { return [e.name === 'NotFoundError' ? 'warn' : 'fail', `${e.name}: ${e.message}`]; }
    }
  },
  {
    id: 'offline', name: 'Offline mode test',
    run() {
      if (navigator.onLine) return ['warn', 'The device is online now. Turn on airplane mode and run again. (Local alert logic is checked separately by the simulation test.)'];
      const ok = classify(30, 'connected') === 'critical';
      return [ok ? 'pass' : 'fail', ok ? 'Offline and the sensor alert logic runs locally.' : 'Alert logic failed offline.'];
    }
  },
  {
    id: 'disc', name: 'Sensor disconnect test',
    run() {
      Sensor.enableSimulation(); Sensor.setSimDistance(30);
      const before = classify(Sensor.get().distance, Sensor.get().status);
      Sensor.simDisconnect();
      const after = classify(Sensor.get().distance, Sensor.get().status);
      Sensor.stop();
      const ok = before === 'critical' && after === 'unavailable';
      return [ok ? 'pass' : 'fail', `Before: ${before}, after disconnect: ${after}. Message: "${SAY.sensorUnavailable}"`];
    }
  },
  {
    id: 'camfail', name: 'Camera failure test (impossible request)',
    async run() {
      if (!navigator.mediaDevices?.getUserMedia) return ['warn', 'There is no camera API, so the failure path is already active.'];
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: 'saathi-nonexistent-device' } } });
        s.getTracks().forEach(x => x.stop());
        return ['fail', 'The impossible request succeeded; the failure path could not be tested.'];
      } catch (e) {
        Speech.say(SAY.cameraFail, { priority: 'urgent' });
        return ['pass', `Failure caught (${e.name}). Message: "${SAY.cameraFail}"`];
      }
    }
  }
];

const root = document.getElementById('tests');
const rows = {};
tests.forEach(t => {
  const row = document.createElement('div'); row.className = 'test';
  const h = document.createElement('strong'); h.textContent = t.name;
  const res = document.createElement('div'); res.className = 'res idle'; res.setAttribute('aria-live', 'polite'); res.textContent = 'Not run yet.';
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Run test';
  b.addEventListener('click', () => exec(t));
  row.append(h, b, res); root.append(row);
  rows[t.id] = { res, b };
});

async function exec(t) {
  const { res, b } = rows[t.id];
  b.disabled = true; res.className = 'res idle'; res.textContent = 'Running...';
  try {
    const [status, msg] = await t.run();
    res.className = 'res ' + status;
    res.textContent = `${status.toUpperCase()}: ${msg}`;
  } catch (e) { res.className = 'res fail'; res.textContent = 'FAIL: ' + e.message; }
  b.disabled = false;
}

document.getElementById('runAll').addEventListener('click', async () => {
  for (const t of tests) if (!t.manual) await exec(t);
});
