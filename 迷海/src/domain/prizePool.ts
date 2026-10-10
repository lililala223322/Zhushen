/**
 * 迷海寻宝固定奖池。
 *
 * 权重使用整数基点（1% = 100 bp）保存，避免“概率和为 100%”仅仅
 * 因浮点误差而近似成立。重复展示的三类奖品在这里合并为一个类别，
 * 并通过 initialStock = 2 表示库存。
 */
export const PRIZE_CATEGORIES = [
  { id: "crystal_60", name: "水晶60", weightBp: 908, initialStock: 1, fragmentValue: 0 },
  { id: "fragment_5", name: "碎片5", weightBp: 403, initialStock: 1, fragmentValue: 5 },
  { id: "orange_resource_2", name: "橙色资源2", weightBp: 601, initialStock: 1, fragmentValue: 0 },
  { id: "fragment_15", name: "碎片15", weightBp: 192, initialStock: 1, fragmentValue: 15 },
  { id: "crystal_80", name: "水晶80", weightBp: 868, initialStock: 1, fragmentValue: 0 },
  { id: "advanced_resource", name: "高级资源", weightBp: 200, initialStock: 1, fragmentValue: 0 },
  { id: "fragment_30", name: "碎片30", weightBp: 144, initialStock: 1, fragmentValue: 30 },
  { id: "orange_resource_3", name: "橙色资源3", weightBp: 336, initialStock: 1, fragmentValue: 0 },
  { id: "crystal_100", name: "水晶100", weightBp: 561, initialStock: 1, fragmentValue: 0 },
  { id: "orange_resource_5", name: "橙色资源5", weightBp: 240, initialStock: 1, fragmentValue: 0 },
  { id: "radiant_stone_3", name: "辉石3", weightBp: 448, initialStock: 2, fragmentValue: 0 },
  {
    id: "medium_exp_potion_5",
    name: "中级经验药水5",
    weightBp: 481,
    initialStock: 1,
    fragmentValue: 0,
  },
  { id: "dragon_soul_5", name: "龙魂5", weightBp: 663, initialStock: 1, fragmentValue: 0 },
  { id: "divine_soul_3", name: "神魂3", weightBp: 167, initialStock: 1, fragmentValue: 0 },
  {
    id: "intermediate_resource",
    name: "中级资源",
    weightBp: 315,
    initialStock: 1,
    fragmentValue: 0,
  },
  { id: "dragon_soul_10", name: "龙魂10", weightBp: 801, initialStock: 1, fragmentValue: 0 },
  { id: "divine_soul_6", name: "神魂6", weightBp: 99, initialStock: 1, fragmentValue: 0 },
  { id: "dragon_soul_15", name: "龙魂15", weightBp: 449, initialStock: 1, fragmentValue: 0 },
  { id: "radiant_stone_5", name: "辉石5", weightBp: 282, initialStock: 2, fragmentValue: 0 },
  {
    id: "medium_exp_potion_3",
    name: "中级经验药水3",
    weightBp: 962,
    initialStock: 1,
    fragmentValue: 0,
  },
  { id: "soul_crystal", name: "灵魂水晶", weightBp: 579, initialStock: 2, fragmentValue: 0 },
  {
    id: "intermediate_resource_9",
    name: "中级资源9",
    weightBp: 301,
    initialStock: 1,
    fragmentValue: 0,
  },
] as const;

export type PrizeCategory = (typeof PRIZE_CATEGORIES)[number];
export type PrizeId = PrizeCategory["id"];
export type FragmentValue = 5 | 15 | 30;
export type FragmentMask = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const CATEGORY_COUNT = PRIZE_CATEGORIES.length;
export const MAP_SIZE = 25;
export const FIXED_FRAGMENTS_PER_OPEN = 2;
export const BONUS_FRAGMENTS_PER_MAP = 5 + 15 + 30;
export const FULL_MAP_YIELD =
  MAP_SIZE * FIXED_FRAGMENTS_PER_OPEN + BONUS_FRAGMENTS_PER_MAP;

export const CATEGORY_WEIGHT_BPS = new Uint16Array(
  PRIZE_CATEGORIES.map((category) => category.weightBp),
);
export const INITIAL_INVENTORY = new Uint8Array(
  PRIZE_CATEGORIES.map((category) => category.initialStock),
);
export const FRAGMENT_VALUE_BY_CATEGORY = new Uint8Array(
  PRIZE_CATEGORIES.map((category) => category.fragmentValue),
);

export const CATEGORY_INDEX_BY_ID: Readonly<Record<PrizeId, number>> =
  Object.freeze(
    Object.fromEntries(
      PRIZE_CATEGORIES.map((category, index) => [category.id, index]),
    ) as Record<PrizeId, number>,
  );

export const FRAGMENT_CATEGORY_INDICES = Object.freeze({
  5: CATEGORY_INDEX_BY_ID.fragment_5,
  15: CATEGORY_INDEX_BY_ID.fragment_15,
  30: CATEGORY_INDEX_BY_ID.fragment_30,
} satisfies Record<FragmentValue, number>);

export function createInitialInventory(): Uint8Array {
  return INITIAL_INVENTORY.slice();
}

export function getFragmentValue(categoryIndex: number): FragmentValue | 0 {
  const value = FRAGMENT_VALUE_BY_CATEGORY[categoryIndex];
  if (value === 5 || value === 15 || value === 30) {
    return value;
  }
  return 0;
}

export function fragmentMaskBit(value: FragmentValue): 1 | 2 | 4 {
  switch (value) {
    case 5:
      return 1;
    case 15:
      return 2;
    case 30:
      return 4;
  }
}

export function sumInventory(inventory: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < inventory.length; index += 1) {
    total += inventory[index] ?? 0;
  }
  return total;
}

export function remainingFragmentBonus(
  inventory: ArrayLike<number>,
): number {
  return (
    (inventory[FRAGMENT_CATEGORY_INDICES[5]] ?? 0) * 5 +
    (inventory[FRAGMENT_CATEGORY_INDICES[15]] ?? 0) * 15 +
    (inventory[FRAGMENT_CATEGORY_INDICES[30]] ?? 0) * 30
  );
}

/** Sum of the 22 de-duplicated display weights: exactly 100.00%. */
export const UNIQUE_WEIGHT_BPS = CATEGORY_WEIGHT_BPS.reduce(
  (sum, weight) => sum + weight,
  0,
);

/** Sum obtained when the three stock-2 rows are counted twice: 113.09%. */
export const EXPANDED_ROW_WEIGHT_BPS = PRIZE_CATEGORIES.reduce(
  (sum, category) => sum + category.weightBp * category.initialStock,
  0,
);

