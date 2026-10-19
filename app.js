// Saathi AI - main controller. Wires modules to the dashboard.
import { CONFIG } from './config.js';
import { SAY, describeDetections, objLabel } from './phrases.js';
import { Speech } from './speech.js';
import { Alerts, classify } from './alerts.js';
import { Sensor } from './sensor.js';
import { Camera } from './camera.js';
import { Detector } from './detector.js';
import { GPS } from './gps.js';
import { Gemini } from './gemini.js';
import { Voice, matchCommand } from './voice.js';
import { Depth } from './depth.js';

const $ = id => document.getElementById(id);
const el = {
  video: $('video'), videoWrap: document.querySelector('.video-wrap'),
  pill: $('statePill'), btnStart: $('btnStart'), btnStop: $('btnStop'), btnMic: $('btnMic'),
  micLabel: $('micLabel'), micNote: $('micNote'), alert: $('alertBanner'),
  btnCam: $('btnCamToggle'), btnAhead: $('btnWhatsAhead'), btnDescribe: $('btnDescribe'),
  detectStatus: $('detectStatus'), detectList: $('detectList'), scene: $('sceneText'),
  distance: $('distance'), rangeDot: $('rangeDot'), hdg: $('hdg'), spd: $('spd'), obsLevel: $('obsLevel'), obsSource: $('obsSource'), obsStatus: $('obsStatus'),
  slider: $('slider'), sliderOut: $('sliderOut'), btnBle: $('btnBle'), btnSim: $('btnSimMode'), bleNote: $('bleNote'),
  lat: $('lat'), lon: $('lon'), acc: $('acc'), gpsStatus: $('gpsStatus'),
  btnGps: $('btnGps'), btnSayLoc: $('btnSayLoc'), btnMap: $('btnMap'),
  chipNet: $('chipNet'), chipBle: $('chipBle'), chipCam: $('chipCam'), chipGps: $('chipGps'),
  chipVoice: $('chipVoice'), chipOut: $('chipOut'), fallback: $('fallbackMsg'), heard: $('heard')
};

const app = { active: false, level: 'unavailable', online: navigator.onLine, cloudConsent: false, tick: null, modelFailed: false };

/* ---------- helpers ---------- */
function say(text, priority = 'routine') { return Speech.say(text, { priority }); }
function chip(node, text, ok) { node.textContent = text; node.classList.toggle('ok', ok === true); node.classList.toggle('bad', ok === false); }
function setFallback(msg) { el.fallback.textContent = msg; }

Speech.setFallbackHandler((code, text) => {
  if (code === 'ttsNo') { setFallback(SAY.ttsNo); if (text) showBanner('unavailable', text); }
  else if (code === 'ttsNoVoice') setFallback('No English voice installed. The device default voice may be used.');
  else if (code === 'vibrationNo') setFallback(SAY.vibrationNo);
});

/* ---------- visual state ---------- */
function renderState() {
  let s = 'ready', label = 'Ready';
  if (!app.online) { s = 'offline'; label = 'Offline'; }
  if (Detector.ready && Camera.active) { s = 'detecting'; label = 'Detecting'; }
  if (Voice.listening) { s = 'listening'; label = 'Listening'; }
  if (app.active && !app.online) { s = 'offline'; label = 'Offline'; }
  if (app.active && ['unavailable'].includes(app.level)) { s = 'sensor-off'; label = 'Sensor Disconnected'; }
  if (app.active && (app.level === 'caution' || app.level === 'warning')) { s = 'warning'; label = 'Warning'; }
  if (app.active && app.level === 'critical') { s = 'critical'; label = 'Critical Warning'; }
  document.body.dataset.state = s;
  el.pill.textContent = label;
}

function showBanner(level, text) {
  el.alert.className = 'alert ' + level;
  el.alert.textContent = text;
}
function hideBanner() { el.alert.className = 'alert hidden'; el.alert.textContent = ''; }

