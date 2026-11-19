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
    pointerReticle.style.left = `${reading.x * 100}%`;
    pointerReticle.style.top = `${reading.y * 100}%`;
    pointerReticle.classList.remove('waiting');
    pointerReticle.classList.toggle('trigger', Boolean(reading.trigger));
    pointerStatus.textContent = reading.transport === 'simulation' ? 'POINTER SIM' : 'STICKS3 / USB';
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

setLive(false);
refreshHeartRate();
setInterval(refreshHeartRate, 1000);
refreshPointer();
setInterval(refreshPointer, 50);
