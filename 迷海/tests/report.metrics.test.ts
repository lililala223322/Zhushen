import { describe, expect, it } from "vitest";
import {
  EvaluationAccumulator,
  PairedComparisonAccumulator,
  cvarFromHistogram,
  quantileFromHistogram,
} from "../src/reports/metrics";
import type { EpisodeObservation } from "../src/reports/types";

function observation(
  cost: number,
  overrides: Partial<EpisodeObservation> = {},
): EpisodeObservation {
  return {
    cost,
    success: true,
    resetsUsed: 2,
    mapsUsed: 6,
    finalFragments: 600,
    fragmentAwards: { 5: 2, 15: 3, 30: 4 },
    ...overrides,
  };
}

describe("report metrics", () => {
  it("computes exact integer quantiles and upper-tail CVaR", () => {
    const histogram = new Map([
      [100, 1],
      [110, 2],
      [200, 1],
    ]);
    expect(quantileFromHistogram(histogram, 0.5)).toBe(110);
    expect(quantileFromHistogram(histogram, 0.75)).toBe(110);
    expect(quantileFromHistogram(histogram, 0.99)).toBe(200);
    expect(cvarFromHistogram(histogram, 0.75)).toBe(200);
  });

  it("summarizes costs, tails, failures, resets and fragments", () => {
    const accumulator = new EvaluationAccumulator(
      { strategyId: "candidate", strategyName: "候选", modelId: "M1" },
      600,
      13,
    );
    accumulator.add(observation(100, { resetsUsed: 1, finalFragments: 605 }));
    accumulator.add(observation(120, { resetsUsed: 2, finalFragments: 610 }));
    accumulator.add(
      observation(150, {
        resetsUsed: 13,
        finalFragments: 600,
        fragmentAwards: { 5: 1, 15: 2, 30: 3 },
      }),
    );
    accumulator.add(
      observation(160, {
        success: false,
        resetsUsed: 13,
        finalFragments: 590,
        fragmentAwards: { 5: 0, 15: 1, 30: 2 },
      }),
    );

    const summary = accumulator.summary();
    expect(summary.episodes).toBe(4);
    expect(summary.successes).toBe(3);
    expect(summary.failures).toBe(1);
    expect(summary.failureRate).toBe(0.25);
    expect(summary.mean).toBe(132.5);
    expect(summary.p50).toBe(120);
    expect(summary.p95).toBe(160);
    expect(summary.cvar95).toBe(160);
    expect(summary.probabilityLt150).toBe(0.5);
    expect(summary.probabilityEq150).toBe(0.25);
    expect(summary.probabilityGt150).toBe(0.25);
    expect(summary.probabilityAllResetsUsed).toBe(0.5);
    expect(summary.meanSavingsVs150).toBe(17.5);
    expect(summary.fragmentAverages.fragment30).toBe(3.25);
    expect(accumulator.costBins().reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    expect(accumulator.costBins().at(-1)?.cdf).toBe(1);
    expect(accumulator.costResetBins().reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
  });

  it("computes paired differences with candidate minus baseline semantics", () => {
    const paired = new PairedComparisonAccumulator("candidate", "baseline", "M1");
    paired.add(100, 110);
    paired.add(110, 110);
    paired.add(120, 110);
    paired.add(90, 110);

    const summary = paired.summary();
    expect(summary.episodes).toBe(4);
    expect(summary.meanDifference).toBe(-5);
    expect(summary.winRate).toBe(0.5);
    expect(summary.tieRate).toBe(0.25);
    expect(summary.lossRate).toBe(0.25);
    expect(summary.meanWinningMargin).toBe(15);
    expect(summary.meanLosingMargin).toBe(10);
    expect(summary.maxObservedSaving).toBe(20);
    expect(summary.maxObservedLoss).toBe(10);
    expect(summary.probabilityBetterByAtLeast10).toBe(0.5);
  });
});