/* ---------- sensor ---------- */
const LEVEL_TEXT = {
  clear: 'No obstacle found within sensor range',
  caution: 'Caution', warning: 'Warning', critical: 'Critical warning', unavailable: 'Sensor unavailable'
};
const STATUS_TEXT = { connected: 'Connected', disconnected: 'Disconnected', stale: 'Stale Data', invalid: 'Invalid Reading' };

function onSensor(s) {
  app.level = classify(s.distance, s.status);
  const real = s.source === 'ble';
  el.distance.textContent = s.status === 'connected' && s.distance != null ? `${Math.round(s.distance)} cm` : '-- cm';
  el.rangeDot.style.left = (s.status === 'connected' && s.distance != null ? Math.min(100, s.distance / CONFIG.THRESHOLDS.max * 100) : 0) + '%';
  el.obsLevel.textContent = LEVEL_TEXT[app.level];
  el.obsLevel.parentElement.parentElement.dataset.level = app.level;
  el.obsSource.textContent = real ? 'Real BLE sensor' : 'Simulation Mode';
  el.obsSource.className = 'src ' + (real ? 'real' : 'sim');
  el.obsStatus.textContent = `Sensor status: ${STATUS_TEXT[s.status]} (${real ? 'BLE' : 'simulation'})`;
  chip(el.chipBle, `Bluetooth sensor: ${real ? STATUS_TEXT[s.status] : 'Simulation Mode'}`, real ? s.status === 'connected' : null);
  if (app.active) {
    if (app.level === 'clear') hideBanner();
    else showBanner(app.level, bannerText(app.level));
    Alerts.handle(app.level);
  }
  renderState();
}
function bannerText(level) {
  return { caution: SAY.caution, warning: SAY.warning, critical: SAY.critical, unavailable: SAY.sensorUnavailable }[level];
}

function sensorSpeech() {
  const s = Sensor.get();
  if (s.status === 'disconnected') return 'The sensor is not connected.';
  if (s.status === 'stale') return 'Sensor data is stale. ' + SAY.sensorUnavailable;
  if (s.status === 'invalid') return 'Sensor reading is invalid.';
  const src = s.source === 'ble' ? 'Bluetooth sensor is connected.' : 'Sensor is in simulation mode, not a real sensor.';
  const d = s.distance != null ? ` Distance is about ${Math.round(s.distance)} centimeters.` : '';
  return src + d;
}

