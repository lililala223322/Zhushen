import {
  FIXED_FRAGMENTS_PER_OPEN,
  FULL_MAP_YIELD,
  MAP_SIZE,
  remainingFragmentBonus,
} from "../domain/prizePool";
import type { StrategyState } from "../domain/state";

export function currentMapRemainingYield(state: StrategyState): number {
  return (
    (MAP_SIZE - state.depth) * FIXED_FRAGMENTS_PER_OPEN +
    remainingFragmentBonus(state.remainingInventory)
  );
}

/** Exact capacity if the player never discards another reward. */
export function maximumReachableFragments(state: StrategyState): number {
  return (
    state.totalFragments +
    currentMapRemainingYield(state) +
    state.resetsRemaining * FULL_MAP_YIELD
  );
}

export function canStillComplete(state: StrategyState): boolean {
  return maximumReachableFragments(state) >= state.targetFragments;
}

/**
 * A reset consumes one reset token but immediately opens a fresh map. Therefore
 * R tokens available before resetting make exactly R fresh full maps reachable.
 */
export function canSafelyReset(state: StrategyState): boolean {
  if (
    state.totalFragments >= state.targetFragments ||
    state.resetsRemaining <= 0
  ) {
    return false;
  }
  return (
    state.totalFragments + state.resetsRemaining * FULL_MAP_YIELD >=
    state.targetFragments
  );
}

export function guaranteedFreshMapYieldAfterOpens(opens: number): number {
  if (!Number.isSafeInteger(opens) || opens < 0 || opens > MAP_SIZE) {
    throw new RangeError(`opens must be an integer in [0, ${MAP_SIZE}].`);
  }
  // There are 22 non-fragment prizes. In the worst ordering, the three bonus
  // fragments appear last in ascending value order: 5, then 15, then 30.
  let bonus = 0;
  if (opens >= 23) bonus += 5;
  if (opens >= 24) bonus += 15;
  if (opens >= 25) bonus += 30;
  return opens * FIXED_FRAGMENTS_PER_OPEN + bonus;
}

export function worstCaseFreshMapOpens(fragmentGap: number): number {
  if (fragmentGap <= 0) {
    return 0;
  }
  const completeMaps = Math.floor((fragmentGap - 1) / FULL_MAP_YIELD);
  const finalMapGap = fragmentGap - completeMaps * FULL_MAP_YIELD;
  let finalMapOpens = MAP_SIZE;
  for (let opens = 1; opens <= MAP_SIZE; opens += 1) {
    if (guaranteedFreshMapYieldAfterOpens(opens) >= finalMapGap) {
      finalMapOpens = opens;
      break;
    }
  }
  return completeMaps * MAP_SIZE + finalMapOpens;
}

export function freshMapsNeeded(fragmentGap: number): number {
  if (fragmentGap <= 0) {
    return 0;
  }
  return Math.ceil(fragmentGap / FULL_MAP_YIELD);
}

/**
 * Whether discarding the current remainder still guarantees completion without
 * exceeding a total operation-1 budget, under the worst valid future ordering.
 */
export function canResetWithinCostLimit(
  state: StrategyState,
  hardCostLimit: number,
): boolean {
  if (!canSafelyReset(state)) {
    return false;
  }
  const gap = state.targetFragments - state.totalFragments;
  return (
    freshMapsNeeded(gap) <= state.resetsRemaining &&
    state.operations + worstCaseFreshMapOpens(gap) <= hardCostLimit
  );
}

export interface GuardDecision {
  readonly requested: "open" | "reset";
  readonly allowed: "open" | "reset";
  readonly blocked: boolean;
  readonly reason?: "no_reset_available" | "target_would_become_unreachable";
}

export function applyFeasibilityGuard(
  requested: "open" | "reset",
  state: StrategyState,
): GuardDecision {
  if (requested === "open") {
    return { requested, allowed: "open", blocked: false };
  }
  if (state.resetsRemaining <= 0) {
    return {
      requested,
      allowed: "open",
      blocked: true,
      reason: "no_reset_available",
    };
  }
  if (!canSafelyReset(state)) {
    return {
      requested,
      allowed: "open",
      blocked: true,
      reason: "target_would_become_unreachable",
    };
  }
  return { requested, allowed: "reset", blocked: false };
}

