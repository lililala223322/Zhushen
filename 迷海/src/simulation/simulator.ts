import type { ModelId } from "../domain/models";
import {
  CATEGORY_COUNT,
  createInitialInventory,
  fragmentMaskBit,
  FULL_MAP_YIELD,
  getFragmentValue,
  MAP_SIZE,
  PRIZE_CATEGORIES,
  type FragmentMask,
  type PrizeId,
} from "../domain/prizePool";
import type {
  EpisodeFailureReason,
  EpisodeResult,
  FragmentAwardCounts,
  StrategyState,
} from "../domain/state";
import {
  applyFeasibilityGuard,
  canStillComplete,
} from "../strategies/feasibilityGuard";
import type { Strategy } from "../strategies/types";
import { generateMapOrderFromHash } from "./mapGenerator";
import { normalizeSeed, type Seed } from "./rng";

export const DEFAULT_TARGET_FRAGMENTS = 600;
export const DEFAULT_MAX_RESETS = 13;

export type MapOrderProvider = (
  episodeIndex: number,
  mapIndex: number,
  model: ModelId,
) => Uint8Array;

export interface EpisodeConfig {
  readonly masterSeed: Seed;
  readonly episodeIndex: number;
  readonly model: ModelId;
  readonly strategy: Strategy;
  readonly targetFragments?: number;
  readonly maxResets?: number;
  /**
   * Test/advanced hook. A provider must return the complete fixed 25-item order
   * for the requested episode/map/model, independent of strategy.
   */
  readonly mapOrderProvider?: MapOrderProvider;
}

export type EpisodeSeriesConfig = Omit<EpisodeConfig, "episodeIndex">;

