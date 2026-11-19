// Body part: webcam pose tracking (MediaPipe, fully local) → simple game signals.
//
//   body.ready       tracking + standing calibration done
//   body.duck        head is clearly below standing height
//   body.duckAmount  0 = standing, 1 = at the duck threshold, >1 deeper
//   body.lean        −1 (left) … +1 (right), mirrored like a selfie view
//   body.head, body.hands[]   normalized {x, y}, mirrored
//   body.status      human-readable state for the UI
//
// Keyboard fallback (for building without a camera): hold Space or ↓ to duck.
// Ducking recipe adapted from the pulse-play branch's camera.js.
const VENDOR = '/vendor/mediapipe';
const CALIBRATION_FRAMES = 45;
const POSE_LINES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];

export function createBody() {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  const body = {
    video,
    ready: false,
    tracking: false,
    duck: false,
    duckAmount: 0,
    lean: 0,
    head: null,
    hands: [],
    landmarks: null,
    status: 'Camera off',
    baseline: null,
    threshold: 0.08,
    keyDuck: false,
    get ducking() { return this.keyDuck || this.duck; },
    async start() {
      try {
        body.status = 'Loading pose model…';
        const { FilesetResolver, PoseLandmarker } = await import(`${VENDOR}/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${VENDOR}/wasm`);
        const options = delegate => ({
          baseOptions: { modelAssetPath: `${VENDOR}/pose_landmarker_lite.task`, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        try {
          model = await PoseLandmarker.createFromOptions(files, options('GPU'));
        } catch {
          model = await PoseLandmarker.createFromOptions(files, options('CPU'));
        }
        body.status = 'Starting camera…';
        video.srcObject = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
        });
        await video.play();
        running = true;
        body.calibrate();
        loop();
      } catch (error) {
        body.status = error.message?.includes('vision_bundle')
          ? 'Pose model missing — run ./scripts/setup-vision.sh'
          : `Camera unavailable: ${error.message}`;
        throw error;
      }
    },
    calibrate() {
      body.baseline = null;
      samples = [];
      body.ready = false;
      body.status = 'Stand tall — calibrating…';
    },
    stop() {
      running = false;
      video.srcObject?.getTracks().forEach(t => t.stop());
      model?.close();
    },
    // Mirrored webcam preview with skeleton and the duck line.
    drawPreview(g, x, y, w, h) {
      if (!running || !video.videoWidth) return;
      g.save();
      g.beginPath();
      g.roundRect(x, y, w, h, 10);
      g.clip();
      g.translate(x + w, y);
      g.scale(-1, 1);
      g.drawImage(video, 0, 0, w, h);
      g.restore();
      const px = p => x + (1 - p.x) * w;
      const py = p => y + p.y * h;
      if (body.baseline !== null) {
        const lineY = y + (body.baseline + body.threshold) * h;
        g.strokeStyle = body.ducking ? '#06d6a0' : '#ffdc5d';
        g.setLineDash([6, 5]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, lineY);
        g.lineTo(x + w, lineY);
        g.stroke();
        g.setLineDash([]);
      }
      const p = body.landmarks;
      if (p && body.tracking) {
        g.strokeStyle = '#ffffffcc';
        g.lineWidth = 3;
        g.beginPath();
        for (const [a, b] of POSE_LINES) {
          g.moveTo(px(p[a]), py(p[a]));
          g.lineTo(px(p[b]), py(p[b]));
        }
        g.stroke();
        g.fillStyle = body.ducking ? '#06d6a0' : '#ffdc5d';
        g.beginPath();
        g.arc(px(p[0]), py(p[0]), 7, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#ffffff55';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x, y, w, h, 10);
      g.stroke();
    },
  };

  let model = null;
  let running = false;
  let samples = [];
  let lastFrame = -1;
  let lastSeen = 0;

  function update(p) {
    const visible = p && p[0].visibility > 0.6 && p[11].visibility > 0.6 && p[12].visibility > 0.6;
    if (!visible) {
      if (performance.now() - lastSeen > 600) {
        Object.assign(body, { tracking: false, duck: false, duckAmount: 0, hands: [], head: null });
        body.status = 'Step into view — head and shoulders visible';
      }
      return;
    }
    lastSeen = performance.now();
    body.tracking = true;
    body.landmarks = p;
    const mirror = q => ({ x: 1 - q.x, y: q.y });
    body.head = mirror(p[0]);
    body.hands = [15, 16].filter(i => p[i].visibility > 0.55).map(i => mirror(p[i]));
    const shoulderWidth = Math.abs(p[11].x - p[12].x);
    const shoulderMid = (p[11].x + p[12].x) / 2;
    body.lean = Math.max(-1, Math.min(1, -((p[0].x - shoulderMid) / Math.max(0.05, shoulderWidth)) * 1.5));

    if (body.baseline === null) {
      samples.push(p[0].y);
      body.status = `Stand tall — calibrating ${Math.round((samples.length / CALIBRATION_FRAMES) * 100)}%`;
      if (samples.length >= CALIBRATION_FRAMES) {
        body.baseline = samples.reduce((a, b) => a + b, 0) / samples.length;
        body.threshold = Math.max(0.07, shoulderWidth * 0.35);
        body.ready = true;
      }
      return;
    }
    body.duckAmount = Math.max(0, (p[0].y - body.baseline) / body.threshold);
    body.duck = body.duckAmount >= 1;
    body.status = body.duck ? 'Ducking' : 'Tracking';
  }

  function loop() {
    if (!running) return;
    if (video.currentTime !== lastFrame) {
      lastFrame = video.currentTime;
      try {
        update(model.detectForVideo(video, performance.now()).landmarks[0]);
      } catch (error) {
        body.status = `Tracking error: ${error.message}`;
      }
    }
    requestAnimationFrame(loop);
  }

  const duckKeys = ['Space', 'ArrowDown'];
  addEventListener('keydown', e => { if (duckKeys.includes(e.code)) { e.preventDefault(); body.keyDuck = true; } });
  addEventListener('keyup', e => { if (duckKeys.includes(e.code)) body.keyDuck = false; });
  addEventListener('blur', () => { body.keyDuck = false; });
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r') body.calibrate(); });

  return body;
}
