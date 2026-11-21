import type { GroceryAisle } from './api';

// Pure helpers for the grocery list (no React Native), shared by the screens and tests.

/** Aisles in the order of a walk through the store (the API's order). */
export const AISLES: GroceryAisle[] = [
  'produce',
  'bakery',
  'dairy_eggs',
  'meat_fish',
  'pantry',
  'frozen',
  'baby',
  'pet',
  'household',
  'other',
];

export const AISLE_LABEL: Record<GroceryAisle, string> = {
  produce: 'Produce',
  bakery: 'Bakery',
  dairy_eggs: 'Dairy & eggs',
  meat_fish: 'Meat & fish',
  pantry: 'Pantry',
  frozen: 'Frozen',
  baby: 'Baby',
  pet: 'Pet',
  household: 'Household',
  other: 'Other',
};

/** Words that point to an aisle. The longest match wins ("peanut butter" beats "butter"). */
const AISLE_WORDS: [GroceryAisle, string[]][] = [
  ['baby', ['diaper', 'wipes', 'formula', 'baby', 'pacifier', 'sippy', 'pouches']],
  ['pet', ['dog', 'cat', 'kibble', 'litter', 'treats', 'flea', 'pet ']],
  [
    'household',
    [
      'soap',
      'detergent',
      'paper towel',
      'toilet paper',
      'tissues',
      'trash bag',
      'sponge',
      'bleach',
      'foil',
      'cling',
      'batteries',
      'light bulb',
      'cleaner',
      'shampoo',
      'toothpaste',
    ],
  ],
  ['frozen', ['frozen', 'ice cream', 'popsicle', 'peas', 'waffles']],
  [
    'dairy_eggs',
    ['milk', 'egg', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'kefir', 'cheddar', 'feta'],
  ],
  [
    'meat_fish',
    [
      'chicken',
      'beef',
      'pork',
      'salmon',
      'fish',
      'shrimp',
      'turkey',
      'bacon',
      'sausage',
      'mince',
      'steak',
      'tuna steak',
      'ham',
    ],
  ],
  ['bakery', ['bread', 'sourdough', 'bagel', 'bun', 'roll', 'tortilla', 'croissant', 'muffin']],
  [
    'produce',
    [
      'apple',
      'banana',
      'lemon',
      'lime',
      'orange',
      'berr',
      'grape',
      'avocado',
      'tomato',
      'potato',
      'onion',
      'garlic',
      'carrot',
      'spinach',
      'lettuce',
      'kale',
      'broccoli',
      'pepper',
      'cucumber',
      'zucchini',
      'mushroom',
      'herb',
      'basil',
      'dill',
      'cilantro',
      'parsley',
      'ginger',
      'pear',
      'peach',
      'melon',
      'squash',
      'celery',
      'salad',
    ],
  ],
  [
    'pantry',
    [
      'rice',
      'pasta',
      'flour',
      'sugar',
      'oil',
      'vinegar',
      'beans',
      'lentil',
      'cereal',
      'oats',
      'coffee',
      'tea',
      'sauce',
      'pesto',
      'stock',
      'broth',
      'spice',
      'salt',
      'honey',
      'peanut butter',
      'jam',
      'crackers',
      'snacks',
      'chips',
      'canned',
      'tuna',
      'noodles',
      'quinoa',
    ],
  ],
];

/** A best guess at the aisle from the item's name ("Oat milk" → dairy), else Other. */
export function guessAisle(name: string): GroceryAisle {
  const n = ` ${name.toLowerCase()} `;
  let best: { aisle: GroceryAisle; length: number } = { aisle: 'other', length: 0 };
  for (const [aisle, words] of AISLE_WORDS) {
    for (const w of words) {
      if (w.length > best.length && n.includes(w)) best = { aisle, length: w.length };
    }
  }
  return best.aisle;
}

/** "2 lemons" → name "lemons", detail "2"; "Milk, 1 gal" → "Milk" + "1 gal". */
export function splitDetail(raw: string): { name: string; detail: string | null } {
  const text = raw.trim().replace(/\s+/g, ' ');
  const comma = text.match(/^(.+?)\s*[,(]\s*(.+?)\)?$/);
  if (comma?.[1] && comma[2]) return { name: comma[1], detail: comma[2].slice(0, 80) };
  const qty = text.match(
    /^(\d+(?:\.\d+)?\s*(?:x|lb|lbs|kg|g|oz|gal|l|pack|packs|bags?|dozen)?)\s+(.+)$/i,
  );
  if (qty?.[1] && qty[2]) {
    const name = qty[2];
    return { name: name.charAt(0).toUpperCase() + name.slice(1), detail: qty[1] };
  }
  return { name: text, detail: null };
}