interface NormalizedEpisodeConfig {
  readonly masterSeedHash: number;
  readonly episodeIndex: number;
  readonly model: ModelId;
  readonly strategy: Strategy;
  readonly targetFragments: number;
  readonly maxResets: number;
  readonly mapOrderProvider?: MapOrderProvider;
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function normalizeEpisodeConfig(config: EpisodeConfig): NormalizedEpisodeConfig {
  const targetFragments =
    config.targetFragments ?? DEFAULT_TARGET_FRAGMENTS;
  const maxResets = config.maxResets ?? DEFAULT_MAX_RESETS;
  validateNonNegativeInteger(config.episodeIndex, "episodeIndex");
  validateNonNegativeInteger(targetFragments, "targetFragments");
  validateNonNegativeInteger(maxResets, "maxResets");
  if (targetFragments <= 0) {
    throw new RangeError("targetFragments must be positive.");
  }
  return {
    masterSeedHash: normalizeSeed(config.masterSeed),
    episodeIndex: config.episodeIndex,
    model: config.model,
    strategy: config.strategy,
    targetFragments,
    maxResets,
    mapOrderProvider: config.mapOrderProvider,
  };
}

function buildResult(
  config: NormalizedEpisodeConfig,
  success: boolean,
  cost: number,
  resetsUsed: number,
  mapsUsed: number,
  finalFragments: number,
  fragmentAwards: FragmentAwardCounts,
  guardBlockedResets: number,
  lastMapDepth: number,
  failureReason?: EpisodeFailureReason,
): EpisodeResult {
  return {
    episodeIndex: config.episodeIndex,
    model: config.model,
    strategyId: config.strategy.id,
    success,
    cost,
    resetsUsed,
    mapsUsed,
    finalFragments,
    overflow: Math.max(0, finalFragments - config.targetFragments),
    fragmentAwards: Object.freeze({ ...fragmentAwards }),
    guardBlockedResets,
    lastMapDepth,
    ...(failureReason === undefined ? {} : { failureReason }),
  };
}

function getMapOrder(
  config: NormalizedEpisodeConfig,
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
  if (order.length !== MAP_SIZE) {
    throw new RangeError(`Map providers must return exactly ${MAP_SIZE} items.`);
  }
  return order;
}

function simulateNormalizedEpisode(
  config: NormalizedEpisodeConfig,
): EpisodeResult {
  const fragmentAwards: { 5: number; 15: number; 30: number } = {
    5: 0,
    15: 0,
    30: 0,
  };

  if ((config.maxResets + 1) * FULL_MAP_YIELD < config.targetFragments) {
    return buildResult(
      config,
      false,
      0,
      0,
      0,
      0,
      fragmentAwards,
      0,
      0,
      "target_unreachable_from_initial_configuration",
    );
  }

  let totalFragments = 0;
  let operations = 0;
  let resetsUsed = 0;
  let mapsUsed = 0;
  let guardBlockedResets = 0;
  let lastMapDepth = 0;
  let mapIndex = 0;

  for (;;) {
    const order = getMapOrder(config, mapIndex);
    const remainingInventory = createInitialInventory();
    mapsUsed += 1;
    let fragmentMask: FragmentMask = 0;

    for (let orderIndex = 0; orderIndex < MAP_SIZE; orderIndex += 1) {
      const categoryIndex = order[orderIndex];
      if (
        categoryIndex === undefined ||
        categoryIndex < 0 ||
        categoryIndex >= CATEGORY_COUNT ||
        (remainingInventory[categoryIndex] ?? 0) <= 0
      ) {
        return buildResult(
          config,
          false,
          operations,
          resetsUsed,
          mapsUsed,
          totalFragments,
          fragmentAwards,
          guardBlockedResets,
          lastMapDepth,
          "safety_invariant_violated",
        );
      }

      remainingInventory[categoryIndex] =
        (remainingInventory[categoryIndex] ?? 0) - 1;
      operations += 1;
      const depth = orderIndex + 1;
      lastMapDepth = depth;
      totalFragments += 2;

      const fragmentValue = getFragmentValue(categoryIndex);
      if (fragmentValue !== 0) {
        totalFragments += fragmentValue;
        fragmentAwards[fragmentValue] += 1;
        fragmentMask = (fragmentMask |
          fragmentMaskBit(fragmentValue)) as FragmentMask;
      }

      if (totalFragments >= config.targetFragments) {
        return buildResult(
          config,
          true,
          operations,
          resetsUsed,
          mapsUsed,
          totalFragments,
          fragmentAwards,
          guardBlockedResets,
          depth,
        );
      }

      const category = PRIZE_CATEGORIES[categoryIndex];
      if (category === undefined) {
        return buildResult(
          config,
          false,
          operations,
          resetsUsed,
          mapsUsed,
          totalFragments,
          fragmentAwards,
          guardBlockedResets,
          depth,
          "safety_invariant_violated",
        );
      }

      const state: StrategyState = {
        model: config.model,
        targetFragments: config.targetFragments,
        maxResets: config.maxResets,
        totalFragments,
        operations,
        resetsRemaining: config.maxResets - resetsUsed,
        resetsUsed,
        mapsUsed,
        mapIndex,
        depth,
        fragmentMask,
        remainingInventory,
        lastPrizeIndex: categoryIndex,
        lastPrizeId: category.id as PrizeId,
        lastFragmentAward: fragmentValue,
      };

      if (!canStillComplete(state)) {
        return buildResult(
          config,
          false,
          operations,
          resetsUsed,
          mapsUsed,
          totalFragments,
          fragmentAwards,
          guardBlockedResets,
          depth,
          "safety_invariant_violated",
        );
      }

      const requested = config.strategy.decide(state);
      const guarded = applyFeasibilityGuard(requested, state);
      if (guarded.blocked) {
        guardBlockedResets += 1;
      }

      const mapIsExhausted = depth === MAP_SIZE;
      if (guarded.allowed === "reset" || mapIsExhausted) {
        if (state.resetsRemaining <= 0) {
          return buildResult(
            config,
            false,
            operations,
            resetsUsed,
            mapsUsed,
            totalFragments,
            fragmentAwards,
            guardBlockedResets,
            depth,
            "map_exhausted_without_reset",
          );
        }
        if (
          totalFragments + state.resetsRemaining * FULL_MAP_YIELD <
          config.targetFragments
        ) {
          if (mapIsExhausted) {
            return buildResult(
              config,
              false,
              operations,
              resetsUsed,
              mapsUsed,
              totalFragments,
              fragmentAwards,
              guardBlockedResets,
              depth,
              "safety_invariant_violated",
            );
          }
          continue;
        }
        resetsUsed += 1;
        mapIndex += 1;
        break;
      }
    }
  }
}

export function simulateEpisode(configInput: EpisodeConfig): EpisodeResult {
  return simulateNormalizedEpisode(normalizeEpisodeConfig(configInput));
}

/**
 * Pre-hashes the master seed and validates invariant options once. This is the
 * preferred high-throughput API for running many episode indices.
 */
export function createEpisodeSimulator(
  configInput: EpisodeSeriesConfig,
): (episodeIndex: number) => EpisodeResult {
  const normalizedBase = normalizeEpisodeConfig({
    ...configInput,
    episodeIndex: 0,
  });
  return (episodeIndex: number) => {
    validateNonNegativeInteger(episodeIndex, "episodeIndex");
    return simulateNormalizedEpisode({
      ...normalizedBase,
      episodeIndex,
    });
  };
}
