// Calibration part: 5 on-screen targets; aim the wand tip at each, press A.
import { CAL_TARGETS, solveCalibration } from './wand.js';

export async function runCalibration(wand, container = document.body) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:50;background:#020814cc;cursor:none';
  const dot = document.createElement('div');
  dot.style.cssText = `position:absolute;width:30px;height:30px;border-radius:50%;
    transform:translate(-50%,-50%);background:#ff5d8f;border:3px solid #fff;
    box-shadow:0 0 0 8px #ff5d8f55,0 0 30px #ff5d8f;transition:left .2s,top .2s`;
  const prompt = document.createElement('div');
  prompt.style.cssText = `position:absolute;left:50%;top:24px;transform:translateX(-50%);
    color:#fff;font:600 16px system-ui;background:#000a;padding:10px 16px;border-radius:8px;
    border:1px solid #ff5d8f;text-align:center;white-space:nowrap`;
  overlay.append(dot, prompt);
  container.append(overlay);

  let cancelled = false;
  const onKey = event => {
    if (event.key === 'Escape') { cancelled = true; wand.cancelPress(); finish(); }
  };
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  addEventListener('keydown', onKey);

  try {
    const samples = [];
    for (const [i, target] of CAL_TARGETS.entries()) {
      dot.style.left = `${target.x * 100}%`;
      dot.style.top = `${target.y * 100}%`;
      prompt.textContent =
        `Calibrate ${i + 1}/${CAL_TARGETS.length}: point the wand tip at the dot (${target.label}) and press A · Esc cancels`;
      const sample = await Promise.race([wand.nextPress(), done]);
      if (cancelled) return null;
      samples.push(sample);
    }
    const cal = solveCalibration(samples);
    wand.setCalibration(cal);
    return cal;
  } catch (error) {
    prompt.textContent = error.message;
    await new Promise(r => setTimeout(r, 2200));
    return null;
  } finally {
    removeEventListener('keydown', onKey);
    overlay.remove();
  }
}
