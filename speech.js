// Output channel: Hindi TTS, beeps, vibration. Urgent speech interrupts routine speech.
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let enVoice = null;
let onFallback = () => {};
let lastText = '';
let lastAt = 0;

export const Speech = {
  supported: !!synth,
  vibrationSupported: 'vibrate' in navigator,
  muted: false,

  setFallbackHandler(fn) { onFallback = fn; },

  init() {
    if (!synth) return;
    const pick = () => {
      const voices = synth.getVoices();
      enVoice = voices.find(v => v.lang === 'en-US') ||
                   voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || null;
    };
    pick();
    synth.onvoiceschanged = pick;
  },

  hasVoice() { return !!enVoice; },

  /** priority: 'urgent' cancels anything speaking; 'routine' is dropped if busy. */
  say(text, { priority = 'routine', cooldownMs = 0 } = {}) {
    const now = Date.now();
    if (cooldownMs && text === lastText && now - lastAt < cooldownMs) return false;
    if (!synth) { onFallback('ttsNo', text); return false; }
    if (this.muted && priority !== 'urgent') return false;
    if (priority === 'routine' && synth.speaking) return false;
    if (priority === 'urgent') synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (enVoice) u.voice = enVoice; else onFallback('ttsNoVoice', text);
    u.rate = 0.95;
    synth.speak(u);
    lastText = text; lastAt = now;
    return true;
  },

  stopSpeaking() { if (synth) synth.cancel(); },

  vibrate(level) {
    const patterns = { caution: [200], warning: [250, 120, 250], critical: [500, 100, 500, 100, 500] };
    if (!this.vibrationSupported) { onFallback('vibrationNo'); return false; }
    return navigator.vibrate(patterns[level] || [100]);
  },

  stopVibration() { if (this.vibrationSupported) navigator.vibrate(0); },

  beep(freq = 880, ms = 150) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = freq; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, ms);
    } catch (_) { /* audio unavailable */ }
  }
};
