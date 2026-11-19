// Sound part: tiny synthesized effects, no asset files. Browsers only allow
// audio after a user gesture, so the first click/key unlocks it.
let ac = null;

function audio() {
  ac ??= new AudioContext();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
addEventListener('pointerdown', audio, { once: true });
addEventListener('keydown', audio, { once: true });

function tone({ freq = 440, to = freq, dur = 0.12, type = 'sine', gain = 0.18, delay = 0 }) {
  try {
    const ctx = audio();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {}
}

function noise({ dur = 0.08, gain = 0.25 }) {
  try {
    const ctx = audio();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.buffer = buffer;
    src.connect(amp).connect(ctx.destination);
    src.start();
  } catch {}
}

export const sfx = {
  shoot: () => tone({ freq: 900, to: 300, dur: 0.07, type: 'square', gain: 0.05 }),
  pop: () => { noise({ dur: 0.09, gain: 0.3 }); tone({ freq: 700, to: 1400, dur: 0.08, gain: 0.08 }); },
  bonus: () => [0, 0.07, 0.14].forEach((delay, i) => tone({ freq: 660 * (1 + i * 0.26), dur: 0.1, delay, gain: 0.1 })),
  whoosh: () => { noise({ dur: 0.18, gain: 0.12 }); tone({ freq: 300, to: 900, dur: 0.18, gain: 0.06 }); },
  hit: () => tone({ freq: 180, to: 50, dur: 0.3, type: 'sawtooth', gain: 0.2 }),
  tick: () => tone({ freq: 520, dur: 0.1, type: 'triangle' }),
  go: () => tone({ freq: 880, dur: 0.25, type: 'triangle' }),
  end: () => [0, 0.12, 0.24].forEach((delay, i) => tone({ freq: 660 / (1 + i * 0.2), dur: 0.18, delay, type: 'triangle' })),
};
