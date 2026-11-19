// Sprites part: emoji rendered once per (sprite, look, size) into an offscreen
// canvas, then stamped with drawImage. Use spriteImage(emoji, radius, look) and
// draw it centred: g.drawImage(img, x - img.css / 2, y - img.css / 2, img.css, img.css).
// Looks: 'plain' | 'gold' (glow) | 'runner' (dark brown + outline) | 'goldRunner'.
const GOLD = '#ffd60a';

// Emoji + filters/glow are rendered ONCE per (sprite, look, size)
// into an offscreen canvas, then stamped with drawImage each frame. Running
// canvas filters / shadowBlur per target per frame is what made rounds lag.
const spriteCache = new Map();
export function spriteImage(sprite, r, look = 'plain') {
  const size = Math.max(8, Math.round((r * 2.3) / 4) * 4); // 4px buckets
  const dpr = devicePixelRatio || 1;
  const key = `${sprite}|${look}|${size}|${dpr}`;
  let img = spriteCache.get(key);
  if (img) return img;
  const pad = look === 'plain' ? 4 : 36; // room for glow / outline
  const css = Math.ceil(size * 1.3 + pad * 2);
  img = document.createElement('canvas');
  img.width = img.height = Math.ceil(css * dpr);
  img.css = css;
  const g = img.getContext('2d');
  g.scale(dpr, dpr);
  g.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (look === 'gold' || look === 'goldRunner') {
    g.shadowColor = GOLD;
    g.shadowBlur = 30;
    g.fillText(sprite, css / 2, css / 2);
    g.shadowBlur = 0;
  }
  // Ground runners (gray rat emoji) read faint: darken to a brown "NYC rat"
  // (or tint gold), boost contrast and add a crisp dark outline.
  const outline = 'drop-shadow(0 0 1.5px #000) drop-shadow(0 0 1.5px #000)';
  if (look === 'runner') g.filter = `sepia(0.7) saturate(1.8) brightness(0.62) contrast(1.35) ${outline}`;
  if (look === 'goldRunner') g.filter = `sepia(1) saturate(4) brightness(1.05) ${outline}`;
  g.fillText(sprite, css / 2, css / 2);
  if (spriteCache.size > 300) spriteCache.clear();
  spriteCache.set(key, img);
  return img;
}

