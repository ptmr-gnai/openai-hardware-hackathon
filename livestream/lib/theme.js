// Theme part: what the targets look like. Games draw from ctx.theme, and a
// spoken phrase can swap it mid-round ("teddy bears" → balloons become 🧸).
//
// Theme shape (also the contract for the future OpenAI resolver):
//   { name: 'teddy bears', sprite: '🧸' | null, sky: [top, bottom], burst: [colors…],
//     motion: 'rise' | 'fall' | 'fly' | 'scurry', scene: 'sky' | 'nyc' | 'subway' | 'pond' }
//   sprite null = draw classic balloons.
//
// resolveTheme(text) is async so the local dictionary below can later be
// replaced by a server call to a model returning the same JSON.
export const DEFAULT_THEME = { name: 'balloons', sprite: null, sky: ['#2b6cb0', '#90cdf4'], burst: null, motion: 'rise', scene: 'sky' };

const T = (words, sprite, sky, burst, { motion = 'rise', scene = 'sky' } = {}) => ({ words, sprite, sky, burst, motion, scene });
const DICTIONARY = [
  // --- NYC pack ---
  T(['pizza', 'pizza slice', 'slice'], '🍕', ['#ff7b54', '#ffd56b'], ['#ef476f', '#ffd166', '#f8f9fa'], { motion: 'fall', scene: 'nyc' }),
  T(['rat', 'pizza rat', 'subway rat', 'mouse', 'mice'], '🐀', ['#adb5bd', '#e9ecef'], ['#6c757d', '#343a40', '#ffd60a'], { motion: 'scurry', scene: 'subway' }),
  T(['ducks', 'duck season', 'duck hunt', 'duck hunting'], '🦆', ['#48cae4', '#caf0f8'], ['#ffffff', '#52b788', '#ffd60a'], { motion: 'fly', scene: 'pond' }),
  T(['pigeon', 'pigeons', 'bird', 'birds'], '🐦', ['#ff9e7d', '#ffe5b4'], ['#adb5bd', '#ffffff', '#6c757d'], { motion: 'fly', scene: 'nyc' }),
  T(['taxi', 'taxis', 'cab', 'cabs', 'yellow cab'], '🚕', ['#ff7b54', '#ffd56b'], ['#ffd60a', '#000000', '#ffffff'], { motion: 'scurry', scene: 'nyc' }),
  T(['bagel', 'bagels'], '🥯', ['#ff9e7d', '#ffe5b4'], ['#d4a373', '#faedcd', '#6f4518'], { motion: 'fall', scene: 'nyc' }),
  T(['hot dog', 'hotdog', 'hot dogs'], '🌭', ['#ff7b54', '#ffd56b'], ['#e63946', '#ffd60a', '#d4a373'], { motion: 'fall', scene: 'nyc' }),
  T(['big apple', 'new york', 'nyc'], '🍎', ['#ff7b54', '#ffd56b'], ['#e63946', '#52b788', '#ffffff'], { motion: 'fall', scene: 'nyc' }),
  // --- everything else ---
  T(['teddy', 'teddy bear', 'bear'], '🧸', ['#5b3a29', '#e9c8a0'], ['#c68642', '#8d5524', '#ffdbac']),
  T(['cat', 'kitten', 'kitty'], '🐱', ['#3d2c5c', '#f6c1d9'], ['#ffb347', '#ffffff', '#ff8fab']),
  T(['dog', 'puppy', 'doggo'], '🐶', ['#2d6a4f', '#b7e4c7'], ['#d4a373', '#ffffff', '#6f4518']),
  T(['donut', 'doughnut'], '🍩', ['#6d3b7a', '#ffc8dd'], ['#ff8fab', '#ffd6a5', '#cdb4db']),
  T(['ghost', 'spooky', 'halloween'], '👻', ['#0b0b1a', '#4b3b6b'], ['#ffffff', '#c8b6ff', '#ff9f1c']),
  T(['pumpkin'], '🎃', ['#1a0f00', '#ff7b00'], ['#ff7b00', '#ffd000', '#3a5a40']),
  T(['alien', 'ufo', 'space'], '👽', ['#000814', '#3a0ca3'], ['#80ffdb', '#7209b7', '#ffffff']),
  T(['rocket'], '🚀', ['#03045e', '#0077b6'], ['#ff6b35', '#ffd166', '#ffffff']),
  T(['star'], '⭐', ['#0d1b2a', '#415a77'], ['#ffd60a', '#ffffff', '#ffc300']),
  T(['heart', 'love'], '❤️', ['#590d22', '#ffb3c1'], ['#ff4d6d', '#ff8fa3', '#ffffff']),
  T(['fish', 'ocean', 'sea', 'underwater'], '🐟', ['#023e8a', '#48cae4'], ['#90e0ef', '#ffffff', '#ffb703']),
  T(['shark'], '🦈', ['#03045e', '#00b4d8'], ['#caf0f8', '#ffffff', '#e63946']),
  T(['octopus'], '🐙', ['#240046', '#7b2cbf'], ['#ff6d00', '#ff9e00', '#e0aaff']),
  T(['frog'], '🐸', ['#1b4332', '#95d5b2'], ['#52b788', '#d8f3dc', '#ffd166']),
  T(['rubber duck', 'rubber ducks', 'ducky'], '🦆', ['#0077b6', '#caf0f8'], ['#ffd60a', '#ff9f1c', '#ffffff']),
  T(['chicken'], '🐔', ['#7f5539', '#ede0d4'], ['#ffffff', '#ffd60a', '#e63946']),
  T(['unicorn'], '🦄', ['#7400b8', '#ffafcc'], ['#ffafcc', '#bde0fe', '#cdb4db', '#ffd6a5']),
  T(['dragon'], '🐉', ['#370617', '#dc2f02'], ['#ffba08', '#e85d04', '#38b000']),
  T(['dinosaur', 'dino', 't rex'], '🦖', ['#2b2d42', '#8d99ae'], ['#38b000', '#70e000', '#ffd60a']),
  T(['robot'], '🤖', ['#212529', '#6c757d'], ['#adb5bd', '#00b4d8', '#ffd60a']),
  T(['banana'], '🍌', ['#3a5a40', '#fefae0'], ['#ffd60a', '#fff3b0', '#6f4518']),
  T(['apple'], '🍎', ['#2d6a4f', '#d8f3dc'], ['#e63946', '#52b788', '#ffffff']),
  T(['strawberry', 'strawberries'], '🍓', ['#590d22', '#ffccd5'], ['#e63946', '#2d6a4f', '#ffffff']),
  T(['cupcake', 'cake', 'birthday'], '🧁', ['#ff85a1', '#fff0f3'], ['#ff4d6d', '#ffd6a5', '#bde0fe']),
  T(['ice cream'], '🍦', ['#bde0fe', '#fff0f3'], ['#ffafcc', '#fff3b0', '#a2d2ff']),
  T(['cookie'], '🍪', ['#6f4518', '#ede0d4'], ['#b08968', '#7f5539', '#ffffff']),
  T(['taco'], '🌮', ['#9d0208', '#ffba08'], ['#ffba08', '#38b000', '#d00000']),
  T(['burger', 'hamburger'], '🍔', ['#6f1d1b', '#ffe6a7'], ['#bb9457', '#432818', '#99582a']),
  T(['football', 'soccer'], '⚽', ['#2d6a4f', '#95d5b2'], ['#ffffff', '#000000', '#52b788']),
  T(['basketball'], '🏀', ['#7f4f24', '#ffcb69'], ['#e85d04', '#000000', '#ffffff']),
  T(['flower', 'flowers', 'spring'], '🌸', ['#80b918', '#fff0f3'], ['#ffafcc', '#ffffff', '#ffd6a5']),
  T(['snowman', 'snow', 'winter', 'christmas'], '⛄', ['#0b2545', '#caf0f8'], ['#ffffff', '#caf0f8', '#e63946']),
  T(['santa'], '🎅', ['#0b2545', '#e63946'], ['#ffffff', '#e63946', '#2d6a4f']),
  T(['poop', 'poo'], '💩', ['#432818', '#bb9457'], ['#7f5539', '#b08968', '#ffffff']),
  T(['monkey'], '🐵', ['#386641', '#a7c957'], ['#bc6c25', '#dda15e', '#ffffff']),
  T(['panda'], '🐼', ['#1b4332', '#d8f3dc'], ['#000000', '#ffffff', '#52b788']),
  T(['bee', 'bees'], '🐝', ['#ffb703', '#fff3b0'], ['#000000', '#ffd60a', '#ffffff']),
  T(['butterfly', 'butterflies'], '🦋', ['#023e8a', '#ade8f4'], ['#00b4d8', '#ffffff', '#7209b7']),
  T(['money', 'cash', 'dollar'], '💵', ['#081c15', '#74c69d'], ['#52b788', '#ffd60a', '#ffffff']),
  T(['diamond', 'gem'], '💎', ['#03045e', '#90e0ef'], ['#caf0f8', '#ffffff', '#00b4d8']),
  T(['bomb'], '💣', ['#000000', '#495057'], ['#ff7b00', '#ffd000', '#d00000']),
];
const RESET_WORDS = ['balloon', 'balloons', 'normal', 'reset', 'default', 'back to normal'];

