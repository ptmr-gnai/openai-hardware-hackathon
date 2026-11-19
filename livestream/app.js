const video = document.querySelector('#video');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const mirrorButton = document.querySelector('#mirrorButton');
const muteButton = document.querySelector('#muteButton');
const cameraSelect = document.querySelector('#cameraSelect');
const emptyState = document.querySelector('#emptyState');
const status = document.querySelector('#status');
const resolution = document.querySelector('#resolution');
const fps = document.querySelector('#fps');
const liveBadge = document.querySelector('#liveBadge');
const micState = document.querySelector('#micState');
const meter = document.querySelector('#meter');
const meterContext = meter.getContext('2d');
const heartRateCard = document.querySelector('#heartRateCard');
const heartRateValue = document.querySelector('#heartRateValue');
const rrValue = document.querySelector('#rrValue');
const pointerReticle = document.querySelector('#pointerReticle');
const pointerStatus = document.querySelector('#pointerStatus');
const calTarget = document.querySelector('#calTarget');
const calPrompt = document.querySelector('#calPrompt');
const calibrateButton = document.querySelector('#calibrateButton');

// --- Wand calibration -------------------------------------------------------
// The bridge publishes unclamped gyro angles (rawYaw, rawPitch.{x,y,z}) plus
// press counters. Calibration = aim at 5 targets and press A on each; from the
// recorded angles we solve sign + gain per axis and which device axis is "front".
const CAL_KEY = 'wandCalibration.v2'; // v2: pitch is absolute elevation
const CAL_TARGETS = [
  { x: 0.5, y: 0.5, label: 'center' },
  { x: 0.1, y: 0.5, label: 'LEFT edge' },
  { x: 0.9, y: 0.5, label: 'RIGHT edge' },
  { x: 0.5, y: 0.12, label: 'TOP edge' },
  { x: 0.5, y: 0.88, label: 'BOTTOM edge' },
];
let wandCal = null;
try { wandCal = JSON.parse(localStorage.getItem(CAL_KEY)); } catch {}
let calRun = null; // { step, samples, triggerCount }
let lastCounts = null;
// 1€ filter: heavy smoothing when the wand is held steady, little when it moves fast.
function oneEuro({ minCutoff = 1.2, beta = 0.015, dCutoff = 1.0 } = {}) {
  let prev = null;
  let prevDeriv = 0;
  let prevTime = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return (value, time) => {
    if (prev === null) { prev = value; prevTime = time; return value; }
    const dt = Math.max(1e-3, time - prevTime);
    prevTime = time;
    const deriv = (value - prev) / dt;
    prevDeriv += (deriv - prevDeriv) * alpha(dCutoff, dt);
    const cutoff = minCutoff + beta * Math.abs(prevDeriv);
    prev += (value - prev) * alpha(cutoff, dt);
    return prev;
  };
}
const filterX = oneEuro();
const filterY = oneEuro();

function showCalStep() {
  const target = CAL_TARGETS[calRun.step];
  calTarget.hidden = false;
  calTarget.classList.remove('hit');
  calTarget.style.left = `${target.x * 100}%`;
  calTarget.style.top = `${target.y * 100}%`;
  calPrompt.hidden = false;
  calPrompt.textContent =
    `Step ${calRun.step + 1}/${CAL_TARGETS.length}: aim at the pink dot (${target.label}) and press A · Esc cancels`;
}

function startCalibration() {
  calRun = { step: 0, samples: [], triggerCount: null };
  showCalStep();
}

function endCalibration(message) {
  calRun = null;
  calTarget.hidden = true;
  calPrompt.textContent = message;
  setTimeout(() => { if (!calRun) calPrompt.hidden = true; }, 4000);
}

function solveCalibration(samples) {
  const [c, l, r, t, b] = samples;
  const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
  const dYaw = r.yaw - l.yaw;
  if (Math.abs(dYaw) < 4) throw new Error('Left/right aim barely moved — turn your wrist more and retry.');
  const axis = ['x', 'y', 'z']
    .map(key => ({ key, d: b.pitch[key] - t.pitch[key] }))
    .sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
  if (Math.abs(axis.d) < 4) throw new Error('Up/down aim barely moved — tip it more and retry.');
  const pitchKey = axis.key;
  return {
    pitchKey,
    kx: (CAL_TARGETS[2].x - CAL_TARGETS[1].x) / dYaw,
    ky: (CAL_TARGETS[4].y - CAL_TARGETS[3].y) / axis.d,
    yaw0: mean([c.yaw, t.yaw, b.yaw]),
    pitch0: mean([c.pitch[pitchKey], l.pitch[pitchKey], r.pitch[pitchKey]]),
    spanDeg: Math.round(Math.abs(dYaw) / 2),
  };
}

