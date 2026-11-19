// Effects part: particle bursts and floating score text, drawn on a 2D canvas.
export function createFx() {
  let particles = [];
  let texts = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    burst(x, y, color, count = 18, speed = 320) {
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const v = rand(speed * 0.3, speed);
        particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: rand(0.4, 0.8), max: 0.8, color, size: rand(3, 7) });
      }
    },
    puff(x, y) { this.burst(x, y, '#ffffffaa', 6, 90); },
    text(label, x, y, color = '#fff') { texts.push({ label, x, y, color, life: 0.9 }); },
    clear() { particles = []; texts = []; },
    update(dt) {
      for (const p of particles) {
        p.life -= dt;
        p.vy += 600 * dt;
        p.vx *= 0.98;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const t of texts) { t.life -= dt; t.y -= 60 * dt; }
      particles = particles.filter(p => p.life > 0);
      texts = texts.filter(t => t.life > 0);
    },
    draw(g) {
      for (const p of particles) {
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.textAlign = 'center';
      g.font = '800 34px system-ui, sans-serif';
      for (const t of texts) {
        g.globalAlpha = Math.min(1, t.life * 2);
        g.lineWidth = 5;
        g.strokeStyle = '#0008';
        g.lineJoin = 'round';
        g.strokeText(t.label, t.x, t.y);
        g.fillStyle = t.color;
        g.fillText(t.label, t.x, t.y);
      }
      g.globalAlpha = 1;
    },
  };
}
