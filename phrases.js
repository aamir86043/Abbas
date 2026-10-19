// English phrases + object label names
export const SAY = {
  started: 'Assistance started.',
  stopped: 'Assistance stopped.',
  muted: 'Okay, quiet mode. Important safety alerts will still be spoken.',
  gpsNeeded: 'Please turn on location first.',
  caution: 'Caution, there may be an obstacle ahead.',
  warning: 'Attention, an obstacle is close ahead.',
  critical: 'Stop. An obstacle may be very close ahead.',
  sensorUnavailable: 'No data from the obstacle sensor.',
  cameraFail: 'The camera is not working. Check sensor status.',
  cameraOn: 'Camera is on.',
  cameraOff: 'Camera is off.',
  cameraDenied: 'Camera permission was denied. Other features will keep working.',
  cameraNeeded: 'Please turn on the camera first.',
  modelLoading: 'Loading the detection model, please wait.',
  modelFail: 'The detection model could not load. Check your internet.',
  nothingDetected: 'No recognized objects right now.',
  micDenied: 'Microphone permission was denied. Voice commands will not work.',
  micUnsupported: 'Voice recognition is not available in this browser. Use the on-screen buttons.',
  notUnderstood: 'Sorry, I did not understand that command.',
  gpsDenied: 'Location permission was denied.',
  gpsFail: 'Location is not available right now.',
  gpsUnsupported: 'Location is not available in this browser.',
  navigation: 'Navigation currently only opens the map. Opening the map.',
  needOnline: 'The detailed view needs an internet connection.',
  describing: 'Looking in detail, one moment.',
  describeFail: 'Could not get a detailed description.',
  offline: 'Internet is off. Sensor alerts keep working locally.',
  online: 'Internet is back.',
  vibrationNo: 'Vibration is not available on this device. You will get voice alerts.',
  ttsNo: 'Speech is not available in this browser. Alerts will show on screen.'
};

export const LABELS = { couch: 'sofa', tv: 'TV', 'dining table': 'table', 'cell phone': 'mobile phone', 'potted plant': 'potted plant', refrigerator: 'fridge' };
export function objLabel(en) { return LABELS[en] || en; }
const art = n => (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n;

export function describeDetections(dets, frameW) {
  if (!dets.length) return SAY.nothingDetected;
  const groups = {};
  dets.slice(0, 4).forEach(d => {
    const cx = d.bbox[0] + d.bbox[2] / 2;
    const pos = cx < frameW / 3 ? 'On your left' : cx > (2 * frameW) / 3 ? 'On your right' : 'Ahead of you';
    const n = objLabel(d.class);
    (groups[pos] = groups[pos] || []).push(art(n) + (d.distCm ? ` about ${(d.distCm / 100).toFixed(1)} meters away` : ''));
  });
  return Object.entries(groups).map(([pos, l]) => `${pos}: ${l.join(' and ')}.`).join(' ');
}