const singular = w => w.replace(/(ies)$/, 'y').replace(/(ches|shes|xes|oes)$/, m => m.slice(0, -2)).replace(/s$/, '');

export async function resolveTheme(text) {
  const clean = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const words = clean.split(' ');
  const candidates = new Set();
  for (let i = 0; i < words.length; i++) {
    candidates.add(words[i]);
    candidates.add(singular(words[i]));
    if (i + 1 < words.length) {
      candidates.add(`${words[i]} ${words[i + 1]}`);
      candidates.add(`${words[i]} ${singular(words[i + 1])}`);
    }
  }
  if (RESET_WORDS.some(w => candidates.has(w))) return { ...DEFAULT_THEME };
  // Prefer the longest matching phrase ("ice cream" over "cream").
  let best = null;
  for (const entry of DICTIONARY) {
    for (const w of entry.words) {
      if (candidates.has(w) && (!best || w.length > best.word.length)) best = { entry, word: w };
    }
  }
  if (!best) return null;
  const { entry } = best;
  return { name: clean, sprite: entry.sprite, sky: entry.sky, burst: entry.burst, motion: entry.motion, scene: entry.scene };
}

// The current theme, shared by every game and remembered across reloads.
const KEY = 'arcade.theme';
let current = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? { ...DEFAULT_THEME }; } catch { return { ...DEFAULT_THEME }; }
})();
const listeners = [];
export const theme = {
  get current() { return current; },
  set(next) {
    current = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    listeners.forEach(fn => fn(next));
  },
  onChange(fn) { listeners.push(fn); },
};
