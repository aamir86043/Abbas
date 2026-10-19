// Voice commands via Web Speech API (en-US). Push-to-talk only: no wake word, no background listening.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// Matching is on lower-cased text. English phrases.
const COMMANDS = [
  { id: 'start',      words: ['start assistance', 'saathi start', 'hey saathi', 'start saathi'] },
  { id: 'whatsAhead', words: ["what's ahead", 'what is ahead', 'whats ahead', "what's in front", 'what is in front'] },
  { id: 'location',   words: ['my location', 'where am i', 'tell my location'] },
  { id: 'sensor',     words: ['sensor status', 'sensor'] },
  { id: 'cameraOn',   words: ['camera on', 'turn on camera', 'start camera', 'open camera'] },
  { id: 'cameraOff',  words: ['camera off', 'turn off camera', 'stop camera', 'close camera'] },
  { id: 'navigate',   words: ['start navigation', 'navigation'] },
  { id: 'mute',       words: ['be quiet', 'quiet', 'mute', 'silence'] },
  { id: 'stop',       words: ['stop assistance', 'stop everything'] }
];

export function matchCommand(text) {
  const t = text.toLowerCase().trim();
  // Check camera off/on before generic "band"
  const order = ['cameraOff', 'cameraOn', 'stop', 'start', 'whatsAhead', 'location', 'sensor', 'navigate', 'mute'];
  for (const id of order) {
    const c = COMMANDS.find(x => x.id === id);
    if (c.words.some(w => t.includes(w))) return id;
  }
  return null;
}

let rec = null;

export const Voice = {
  supported: !!SR,
  listening: false,

  listen({ onStart, onResult, onError, onEnd }) {
    if (!SR) { onError('unsupported'); return; }
    if (this.listening) return;
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    rec.onstart = () => { this.listening = true; onStart(); };
    rec.onresult = e => {
      const alts = Array.from(e.results[0]).map(a => a.transcript);
      onResult(alts);
    };
    rec.onerror = e => onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied'
      : e.error === 'no-speech' ? 'nospeech' : e.error === 'network' ? 'network' : 'failed');
    rec.onend = () => { this.listening = false; onEnd(); };
    try { rec.start(); } catch (_) { this.listening = false; onError('failed'); }
  },

  stop() { try { if (rec) rec.stop(); } catch (_) {} this.listening = false; }
};