/* ---------- menu bar (camera mode shows only the mic + this menu) ---------- */
function setPanel(id) {
  document.querySelectorAll('main > .card').forEach(c => c.classList.toggle('open', c.id === id));
  document.querySelectorAll('#menuBar button[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.target === id)));
}

/* ---------- camera + detection ---------- */
function withDistance(dets) {
  const w = el.video.videoWidth, h = el.video.videoHeight;
  dets.forEach(d => { const r = Depth.estimate(d, w, h); d.distCm = r.cm; d.distState = r.state; });
  return dets.sort((a, b) => (a.distCm ?? 1e9) - (b.distCm ?? 1e9));
}
let lastSpokeAt = 0;
function drawBoxes(dets) {
  const c = $('overlay'), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
  const vw = el.video.videoWidth, vh = el.video.videoHeight; if (!vw) return;
  const s = Math.max(w / vw, h / vh), ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
  g.lineWidth = 3; g.font = 'bold 14px system-ui';
  dets.slice(0, 6).forEach(d => {
    const [x, y, bw, bh] = d.bbox, X = x * s + ox, Y = y * s + oy;
    const col = !d.distCm ? '#1f6bff' : d.distCm < 150 ? '#ff3b3b' : d.distCm < 300 ? '#ffb347' : '#2fd27a';
    const t = objLabel(d.class) + (d.distCm ? ` ${(d.distCm / 100).toFixed(1)} m` : '');
    g.strokeStyle = col; g.strokeRect(X, Y, bw * s, bh * s);
    g.fillStyle = col; g.fillRect(X, Math.max(0, Y - 22), g.measureText(t).width + 12, 22);
    g.fillStyle = '#04141f'; g.fillText(t, X + 6, Math.max(16, Y - 6));
  });
}
// Repeats every 5 s while the camera is on: nearest 3-4 objects (+ Bluetooth sensor reading if close).
function announce(dets) {
  if (!Camera.active || Date.now() - lastSpokeAt < 5000) return;
  const near = dets.filter(d => d.distState !== 'far').slice(0, 4);
  if (!near.length) return;
  const s = Sensor.get();
  const sen = s.status === 'connected' && s.distance != null && s.distance <= 300
    ? `Sensor reports an obstacle about ${(s.distance / 100).toFixed(1)} meters ahead. ` : '';
  const txt = describeDetections(near, el.video.videoWidth);
  el.scene.textContent = txt;
  if (Speech.say(sen + txt, { priority: 'routine' })) lastSpokeAt = Date.now();
}
function distText(d) {
  return d.distCm ? `≈ ${(d.distCm / 100).toFixed(1)} m` : d.distState === 'far' ? '(beyond 5 m)' : '(distance unknown)';
}
function camUi(on) {
  document.body.classList.toggle('cam-mode', on);
  if (!on) { const c = $('overlay'); c.getContext('2d').clearRect(0, 0, c.width, c.height); } if (!on) setPanel('');
  el.videoWrap.classList.toggle('live', on);
  el.btnCam.textContent = on ? 'Turn camera off' : 'Turn camera on';
  chip(el.chipCam, on ? 'Camera: on' : 'Camera: off', on ? true : null);
  if (!on) { el.detectList.replaceChildren(); el.detectStatus.textContent = 'Camera is off.'; }
}

async function startCamera() {
  if (Camera.active) return true;
  try {
    await Camera.start(el.video);
  } catch (e) {
    const msg = e.code === 'denied' ? SAY.cameraDenied : e.code === 'unsupported' ? 'Camera is not available in this browser.' : SAY.cameraFail;
    el.detectStatus.textContent = msg; say(msg, 'urgent'); camUi(false); renderState();
    return false;
  }
  camUi(true); say(SAY.cameraOn);
  loadAndDetect();
  return true;
}

async function loadAndDetect() {
  el.detectStatus.textContent = 'Loading object detection model...';
  try {
    if (!Detector.ready) { if (!app.online) throw new Error('offline'); say(SAY.modelLoading); }
    await Detector.load();
    app.modelFailed = false;
  } catch (e) {
    app.modelFailed = true;
    el.detectStatus.textContent = SAY.modelFail + ' (Camera preview will continue.)';
    return;
  }
  if (!Camera.active) return;
  el.detectStatus.textContent = 'Detecting (on-device model)';
  Detector.start(el.video, dets => {
    dets = withDistance(dets);
    drawBoxes(dets); announce(dets);
    el.detectList.replaceChildren(...dets.map(d => {
      const li = document.createElement('li');
      li.textContent = `${objLabel(d.class)} ${distText(d)}`;
      return li;
    }));
    const dark = Depth.brightness(el.video) < 40 ? ' Low light, so estimates are less reliable.' : '';
    el.detectStatus.textContent = (dets.length ? `${dets.length} object(s) found (distance is an estimate, ±30%).` : 'No objects found right now.') + dark;
  });
  renderState();
}

function stopCamera() {
  Detector.stop(); Camera.stop(el.video); camUi(false); say(SAY.cameraOff); renderState();
}

async function whatsAhead() {
  if (!Camera.active) { el.scene.textContent = SAY.cameraNeeded; say(SAY.cameraNeeded); return; }
  try {
    if (!Detector.ready) { say(SAY.modelLoading); await Detector.load(); }
    const dets = withDistance(await Detector.detectOnce(el.video));
    const text = describeDetections(dets, el.video.videoWidth);
    el.scene.textContent = text; say(text, 'urgent');
  } catch (_) { el.scene.textContent = SAY.modelFail; say(SAY.modelFail); }
}

async function describeCloud() {
  if (!Camera.active) { el.scene.textContent = SAY.cameraNeeded; say(SAY.cameraNeeded); return; }
  if (!app.online) { el.scene.textContent = SAY.needOnline; say(SAY.needOnline); return; }
  { const e = await Gemini.verify(); if (e) { el.scene.textContent = e.message; say(e.message, 'urgent'); showKeyError(e.code === 'network' ? null : e); return; } }
  if (!app.cloudConsent) {
    app.cloudConsent = window.confirm('One photo will be sent to Google Gemini to describe it in detail. Do you agree?');
    if (!app.cloudConsent) return;
  }
  say(SAY.describing); el.scene.textContent = SAY.describing;
  try {
    const jpg = Camera.captureJpeg(el.video, 640, 0.6);
    if (!jpg) throw new Error('no frame');
    const text = await Gemini.describe(jpg);
    el.scene.textContent = text; say(text, 'urgent');
  } catch (e) {
    console.warn(e);
    const m = e.code ? e.message : SAY.describeFail;
    el.scene.textContent = m; say(m, 'urgent'); if (e.code) showKeyError(e);
  }
}

/* ---------- Gemini key status ---------- */
function showKeyError(e) {
  const k = $('keyAlert'); if (!e) { k.classList.add('hidden'); return; }
  k.innerHTML = `⚠️ ${e.message}<small>The online AI description will not work until this is fixed. On-device camera detection keeps working.</small>`;
  k.classList.remove('hidden');
}
async function checkKey(speak) {
  if (!app.online) return;
  const e = await Gemini.verify();
  showKeyError(e && e.code !== 'network' ? e : null);
  if (e && e.code !== 'network' && speak) say(e.message, 'urgent');
}

/* ---------- GPS ---------- */
function startGps() {
  el.gpsStatus.textContent = 'Asking for location permission...';
  GPS.start(p => {
    el.lat.textContent = p.lat.toFixed(5); el.lon.textContent = p.lon.toFixed(5);
    el.acc.textContent = `±${Math.round(p.acc)} m`;
    el.hdg.textContent = p.hdg != null && !isNaN(p.hdg) ? Math.round(p.hdg) + '°' : '--';
    el.spd.textContent = p.spd != null ? (p.spd * 3.6).toFixed(1) + ' km/h' : '--';
    el.gpsStatus.textContent = p.acc > 50 ? 'Live location is on, but accuracy is low (move to an open area).' : 'Live location is on.';
    el.btnMap.href = GPS.mapUrl(p); el.btnMap.classList.remove('disabled'); el.btnMap.setAttribute('aria-disabled', 'false');
    chip(el.chipGps, 'GPS: on', true);
    el.btnGps.textContent = 'Turn location off';
  }, err => {
    const msg = err.code === 'denied' ? SAY.gpsDenied : err.code === 'unsupported' ? SAY.gpsUnsupported : SAY.gpsFail;
    el.gpsStatus.textContent = 'Warning: ' + msg; chip(el.chipGps, 'GPS: unavailable', false); say(msg);
    GPS.stop(); el.btnGps.textContent = 'Turn location on';
  });
}
function stopGps() {
  GPS.stop();
  el.lat.textContent = el.lon.textContent = el.acc.textContent = el.hdg.textContent = el.spd.textContent = '--';
  el.gpsStatus.textContent = 'Location is off.';
  el.btnMap.href = '#'; el.btnMap.classList.add('disabled'); el.btnMap.setAttribute('aria-disabled', 'true');
  chip(el.chipGps, 'GPS: off', null); el.btnGps.textContent = 'Turn location on';
}
function sayLocation() {
  if (!GPS.active || !GPS.last) { el.gpsStatus.textContent = SAY.gpsNeeded; say(SAY.gpsNeeded); if (!GPS.active) startGps(); return; }
  say(GPS.speakText(GPS.last), 'urgent');
}

/* ---------- voice ---------- */
function micUi(on) {
  el.btnMic.classList.toggle('on', on); el.btnMic.setAttribute('aria-pressed', String(on));
  el.micLabel.textContent = on ? 'Listening... speak now' : 'Tap to speak';
}
function listen() {
  if (!Voice.supported) { el.micNote.textContent = SAY.micUnsupported; say(SAY.micUnsupported); return; }
  if (Voice.listening) { Voice.stop(); return; }
  Speech.stopSpeaking();
  Voice.listen({
    onStart() { micUi(true); renderState(); el.micNote.textContent = 'Listening... There is no wake word; tap the button for each command.'; },
    onResult(alts) {
      el.heard.textContent = 'Heard: ' + alts[0];
      const id = alts.map(matchCommand).find(Boolean);
      if (id) runCommand(id); else { say(SAY.notUnderstood); }
    },
    onError(code) {
      const msg = code === 'denied' ? SAY.micDenied : code === 'unsupported' ? SAY.micUnsupported
        : code === 'nospeech' ? 'Nothing was heard. Please try again.'
        : code === 'network' ? 'Voice recognition may need an internet connection.' : 'Voice recognition is not working.';
      el.micNote.textContent = msg; say(msg);
    },
    onEnd() { micUi(false); renderState(); }
  });
}

function runCommand(id) {
  switch (id) {
    case 'start': startAssistance(); break;
    case 'whatsAhead': whatsAhead(); break;
    case 'location': sayLocation(); break;
    case 'sensor': say(sensorSpeech(), 'urgent'); break;
    case 'cameraOn': startCamera(); break;
    case 'cameraOff': if (Camera.active) stopCamera(); else say(SAY.cameraOff); break;
    case 'navigate':
      if (!GPS.last) { say(SAY.gpsNeeded); if (!GPS.active) startGps(); break; }
      say(SAY.navigation);
      if (!window.open(GPS.mapUrl(GPS.last), '_blank', 'noopener')) el.gpsStatus.textContent = 'Tap "View on map" to open the map.';
      break;
    case 'mute': Speech.muted = true; Speech.stopSpeaking(); Speech.stopVibration(); say(SAY.muted, 'urgent'); break;
    case 'stop': stopAssistance(); break;
  }
}

/* ---------- assistance lifecycle ---------- */
function startAssistance() {
  if (app.active) return;
  app.active = true; Speech.muted = false; Alerts.reset();
  el.btnStart.disabled = true; el.btnStop.disabled = false;
  say(SAY.started, 'urgent');
  if (Sensor.get().status === 'disconnected' && Sensor.get().source !== 'ble') Sensor.enableSimulation();
  checkKey(true);
  startCamera();   // permission prompt comes from the browser; failure does not stop other features
  if (!GPS.active) startGps();
  // Re-evaluate every 2s so persistent warnings repeat (cooldown-limited) and stale data is noticed.
  app.tick = setInterval(() => { Alerts.handle(app.level); }, 2000);
  onSensor(Sensor.get());
}

function stopAssistance() {
  if (!app.active) return;
  app.active = false; clearInterval(app.tick);
  Speech.stopVibration(); Voice.stop();
  Detector.stop(); if (Camera.active) { Camera.stop(el.video); camUi(false); }
  stopGps(); hideBanner(); Alerts.reset();
  el.btnStart.disabled = false; el.btnStop.disabled = true;
  say(SAY.stopped, 'urgent'); renderState();
}

/* ---------- wiring ---------- */
el.btnStart.addEventListener('click', startAssistance);
el.btnStop.addEventListener('click', stopAssistance);
el.btnMic.addEventListener('click', listen);
el.btnCam.addEventListener('click', () => Camera.active ? stopCamera() : startCamera());
el.btnAhead.addEventListener('click', whatsAhead);
el.btnDescribe.addEventListener('click', describeCloud);
el.btnGps.addEventListener('click', () => GPS.active ? stopGps() : startGps());
el.btnSayLoc.addEventListener('click', sayLocation);
$('menuBar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.target;
  if (id === 'camToggle') { Camera.active ? stopCamera() : startCamera(); return; }
  const open = document.querySelector('main > .card.open');
  if (open && open.id === id) { setPanel(''); return; }
  setPanel(id);
  if (!document.body.classList.contains('cam-mode') && id !== 'home') window.scrollTo(0, 0);
});
el.btnMap.addEventListener('click', e => { if (el.btnMap.classList.contains('disabled')) e.preventDefault(); });

