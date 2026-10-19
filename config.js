// Saathi AI - configuration
// The Gemini API key is NOT stored here. It is read by server.js from the GEMINI_API_KEY environment variable.
export const CONFIG = {
  // Backend (Railway). Used when the page is NOT served by that same server (e.g. GitHub Pages).
  API_BASE: 'https://aamir-production-320a.up.railway.app',

  // Prototype obstacle thresholds (cm). Not guaranteed safe distances.
  THRESHOLDS: { caution: 100, warning: 60, critical: 35, min: 20, max: 500 }, // max 500 cm = 5 m detection range

  // Camera distance estimate. Calibrate DIAG_FOV_DEG: stand 2 m from a person; raise it if the app says "too far", lower it if "too near".
  DEPTH: {
    DIAG_FOV_DEG: 75,
    HEIGHTS_CM: { person: 170, chair: 90, couch: 85, 'dining table': 75, bottle: 24, tv: 50, refrigerator: 170,
      car: 150, bus: 300, truck: 330, bicycle: 100, motorcycle: 110, bench: 85, 'potted plant': 50, dog: 50,
      backpack: 45, suitcase: 60, 'fire hydrant': 70, 'stop sign': 75, door: 200 }
  },

  SENSOR_STALE_MS: 3000,       // reading older than this = stale
  SPEECH_COOLDOWN_MS: 4000,    // min gap between repeated same-level speech
  DETECT_INTERVAL_MS: 450,     // object detection loop delay
  DETECT_MIN_SCORE: 0.30,      // low threshold; false hits are removed by temporal smoothing (detector.js)
  DETECT_STRONG_SCORE: 0.60,   // shown immediately without needing a second sighting
  GPS_MAX_AGE_MS: 1000,

  // BLE contract for the future ESP32 (see README)
  BLE: {
    SERVICE_UUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    NAME_PREFIX: 'Saathi'
  },

  // TensorFlow.js + COCO-SSD (loaded lazily only when camera detection starts)
  TFJS_URL: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  COCO_URL: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'
};