function handleCalibrationReading(reading) {
  if (calRun.triggerCount === null) calRun.triggerCount = reading.triggerCount;
  if (reading.triggerCount === calRun.triggerCount) return;
  calRun.triggerCount = reading.triggerCount;
  calRun.samples.push(reading.pressPitch
    ? { yaw: reading.pressYaw, pitch: { ...reading.pressPitch } }
    : { yaw: reading.rawYaw, pitch: { ...reading.rawPitch } });
  calTarget.classList.add('hit');
  calRun.step += 1;
  if (calRun.step < CAL_TARGETS.length) {
    setTimeout(() => { if (calRun) showCalStep(); }, 250);
    return;
  }
  try {
    wandCal = solveCalibration(calRun.samples);
    try { localStorage.setItem(CAL_KEY, JSON.stringify(wandCal)); } catch {}
    endCalibration(`Calibrated ✓ (front axis ${wandCal.pitchKey}, ~${wandCal.spanDeg}° to edge). Press B anytime to recenter.`);
  } catch (error) {
    endCalibration(error.message);
  }
}

function mapReading(reading) {
  if (!wandCal || reading.rawYaw === undefined) return { x: reading.x, y: reading.y };
  const counts = reading.recenterCount;
  if (lastCounts !== null && counts !== lastCounts) {
    // B pressed: wherever the wand points now becomes screen center.
    wandCal.yaw0 = reading.rawYaw;
    wandCal.pitch0 = reading.rawPitch[wandCal.pitchKey];
  }
  lastCounts = counts;
  const clamp = v => Math.min(1, Math.max(0, v));
  const x = clamp(0.5 + (reading.rawYaw - wandCal.yaw0) * wandCal.kx);
  const y = clamp(0.5 + (reading.rawPitch[wandCal.pitchKey] - wandCal.pitch0) * wandCal.ky);
  // Filter in "pixels" (×1000) so beta has a sensible scale.
  const now = reading.timestamp;
  return { x: filterX(x * 1000, now) / 1000, y: filterY(y * 1000, now) / 1000 };
}

let stream;
let audioContext;
let analyser;
let meterFrame;

async function refreshHeartRate() {
  try {
    const response = await fetch(`hr.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No sensor snapshot');
    const reading = await response.json();
    const age = Date.now() - Date.parse(reading.timestamp);
    if (!reading.connected || !Number.isFinite(age) || age > 5000) {
      throw new Error('Sensor data is stale');
    }
    heartRateValue.textContent = reading.bpm;
    const latestRr = reading.rrMs?.at(-1);
    const battery = Number.isFinite(reading.batteryPercent) ? ` · ${reading.batteryPercent}%` : '';
    rrValue.textContent = latestRr ? `RR ${Math.round(latestRr)} ms${battery}` : `Live${battery}`;
    heartRateCard.classList.remove('waiting');
  } catch {
    heartRateValue.textContent = '—';
    rrValue.textContent = 'Waiting for sensor';
    heartRateCard.classList.add('waiting');
  }
}

async function refreshPointer() {
  try {
    const response = await fetch(`pointer.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No pointer snapshot');
    const reading = await response.json();
    const age = Date.now() / 1000 - reading.timestamp;
    if (!reading.connected || !Number.isFinite(age) || age > 0.5) {
      throw new Error('Pointer data is stale');
    }
    if (calRun) {
      if (reading.triggerCount === undefined) throw new Error('Bridge too old for calibration');
      handleCalibrationReading(reading);
      pointerReticle.classList.add('waiting');
      pointerStatus.textContent = 'CALIBRATING';
      return;
    }
    const point = mapReading(reading);
    pointerReticle.style.left = `${point.x * 100}%`;
    pointerReticle.style.top = `${point.y * 100}%`;
    pointerReticle.classList.remove('waiting');
    pointerReticle.classList.toggle('trigger', Boolean(reading.trigger));
    pointerStatus.textContent = reading.transport === 'simulation' ? 'POINTER SIM' : `STICKS3 / ${(reading.transport ?? 'usb').toUpperCase()}`;
    pointerStatus.classList.add('connected');
  } catch {
    pointerReticle.classList.add('waiting');
    pointerReticle.classList.remove('trigger');
    pointerStatus.textContent = 'POINTER WAITING';
    pointerStatus.classList.remove('connected');
  }
}

function setLive(isLive) {
  liveBadge.classList.toggle('live', isLive);
  liveBadge.classList.toggle('idle', !isLive);
  liveBadge.querySelector('strong').textContent = isLive ? 'LIVE' : 'OFFLINE';
  emptyState.classList.toggle('hidden', isLive);
  stopButton.disabled = !isLive;
  mirrorButton.disabled = !isLive;
  muteButton.disabled = !isLive;
  cameraSelect.disabled = !isLive;
}

function drawMeter() {
  if (!analyser) return;
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);
  let energy = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    energy += normalized * normalized;
  }
  const rms = Math.sqrt(energy / samples.length);
  const level = Math.min(1, rms * 5);
  const width = meter.width;
  const height = meter.height;
  meterContext.clearRect(0, 0, width, height);
  meterContext.fillStyle = '#17231e';
  meterContext.fillRect(0, 0, width, height);
  meterContext.fillStyle = level > .82 ? '#ff6b58' : '#3cff98';
  meterContext.fillRect(0, 0, width * level, height);
  meterFrame = requestAnimationFrame(drawMeter);
}

