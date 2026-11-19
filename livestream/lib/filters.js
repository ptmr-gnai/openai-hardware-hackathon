// 1€ filter: heavy smoothing when the signal is steady, little when it moves fast.
// https://gery.casiez.net/1euro/
export function oneEuro({ minCutoff = 1.2, beta = 0.015, dCutoff = 1.0 } = {}) {
  let prev = null;
  let prevDeriv = 0;
  let prevTime = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  const filter = (value, time) => {
    if (prev === null) { prev = value; prevTime = time; return value; }
    const dt = Math.max(1e-3, time - prevTime);
    prevTime = time;
    const deriv = (value - prev) / dt;
    prevDeriv += (deriv - prevDeriv) * alpha(dCutoff, dt);
    const cutoff = minCutoff + beta * Math.abs(prevDeriv);
    prev += (value - prev) * alpha(cutoff, dt);
    return prev;
  };
  filter.reset = () => { prev = null; prevDeriv = 0; };
  return filter;
}