function simSet(cm) {
  if (Sensor.get().source !== 'simulation') Sensor.enableSimulation();
  else if (Sensor.get().status === 'disconnected') Sensor.enableSimulation();
  el.slider.value = cm; el.sliderOut.textContent = cm;
  Sensor.setSimDistance(cm);
}
el.slider.addEventListener('input', () => simSet(el.slider.value));
document.querySelectorAll('.sim-btn').forEach(b => b.addEventListener('click', () => simSet(b.dataset.cm)));
el.btnSim.addEventListener('click', () => { Sensor.enableSimulation(); el.bleNote.textContent = 'Simulation Mode is on.'; });
el.btnBle.addEventListener('click', async () => {
  if (!Sensor.bleSupported) { el.bleNote.textContent = 'Web Bluetooth is not available in this browser (try Chrome on Android or desktop). Simulation Mode continues.'; return; }
  el.bleNote.textContent = 'Choose a Bluetooth device...';
  try { const name = await Sensor.connectBle(); el.bleNote.textContent = `Connected: ${name}. Waiting for readings.`; }
  catch (e) { el.bleNote.textContent = e.name === 'NotFoundError' ? 'No device was selected.' : 'Bluetooth could not connect: ' + e.message; }
});

el.video.addEventListener('camerafail', () => { Detector.stop(); camUi(false); say(SAY.cameraFail, 'urgent'); showBanner('unavailable', SAY.cameraFail); renderState(); });

