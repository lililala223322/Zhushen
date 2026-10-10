import { isModelId, type ModelId } from "../domain/models";
import {
  CATEGORY_COUNT,
  createInitialInventory,
  fragmentMaskBit,
  FULL_MAP_YIELD,
  getFragmentValue,
  INITIAL_INVENTORY,
  MAP_SIZE,
  type FragmentMask,
} from "../domain/prizePool";
import { generateMapOrderFromHash } from "../simulation/mapGenerator";
import { normalizeSeed, type Seed } from "../simulation/rng";
import { guaranteedFreshMapYieldAfterOpens } from "../strategies/feasibilityGuard";
import {
  INITIAL_THRESHOLDS,
  OPTIMIZED_RESET_BANDS_V1,
  OPTIMIZED_THRESHOLDS_V1,
  type ThresholdVector,
} from "../strategies/thresholdPolicy";

/** The fixed-length exam deliberately has no fragment target. */
export const FIXED_HORIZON_OPERATIONS = 180;
export const FIXED_HORIZON_CHECKPOINT_START = 80;
export const FIXED_HORIZON_MAX_RESETS = 13;

export const FIXED_HORIZON_CHECKPOINTS: readonly number[] = Object.freeze(
  Array.from(
    {
      length:
        FIXED_HORIZON_OPERATIONS - FIXED_HORIZON_CHECKPOINT_START + 1,
    },
    (_, index) => FIXED_HORIZON_CHECKPOINT_START + index,
  ),
);

export const FIXED_HORIZON_FRAGMENT_BASELINE_IDS = Object.freeze([
  "reset_on_5",
  "reset_on_15",
  "reset_on_30",
  "reset_on_5_and_15",
  "reset_on_5_and_30",
  "reset_on_15_and_30",
  "reset_on_all_fragments",
  "reset_on_5_or_15",
  "reset_on_5_or_30",
  "reset_on_15_or_30",
  "reset_on_any_fragment",
] as const);

export type FixedHorizonFragmentBaselineId =
  (typeof FIXED_HORIZON_FRAGMENT_BASELINE_IDS)[number];

export type FixedHorizonStrategyId =
  | "full_clear"
  | "safe_credit_whitelist"
  | FixedHorizonFragmentBaselineId
  | "optimized_threshold_v1"
  | "optimized_conservative_150"
  | "aggressive_threshold"
  | "conservative_150";

export type FixedHorizonCoreStrategyId =
  | "full_clear"
  | "safe_credit_whitelist"
  | FixedHorizonFragmentBaselineId
  | "optimized_threshold_v1"
  | "aggressive_threshold";

/**
 * S02's 150-cost wrapper and S16's 150-cost wrapper have no meaning once the
 * 600-fragment target is removed. The exam therefore evaluates their
 * underlying cores. This mapping is public so reports cannot silently present
 * the aliases as four independent policies.
 */
export const FIXED_HORIZON_NUMBERED_STRATEGY_CORES = Object.freeze({
  S01: Object.freeze({
    strategyId: "optimized_threshold_v1",
    coreStrategyId: "optimized_threshold_v1",
  }),
  S02: Object.freeze({
    strategyId: "optimized_conservative_150",
    coreStrategyId: "optimized_threshold_v1",
  }),
  S05: Object.freeze({
    strategyId: "aggressive_threshold",
    coreStrategyId: "aggressive_threshold",
  }),
  S16: Object.freeze({
    strategyId: "conservative_150",
    coreStrategyId: "aggressive_threshold",
  }),
} as const);

export const FIXED_HORIZON_CORE_BY_STRATEGY_ID: Readonly<
  Record<FixedHorizonStrategyId, FixedHorizonCoreStrategyId>
> = Object.freeze({
  full_clear: "full_clear",
  safe_credit_whitelist: "safe_credit_whitelist",
  reset_on_5: "reset_on_5",
  reset_on_15: "reset_on_15",
  reset_on_30: "reset_on_30",
  reset_on_5_and_15: "reset_on_5_and_15",
  reset_on_5_and_30: "reset_on_5_and_30",
  reset_on_15_and_30: "reset_on_15_and_30",
  reset_on_all_fragments: "reset_on_all_fragments",
  reset_on_5_or_15: "reset_on_5_or_15",
  reset_on_5_or_30: "reset_on_5_or_30",
  reset_on_15_or_30: "reset_on_15_or_30",
  reset_on_any_fragment: "reset_on_any_fragment",
  optimized_threshold_v1: "optimized_threshold_v1",
  optimized_conservative_150: "optimized_threshold_v1",
  aggressive_threshold: "aggressive_threshold",
  conservative_150: "aggressive_threshold",
});

