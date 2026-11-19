// Voice part: hands-free speech → text, using Chrome's Web Speech API
// (Google's recognizer; needs internet). Always listening by default:
// every finished phrase is emitted as a 'command'. M toggles the mic.
//
//   voice.on('command', text => …)   each final phrase
//   voice.enabled, voice.listening, voice.interim   for on-screen feedback
//
// Lessons carried over from ~/scrappy-dictation:
//  - continuous + interim results
//  - Chrome ends sessions on silence/timeouts → restart from onend while enabled
//  - back off on errors; stop for good on permission denial
export function createVoice({ toggleKey = 'm', lang = 'en-US', autoStart = true } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listeners = {};
  const emit = (event, data) => (listeners[event] ?? []).forEach(fn => fn(data));
  const voice = {
    supported: Boolean(Recognition),
    enabled: false,
    listening: false,
    interim: '',
    lastHeard: '',
    error: null,
    on(event, fn) { (listeners[event] ??= []).push(fn); },
    start, stop,
    toggle() { voice.enabled ? stop() : start(); },
  };
  if (!Recognition) return voice;

  let recognition = null;
  let restartDelay = 250;
  let interimTimer = null;

  function start() {
    if (voice.enabled) return;
    voice.enabled = true;
    voice.error = null;
    begin();
  }

  function stop() {
    voice.enabled = false;
    voice.interim = '';
    recognition?.abort();
  }

  function begin() {
    if (!voice.enabled) return;
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { voice.listening = true; restartDelay = 250; };
    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          if (text) {
            voice.lastHeard = text;
            emit('command', text);
          }
        } else {
          interim += text;
        }
      }
      voice.interim = interim;
      // Clear stale captions if Chrome never finalizes a fragment.
      clearTimeout(interimTimer);
      interimTimer = setTimeout(() => { voice.interim = ''; }, 2500);
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voice.error = 'Microphone blocked — allow it for this site';
        voice.enabled = false;
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        voice.error = event.error;
        restartDelay = Math.min(5000, restartDelay * 2);
      }
    };
    recognition.onend = () => {
      voice.listening = false;
      voice.interim = '';
      if (voice.enabled) setTimeout(begin, restartDelay); // keep listening
    };
    try { recognition.start(); } catch (error) { voice.error = error.message; }
  }

  const isTyping = target => target?.closest?.('input, textarea, select');
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() === toggleKey && !e.repeat && !isTyping(e.target)) voice.toggle();
  });
  if (autoStart) start();
  return voice;
}