window.addEventListener('online', () => { app.online = true; chip(el.chipNet, 'Internet: online', true); if (app.active) say(SAY.online); renderState(); });
window.addEventListener('offline', () => { app.online = false; chip(el.chipNet, 'Internet: offline', false); if (app.active) say(SAY.offline, 'urgent'); renderState(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && app.active) setFallback('Page went to the background: the browser may pause camera, GPS and speech.'); });

Sensor.subscribe(onSensor);
checkKey(false);
$('btnSplash').addEventListener('click', () => say('Saathi AI is ready.'));
document.querySelectorAll('.tile').forEach(t => t.addEventListener('click', () => {
  const go = t.dataset.go;
  if (go === 'camera') startCamera();
  else if (go === 'mic') listen();
  else { document.querySelector(`#menuBar [data-target=${go}]`).click(); if (go === 'gpsCard' && !GPS.active) startGps(); }
}));

/* ---------- init ---------- */
Speech.init();
chip(el.chipNet, app.online ? 'Internet: online' : 'Internet: offline', app.online);
chip(el.chipVoice, Voice.supported ? 'Voice: push-to-talk' : 'Voice: unsupported', Voice.supported);
chip(el.chipOut, `Speech: ${Speech.supported ? 'yes' : 'no'} / Vibration: ${Speech.vibrationSupported ? 'yes' : 'no'}`, Speech.supported && Speech.vibrationSupported);
if (!Voice.supported) el.micNote.textContent = SAY.micUnsupported;
if (!Sensor.bleSupported) el.bleNote.textContent = 'Web Bluetooth is not available here; Simulation Mode only.';
onSensor(Sensor.get());
renderState();

window.__saathiLoaded = true;
