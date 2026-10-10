import { describe, expect, it } from "vitest";

import {
  CATEGORY_COUNT,
  getFragmentValue,
  INITIAL_INVENTORY,
} from "../src/domain";
import {
  FIXED_HORIZON_CHECKPOINTS,
  FIXED_HORIZON_CORE_BY_STRATEGY_ID,
  FIXED_HORIZON_FRAGMENT_BASELINE_IDS,
  FIXED_HORIZON_NUMBERED_STRATEGY_CORES,
  canResetWithinFixedHorizon,
  createFixedHorizonSimulator,
  decideFixedHorizonCore,
  simulateFixedHorizonEpisode,
  type FixedHorizonStrategyId,
} from "../src/exam/fixedHorizon";

function fixedOrder(fragmentPosition: "first" | "last"): Uint8Array {
  const values: number[] = [];
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    for (
      let copy = 0;
      copy < (INITIAL_INVENTORY[index] ?? 0);
      copy += 1
    ) {
      values.push(index);
    }
  }
  values.sort((left, right) => {
    const leftIsFragment = getFragmentValue(left) === 0 ? 0 : 1;
    const rightIsFragment = getFragmentValue(right) === 0 ? 0 : 1;
    const direction = fragmentPosition === "first" ? -1 : 1;
    return direction * (leftIsFragment - rightIsFragment) || left - right;
  });
  return Uint8Array.from(values);
}

function checkpoint(
  result: ReturnType<typeof simulateFixedHorizonEpisode>,
  operations: number,
) {
  const value = result.checkpoints[operations - 80];
  expect(value?.operations).toBe(operations);
  if (value === undefined) {
    throw new Error(`Missing checkpoint ${operations}.`);
  }
  return value;
}

describe("fixed-horizon exam constants and guards", () => {
  it("records every integer operation count from 80 through 180", () => {
    expect(FIXED_HORIZON_CHECKPOINTS).toHaveLength(101);
    expect(FIXED_HORIZON_CHECKPOINTS[0]).toBe(80);
    expect(FIXED_HORIZON_CHECKPOINTS.at(-1)).toBe(180);
  });

  it("uses the exact op + 25R >= 180 reset guard", () => {
    expect(canResetWithinFixedHorizon(29, 6)).toBe(false);
    expect(canResetWithinFixedHorizon(30, 6)).toBe(true);
    expect(canResetWithinFixedHorizon(155, 1)).toBe(true);
    expect(canResetWithinFixedHorizon(179, 0)).toBe(false);
  });
});