export interface FixedHorizonFragmentAwardCounts {
  readonly 5: number;
  readonly 15: number;
  readonly 30: number;
}

export interface FixedHorizonCheckpoint {
  readonly operations: number;
  readonly totalFragments: number;
  readonly baseFragments: number;
  readonly bonusFragments: number;
  readonly fragmentsPerOperation: number;
  readonly resetsUsed: number;
  readonly resetsRemaining: number;
  readonly strategicResetsUsed: number;
  readonly mapExhaustionResetsUsed: number;
  readonly resetRequests: number;
  readonly guardBlockedResets: number;
  readonly mapsUsed: number;
  readonly mapIndex: number;
  /** Depth after operation N's reward, before the post-N reset decision. */
  readonly currentMapDepth: number;
  readonly fragmentAwards: FixedHorizonFragmentAwardCounts;
}

export interface FixedHorizonEpisodeResult {
  readonly episodeIndex: number;
  readonly model: ModelId;
  /** The requested strategy, retained even when it is an exam alias. */
  readonly strategyId: FixedHorizonStrategyId;
  /** The policy that actually made decisions in this target-free exam. */
  readonly coreStrategyId: FixedHorizonCoreStrategyId;
  readonly horizon: typeof FIXED_HORIZON_OPERATIONS;
  readonly maxResets: typeof FIXED_HORIZON_MAX_RESETS;
  readonly checkpoints: readonly FixedHorizonCheckpoint[];
  readonly final: FixedHorizonCheckpoint;
  /**
   * Diagnostic for the optional one-way emergency fallback. A fallback only
   * suppresses strategic resets; map-exhaustion transitions still happen.
   */
  readonly emergencyFullClear: {
    readonly configured: boolean;
    readonly activated: boolean;
    readonly operation: number | null;
    readonly resetsUsed: number | null;
    readonly capacitySlack: number | null;
    readonly reason:
      | "reset_warning"
      | "capacity_warning"
      | "fragment_guarantee"
      | "both"
      | null;
  };
}

export type FixedHorizonMapOrderProvider = (
  episodeIndex: number,
  mapIndex: number,
  model: ModelId,
) => Uint8Array;

/**
 * Permanently retire the core strategy to full-clear mode once either warning
 * is reached. `afterResetsUsed: 11`, for example, means that only two reset
 * tokens remain. Capacity slack counts how many operation slots may still be
 * discarded while preserving the ability to reach operation 180.
 */
export interface FixedHorizonEmergencyFullClear {
  readonly afterResetsUsed?: number;
  readonly capacitySlackAtMost?: number;
  /**
   * Every strategic reset must leave a worst-case full-clear path to this
   * checkpoint score. The first unsafe request permanently activates fallback.
   */
  readonly minimumFragmentsAt?: {
    readonly operations: number;
    readonly fragments: number;
    /**
     * `retire` is the one-way emergency requested by the player. `block`
     * reproduces S02-style flexibility by reconsidering later requests.
     */
    readonly onUnsafe?: "retire" | "block";
  };
}

export interface FixedHorizonEpisodeConfig {
  readonly masterSeed: Seed;
  readonly episodeIndex: number;
  readonly model: ModelId;
  readonly strategyId: FixedHorizonStrategyId;
  readonly emergencyFullClear?: FixedHorizonEmergencyFullClear;
  /**
   * Test/advanced hook. The provider must return one complete valid 25-item
   * fixed prize pool for the requested episode, map, and model.
   */
  readonly mapOrderProvider?: FixedHorizonMapOrderProvider;
}

export type FixedHorizonSeriesConfig = Omit<
  FixedHorizonEpisodeConfig,
  "episodeIndex"
>;

