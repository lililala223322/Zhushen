import { describe, expect, it } from "vitest";

import {
  CATEGORY_COUNT,
  CATEGORY_INDEX_BY_ID,
  CATEGORY_WEIGHT_BPS,
  EXPANDED_ROW_WEIGHT_BPS,
  FIXED_FRAGMENTS_PER_OPEN,
  FRAGMENT_CATEGORY_INDICES,
  FULL_MAP_YIELD,
  getFragmentValue,
  INITIAL_INVENTORY,
  MAP_SIZE,
  PRIZE_CATEGORIES,
  UNIQUE_WEIGHT_BPS,
  type FragmentMask,
} from "../src/domain";
import type { StrategyState } from "../src/domain/state";
import {
  deriveMapSeed,
  generateMapOrder,
  getCategoryProbabilities,
  simulateEpisode,
  validateMapOrder,
} from "../src/simulation";
import {
  aggressiveThresholdStrategy,
  canResetWithinCostLimit,
  canSafelyReset,
  conservative150Strategy,
  fullClearStrategy,
  guaranteedFreshMapYieldAfterOpens,
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  resetOn5And15Strategy,
  resetOn5Or15Strategy,
  STRATEGIES,
  worstCaseFreshMapOpens,
} from "../src/strategies";

function sum(values: ArrayLike<number>): number {
  let result = 0;
  for (let index = 0; index < values.length; index += 1) {
    result += values[index] ?? 0;
  }
  return result;
}