describe("fixed-horizon policy cores", () => {
  it("makes S02 an S01-core alias and S16 an S05-core alias", () => {
    expect(FIXED_HORIZON_NUMBERED_STRATEGY_CORES).toMatchObject({
      S01: {
        strategyId: "optimized_threshold_v1",
        coreStrategyId: "optimized_threshold_v1",
      },
      S02: {
        strategyId: "optimized_conservative_150",
        coreStrategyId: "optimized_threshold_v1",
      },
      S05: {
        strategyId: "aggressive_threshold",
        coreStrategyId: "aggressive_threshold",
      },
      S16: {
        strategyId: "conservative_150",
        coreStrategyId: "aggressive_threshold",
      },
    });
    expect(
      FIXED_HORIZON_CORE_BY_STRATEGY_ID.optimized_conservative_150,
    ).toBe("optimized_threshold_v1");
    expect(FIXED_HORIZON_CORE_BY_STRATEGY_ID.conservative_150).toBe(
      "aggressive_threshold",
    );
  });

  it("uses V1 reset bands without the original deficit override", () => {
    // At 10..13 resets, V1's mask-5 threshold is 1. Its removed near-target
    // deficit threshold was also 1; depth 2 therefore remains open regardless
    // of any fragment total that the target-free state intentionally lacks.
    expect(
      decideFixedHorizonCore("optimized_threshold_v1", {
        depth: 2,
        fragmentMask: 1,
        resetsRemaining: 13,
      }),
    ).toBe("open");
    expect(
      decideFixedHorizonCore("optimized_threshold_v1", {
        depth: 8,
        fragmentMask: 3,
        resetsRemaining: 8,
      }),
    ).toBe("reset");
    expect(
      decideFixedHorizonCore("optimized_threshold_v1", {
        depth: 9,
        fragmentMask: 3,
        resetsRemaining: 8,
      }),
    ).toBe("open");
  });

  it("keeps S05's fixed vector and fragment AND/OR semantics", () => {
    expect(
      decideFixedHorizonCore("aggressive_threshold", {
        depth: 2,
        fragmentMask: 1,
        resetsRemaining: 13,
      }),
    ).toBe("reset");
    expect(
      decideFixedHorizonCore("aggressive_threshold", {
        depth: 3,
        fragmentMask: 1,
        resetsRemaining: 1,
      }),
    ).toBe("open");
    expect(
      decideFixedHorizonCore("reset_on_5_and_15", {
        depth: 1,
        fragmentMask: 1,
        resetsRemaining: 13,
      }),
    ).toBe("open");
    expect(
      decideFixedHorizonCore("reset_on_5_or_15", {
        depth: 1,
        fragmentMask: 1,
        resetsRemaining: 13,
      }),
    ).toBe("reset");
  });

  it("implements the simple 150-safe credit whitelist exactly", () => {
    expect(
      decideFixedHorizonCore("safe_credit_whitelist", {
        depth: 1,
        fragmentMask: 4,
        resetsRemaining: 13,
      }),
    ).toBe("reset");
    expect(
      decideFixedHorizonCore("safe_credit_whitelist", {
        depth: 2,
        fragmentMask: 6,
        resetsRemaining: 13,
      }),
    ).toBe("reset");
    expect(
      decideFixedHorizonCore("safe_credit_whitelist", {
        depth: 2,
        fragmentMask: 4,
        resetsRemaining: 13,
      }),
    ).toBe("open");
    expect(
      decideFixedHorizonCore("safe_credit_whitelist", {
        depth: 17,
        fragmentMask: 7,
        resetsRemaining: 13,
      }),
    ).toBe("reset");
  });
});

