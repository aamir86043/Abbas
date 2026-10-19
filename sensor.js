// Obstacle sensor: Simulation Mode (default) + Web Bluetooth (ESP32 BLE).
// Simulated readings are always tagged source:'simulation' and never shown as real.
import { CONFIG } from './config.js';

const listeners = new Set();
let state = {
  source: 'simulation',      // 'simulation' | 'ble'
  status: 'disconnected',    // 'connected' | 'disconnected' | 'stale' | 'invalid'
  distance: null,
  updatedAt: 0
};
let bleDevice = null, bleChar = null, staleTimer = null;

function emit() { const snap = { ...state }; listeners.forEach(fn => fn(snap)); }
function set(patch) { state = { ...state, ...patch }; emit(); }

function startStaleWatch() {
  clearInterval(staleTimer);
  staleTimer = setInterval(() => {
    // Simulation has no live feed: keep a connected simulated reading fresh (silently).
    if (state.source === 'simulation' && state.status === 'connected') state.updatedAt = Date.now();
    if (state.status === 'connected' && Date.now() - state.updatedAt > CONFIG.SENSOR_STALE_MS) {
      set({ status: 'stale' });
    }
  }, 500);
}

function parseReading(text) {
  const n = parseFloat(String(text).trim());
  return isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

function onBle(e) {
  const cm = parseReading(new TextDecoder().decode(e.target.value));
  if (cm === null) set({ status: 'invalid', distance: null, updatedAt: Date.now() });
  else set({ status: 'connected', distance: cm, updatedAt: Date.now() });
}
// Auto-reconnect after a dropped link (3 tries, 2 s apart)
async function reconnect() {
  const { SERVICE_UUID, CHARACTERISTIC_UUID } = CONFIG.BLE;
  for (let i = 0; i < 3 && bleDevice; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const server = await bleDevice.gatt.connect();
      bleChar = await (await server.getPrimaryService(SERVICE_UUID)).getCharacteristic(CHARACTERISTIC_UUID);
      await bleChar.startNotifications();
      bleChar.addEventListener('characteristicvaluechanged', onBle);
      set({ status: 'connected', distance: null, updatedAt: Date.now() });
      return;
    } catch (_) { /* try again */ }
  }
}

export const Sensor = {
  bleSupported: 'bluetooth' in navigator,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get() { return { ...state }; },

  /* ---- Simulation ---- */
  enableSimulation() {
    this.disconnectBle(true);
    set({ source: 'simulation', status: 'connected', distance: 400, updatedAt: Date.now() });
    startStaleWatch();
  },
  setSimDistance(cm) {
    if (state.source !== 'simulation' || state.status === 'disconnected') return;
    const v = Number(cm);
    if (!isFinite(v)) { set({ status: 'invalid', distance: null }); return; }
    set({ status: 'connected', distance: v, updatedAt: Date.now() });
  },
  /** Test hooks */
  simDisconnect() { set({ status: 'disconnected', distance: null }); },
  simInvalid() { set({ status: 'invalid', distance: null }); },
  simStale() { set({ status: 'stale' }); },
  stop() { clearInterval(staleTimer); set({ status: 'disconnected', distance: null }); },

  /* ---- BLE ---- */
  async connectBle() {
    if (!this.bleSupported) throw new Error('Web Bluetooth is not supported in this browser.');
    const { SERVICE_UUID, CHARACTERISTIC_UUID, NAME_PREFIX } = CONFIG.BLE;
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: NAME_PREFIX }],
      optionalServices: [SERVICE_UUID]
    });
    bleDevice.addEventListener('gattserverdisconnected', () => {
      if (state.source === 'ble') { set({ status: 'disconnected', distance: null }); reconnect(); }
    });
    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    bleChar = await service.getCharacteristic(CHARACTERISTIC_UUID);
    await bleChar.startNotifications();
    bleChar.addEventListener('characteristicvaluechanged', onBle);
    set({ source: 'ble', status: 'connected', distance: null, updatedAt: Date.now() });
    startStaleWatch();
    return bleDevice.name || 'BLE device';
  },
  disconnectBle(silent = false) {
    try { if (bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect(); } catch (_) {}
    bleDevice = null; bleChar = null;
    if (!silent && state.source === 'ble') set({ source: 'simulation', status: 'disconnected', distance: null });
  }
};
