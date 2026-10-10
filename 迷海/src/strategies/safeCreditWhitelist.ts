import type { StrategyState } from "../domain/state";
import type { Strategy } from "./types";

/**
 * A compact 150-operation safety whitelist.
 *
 * Every discarded prefix earns enough fragment credit to compensate for the
 * worst possible partial-map suffix at operation 150:
 * - depth 1: the 30-fragment award;
 * - depth 2: both 15 and 30;
 * - any later depth: all three fragment awards.
 */
export const safeCreditWhitelistStrategy: Strategy = Object.freeze({
  id: "safe_credit_whitelist",
  name: "150保底安全白名单",
  description:
    "第1格取得30，或前2格取得15和30时可提前重置；其他情况只在三种碎片全部取得后重置。",
  kind: "threshold",
  definition: Object.freeze({
    type: "safe_credit_whitelist",
    thresholds: Object.freeze([0, 0, 0, 0, 1, 0, 2, 25]),
    guaranteedCostLimit: 150,
    guaranteedTargetFragments: 600,
  }),
  decide: (state: StrategyState) => {
    if (state.depth === 1 && (state.fragmentMask & 4) !== 0) {
      return "reset";
    }
    if (state.depth <= 2 && (state.fragmentMask & 6) === 6) {
      return "reset";
    }
    return state.fragmentMask === 7 ? "reset" : "open";
  },
});
