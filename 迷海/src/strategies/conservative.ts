import type { Strategy } from "./types";
import { canResetWithinCostLimit } from "./feasibilityGuard";
import {
  aggressiveThresholdStrategy,
  optimizedThresholdStrategy,
} from "./thresholdPolicy";

export function createConservativeStrategy(
  baseStrategy: Strategy = aggressiveThresholdStrategy,
  hardCostLimit = 150,
  options: { readonly id?: string; readonly name?: string } = {},
): Strategy {
  if (!Number.isSafeInteger(hardCostLimit) || hardCostLimit <= 0) {
    throw new RangeError("hardCostLimit must be a positive integer.");
  }
  return Object.freeze({
    id: options.id ?? `conservative_${hardCostLimit}`,
    name: options.name ?? `保守版（最多${hardCostLimit}次）`,
    description: `沿用“${baseStrategy.name}”的请求，但仅在最坏合法抽取顺序下仍可于${hardCostLimit}次内完成时重置。`,
    kind: "conservative_wrapper",
    definition: Object.freeze({
      type: "conservative_wrapper",
      hardCostLimit,
      baseStrategyId: baseStrategy.id,
      baseStrategyDefinition: baseStrategy.definition,
    }),
    decide: (state) =>
      baseStrategy.decide(state) === "reset" &&
      canResetWithinCostLimit(state, hardCostLimit)
        ? "reset"
        : "open",
  } satisfies Strategy);
}

export const conservative150Strategy = createConservativeStrategy();

export const optimizedConservative150Strategy = createConservativeStrategy(
  optimizedThresholdStrategy,
  150,
  {
    id: "optimized_conservative_150",
    name: "优化策略的保守150版",
  },
);
