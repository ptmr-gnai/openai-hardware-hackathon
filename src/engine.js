export const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b, n));
export function parseHeartRate(view) {
  if (view.byteLength < 2) throw new Error('Truncated heart-rate packet');
  const wide = view.getUint8(0) & 1;
  if (wide && view.byteLength < 3) throw new Error('Truncated 16-bit heart-rate packet');
  return wide ? view.getUint16(1, true) : view.getUint8(1);
}
export function parseWand(line) {
  const v = JSON.parse(line);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || typeof v.duck !== 'boolean') throw new Error('Expected x, y, duck');
  return {x:clamp(v.x),y:clamp(v.y),duck:v.duck};
}
export class Round {
  constructor(random = Math.random) { this.random=random; this.reset(); }
  reset() { this.elapsed=0; this.score=0; this.streak=0; this.best=0; this.hits=0; this.dodges=0; this.missed=0; this.nextWave=8; this.wave=null; this.target=null; this.active=false; }
  start() { this.reset(); this.active=true; this.spawn(); }
  spawn() { this.target={x:.16+this.random()*.68,y:.28+this.random()*.43,age:0}; }
  tick(dt, hands=[], duck=false) {
    if(!this.active) return [];
    dt=clamp(dt,0,.1); this.elapsed+=dt; const events=[];
    if(this.elapsed>=60) { this.elapsed=60; this.active=false; return ['end']; }
    if(this.elapsed>=this.nextWave && !this.wave) { this.wave={age:0}; events.push('warning'); }
    if(this.wave) {
      this.wave.age+=dt;
      if(this.wave.age>=2.5) {
        if(duck) { this.score+=25; this.dodges++; events.push('dodge'); }
        else { this.streak=0; this.missed++; events.push('bump'); }
        this.wave=null; this.nextWave+=10;
      }
    } else if(this.target) {
      this.target.age+=dt;
      if(hands.some(h=>Math.hypot(h.x-this.target.x,h.y-this.target.y)<.075)) {
        this.hits++; this.streak++; this.best=Math.max(this.best,this.streak); this.score+=10+Math.min(this.streak-1,5)*2; events.push('hit'); this.spawn();
      } else if(this.target.age>4) { this.streak=0; this.missed++; events.push('miss'); this.spawn(); }
    }
    return events;
  }
}
