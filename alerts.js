// Obstacle classification + alert engine (fully local, no internet needed)
import { CONFIG } from './config.js';
import { SAY } from './phrases.js';
import { Speech } from './speech.js';

/** Returns 'unavailable' | 'clear' | 'caution' | 'warning' | 'critical' */
export function classify(distanceCm, sensorStatus) {
  if (sensorStatus !== 'connected') return 'unavailable';
  if (typeof distanceCm !== 'number' || !isFinite(distanceCm) || distanceCm < 0) return 'unavailable';
  const t = CONFIG.THRESHOLDS;
  if (distanceCm > t.caution) return 'clear';
  if (distanceCm > t.warning) return 'caution';
  if (distanceCm > t.critical) return 'warning';
  return 'critical'; // includes anything below 20 cm (too close to measure reliably)
}

const TEXT = {
  caution: SAY.caution, warning: SAY.warning, critical: SAY.critical,
  unavailable: SAY.sensorUnavailable
};
const COOLDOWN = { caution: 6000, warning: 4000, critical: 2500, unavailable: 15000 };

let lastLevel = 'clear';

export const Alerts = {
  /** Called on every sensor update; speaks only on level change or after cooldown. */
  handle(level) {
    const changed = level !== lastLevel;
    lastLevel = level;
    if (level === 'clear') return;
    const urgent = level === 'critical' || level === 'warning';
    const spoke = Speech.say(TEXT[level], {
      priority: urgent ? 'urgent' : 'routine',
      cooldownMs: changed ? 0 : COOLDOWN[level]
    });
    if (spoke && level !== 'unavailable') Speech.vibrate(level);
    if (spoke && level === 'critical') Speech.beep(1200, 200);
  },
  reset() { lastLevel = 'clear'; }
};