export interface FixedHorizonDecisionState {
  readonly depth: number;
  readonly fragmentMask: FragmentMask;
  readonly resetsRemaining: number;
}

interface FragmentBaselineRule {
  readonly requiredMask: number;
  readonly mode: "all" | "any";
}

const FRAGMENT_BASELINE_RULES: Readonly<
  Record<FixedHorizonFragmentBaselineId, FragmentBaselineRule>
> = Object.freeze({
  reset_on_5: Object.freeze({ requiredMask: 1, mode: "all" }),
  reset_on_15: Object.freeze({ requiredMask: 2, mode: "all" }),
  reset_on_30: Object.freeze({ requiredMask: 4, mode: "all" }),
  reset_on_5_and_15: Object.freeze({ requiredMask: 3, mode: "all" }),
  reset_on_5_and_30: Object.freeze({ requiredMask: 5, mode: "all" }),
  reset_on_15_and_30: Object.freeze({ requiredMask: 6, mode: "all" }),
  reset_on_all_fragments: Object.freeze({ requiredMask: 7, mode: "all" }),
  reset_on_5_or_15: Object.freeze({ requiredMask: 3, mode: "any" }),
  reset_on_5_or_30: Object.freeze({ requiredMask: 5, mode: "any" }),
  reset_on_15_or_30: Object.freeze({ requiredMask: 6, mode: "any" }),
  reset_on_any_fragment: Object.freeze({ requiredMask: 7, mode: "any" }),
});

function isFixedHorizonFragmentBaselineId(
  value: FixedHorizonCoreStrategyId,
): value is FixedHorizonFragmentBaselineId {
  return Object.hasOwn(FRAGMENT_BASELINE_RULES, value);
}

