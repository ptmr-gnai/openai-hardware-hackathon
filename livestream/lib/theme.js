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
  T(['pizza', 'pizzas', 'pizza slice', 'slice', 'slices', 'dollar slice', 'pepperoni', 'cheese pizza', 'pizza party', 'pie'], '🍕', ['#ff7b54', '#ffd56b'], ['#ef476f', '#ffd166', '#f8f9fa'], { motion: 'fall', scene: 'nyc' }),
  T(['rat', 'rats', 'pizza rat', 'subway rat', 'mouse', 'mice', 'rodent', 'rodents', 'subway', 'metro', 'train', 'trains', 'mta', 'vermin'], '🐀', ['#adb5bd', '#e9ecef'], ['#6c757d', '#343a40', '#ffd60a'], { motion: 'scurry', scene: 'subway' }),
  T(['cockroach', 'cockroaches', 'roach', 'roaches', 'bug', 'bugs'], '🪳', ['#adb5bd', '#e9ecef'], ['#6f4518', '#343a40', '#ffd60a'], { motion: 'scurry', scene: 'subway' }),
  T(['ducks', 'duckling', 'ducklings', 'duck season', 'duck hunt', 'duck hunting', 'mallard', 'mallards', 'quack', 'goose', 'geese', 'pond', 'central park', 'the park'], '🦆', ['#48cae4', '#caf0f8'], ['#ffffff', '#52b788', '#ffd60a'], { motion: 'fly', scene: 'pond' }),
  T(['pigeon', 'pigeons', 'bird', 'birds', 'dove', 'doves', 'seagull', 'seagulls', 'flock'], '🐦', ['#ff9e7d', '#ffe5b4'], ['#adb5bd', '#ffffff', '#6c757d'], { motion: 'fly', scene: 'nyc' }),
  T(['taxi', 'taxis', 'cab', 'cabs', 'yellow cab', 'yellow cabs', 'car', 'cars', 'traffic', 'rush hour'], '🚕', ['#ff7b54', '#ffd56b'], ['#ffd60a', '#000000', '#ffffff'], { motion: 'scurry', scene: 'nyc' }),
  T(['bus', 'buses', 'city bus'], '🚌', ['#ff7b54', '#ffd56b'], ['#118ab2', '#ffffff', '#ffd60a'], { motion: 'scurry', scene: 'nyc' }),
  T(['fire truck', 'firetruck', 'fire trucks', 'fire engine', 'firefighter'], '🚒', ['#ff7b54', '#ffd56b'], ['#e63946', '#ffffff', '#ffd60a'], { motion: 'scurry', scene: 'nyc' }),
  T(['bagel', 'bagels', 'breakfast', 'lox', 'schmear', 'everything bagel'], '🥯', ['#ff9e7d', '#ffe5b4'], ['#d4a373', '#faedcd', '#6f4518'], { motion: 'fall', scene: 'nyc' }),
  T(['hot dog', 'hotdog', 'hot dogs', 'hotdogs', 'frank', 'franks', 'sausage', 'sausages', 'street food', 'food cart'], '🌭', ['#ff7b54', '#ffd56b'], ['#e63946', '#ffd60a', '#d4a373'], { motion: 'fall', scene: 'nyc' }),
  T(['pretzel', 'pretzels'], '🥨', ['#ff9e7d', '#ffe5b4'], ['#b08968', '#ffffff', '#7f5539'], { motion: 'fall', scene: 'nyc' }),
  T(['dumpling', 'dumplings', 'chinatown', 'dim sum'], '🥟', ['#9d0208', '#ffba08'], ['#fefae0', '#e63946', '#ffd60a'], { motion: 'fall', scene: 'nyc' }),
  T(['coffee', 'coffees', 'latte', 'espresso', 'deli coffee'], '☕', ['#6f4518', '#ede0d4'], ['#b08968', '#ffffff', '#432818'], { motion: 'fall', scene: 'nyc' }),
  T(['statue of liberty', 'lady liberty', 'liberty', 'statue', 'statues'], '🗽', ['#118ab2', '#caf0f8'], ['#52b788', '#ffffff', '#ffd60a'], { motion: 'rise', scene: 'nyc' }),
  T(['big apple', 'new york', 'new york city', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'times square', 'broadway', 'skyline', 'city'], '🍎', ['#ff7b54', '#ffd56b'], ['#e63946', '#52b788', '#ffffff'], { motion: 'fall', scene: 'nyc' }),
  // --- everything else ---
  T(['teddy', 'teddies', 'teddy bear', 'teddy bears', 'bear', 'bears', 'stuffed animal', 'stuffed animals', 'plushie'], '🧸', ['#5b3a29', '#e9c8a0'], ['#c68642', '#8d5524', '#ffdbac']),
  T(['cat', 'cats', 'kitten', 'kittens', 'kitty', 'kitties', 'kitty cat', 'bodega cat', 'meow'], '🐱', ['#3d2c5c', '#f6c1d9'], ['#ffb347', '#ffffff', '#ff8fab']),
  T(['dog', 'dogs', 'puppy', 'puppies', 'pup', 'pups', 'doggo', 'doggos', 'corgi', 'woof'], '🐶', ['#2d6a4f', '#b7e4c7'], ['#d4a373', '#ffffff', '#6f4518']),
  T(['donut', 'donuts', 'doughnut', 'doughnuts'], '🍩', ['#6d3b7a', '#ffc8dd'], ['#ff8fab', '#ffd6a5', '#cdb4db']),
  T(['ghost', 'ghosts', 'spooky', 'halloween', 'boo', 'haunted'], '👻', ['#0b0b1a', '#4b3b6b'], ['#ffffff', '#c8b6ff', '#ff9f1c']),
  T(['pumpkin', 'pumpkins', 'jack o lantern'], '🎃', ['#1a0f00', '#ff7b00'], ['#ff7b00', '#ffd000', '#3a5a40']),
  T(['alien', 'aliens', 'ufo', 'ufos', 'space', 'outer space', 'martian', 'martians'], '👽', ['#000814', '#3a0ca3'], ['#80ffdb', '#7209b7', '#ffffff']),
  T(['rocket', 'rockets', 'spaceship', 'spaceships', 'blast off'], '🚀', ['#03045e', '#0077b6'], ['#ff6b35', '#ffd166', '#ffffff']),
  T(['star', 'stars', 'night sky', 'galaxy'], '⭐', ['#0d1b2a', '#415a77'], ['#ffd60a', '#ffffff', '#ffc300']),
  T(['heart', 'hearts', 'valentine', 'valentines'], '❤️', ['#590d22', '#ffb3c1'], ['#ff4d6d', '#ff8fa3', '#ffffff']),
  T(['fish', 'fishes', 'goldfish', 'ocean', 'sea', 'underwater', 'aquarium'], '🐟', ['#023e8a', '#48cae4'], ['#90e0ef', '#ffffff', '#ffb703']),
  T(['shark', 'sharks', 'jaws'], '🦈', ['#03045e', '#00b4d8'], ['#caf0f8', '#ffffff', '#e63946']),
  T(['octopus', 'octopuses', 'octopi', 'squid'], '🐙', ['#240046', '#7b2cbf'], ['#ff6d00', '#ff9e00', '#e0aaff']),
  T(['frog', 'frogs', 'toad', 'toads'], '🐸', ['#1b4332', '#95d5b2'], ['#52b788', '#d8f3dc', '#ffd166']),
  T(['rubber duck', 'rubber ducks', 'rubber ducky', 'ducky'], '🦆', ['#0077b6', '#caf0f8'], ['#ffd60a', '#ff9f1c', '#ffffff']),
  T(['chicken', 'chickens', 'chick', 'chicks'], '🐔', ['#7f5539', '#ede0d4'], ['#ffffff', '#ffd60a', '#e63946']),
  T(['unicorn', 'unicorns', 'rainbow', 'rainbows', 'magic'], '🦄', ['#7400b8', '#ffafcc'], ['#ffafcc', '#bde0fe', '#cdb4db', '#ffd6a5']),
  T(['dragon', 'dragons'], '🐉', ['#370617', '#dc2f02'], ['#ffba08', '#e85d04', '#38b000']),
  T(['dinosaur', 'dinosaurs', 'dino', 'dinos', 't rex', 'trex'], '🦖', ['#2b2d42', '#8d99ae'], ['#38b000', '#70e000', '#ffd60a']),
  T(['robot', 'robots', 'ai', 'codex', 'computer', 'computers'], '🤖', ['#212529', '#6c757d'], ['#adb5bd', '#00b4d8', '#ffd60a']),
  T(['banana', 'bananas'], '🍌', ['#3a5a40', '#fefae0'], ['#ffd60a', '#fff3b0', '#6f4518']),
  T(['apple', 'apples'], '🍎', ['#2d6a4f', '#d8f3dc'], ['#e63946', '#52b788', '#ffffff']),
  T(['strawberry', 'strawberries', 'fruit', 'fruits'], '🍓', ['#590d22', '#ffccd5'], ['#e63946', '#2d6a4f', '#ffffff']),
  T(['cupcake', 'cupcakes', 'cake', 'cakes', 'birthday', 'party'], '🧁', ['#ff85a1', '#fff0f3'], ['#ff4d6d', '#ffd6a5', '#bde0fe']),
  T(['ice cream', 'ice creams', 'ice cream cone', 'gelato'], '🍦', ['#bde0fe', '#fff0f3'], ['#ffafcc', '#fff3b0', '#a2d2ff']),
  T(['cookie', 'cookies', 'black and white cookie'], '🍪', ['#6f4518', '#ede0d4'], ['#b08968', '#7f5539', '#ffffff']),
  T(['taco', 'tacos', 'burrito', 'burritos'], '🌮', ['#9d0208', '#ffba08'], ['#ffba08', '#38b000', '#d00000']),
  T(['sushi', 'sashimi'], '🍣', ['#03045e', '#caf0f8'], ['#ff8fab', '#ffffff', '#2d6a4f']),
  T(['ramen', 'noodles', 'noodle'], '🍜', ['#9d0208', '#ffba08'], ['#ffd6a5', '#ffffff', '#e63946']),
  T(['burger', 'burgers', 'hamburger', 'hamburgers', 'cheeseburger', 'fries'], '🍔', ['#6f1d1b', '#ffe6a7'], ['#bb9457', '#432818', '#99582a']),
  T(['football', 'soccer', 'soccer ball'], '⚽', ['#2d6a4f', '#95d5b2'], ['#ffffff', '#000000', '#52b788']),
  T(['basketball', 'basketballs', 'hoops'], '🏀', ['#7f4f24', '#ffcb69'], ['#e85d04', '#000000', '#ffffff']),
  T(['baseball', 'baseballs'], '⚾', ['#2d6a4f', '#95d5b2'], ['#ffffff', '#e63946', '#52b788']),
  T(['flower', 'flowers', 'spring', 'rose', 'roses', 'tulip', 'tulips', 'garden'], '🌸', ['#80b918', '#fff0f3'], ['#ffafcc', '#ffffff', '#ffd6a5']),
  T(['snowman', 'snowmen', 'snow', 'snowflake', 'snowflakes', 'winter', 'christmas', 'holidays'], '⛄', ['#0b2545', '#caf0f8'], ['#ffffff', '#caf0f8', '#e63946']),
  T(['santa', 'santa claus'], '🎅', ['#0b2545', '#e63946'], ['#ffffff', '#e63946', '#2d6a4f']),
  T(['poop', 'poo', 'poops'], '💩', ['#432818', '#bb9457'], ['#7f5539', '#b08968', '#ffffff']),
  T(['monkey', 'monkeys', 'banana monkey'], '🐵', ['#386641', '#a7c957'], ['#bc6c25', '#dda15e', '#ffffff']),
  T(['panda', 'pandas'], '🐼', ['#1b4332', '#d8f3dc'], ['#000000', '#ffffff', '#52b788']),
  T(['bee', 'bees', 'bumblebee', 'honey'], '🐝', ['#ffb703', '#fff3b0'], ['#000000', '#ffd60a', '#ffffff'], { motion: 'fly', scene: 'pond' }),
  T(['butterfly', 'butterflies'], '🦋', ['#023e8a', '#ade8f4'], ['#00b4d8', '#ffffff', '#7209b7'], { motion: 'fly', scene: 'pond' }),
  T(['money', 'cash', 'dollar', 'dollars', 'bucks', 'bills', 'make it rain', 'rich'], '💵', ['#081c15', '#74c69d'], ['#52b788', '#ffd60a', '#ffffff'], { motion: 'fall' }),
  T(['diamond', 'diamonds', 'gem', 'gems', 'jewel', 'jewels', 'bling'], '💎', ['#03045e', '#90e0ef'], ['#caf0f8', '#ffffff', '#00b4d8']),
  T(['bomb', 'bombs', 'boom', 'explosion'], '💣', ['#000000', '#495057'], ['#ff7b00', '#ffd000', '#d00000']),
  T(['fireworks', 'firework', 'celebration', 'new years'], '🎆', ['#000814', '#3a0ca3'], ['#ffd60a', '#ff006e', '#3a86ff', '#ffffff']),
  T(['rain', 'rainy', 'raining', 'umbrella', 'umbrellas', 'storm'], '☂️', ['#343a40', '#adb5bd'], ['#90e0ef', '#ffffff', '#3a86ff'], { motion: 'fall' }),
  T(['sun', 'sunny', 'summer', 'beach'], '☀️', ['#ff9e00', '#ffe5b4'], ['#ffd60a', '#ff9e00', '#ffffff']),
  T(['moon', 'moons', 'night', 'midnight'], '🌙', ['#03045e', '#3a0ca3'], ['#ffd60a', '#ffffff', '#c8b6ff']),
];
const RESET_WORDS = ['balloon', 'balloons', 'normal', 'reset', 'default', 'back to normal', 'start over', 'original', 'classic', 'go back'];

const singular = w => w.replace(/(ies)$/, 'y').replace(/(ches|shes|xes|oes)$/, m => m.slice(0, -2)).replace(/s$/, '');

export async function resolveTheme(text) {
  const clean = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const words = clean.split(' ');
  const candidates = new Set();
  // Single words (and their singulars) plus phrases of up to 4 words, so
  // "make it rain" or "statue of liberty" can beat a shorter match inside them.
  for (let i = 0; i < words.length; i++) {
    candidates.add(words[i]);
    candidates.add(singular(words[i]));
    for (let n = 2; n <= 4 && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n);
      candidates.add(phrase.join(' '));
      candidates.add([...phrase.slice(0, -1), singular(phrase.at(-1))].join(' '));
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
