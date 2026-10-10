import { describe, expect, it } from "vitest";

import {
  CATEGORY_COUNT,
  CATEGORY_INDEX_BY_ID,
  INITIAL_INVENTORY,
} from "../src/domain";
import type { StrategyState } from "../src/domain/state";
import {
  buildM3BellmanSolver,
  type M3BellmanSolver,
} from "../src/optimization/m3Bellman";

function strategyState(
  solver: M3BellmanSolver,
  remainingInventory: Uint8Array,
  overrides: Partial<StrategyState> = {},
): StrategyState {
  return {
    model: "M3",
    targetFragments: solver.targetFragments,
    maxResets: solver.maxResets,
    totalFragments: 0,
    operations: 0,
    resetsRemaining: solver.maxResets,
    resetsUsed: 0,
    mapsUsed: 1,
    mapIndex: 0,
    depth: 0,
    fragmentMask: 0,
    remainingInventory,
    lastPrizeIndex: CATEGORY_INDEX_BY_ID.crystal_60,
    lastPrizeId: "crystal_60",
    lastFragmentAward: 0,
    ...overrides,
  };
}

describe("M3 exact Bellman solver", () => {
  it("handles terminal, one-open, and unreachable boundaries", () => {
    const solver = buildM3BellmanSolver({
      targetFragments: 101,
      maxResets: 0,
    });

    expect(
      solver.query({
        gap: 0,
        resetsRemaining: 0,
        ordinaryRemaining: 0,
        remainingFragmentMask: 0,
      }),
    ).toEqual({ expectedOperations: 0, action: null });
    expect(
      solver.query({
        gap: 2,
        resetsRemaining: 0,
        ordinaryRemaining: 1,
        remainingFragmentMask: 0,
      }),
    ).toEqual({ expectedOperations: 1, action: "open" });

    const unreachable = solver.query({
      gap: 101,
      resetsRemaining: 0,
      ordinaryRemaining: 22,
      remainingFragmentMask: 7,
    });
    expect(unreachable.expectedOperations).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(unreachable.action).toBeNull();
  });

  it("uses the exact uniform-without-replacement Bellman expectation", () => {
    const solver = buildM3BellmanSolver({
      targetFragments: 9,
      maxResets: 0,
    });

    // One ordinary (+2) and fragment-5 (+7) remain. For a gap of 7,
    // fragment-first finishes in one open and ordinary-first in two.
    expect(
      solver.query({
        gap: 7,
        resetsRemaining: 0,
        ordinaryRemaining: 1,
        remainingFragmentMask: 1,
      }),
    ).toEqual({ expectedOperations: 1.5, action: "open" });
    expect(
      solver.value({
        gap: 9,
        resetsRemaining: 0,
        ordinaryRemaining: 1,
        remainingFragmentMask: 1,
      }),
    ).toBe(2);
  });

  it("forces a reset on an exhausted reachable map", () => {
    const solver = buildM3BellmanSolver({
      targetFragments: 2,
      maxResets: 1,
    });
    expect(
      solver.query({
        gap: 2,
        resetsRemaining: 1,
        ordinaryRemaining: 0,
        remainingFragmentMask: 0,
      }),
    ).toEqual({ expectedOperations: 1, action: "reset" });
  });

  it("chooses reset when its continuation value beats opening", () => {
    const solver = buildM3BellmanSolver({
      targetFragments: 3,
      maxResets: 1,
    });

    // Opening the sole ordinary item takes two operations in total: +2 now,
    // forced reset, then any fresh item supplies the last fragment.
    // Resetting immediately gives 1 open with probability 3/25 and 2 opens
    // with probability 22/25, hence 47/25 = 1.88.
    const decision = solver.query({
      gap: 3,
      resetsRemaining: 1,
      ordinaryRemaining: 1,
      remainingFragmentMask: 0,
    });
    expect(decision.action).toBe("reset");
    expect(decision.expectedOperations).toBeCloseTo(47 / 25, 14);
  });

  it("adapts an exact M3 StrategyState without mutating inventory", () => {
    const solver = buildM3BellmanSolver({
      targetFragments: 3,
      maxResets: 1,
    });
    const remainingInventory = new Uint8Array(CATEGORY_COUNT);
    remainingInventory[CATEGORY_INDEX_BY_ID.crystal_60] = 1;
    const snapshot = remainingInventory.slice();
    const state = strategyState(solver, remainingInventory, {
      depth: 24,
    });

    expect(solver.decide(state)).toBe("reset");
    expect(remainingInventory).toEqual(snapshot);
    expect(() =>
      solver.decide({ ...state, model: "M1" }),
    ).toThrow(/only accepts M3/u);
    expect(() =>
      solver.decide({ ...state, targetFragments: 4 }),
    ).toThrow(/do not match/u);
  });

  it("finds a finite global optimum for the production configuration", () => {
    const solver = buildM3BellmanSolver();
    expect(solver.initialExpectedOperations).toBeGreaterThan(0);
    expect(solver.initialExpectedOperations).toBeLessThanOrEqual(150);
    expect(
      solver.optimalAction({
        gap: 600,
        resetsRemaining: 13,
        ordinaryRemaining: 22,
        remainingFragmentMask: 7,
      }),
    ).toBe("open");
  });

  it("validates table and query dimensions", () => {
    expect(() =>
      buildM3BellmanSolver({ targetFragments: 0 }),
    ).toThrow(/positive/u);
    const solver = buildM3BellmanSolver({
      targetFragments: 10,
      maxResets: 1,
    });
    expect(() =>
      solver.query({
        gap: 11,
        resetsRemaining: 1,
        ordinaryRemaining: 22,
        remainingFragmentMask: 7,
      }),
    ).toThrow(/\[0, 10\]/u);
    expect(() =>
      solver.query({
        gap: 10,
        resetsRemaining: 1,
        ordinaryRemaining: 23,
        remainingFragmentMask: 7,
      }),
    ).toThrow(/\[0, 22\]/u);
    expect(INITIAL_INVENTORY).toHaveLength(CATEGORY_COUNT);
  });
});