function isFixedHorizonStrategyId(
  value: unknown,
): value is FixedHorizonStrategyId {
  return (
    typeof value === "string" &&
    Object.hasOwn(FIXED_HORIZON_CORE_BY_STRATEGY_ID, value)
  );
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function validateDecisionState(state: FixedHorizonDecisionState): void {
  if (
    !Number.isSafeInteger(state.depth) ||
    state.depth < 1 ||
    state.depth > MAP_SIZE
  ) {
    throw new RangeError(`depth must be an integer in [1, ${MAP_SIZE}].`);
  }
  if (
    !Number.isSafeInteger(state.fragmentMask) ||
    state.fragmentMask < 0 ||
    state.fragmentMask > 7
  ) {
    throw new RangeError("fragmentMask must be an integer in [0, 7].");
  }
  if (
    !Number.isSafeInteger(state.resetsRemaining) ||
    state.resetsRemaining < 0 ||
    state.resetsRemaining > FIXED_HORIZON_MAX_RESETS
  ) {
    throw new RangeError(
      `resetsRemaining must be an integer in [0, ${FIXED_HORIZON_MAX_RESETS}].`,
    );
  }
}

function thresholdsForResetsRemaining(
  resetsRemaining: number,
): ThresholdVector {
  const band = OPTIMIZED_RESET_BANDS_V1.find(
    (candidate) =>
      resetsRemaining >= candidate.min && resetsRemaining <= candidate.max,
  );
  return (band?.thresholds ?? OPTIMIZED_THRESHOLDS_V1) as ThresholdVector;
}

/**
 * Makes the target-free policy decision. In particular, S01 uses only its
 * reset-count bands: the original 1..100 deficit band is intentionally absent.
 */
export function decideFixedHorizonCore(
  strategyId: FixedHorizonStrategyId,
  state: FixedHorizonDecisionState,
): "open" | "reset" {
  if (!isFixedHorizonStrategyId(strategyId)) {
    throw new RangeError(`Unsupported fixed-horizon strategy: ${String(strategyId)}`);
  }
  validateDecisionState(state);
  const coreStrategyId = FIXED_HORIZON_CORE_BY_STRATEGY_ID[strategyId];

  if (coreStrategyId === "full_clear") {
    return "open";
  }

  if (coreStrategyId === "safe_credit_whitelist") {
    if (state.depth === 1 && (state.fragmentMask & 4) !== 0) {
      return "reset";
    }
    if (state.depth <= 2 && (state.fragmentMask & 6) === 6) {
      return "reset";
    }
    return state.fragmentMask === 7 ? "reset" : "open";
  }

  if (isFixedHorizonFragmentBaselineId(coreStrategyId)) {
    const rule = FRAGMENT_BASELINE_RULES[coreStrategyId];
    const matches =
      rule.mode === "all"
        ? (state.fragmentMask & rule.requiredMask) === rule.requiredMask
        : (state.fragmentMask & rule.requiredMask) !== 0;
    return matches ? "reset" : "open";
  }

  const thresholds =
    coreStrategyId === "optimized_threshold_v1"
      ? thresholdsForResetsRemaining(state.resetsRemaining)
      : INITIAL_THRESHOLDS;
  const threshold = thresholds[state.fragmentMask] ?? 0;
  return threshold > 0 && state.depth <= threshold ? "reset" : "open";
}

/**
 * A requested reset is safe exactly when all remaining reset-created maps can
 * still supply enough operation-1 slots to reach operation 180.
 *
 * R is measured before consuming the requested reset, so a successful reset
 * creates one of the R available fresh maps.
 */
export function canResetWithinFixedHorizon(
  operations: number,
  resetsRemaining: number,
): boolean {
  validateNonNegativeInteger(operations, "operations");
  validateNonNegativeInteger(resetsRemaining, "resetsRemaining");
  return (
    resetsRemaining > 0 &&
    operations + MAP_SIZE * resetsRemaining >= FIXED_HORIZON_OPERATIONS
  );
}

interface MutableCounters {
  totalFragments: number;
  operations: number;
  resetsUsed: number;
  strategicResetsUsed: number;
  mapExhaustionResetsUsed: number;
  resetRequests: number;
  guardBlockedResets: number;
  mapsUsed: number;
  mapIndex: number;
  currentMapDepth: number;
  fragmentAwards: { 5: number; 15: number; 30: number };
}

function buildCheckpoint(counters: MutableCounters): FixedHorizonCheckpoint {
  const baseFragments = counters.operations * 2;
  const bonusFragments = counters.totalFragments - baseFragments;
  return Object.freeze({
    operations: counters.operations,
    totalFragments: counters.totalFragments,
    baseFragments,
    bonusFragments,
    fragmentsPerOperation:
      counters.operations === 0
        ? 0
        : counters.totalFragments / counters.operations,
    resetsUsed: counters.resetsUsed,
    resetsRemaining: FIXED_HORIZON_MAX_RESETS - counters.resetsUsed,
    strategicResetsUsed: counters.strategicResetsUsed,
    mapExhaustionResetsUsed: counters.mapExhaustionResetsUsed,
    resetRequests: counters.resetRequests,
    guardBlockedResets: counters.guardBlockedResets,
    mapsUsed: counters.mapsUsed,
    mapIndex: counters.mapIndex,
    currentMapDepth: counters.currentMapDepth,
    fragmentAwards: Object.freeze({ ...counters.fragmentAwards }),
  });
}

function validateMapOrder(order: Uint8Array, mapIndex: number): void {
  if (order.length !== MAP_SIZE) {
    throw new RangeError(
      `Map ${mapIndex} must contain exactly ${MAP_SIZE} items.`,
    );
  }
  const observed = new Uint8Array(CATEGORY_COUNT);
  for (const categoryIndex of order) {
    if (categoryIndex >= CATEGORY_COUNT) {
      throw new RangeError(
        `Map ${mapIndex} contains invalid category index ${categoryIndex}.`,
      );
    }
    observed[categoryIndex] = (observed[categoryIndex] ?? 0) + 1;
  }
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    if (observed[index] !== INITIAL_INVENTORY[index]) {
      throw new RangeError(
        `Map ${mapIndex} does not match the fixed prize-pool inventory.`,
      );
    }
  }
}

interface NormalizedFixedHorizonConfig {
  readonly masterSeedHash: number;
  readonly episodeIndex: number;
  readonly model: ModelId;
  readonly strategyId: FixedHorizonStrategyId;
  readonly coreStrategyId: FixedHorizonCoreStrategyId;
  readonly emergencyFullClear?: Readonly<FixedHorizonEmergencyFullClear>;
  readonly mapOrderProvider?: FixedHorizonMapOrderProvider;
}