describe("fixed-horizon episode simulation", () => {
  it("gives full-clear exact zero-variance checkpoints on fixed orders", () => {
    const order = fixedOrder("last");
    const result = simulateFixedHorizonEpisode({
      masterSeed: "ignored",
      episodeIndex: 0,
      model: "M1",
      strategyId: "full_clear",
      mapOrderProvider: () => order,
    });

    expect(result.checkpoints).toHaveLength(101);
    expect(checkpoint(result, 80)).toMatchObject({
      totalFragments: 310,
      baseFragments: 160,
      bonusFragments: 150,
      resetsUsed: 3,
      strategicResetsUsed: 0,
      mapExhaustionResetsUsed: 3,
      mapsUsed: 4,
      currentMapDepth: 5,
      fragmentAwards: { 5: 3, 15: 3, 30: 3 },
    });
    expect(checkpoint(result, 100)).toMatchObject({
      totalFragments: 400,
      resetsUsed: 3,
      mapsUsed: 4,
      currentMapDepth: 25,
      fragmentAwards: { 5: 4, 15: 4, 30: 4 },
    });
    expect(
      [100, 125, 150, 175].map((operations) => {
        const value = checkpoint(result, operations);
        return {
          operations,
          fragments: value.totalFragments,
          resets: value.resetsUsed,
        };
      }),
    ).toEqual([
      { operations: 100, fragments: 400, resets: 3 },
      { operations: 125, fragments: 500, resets: 4 },
      { operations: 150, fragments: 600, resets: 5 },
      { operations: 175, fragments: 700, resets: 6 },
    ]);
    expect(result.final).toMatchObject({
      operations: 180,
      totalFragments: 710,
      resetsUsed: 7,
      resetsRemaining: 6,
      mapsUsed: 8,
      currentMapDepth: 5,
      fragmentAwards: { 5: 7, 15: 7, 30: 7 },
    });
    expect(result.final.fragmentsPerOperation).toBeCloseTo(710 / 180, 14);
  });

  it("blocks over-aggressive requests but always completes operation 180", () => {
    const order = fixedOrder("first");
    const result = simulateFixedHorizonEpisode({
      masterSeed: "ignored",
      episodeIndex: 1,
      model: "M1",
      strategyId: "reset_on_5",
      mapOrderProvider: () => order,
    });

    expect(result.final.operations).toBe(180);
    expect(result.final.resetsUsed).toBeLessThanOrEqual(13);
    expect(result.final.guardBlockedResets).toBeGreaterThan(0);
    expect(result.final.resetRequests).toBe(
      result.final.strategicResetsUsed +
        result.final.guardBlockedResets,
    );
    expect(result.final.mapsUsed).toBe(result.final.resetsUsed + 1);
  });

  it("permanently retires strategic resets at the configured reset warning", () => {
    const order = fixedOrder("first");
    const result = simulateFixedHorizonEpisode({
      masterSeed: "ignored",
      episodeIndex: 2,
      model: "M1",
      strategyId: "reset_on_any_fragment",
      emergencyFullClear: { afterResetsUsed: 3 },
      mapOrderProvider: () => order,
    });

    expect(result.emergencyFullClear).toMatchObject({
      configured: true,
      activated: true,
      resetsUsed: 3,
      reason: "reset_warning",
    });
    expect(result.emergencyFullClear.operation).toBeGreaterThan(0);
    expect(result.final.strategicResetsUsed).toBe(3);
    expect(result.final.mapExhaustionResetsUsed).toBeGreaterThan(0);
    expect(result.final.operations).toBe(180);
  });

  it("can use monotone capacity slack as an immediate full-clear warning", () => {
    const order = fixedOrder("first");
    const emergency = simulateFixedHorizonEpisode({
      masterSeed: "ignored",
      episodeIndex: 3,
      model: "M1",
      strategyId: "reset_on_any_fragment",
      emergencyFullClear: { capacitySlackAtMost: 170 },
      mapOrderProvider: () => order,
    });
    const fullClear = simulateFixedHorizonEpisode({
      masterSeed: "ignored",
      episodeIndex: 3,
      model: "M1",
      strategyId: "full_clear",
      mapOrderProvider: () => order,
    });

    expect(emergency.emergencyFullClear).toEqual({
      configured: true,
      activated: true,
      operation: 1,
      resetsUsed: 0,
      capacitySlack: 170,
      reason: "capacity_warning",
    });
    expect(emergency.checkpoints).toEqual(fullClear.checkpoints);
  });

  it("uses a one-way score guarantee to preserve 600 fragments at operation 150", () => {
    for (const fragmentPosition of ["first", "last"] as const) {
      const result = simulateFixedHorizonEpisode({
        masterSeed: "ignored",
        episodeIndex: 4,
        model: "M1",
        strategyId: "reset_on_any_fragment",
        emergencyFullClear: {
          minimumFragmentsAt: { operations: 150, fragments: 600 },
        },
        mapOrderProvider: () => fixedOrder(fragmentPosition),
      });
      expect(checkpoint(result, 150).totalFragments).toBeGreaterThanOrEqual(
        600,
      );
    }

    for (const model of ["M1", "M2", "M3"] as const) {
      for (let episodeIndex = 0; episodeIndex < 200; episodeIndex += 1) {
        const result = simulateFixedHorizonEpisode({
          masterSeed: "emergency-score-guarantee",
          episodeIndex,
          model,
          strategyId: "optimized_threshold_v1",
          emergencyFullClear: {
            minimumFragmentsAt: { operations: 150, fragments: 600 },
          },
        });
        expect(
          checkpoint(result, 150).totalFragments,
          `${model}:${episodeIndex}`,
        ).toBeGreaterThanOrEqual(600);
      }
    }
  });

  it("supports the non-locking S02-style score guard as an audit comparator", () => {
    let observedBlock = false;
    for (let episodeIndex = 0; episodeIndex < 200; episodeIndex += 1) {
      const result = simulateFixedHorizonEpisode({
        masterSeed: "dynamic-score-guarantee",
        episodeIndex,
        model: "M1",
        strategyId: "optimized_threshold_v1",
        emergencyFullClear: {
          minimumFragmentsAt: {
            operations: 150,
            fragments: 600,
            onUnsafe: "block",
          },
        },
      });
      expect(checkpoint(result, 150).totalFragments).toBeGreaterThanOrEqual(
        600,
      );
      expect(result.emergencyFullClear.activated).toBe(false);
      observedBlock ||= result.final.guardBlockedResets > 0;
    }
    expect(observedBlock).toBe(true);
  });

  it("validates emergency full-clear warning thresholds", () => {
    const common = {
      masterSeed: "invalid-emergency",
      episodeIndex: 0,
      model: "M1" as const,
      strategyId: "optimized_threshold_v1" as const,
    };
    expect(() =>
      simulateFixedHorizonEpisode({
        ...common,
        emergencyFullClear: {},
      }),
    ).toThrow(/at least one warning threshold/u);
    expect(() =>
      simulateFixedHorizonEpisode({
        ...common,
        emergencyFullClear: { afterResetsUsed: 14 },
      }),
    ).toThrow(/\[0, 13\]/u);
    expect(() =>
      simulateFixedHorizonEpisode({
        ...common,
        emergencyFullClear: { capacitySlackAtMost: -1 },
      }),
    ).toThrow(/non-negative/u);
    expect(() =>
      simulateFixedHorizonEpisode({
        ...common,
        emergencyFullClear: {
          minimumFragmentsAt: { operations: 150, fragments: 601 },
        },
      }),
    ).toThrow(/worst-case full-clear yield/u);
    expect(() =>
      simulateFixedHorizonEpisode({
        ...common,
        emergencyFullClear: {
          minimumFragmentsAt: {
            operations: 150,
            fragments: 600,
            onUnsafe: "invalid" as "retire",
          },
        },
      }),
    ).toThrow(/"retire" or "block"/u);
  });

  it("guarantees at least 600 fragments by operation 150 after collecting all three before reset", () => {
    for (const fragmentPosition of ["first", "last"] as const) {
      const order = fixedOrder(fragmentPosition);
      const result = simulateFixedHorizonEpisode({
        masterSeed: "ignored",
        episodeIndex: 0,
        model: "M1",
        strategyId: "reset_on_all_fragments",
        mapOrderProvider: () => order,
      });
      expect(checkpoint(result, 150).totalFragments).toBeGreaterThanOrEqual(
        600,
      );
    }

    for (const model of ["M1", "M2", "M3"] as const) {
      for (let episodeIndex = 0; episodeIndex < 200; episodeIndex += 1) {
        const result = simulateFixedHorizonEpisode({
          masterSeed: "reset-on-all-150-guarantee",
          episodeIndex,
          model,
          strategyId: "reset_on_all_fragments",
        });
        expect(
          checkpoint(result, 150).totalFragments,
          `${model}:${episodeIndex}`,
        ).toBeGreaterThanOrEqual(600);
      }
    }
  });

  it("produces identical score paths for each target-free alias pair", () => {
    const base = {
      masterSeed: "fixed-horizon-aliases",
      episodeIndex: 42,
      model: "M2" as const,
    };
    const s01 = simulateFixedHorizonEpisode({
      ...base,
      strategyId: "optimized_threshold_v1",
    });
    const s02 = simulateFixedHorizonEpisode({
      ...base,
      strategyId: "optimized_conservative_150",
    });
    const s05 = simulateFixedHorizonEpisode({
      ...base,
      strategyId: "aggressive_threshold",
    });
    const s16 = simulateFixedHorizonEpisode({
      ...base,
      strategyId: "conservative_150",
    });

    expect(s02.coreStrategyId).toBe(s01.coreStrategyId);
    expect(s02.checkpoints).toEqual(s01.checkpoints);
    expect(s16.coreStrategyId).toBe(s05.coreStrategyId);
    expect(s16.checkpoints).toEqual(s05.checkpoints);
  });

  it("supports every full-clear, fragment, threshold, and alias policy", () => {
    const strategyIds: readonly FixedHorizonStrategyId[] = [
      "full_clear",
      "safe_credit_whitelist",
      ...FIXED_HORIZON_FRAGMENT_BASELINE_IDS,
      "optimized_threshold_v1",
      "optimized_conservative_150",
      "aggressive_threshold",
      "conservative_150",
    ];
    const simulate = createFixedHorizonSimulator({
      masterSeed: "all-fixed-horizon-policies",
      model: "M3",
      strategyId: "full_clear",
    });

    expect(simulate(9)).toEqual(simulate(9));
    for (const strategyId of strategyIds) {
      const result = simulateFixedHorizonEpisode({
        masterSeed: "all-fixed-horizon-policies",
        episodeIndex: 9,
        model: "M3",
        strategyId,
      });
      expect(result.final.operations, strategyId).toBe(180);
      expect(result.final.resetsUsed, strategyId).toBeLessThanOrEqual(13);
      expect(result.checkpoints, strategyId).toHaveLength(101);
    }
  });
});
