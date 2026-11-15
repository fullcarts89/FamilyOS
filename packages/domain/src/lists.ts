/**
 * Fixed vocabularies for meals, the grocery list and contacts. The order is the display order:
 * aisles follow a typical walk through the store, contact categories put health first.
 */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const GROCERY_AISLES = [
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
] as const;
export type GroceryAisle = (typeof GROCERY_AISLES)[number];

export const CONTACT_CATEGORIES = [
  'health',
  'childcare',
  'school',
  'pets',
  'home',
  'services',
  'family',
  'other',
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/** Sort key for a value in one of the vocabularies above. */
export const orderIn = <T extends string>(list: readonly T[], value: T): number =>
  list.indexOf(value);