function normalizeEmergencyFullClear(
  input: FixedHorizonEmergencyFullClear | undefined,
): Readonly<FixedHorizonEmergencyFullClear> | undefined {
  if (input === undefined) return undefined;
  if (
    input.afterResetsUsed === undefined &&
    input.capacitySlackAtMost === undefined &&
    input.minimumFragmentsAt === undefined
  ) {
    throw new RangeError(
      "emergencyFullClear must define at least one warning threshold.",
    );
  }
  if (input.afterResetsUsed !== undefined) {
    validateNonNegativeInteger(
      input.afterResetsUsed,
      "emergencyFullClear.afterResetsUsed",
    );
    if (input.afterResetsUsed > FIXED_HORIZON_MAX_RESETS) {
      throw new RangeError(
        `emergencyFullClear.afterResetsUsed must be in [0, ${FIXED_HORIZON_MAX_RESETS}].`,
      );
    }
  }
  if (input.capacitySlackAtMost !== undefined) {
    validateNonNegativeInteger(
      input.capacitySlackAtMost,
      "emergencyFullClear.capacitySlackAtMost",
    );
  }
  if (input.minimumFragmentsAt !== undefined) {
    validateNonNegativeInteger(
      input.minimumFragmentsAt.operations,
      "emergencyFullClear.minimumFragmentsAt.operations",
    );
    validateNonNegativeInteger(
      input.minimumFragmentsAt.fragments,
      "emergencyFullClear.minimumFragmentsAt.fragments",
    );
    if (
      input.minimumFragmentsAt.operations <= 0 ||
      input.minimumFragmentsAt.operations > FIXED_HORIZON_OPERATIONS
    ) {
      throw new RangeError(
        `emergencyFullClear.minimumFragmentsAt.operations must be in [1, ${FIXED_HORIZON_OPERATIONS}].`,
      );
    }
    const fullMaps = Math.floor(
      input.minimumFragmentsAt.operations / MAP_SIZE,
    );
    const partialOpens =
      input.minimumFragmentsAt.operations % MAP_SIZE;
    const initialWorstCaseYield =
      fullMaps * FULL_MAP_YIELD +
      guaranteedFreshMapYieldAfterOpens(partialOpens);
    if (input.minimumFragmentsAt.fragments > initialWorstCaseYield) {
      throw new RangeError(
        "emergencyFullClear.minimumFragmentsAt exceeds the initial worst-case full-clear yield.",
      );
    }
    if (
      input.minimumFragmentsAt.onUnsafe !== undefined &&
      input.minimumFragmentsAt.onUnsafe !== "retire" &&
      input.minimumFragmentsAt.onUnsafe !== "block"
    ) {
      throw new RangeError(
        'emergencyFullClear.minimumFragmentsAt.onUnsafe must be "retire" or "block".',
      );
    }
  }
  return Object.freeze({ ...input });
}

function normalizeConfig(
  config: FixedHorizonEpisodeConfig,
): NormalizedFixedHorizonConfig {
  validateNonNegativeInteger(config.episodeIndex, "episodeIndex");
  if (!isModelId(config.model)) {
    throw new RangeError(`Unknown model: ${String(config.model)}`);
  }
  if (!isFixedHorizonStrategyId(config.strategyId)) {
    throw new RangeError(
      `Unsupported fixed-horizon strategy: ${String(config.strategyId)}`,
    );
  }
  return {
    masterSeedHash: normalizeSeed(config.masterSeed),
    episodeIndex: config.episodeIndex,
    model: config.model,
    strategyId: config.strategyId,
    coreStrategyId:
      FIXED_HORIZON_CORE_BY_STRATEGY_ID[config.strategyId],
    emergencyFullClear: normalizeEmergencyFullClear(
      config.emergencyFullClear,
    ),
    mapOrderProvider: config.mapOrderProvider,
  };
}

function getMapOrder(
  config: NormalizedFixedHorizonConfig,
  mapIndex: number,
): Uint8Array {
  const order =
    config.mapOrderProvider?.(
      config.episodeIndex,
      mapIndex,
      config.model,
    ) ??
    generateMapOrderFromHash(
      config.masterSeedHash,
      config.episodeIndex,
      mapIndex,
      config.model,
    );
  validateMapOrder(order, mapIndex);
  return order;
}

