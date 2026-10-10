import { describe, expect, it } from "vitest";

import {
  CATEGORY_INDEX_BY_ID,
  createInitialInventory,
} from "../src/domain/prizePool";
import {
  createExpectedGainGreedyStrategy,
  expectedNextUsefulYield,
} from "../src/strategies/expectedGain";

describe("one-step expected gain", () => {
  it("matches the analytic fresh-map expectations", () => {
    const inventory = createInitialInventory();
    expect(expectedNextUsefulYield("M1", inventory)).toBeCloseTo(2.9215, 12);
    expect(expectedNextUsefulYield("M2", inventory)).toBeCloseTo(
      2 + 9215 / 11309,
      12,
    );
    expect(expectedNextUsefulYield("M3", inventory)).toBeCloseTo(4, 12);
  });

  it("values only useful fragments when the target gap is small", () => {
    const inventory = createInitialInventory();
    expect(expectedNextUsefulYield("M1", inventory, 1)).toBe(1);
    expect(expectedNextUsefulYield("M2", inventory, 2)).toBe(2);
  });

  it("reacts to the exact non-fragment inventory under M1", () => {
    const inventory = createInitialInventory();
    const fresh = expectedNextUsefulYield("M1", inventory);
    inventory[CATEGORY_INDEX_BY_ID.medium_exp_potion_3] = 0;
    expect(expectedNextUsefulYield("M1", inventory)).toBeGreaterThan(fresh);
  });

  it("rejects invalid reset premiums", () => {
    expect(() =>
      createExpectedGainGreedyStrategy({ resetPremium: -0.1 }),
    ).toThrow(RangeError);
  });
});
