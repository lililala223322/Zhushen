import type { ModelId } from "../domain/models";
import {
  CATEGORY_COUNT,
  CATEGORY_WEIGHT_BPS,
  FIXED_FRAGMENTS_PER_OPEN,
  getFragmentValue,
  INITIAL_INVENTORY,
} from "../domain/prizePool";
import type { StrategyState } from "../domain/state";
import type { Strategy } from "./types";

export interface ExpectedGainGreedyOptions {
  /**
   * Compare only fragments that still help reach the target. For example, a
   * 32-fragment outcome is worth only 3 when the remaining gap is 3.
   */
  readonly gapAware?: boolean;
  /**
   * A positive premium conserves resets: a fresh map must beat the current
   * next-open expectation by more than this many useful fragments.
   */
  readonly resetPremium?: number;
  readonly id?: string;
  readonly name?: string;
}

function itemWeight(
  model: ModelId,
  categoryIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  switch (model) {
    case "M1":
      return CATEGORY_WEIGHT_BPS[categoryIndex] ?? 0;
    case "M2":
      return count * (CATEGORY_WEIGHT_BPS[categoryIndex] ?? 0);
    case "M3":
      return count;
  }
}

/**
 * Exact one-step expectation under the selected transition kernel.
 *
 * This is deliberately a local quantity. It does not include the option value
 * of observing the next prize, the scarcity value of a reset, or any reward
 * after the next open.
 */
export function expectedNextUsefulYield(
  model: ModelId,
  inventory: ArrayLike<number>,
  fragmentGap = Number.POSITIVE_INFINITY,
): number {
  if (inventory.length !== CATEGORY_COUNT) {
    throw new RangeError(`Inventory must have ${CATEGORY_COUNT} categories.`);
  }
  if (!(fragmentGap > 0)) return 0;

  let totalWeight = 0;
  let weightedYield = 0;
  for (let categoryIndex = 0; categoryIndex < CATEGORY_COUNT; categoryIndex += 1) {
    const count = inventory[categoryIndex] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Inventory counts must be non-negative integers.");
    }
    const weight = itemWeight(model, categoryIndex, count);
    if (weight <= 0) continue;
    const rawYield =
      FIXED_FRAGMENTS_PER_OPEN + getFragmentValue(categoryIndex);
    totalWeight += weight;
    weightedYield += weight * Math.min(fragmentGap, rawYield);
  }
  return totalWeight === 0 ? 0 : weightedYield / totalWeight;
}

export function createExpectedGainGreedyStrategy(
  options: ExpectedGainGreedyOptions = {},
): Strategy {
  const gapAware = options.gapAware ?? false;
  const resetPremium = options.resetPremium ?? 0;
  if (!Number.isFinite(resetPremium) || resetPremium < 0) {
    throw new RangeError("resetPremium must be a finite non-negative number.");
  }
  const id =
    options.id ??
    `expected_gain_greedy_${gapAware ? "gap" : "raw"}_p${resetPremium}`;
  const name =
    options.name ??
    `一步期望贪心${gapAware ? "（缺口截断）" : ""}`;
  const freshYieldCache = new Map<string, number>();

  const freshYieldFor = (model: ModelId, gap: number): number => {
    const cacheKey = `${model}:${gap}`;
    const cached = freshYieldCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const value = expectedNextUsefulYield(
      model,
      INITIAL_INVENTORY,
      gap,
    );
    freshYieldCache.set(cacheKey, value);
    return value;
  };

  return Object.freeze({
    id,
    name,
    description:
      "若新地图下一抽的期望有效碎片，超过当前地图下一抽期望与重置溢价之和，则请求重置。",
    kind: "expected_gain",
    definition: Object.freeze({
      logic: "one_step_expected_gain",
      gapAware,
      resetPremium,
    }),
    decide(state: StrategyState) {
      if (state.depth >= 25 || state.resetsRemaining <= 0) return "open";
      const gap = gapAware
        ? state.targetFragments - state.totalFragments
        : Number.POSITIVE_INFINITY;
      const currentYield = expectedNextUsefulYield(
        state.model,
        state.remainingInventory,
        gap,
      );
      const freshYield = freshYieldFor(state.model, gap);
      return freshYield > currentYield + resetPremium ? "reset" : "open";
    },
  });
}

export const expectedGainGreedyStrategy =
  createExpectedGainGreedyStrategy();

export const gapAwareExpectedGainGreedyStrategy =
  createExpectedGainGreedyStrategy({
    gapAware: true,
    id: "expected_gain_greedy_gap",
    name: "一步期望贪心（缺口截断）",
  });
