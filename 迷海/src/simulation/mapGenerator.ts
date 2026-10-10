import type { ModelId } from "../domain/models";
import {
  CATEGORY_COUNT,
  CATEGORY_WEIGHT_BPS,
  createInitialInventory,
  INITIAL_INVENTORY,
  MAP_SIZE,
  sumInventory,
} from "../domain/prizePool";
import {
  deriveMapSeed,
  deriveMapSeedFromHash,
  Mulberry32,
  normalizeSeed,
  type Seed,
} from "./rng";

export interface MapCoordinates {
  readonly masterSeed: Seed;
  readonly episodeIndex: number;
  readonly mapIndex: number;
  readonly model: ModelId;
}

function validateInventory(inventory: ArrayLike<number>): void {
  if (inventory.length !== CATEGORY_COUNT) {
    throw new RangeError(`Inventory must contain ${CATEGORY_COUNT} categories.`);
  }
  for (let index = 0; index < inventory.length; index += 1) {
    const count = inventory[index] ?? -1;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Inventory counts must be non-negative integers.");
    }
  }
}

/**
 * Returns normalized category probabilities for tests, diagnostics, and UI.
 * Exhausted categories always have probability zero.
 */
export function getCategoryProbabilities(
  model: ModelId,
  inventory: ArrayLike<number> = INITIAL_INVENTORY,
): Float64Array {
  validateInventory(inventory);
  const probabilities = new Float64Array(CATEGORY_COUNT);
  let totalWeight = 0;

  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    const count = inventory[index] ?? 0;
    let weight = 0;
    if (count > 0) {
      switch (model) {
        case "M1":
          weight = CATEGORY_WEIGHT_BPS[index] ?? 0;
          break;
        case "M2":
          weight = count * (CATEGORY_WEIGHT_BPS[index] ?? 0);
          break;
        case "M3":
          weight = count;
          break;
      }
    }
    probabilities[index] = weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return probabilities;
  }
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    probabilities[index] = (probabilities[index] ?? 0) / totalWeight;
  }
  return probabilities;
}

function chooseWeightedCategory(
  model: "M1" | "M2",
  inventory: Uint8Array,
  totalWeight: number,
  rng: Mulberry32,
): number {
  let cursor = rng.nextFloat() * totalWeight;
  let fallback = -1;
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    const count = inventory[index] ?? 0;
    if (count <= 0) {
      continue;
    }
    fallback = index;
    const categoryWeight = CATEGORY_WEIGHT_BPS[index] ?? 0;
    cursor -= model === "M1" ? categoryWeight : count * categoryWeight;
    if (cursor < 0) {
      return index;
    }
  }
  // Floating-point rounding can only reach this branch at the final boundary.
  return fallback;
}

function generateWeightedOrder(
  model: "M1" | "M2",
  rng: Mulberry32,
): Uint8Array {
  const inventory = createInitialInventory();
  const order = new Uint8Array(MAP_SIZE);
  // M1 loses a category's weight only when its last copy leaves. M2 loses one
  // category weight per physical copy. Updating this running denominator avoids
  // a second full 22-category scan on every draw.
  let totalWeight =
    model === "M1"
      ? CATEGORY_WEIGHT_BPS.reduce((sum, value) => sum + value, 0)
      : CATEGORY_WEIGHT_BPS.reduce(
          (sum, value, index) =>
            sum + value * (inventory[index] ?? 0),
          0,
        );
  for (let depth = 0; depth < MAP_SIZE; depth += 1) {
    const categoryIndex = chooseWeightedCategory(
      model,
      inventory,
      totalWeight,
      rng,
    );
    order[depth] = categoryIndex;
    inventory[categoryIndex] = (inventory[categoryIndex] ?? 0) - 1;
    const categoryWeight = CATEGORY_WEIGHT_BPS[categoryIndex] ?? 0;
    if (model === "M2" || inventory[categoryIndex] === 0) {
      totalWeight -= categoryWeight;
    }
  }
  return order;
}

function generateUniformOrder(rng: Mulberry32): Uint8Array {
  const order = new Uint8Array(MAP_SIZE);
  let cursor = 0;
  for (let categoryIndex = 0; categoryIndex < CATEGORY_COUNT; categoryIndex += 1) {
    const count = INITIAL_INVENTORY[categoryIndex] ?? 0;
    for (let item = 0; item < count; item += 1) {
      order[cursor] = categoryIndex;
      cursor += 1;
    }
  }
  for (let index = MAP_SIZE - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const value = order[index] ?? 0;
    order[index] = order[swapIndex] ?? 0;
    order[swapIndex] = value;
  }
  return order;
}

export function generateMapOrderFromSeed(
  model: ModelId,
  mapSeed: number,
): Uint8Array {
  const rng = new Mulberry32(mapSeed);
  switch (model) {
    case "M1":
    case "M2":
      return generateWeightedOrder(model, rng);
    case "M3":
      return generateUniformOrder(rng);
  }
}

export function generateMapOrder(coordinates: MapCoordinates): Uint8Array {
  return generateMapOrderFromSeed(
    coordinates.model,
    deriveMapSeed(
      coordinates.masterSeed,
      coordinates.episodeIndex,
      coordinates.mapIndex,
      coordinates.model,
    ),
  );
}

/** Fast path for a runner that hashes masterSeed only once. */
export function generateMapOrderFromHash(
  masterSeedHash: number,
  episodeIndex: number,
  mapIndex: number,
  model: ModelId,
): Uint8Array {
  return generateMapOrderFromSeed(
    model,
    deriveMapSeedFromHash(masterSeedHash, episodeIndex, mapIndex, model),
  );
}

export function createMapGenerator(
  masterSeed: Seed,
  model: ModelId,
): (episodeIndex: number, mapIndex: number) => Uint8Array {
  const masterSeedHash = normalizeSeed(masterSeed);
  return (episodeIndex, mapIndex) =>
    generateMapOrderFromHash(masterSeedHash, episodeIndex, mapIndex, model);
}

export function validateMapOrder(order: Uint8Array): boolean {
  if (order.length !== MAP_SIZE) {
    return false;
  }
  const inventory = new Uint8Array(CATEGORY_COUNT);
  for (const categoryIndex of order) {
    if (categoryIndex >= CATEGORY_COUNT) {
      return false;
    }
    inventory[categoryIndex] = (inventory[categoryIndex] ?? 0) + 1;
  }
  if (sumInventory(inventory) !== MAP_SIZE) {
    return false;
  }
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    if (inventory[index] !== INITIAL_INVENTORY[index]) {
      return false;
    }
  }
  return true;
}