function simulateNormalized(
  config: NormalizedFixedHorizonConfig,
): FixedHorizonEpisodeResult {
  const counters: MutableCounters = {
    totalFragments: 0,
    operations: 0,
    resetsUsed: 0,
    strategicResetsUsed: 0,
    mapExhaustionResetsUsed: 0,
    resetRequests: 0,
    guardBlockedResets: 0,
    mapsUsed: 1,
    mapIndex: 0,
    currentMapDepth: 0,
    fragmentAwards: { 5: 0, 15: 0, 30: 0 },
  };
  const checkpoints: FixedHorizonCheckpoint[] = [];

  let order = getMapOrder(config, counters.mapIndex);
  let remainingInventory = createInitialInventory();
  let fragmentMask: FragmentMask = 0;
  let emergencyActive = false;
  let emergencyOperation: number | null = null;
  let emergencyResetsUsed: number | null = null;
  let emergencyCapacitySlack: number | null = null;
  let emergencyReason:
    | "reset_warning"
    | "capacity_warning"
    | "fragment_guarantee"
    | "both"
    | null = null;

  while (counters.operations < FIXED_HORIZON_OPERATIONS) {
    const categoryIndex = order[counters.currentMapDepth];
    if (
      categoryIndex === undefined ||
      categoryIndex >= CATEGORY_COUNT ||
      (remainingInventory[categoryIndex] ?? 0) <= 0
    ) {
      throw new Error(
        `Invalid fixed-horizon map state at map ${counters.mapIndex}, depth ${counters.currentMapDepth + 1}.`,
      );
    }

    remainingInventory[categoryIndex] =
      (remainingInventory[categoryIndex] ?? 0) - 1;
    counters.operations += 1;
    counters.currentMapDepth += 1;
    counters.totalFragments += 2;

    const fragmentValue = getFragmentValue(categoryIndex);
    if (fragmentValue !== 0) {
      counters.totalFragments += fragmentValue;
      counters.fragmentAwards[fragmentValue] += 1;
      fragmentMask = (fragmentMask |
        fragmentMaskBit(fragmentValue)) as FragmentMask;
    }

    // R_N and every other checkpoint field describe only actions that affected
    // the first N opens. The reset decision made after open N belongs to the
    // transition toward N + 1, so the snapshot must precede that decision.
    if (counters.operations >= FIXED_HORIZON_CHECKPOINT_START) {
      checkpoints.push(buildCheckpoint(counters));
    }

    // The exam ends immediately after operation 180. A reset after the final
    // answer could not affect the score and is therefore neither requested nor
    // counted.
    if (counters.operations < FIXED_HORIZON_OPERATIONS) {
      const resetsRemaining =
        FIXED_HORIZON_MAX_RESETS - counters.resetsUsed;
      const capacitySlack =
        counters.operations +
        (MAP_SIZE - counters.currentMapDepth) +
        MAP_SIZE * resetsRemaining -
        FIXED_HORIZON_OPERATIONS;
      if (!emergencyActive && config.emergencyFullClear !== undefined) {
        const resetWarning =
          config.emergencyFullClear.afterResetsUsed !== undefined &&
          counters.resetsUsed >=
            config.emergencyFullClear.afterResetsUsed;
        const capacityWarning =
          config.emergencyFullClear.capacitySlackAtMost !== undefined &&
          capacitySlack <=
            config.emergencyFullClear.capacitySlackAtMost;
        if (resetWarning || capacityWarning) {
          emergencyActive = true;
          emergencyOperation = counters.operations;
          emergencyResetsUsed = counters.resetsUsed;
          emergencyCapacitySlack = capacitySlack;
          emergencyReason =
            resetWarning && capacityWarning
              ? "both"
              : resetWarning
                ? "reset_warning"
                : "capacity_warning";
        }
      }
      const coreRequested =
        decideFixedHorizonCore(config.strategyId, {
          depth: counters.currentMapDepth,
          fragmentMask,
          resetsRemaining,
        }) === "reset";
      let scoreGuaranteeBlocked = false;
      if (
        !emergencyActive &&
        coreRequested &&
        config.emergencyFullClear?.minimumFragmentsAt !== undefined
      ) {
        const guarantee =
          config.emergencyFullClear.minimumFragmentsAt;
        if (counters.operations < guarantee.operations) {
          const futureOpens =
            guarantee.operations - counters.operations;
          const fullMaps = Math.floor(futureOpens / MAP_SIZE);
          const partialOpens = futureOpens % MAP_SIZE;
          const worstCaseFutureYield =
            fullMaps * FULL_MAP_YIELD +
            guaranteedFreshMapYieldAfterOpens(partialOpens);
          const hasOperationCapacity =
            counters.operations +
              MAP_SIZE * resetsRemaining >=
            guarantee.operations;
          if (
            !hasOperationCapacity ||
            counters.totalFragments + worstCaseFutureYield <
              guarantee.fragments
          ) {
            if ((guarantee.onUnsafe ?? "retire") === "block") {
              scoreGuaranteeBlocked = true;
              counters.guardBlockedResets += 1;
            } else {
              emergencyActive = true;
              emergencyOperation = counters.operations;
              emergencyResetsUsed = counters.resetsUsed;
              emergencyCapacitySlack = capacitySlack;
              emergencyReason = "fragment_guarantee";
            }
          }
        }
      }
      const requested =
        !emergencyActive && !scoreGuaranteeBlocked && coreRequested;
      let shouldTransition = false;

      if (requested) {
        counters.resetRequests += 1;
        if (
          canResetWithinFixedHorizon(
            counters.operations,
            resetsRemaining,
          )
        ) {
          shouldTransition = true;
          counters.strategicResetsUsed += 1;
        } else {
          counters.guardBlockedResets += 1;
        }
      }

      if (counters.currentMapDepth === MAP_SIZE && !shouldTransition) {
        if (resetsRemaining <= 0) {
          throw new Error(
            "The fixed horizon became unreachable because no reset remains.",
          );
        }
        shouldTransition = true;
        counters.mapExhaustionResetsUsed += 1;
      }

      if (shouldTransition) {
        counters.resetsUsed += 1;
        if (counters.resetsUsed > FIXED_HORIZON_MAX_RESETS) {
          throw new Error("The fixed-horizon reset limit was exceeded.");
        }
        counters.mapIndex += 1;
        counters.mapsUsed += 1;
        counters.currentMapDepth = 0;
        fragmentMask = 0;
        remainingInventory = createInitialInventory();
        order = getMapOrder(config, counters.mapIndex);
      }
    }
  }

  const final = checkpoints.at(-1);
  if (
    final === undefined ||
    checkpoints.length !== FIXED_HORIZON_CHECKPOINTS.length
  ) {
    throw new Error("Fixed-horizon checkpoint invariant was violated.");
  }

  return Object.freeze({
    episodeIndex: config.episodeIndex,
    model: config.model,
    strategyId: config.strategyId,
    coreStrategyId: config.coreStrategyId,
    horizon: FIXED_HORIZON_OPERATIONS,
    maxResets: FIXED_HORIZON_MAX_RESETS,
    checkpoints: Object.freeze(checkpoints),
    final,
    emergencyFullClear: Object.freeze({
      configured: config.emergencyFullClear !== undefined,
      activated: emergencyActive,
      operation: emergencyOperation,
      resetsUsed: emergencyResetsUsed,
      capacitySlack: emergencyCapacitySlack,
      reason: emergencyReason,
    }),
  });
}

export function simulateFixedHorizonEpisode(
  config: FixedHorizonEpisodeConfig,
): FixedHorizonEpisodeResult {
  return simulateNormalized(normalizeConfig(config));
}

/**
 * Pre-hashes and validates invariant options once for high-throughput batches.
 */
export function createFixedHorizonSimulator(
  config: FixedHorizonSeriesConfig,
): (episodeIndex: number) => FixedHorizonEpisodeResult {
  const normalizedBase = normalizeConfig({
    ...config,
    episodeIndex: 0,
  });
  return (episodeIndex: number) => {
    validateNonNegativeInteger(episodeIndex, "episodeIndex");
    return simulateNormalized({
      ...normalizedBase,
      episodeIndex,
    });
  };
}
