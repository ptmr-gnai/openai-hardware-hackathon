// Wand input part: turns the bridge's pointer.json into a calibrated screen
// pointer with `shoot` (button A) and `recenter` (button B) events.
// Falls back to the mouse (move + click) so games can be built without hardware.
import { oneEuro } from './filters.js';

export const CAL_TARGETS = [
  { x: 0.5, y: 0.5, label: 'center' },
  { x: 0.1, y: 0.5, label: 'LEFT edge' },
  { x: 0.9, y: 0.5, label: 'RIGHT edge' },
  { x: 0.5, y: 0.12, label: 'TOP edge' },
  { x: 0.5, y: 0.88, label: 'BOTTOM edge' },
];

// samples[i] = { yaw, heading?: {x,y,z}, pitch: {x,y,z} } recorded while aiming at CAL_TARGETS[i].
// AHRS firmware reports a heading per body axis; once the forward axis is known
// (the one whose elevation followed the up/down targets) we use ITS heading.
export function solveCalibration(samples, targets = CAL_TARGETS) {
  const [c, l, r, t, b] = samples;
  const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
  const axis = ['x', 'y', 'z']
    .map(key => ({ key, d: b.pitch[key] - t.pitch[key] }))
    .sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
  if (Math.abs(axis.d) < 4) throw new Error('Up/down aim barely moved — tip it more and retry.');
  const pitchKey = axis.key;
  const yawOf = sample => sample.heading?.[pitchKey] ?? sample.yaw;
  const dYaw = yawOf(r) - yawOf(l);
  if (Math.abs(dYaw) < 4) throw new Error('Left/right aim barely moved — turn your wrist more and retry.');
  return {
    pitchKey,
    kx: (targets[2].x - targets[1].x) / dYaw,
    ky: (targets[4].y - targets[3].y) / axis.d,
    yaw0: mean([yawOf(c), yawOf(t), yawOf(b)]),
    pitch0: mean([c.pitch[pitchKey], l.pitch[pitchKey], r.pitch[pitchKey]]),
    spanDeg: Math.round(Math.abs(dYaw) / 2),
  };
}

const LEGACY_KEY = 'wandCalibration.v2'; // written by the livestream page

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

const clamp01 = v => Math.min(1, Math.max(0, v));

export function createWand({ url = '/pointer.json', surface = 'arcade', pollMs = 16 } = {}) {
  const key = `${LEGACY_KEY}.${surface}`;
  // Calibration persists in localStorage, shared by every game on this surface.
  // Gains (kx, ky, pitchKey) and pitch0 survive bridge restarts; yaw0 does not,
  // because rawYaw restarts at 0 each bridge session — so it's re-anchored.
  let cal = load(key) ?? load(LEGACY_KEY);
  const ownCalibration = () => Boolean(load(key));
  const listeners = {};
  const state = { connected: false, x: 0.5, y: 0.5, source: 'none', calibrated: ownCalibration(), session: null };
  const filterX = oneEuro();
  const filterY = oneEuro();
  let lastTrigger = null;
  let lastRecenter = null;
  let lastMouseMs = 0;
  let inflight = false;
  let capture = null;

  const on = (event, fn) => { (listeners[event] ??= []).push(fn); return () => off(event, fn); };
  const off = (event, fn) => { listeners[event] = (listeners[event] ?? []).filter(f => f !== fn); };
  const emit = (event, data) => (listeners[event] ?? []).forEach(fn => fn(data));

  function save() {
    if (!cal || !state.calibrated) return; // don't persist a borrowed calibration
    try { localStorage.setItem(key, JSON.stringify(cal)); } catch {}
  }

  function setConnected(connected) {
    if (state.connected === connected) return;
    state.connected = connected;
    emit(connected ? 'connect' : 'disconnect');
  }

  // A sample is { yaw, heading?, pitch }: prefer the forward axis's own heading.
  const yawOf = sample => sample.heading?.[cal.pitchKey] ?? sample.yaw;
  function map(sample) {
    if (!cal || sample.yaw === undefined) return null;
    const yaw = yawOf(sample);
    const pitches = sample.pitch;
    return {
      x: clamp01(0.5 + (yaw - cal.yaw0) * cal.kx),
      y: clamp01(0.5 + (pitches[cal.pitchKey] - cal.pitch0) * cal.ky),
    };
  }

  function handle(reading) {
    setConnected(true);
    state.session = reading.session;
    if (cal && reading.session && cal.session !== reading.session) {
      // Calibrations from before session tracking were made in this bridge run.
      if (cal.session) {
        cal.yaw0 = yawOf(current);
        emit('reanchor');
      }
      cal.session = reading.session;
      save();
    }
    const current = { yaw: reading.rawYaw, heading: reading.rawHeading, pitch: reading.rawPitch };
    if (lastRecenter !== null && reading.recenterCount !== lastRecenter && cal) {
      cal.yaw0 = yawOf(current);
      cal.pitch0 = reading.rawPitch[cal.pitchKey];
      save();
      emit('recenter');
    }
    lastRecenter = reading.recenterCount;

    if (performance.now() - lastMouseMs > 1500) {
      const target = map(current) ?? { x: reading.x, y: reading.y };
      state.x = filterX(target.x * 1000, reading.timestamp) / 1000;
      state.y = filterY(target.y * 1000, reading.timestamp) / 1000;
      state.source = 'wand';
    }

    // Rising edge of A. Old bridges/simulator only send the boolean.
    const count = reading.triggerCount ?? (reading.trigger ? 1 : 0);
    const pressed = reading.triggerCount !== undefined ? count !== lastTrigger : count && !lastTrigger;
    if (lastTrigger !== null && pressed) {
      // Use where the wand pointed just before the thumb jolted it.
      const sample = reading.pressPitch
        ? { yaw: reading.pressYaw, heading: reading.pressHeading, pitch: { ...reading.pressPitch } }
        : { ...current, pitch: { ...reading.rawPitch } };
      if (capture) {
        capture(sample);
        capture = null;
      } else {
        const point = map(sample) ?? { x: state.x, y: state.y };
        emit('shoot', { ...point, source: 'wand' });
      }
    }
    lastTrigger = count;
  }

  async function poll() {
    if (inflight) return;
    inflight = true;
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      const reading = await response.json();
      const age = Date.now() / 1000 - reading.timestamp;
      if (!reading.connected || !(age < 0.5)) throw new Error('stale');
      handle(reading);
    } catch {
      setConnected(false);
    } finally {
      inflight = false;
    }
  }
  setInterval(poll, pollMs);

  return {
    state,
    on,
    off,
    get calibration() { return cal; },
    setCalibration(next) {
      cal = { ...next, session: state.session };
      state.calibrated = true;
      filterX.reset();
      filterY.reset();
      save();
    },
    // Resolves with the raw aim sample at the next A press (used by calibration).
    nextPress() { return new Promise(resolve => { capture = resolve; }); },
    cancelPress() { capture = null; },
    get capturing() { return capture !== null; },
    attachMouse(element) {
      element.addEventListener('mousemove', event => {
        const rect = element.getBoundingClientRect();
        lastMouseMs = performance.now();
        state.x = clamp01((event.clientX - rect.left) / rect.width);
        state.y = clamp01((event.clientY - rect.top) / rect.height);
        state.source = 'mouse';
      });
      element.addEventListener('mousedown', event => {
        if (event.button !== 0 || capture) return;
        lastMouseMs = performance.now();
        emit('shoot', { x: state.x, y: state.y, source: 'mouse' });
      });
    },
  };
}