function fixedOrder(fragmentPosition: "first" | "last"): Uint8Array {
  const values: number[] = [];
  for (let index = 0; index < CATEGORY_COUNT; index += 1) {
    for (let copy = 0; copy < (INITIAL_INVENTORY[index] ?? 0); copy += 1) {
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

function state(
  overrides: Partial<StrategyState> = {},
): StrategyState {
  return {
    model: "M1",
    targetFragments: 600,
    maxResets: 13,
    totalFragments: 100,
    operations: 20,
    resetsRemaining: 10,
    resetsUsed: 3,
    mapsUsed: 4,
    mapIndex: 3,
    depth: 2,
    fragmentMask: 1,
    remainingInventory: INITIAL_INVENTORY,
    lastPrizeIndex: CATEGORY_INDEX_BY_ID.fragment_5,
    lastPrizeId: "fragment_5",
    lastFragmentAward: 5,
    ...overrides,
  };
}

describe("fixed prize pool", () => {
  it("contains 22 categories and exactly 25 physical items", () => {
    expect(PRIZE_CATEGORIES).toHaveLength(22);
    expect(CATEGORY_COUNT).toBe(22);
    expect(sum(INITIAL_INVENTORY)).toBe(25);
    expect(UNIQUE_WEIGHT_BPS).toBe(10_000);
    expect(EXPANDED_ROW_WEIGHT_BPS).toBe(11_309);
  });

  it("has exactly the three specified duplicated categories", () => {
    const duplicated = PRIZE_CATEGORIES.filter(
      (category) => category.initialStock === 2,
    ).map((category) => category.id);
    expect(duplicated).toEqual([
      "radiant_stone_3",
      "radiant_stone_5",
      "soul_crystal",
    ]);
  });

  it("contains one 5, 15, and 30 fragment bonus per map", () => {
    expect(INITIAL_INVENTORY[FRAGMENT_CATEGORY_INDICES[5]]).toBe(1);
    expect(INITIAL_INVENTORY[FRAGMENT_CATEGORY_INDICES[15]]).toBe(1);
    expect(INITIAL_INVENTORY[FRAGMENT_CATEGORY_INDICES[30]]).toBe(1);
    expect(FULL_MAP_YIELD).toBe(100);
  });
});

describe("draw models", () => {
  it("M1 initially matches each de-duplicated display probability", () => {
    const probabilities = getCategoryProbabilities("M1");
    expect(sum(probabilities)).toBeCloseTo(1, 14);
    for (let index = 0; index < CATEGORY_COUNT; index += 1) {
      expect(probabilities[index]).toBeCloseTo(
        (CATEGORY_WEIGHT_BPS[index] ?? 0) / 10_000,
        14,
      );
    }
  });

  it("M1 keeps a duplicate category's full weight after its first copy", () => {
    const index = CATEGORY_INDEX_BY_ID.radiant_stone_3;
    const remaining = INITIAL_INVENTORY.slice();
    remaining[index] = 1;
    const probabilities = getCategoryProbabilities("M1", remaining);
    expect(probabilities[index]).toBeCloseTo(448 / 10_000, 14);
    remaining[index] = 0;
    expect(getCategoryProbabilities("M1", remaining)[index]).toBe(0);
  });

  it("M2 multiplies category weight by remaining stock", () => {
    const index = CATEGORY_INDEX_BY_ID.radiant_stone_3;
    const initial = getCategoryProbabilities("M2");
    expect(initial[index]).toBeCloseTo((2 * 448) / 11_309, 14);
    const remaining = INITIAL_INVENTORY.slice();
    remaining[index] = 1;
    const afterOne = getCategoryProbabilities("M2", remaining);
    expect(afterOne[index]).toBeCloseTo(448 / (11_309 - 448), 14);
  });

  it("M3 gives each physical item probability 1/25", () => {
    const probabilities = getCategoryProbabilities("M3");
    expect(probabilities[CATEGORY_INDEX_BY_ID.radiant_stone_3]).toBeCloseTo(
      2 / 25,
      14,
    );
    expect(probabilities[CATEGORY_INDEX_BY_ID.fragment_30]).toBeCloseTo(
      1 / 25,
      14,
    );
  });

  it("reproduces the three models' distinct initial fragment probabilities", () => {
    const fragmentProbability = (model: "M1" | "M2" | "M3") => {
      const probabilities = getCategoryProbabilities(model);
      return (
        (probabilities[FRAGMENT_CATEGORY_INDICES[5]] ?? 0) +
        (probabilities[FRAGMENT_CATEGORY_INDICES[15]] ?? 0) +
        (probabilities[FRAGMENT_CATEGORY_INDICES[30]] ?? 0)
      );
    };
    expect(fragmentProbability("M1")).toBeCloseTo(0.0739, 14);
    expect(fragmentProbability("M2")).toBeCloseTo(739 / 11_309, 14);
    expect(fragmentProbability("M3")).toBeCloseTo(3 / 25, 14);
  });

  it("all models generate exact inventory without negative counts", () => {
    for (const model of ["M1", "M2", "M3"] as const) {
      for (let episodeIndex = 0; episodeIndex < 50; episodeIndex += 1) {
        const order = generateMapOrder({
          masterSeed: "model-inventory-test",
          episodeIndex,
          mapIndex: 2,
          model,
        });
        expect(validateMapOrder(order)).toBe(true);
        let yieldTotal = MAP_SIZE * FIXED_FRAGMENTS_PER_OPEN;
        for (const categoryIndex of order) {
          yieldTotal += getFragmentValue(categoryIndex);
        }
        expect(yieldTotal).toBe(100);
      }
    }
  });
});

describe("deterministic random maps", () => {
  it("repeats byte-for-byte for identical coordinates", () => {
    const coordinates = {
      masterSeed: "repeatable",
      episodeIndex: 123,
      mapIndex: 7,
      model: "M1" as const,
    };
    expect(generateMapOrder(coordinates)).toEqual(generateMapOrder(coordinates));
    expect(deriveMapSeed("repeatable", 123, 7, "M1")).toBe(
      deriveMapSeed("repeatable", 123, 7, "M1"),
    );
  });

  it("changes when an episode, map, or model coordinate changes", () => {
    const base = deriveMapSeed("coordinate-test", 1, 2, "M1");
    expect(deriveMapSeed("coordinate-test", 2, 2, "M1")).not.toBe(base);
    expect(deriveMapSeed("coordinate-test", 1, 3, "M1")).not.toBe(base);
    expect(deriveMapSeed("coordinate-test", 1, 2, "M2")).not.toBe(base);
  });
});

describe("feasibility and hard-cost guards", () => {
  it("uses the exact reset capacity invariant", () => {
    expect(
      canSafelyReset(state({ totalFragments: 500, resetsRemaining: 1 })),
    ).toBe(true);
    expect(
      canSafelyReset(state({ totalFragments: 499, resetsRemaining: 1 })),
    ).toBe(false);
    expect(
      canSafelyReset(state({ totalFragments: 600, resetsRemaining: 13 })),
    ).toBe(false);
  });

  it("computes the exact worst valid prefix yield", () => {
    expect(guaranteedFreshMapYieldAfterOpens(22)).toBe(44);
    expect(guaranteedFreshMapYieldAfterOpens(23)).toBe(51);
    expect(guaranteedFreshMapYieldAfterOpens(24)).toBe(68);
    expect(guaranteedFreshMapYieldAfterOpens(25)).toBe(100);
    expect(worstCaseFreshMapOpens(50)).toBe(23);
    expect(worstCaseFreshMapOpens(100)).toBe(25);
    expect(worstCaseFreshMapOpens(150)).toBe(48);
  });

  it("blocks a reset that could exceed the 150 hard limit", () => {
    expect(
      canResetWithinCostLimit(
        state({
          totalFragments: 500,
          resetsRemaining: 1,
          operations: 125,
        }),
        150,
      ),
    ).toBe(true);
    expect(
      canResetWithinCostLimit(
        state({
          totalFragments: 500,
          resetsRemaining: 1,
          operations: 126,
        }),
        150,
      ),
    ).toBe(false);
  });
});

describe("strategy semantics", () => {
  it("uses AND semantics for named fragment combinations", () => {
    expect(
      resetOn5And15Strategy.decide(state({ fragmentMask: 1 })),
    ).toBe("open");
    expect(
      resetOn5And15Strategy.decide(state({ fragmentMask: 3 })),
    ).toBe("reset");
  });

  it("distinguishes OR semantics from AND semantics", () => {
    expect(
      resetOn5Or15Strategy.decide(state({ fragmentMask: 1 })),
    ).toBe("reset");
    expect(
      resetOn5Or15Strategy.decide(state({ fragmentMask: 2 })),
    ).toBe("reset");
    expect(
      resetOn5Or15Strategy.decide(state({ fragmentMask: 4 })),
    ).toBe("open");
  });

  it("uses exact-mask depth thresholds for the initial aggressive policy", () => {
    expect(
      aggressiveThresholdStrategy.decide(
        state({ fragmentMask: 1, depth: 2 }),
      ),
    ).toBe("reset");
    expect(
      aggressiveThresholdStrategy.decide(
        state({ fragmentMask: 1, depth: 3 }),
      ),
    ).toBe("open");
    expect(
      aggressiveThresholdStrategy.decide(
        state({ fragmentMask: 0, depth: 1 }),
      ),
    ).toBe("open");
    for (let mask = 0; mask < 8; mask += 1) {
      expect(mask as FragmentMask).toBe(mask);
    }
  });

  it("executes the frozen optimized base, reset, and near-target bands", () => {
    expect(
      optimizedThresholdStrategy.decide(
        state({
          resetsRemaining: 6,
          fragmentMask: 3,
          depth: 8,
        }),
      ),
    ).toBe("reset");
    expect(
      optimizedThresholdStrategy.decide(
        state({
          resetsRemaining: 6,
          fragmentMask: 3,
          depth: 9,
        }),
      ),
    ).toBe("open");
    expect(
      optimizedThresholdStrategy.decide(
        state({
          resetsRemaining: 13,
          fragmentMask: 4,
          depth: 13,
        }),
      ),
    ).toBe("reset");
    expect(
      optimizedThresholdStrategy.decide(
        state({
          totalFragments: 550,
          resetsRemaining: 13,
          fragmentMask: 1,
          depth: 2,
        }),
      ),
    ).toBe("open");
  });
});

describe("episode state machine", () => {
  it("full_clear is exactly 150 for every model and seed", () => {
    for (const model of ["M1", "M2", "M3"] as const) {
      for (const masterSeed of ["a", "b", 12345]) {
        const result = simulateEpisode({
          masterSeed,
          episodeIndex: 9,
          model,
          strategy: fullClearStrategy,
        });
        expect(result).toMatchObject({
          success: true,
          cost: 150,
          resetsUsed: 5,
          mapsUsed: 6,
          finalFragments: 600,
          overflow: 0,
          lastMapDepth: 25,
        });
      }
    }
  });

  it("stops immediately upon reaching the target", () => {
    const result = simulateEpisode({
      masterSeed: "immediate-stop",
      episodeIndex: 0,
      model: "M1",
      strategy: fullClearStrategy,
      targetFragments: 2,
      maxResets: 0,
    });
    expect(result.success).toBe(true);
    expect(result.cost).toBe(1);
    expect(result.finalFragments).toBeGreaterThanOrEqual(2);
  });

  it("reports an impossible initial configuration instead of looping", () => {
    const result = simulateEpisode({
      masterSeed: "unreachable",
      episodeIndex: 0,
      model: "M1",
      strategy: fullClearStrategy,
      targetFragments: 600,
      maxResets: 4,
    });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe(
      "target_unreachable_from_initial_configuration",
    );
  });

  it("all registered policies complete adversarial valid map orders", () => {
    for (const fragmentPosition of ["first", "last"] as const) {
      const order = fixedOrder(fragmentPosition);
      expect(validateMapOrder(order)).toBe(true);
      for (const strategy of STRATEGIES) {
        const result = simulateEpisode({
          masterSeed: "ignored-by-provider",
          episodeIndex: 0,
          model: "M1",
          strategy,
          mapOrderProvider: () => order,
        });
        expect(
          result.success,
          `${strategy.id}/${fragmentPosition}`,
        ).toBe(true);
        expect(result.resetsUsed).toBeLessThanOrEqual(13);
        expect(result.finalFragments).toBeGreaterThanOrEqual(600);
        if (
          strategy.id === conservative150Strategy.id ||
          strategy.id === optimizedConservative150Strategy.id
        ) {
          expect(result.cost).toBeLessThanOrEqual(150);
        }
      }
    }
  });

  it("is exactly reproducible episode-by-episode", () => {
    const config = {
      masterSeed: "episode-repeat",
      episodeIndex: 2026,
      model: "M2" as const,
      strategy: aggressiveThresholdStrategy,
    };
    expect(simulateEpisode(config)).toEqual(simulateEpisode(config));
  });

  it("keeps every formal strategy safe over a random smoke set", () => {
    for (const strategy of STRATEGIES) {
      for (let episodeIndex = 0; episodeIndex < 100; episodeIndex += 1) {
        const result = simulateEpisode({
          masterSeed: "safety-smoke",
          episodeIndex,
          model: "M1",
          strategy,
        });
        expect(result.success, `${strategy.id}/${episodeIndex}`).toBe(true);
        expect(result.resetsUsed).toBeLessThanOrEqual(13);
        if (
          strategy.id === conservative150Strategy.id ||
          strategy.id === optimizedConservative150Strategy.id
        ) {
          expect(result.cost).toBeLessThanOrEqual(150);
        }
      }
    }
  });
});
