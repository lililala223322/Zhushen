import {
  conservative150Strategy,
  optimizedConservative150Strategy,
} from "./conservative";
import {
  FRAGMENT_BASELINE_STRATEGIES,
  resetOn15And30Strategy,
  resetOn15Or30Strategy,
  resetOn15Strategy,
  resetOn30Strategy,
  resetOn5And15Strategy,
  resetOn5And30Strategy,
  resetOn5Or15Strategy,
  resetOn5Or30Strategy,
  resetOn5Strategy,
  resetOnAllFragmentsStrategy,
  resetOnAnyFragmentStrategy,
} from "./fragmentBaselines";
import { gapAwareExpectedGainGreedyStrategy } from "./expectedGain";
import { fullClearStrategy } from "./fullClear";
import { safeCreditWhitelistStrategy } from "./safeCreditWhitelist";
import {
  aggressiveThresholdStrategy,
  optimizedThresholdStrategy,
} from "./thresholdPolicy";
import type { Strategy } from "./types";

export * from "./conservative";
export * from "./feasibilityGuard";
export * from "./fragmentBaselines";
export * from "./expectedGain";
export * from "./fullClear";
export * from "./safeCreditWhitelist";
export * from "./thresholdPolicy";
export * from "./types";

export const STRATEGIES: readonly Strategy[] = Object.freeze([
  fullClearStrategy,
  gapAwareExpectedGainGreedyStrategy,
  ...FRAGMENT_BASELINE_STRATEGIES,
  safeCreditWhitelistStrategy,
  optimizedThresholdStrategy,
  optimizedConservative150Strategy,
  aggressiveThresholdStrategy,
  conservative150Strategy,
]);

export const STRATEGY_BY_ID: ReadonlyMap<string, Strategy> = new Map(
  STRATEGIES.map((strategy) => [strategy.id, strategy]),
);

export function getStrategyById(id: string): Strategy {
  const strategy = STRATEGY_BY_ID.get(id);
  if (strategy === undefined) {
    throw new RangeError(`Unknown strategy id: ${id}`);
  }
  return strategy;
}

// Named re-exports make auto-completion useful for scripts.
export {
  aggressiveThresholdStrategy,
  conservative150Strategy,
  fullClearStrategy,
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  resetOn5Strategy,
  resetOn15Strategy,
  resetOn30Strategy,
  resetOn5And15Strategy,
  resetOn5And30Strategy,
  resetOn15And30Strategy,
  resetOnAllFragmentsStrategy,
  resetOn5Or15Strategy,
  resetOn5Or30Strategy,
  resetOn15Or30Strategy,
  resetOnAnyFragmentStrategy,
  safeCreditWhitelistStrategy,
  gapAwareExpectedGainGreedyStrategy,
};