async function populateCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(device => device.kind === 'videoinput');
  cameraSelect.replaceChildren(...cameras.map((camera, index) => {
    const option = document.createElement('option');
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    return option;
  }));
  const active = stream?.getVideoTracks()[0];
  if (active) cameraSelect.value = active.getSettings().deviceId || '';
}

async function start(deviceId) {
  stop();
  status.textContent = 'Requesting camera and microphone access…';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: {
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    video.srcObject = stream;
    await video.play();

    const videoSettings = stream.getVideoTracks()[0].getSettings();
    resolution.textContent = `${videoSettings.width ?? '—'} × ${videoSettings.height ?? '—'}`;
    fps.textContent = `${Math.round(videoSettings.frameRate ?? 0) || '—'} FPS`;

    audioContext = new AudioContext();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    drawMeter();

    await populateCameras();
    setLive(true);
    micState.textContent = 'ACTIVE';
    status.textContent = 'Live locally. Nothing is being uploaded or recorded.';
  } catch (error) {
    setLive(false);
    const blocked = error.name === 'NotAllowedError';
    status.textContent = blocked
      ? 'Camera or microphone access was blocked. Allow access in the browser and try again.'
      : `Could not start the stream: ${error.message}`;
  }
}

function stop() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (audioContext) audioContext.close();
  stream = undefined;
  audioContext = undefined;
  analyser = undefined;
  video.srcObject = null;
  meterContext.clearRect(0, 0, meter.width, meter.height);
  resolution.textContent = '— × —';
  fps.textContent = '— FPS';
  micState.textContent = 'STANDBY';
  setLive(false);
}

startButton.addEventListener('click', () => start());
stopButton.addEventListener('click', () => {
  stop();
  status.textContent = 'Livestream stopped. Camera and microphone released.';
});
mirrorButton.addEventListener('click', () => {
  const unmirrored = video.classList.toggle('unmirrored');
  mirrorButton.textContent = `Mirror: ${unmirrored ? 'off' : 'on'}`;
});
muteButton.addEventListener('click', () => {
  const track = stream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  muteButton.textContent = `Mic: ${track.enabled ? 'on' : 'off'}`;
  micState.textContent = track.enabled ? 'ACTIVE' : 'MUTED';
});
cameraSelect.addEventListener('change', event => start(event.target.value));
window.addEventListener('beforeunload', stop);
calibrateButton.addEventListener('click', () => startCalibration());
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && calRun) endCalibration('Calibration cancelled.');
  if (event.key === 'c' && !calRun && !event.target.closest?.('input, select, textarea')) startCalibration();
});

setLive(false);
refreshHeartRate();
setInterval(refreshHeartRate, 1000);
refreshPointer();
setInterval(refreshPointer, 30);
