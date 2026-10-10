import { describe, expect, it } from "vitest";

import type { EpisodeResult } from "../src/domain";
import {
  createPairedEpisodeSimulator,
  IntegerHistogram,
  OnlineMoments,
  PairedComparison,
  runSimulation,
  runSimulationBatch,
  runPairedSimulationBatch,
  StreamingStats,
} from "../src/simulation";
import {
  aggressiveThresholdStrategy,
  fullClearStrategy,
} from "../src/strategies";

function result(
  episodeIndex: number,
  strategyId: string,
  cost: number,
  extras: Partial<EpisodeResult> = {},
): EpisodeResult {
  return {
    episodeIndex,
    model: "M1",
    strategyId,
    success: true,
    cost,
    resetsUsed: episodeIndex % 3,
    mapsUsed: (episodeIndex % 3) + 1,
    finalFragments: 600 + (episodeIndex % 2),
    overflow: episodeIndex % 2,
    fragmentAwards: {
      5: episodeIndex % 2,
      15: episodeIndex % 3,
      30: episodeIndex % 4,
    },
    guardBlockedResets: 0,
    lastMapDepth: 25,
    ...extras,
  };
}

describe("integer histogram", () => {
  it("provides exact counts, nearest-rank quantiles, mode, and tail means", () => {
    const histogram = new IntegerHistogram();
    for (const value of [1, 2, 2, 4]) histogram.add(value);
    expect(histogram.size).toBe(4);
    expect(histogram.entries()).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 2 },
      { value: 4, count: 1 },
    ]);
    expect(histogram.mean()).toBe(2.25);
    expect(histogram.mode()).toBe(2);
    expect(histogram.quantile(0)).toBe(1);
    expect(histogram.quantile(0.5)).toBe(2);
    expect(histogram.quantile(0.75)).toBe(2);
    expect(histogram.quantile(0.76)).toBe(4);
    expect(histogram.quantile(1)).toBe(4);
    expect(histogram.upperTailMean(0.25)).toBe(4);
    expect(histogram.countLessThan(2)).toBe(1);
    expect(histogram.countAtMost(2)).toBe(3);
  });

  it("merges exact integer counts", () => {
    const left = new IntegerHistogram();
    const right = new IntegerHistogram();
    left.add(3, 2);
    right.add(3);
    right.add(5, 4);
    left.merge(right);
    expect(left.entries()).toEqual([
      { value: 3, count: 3 },
      { value: 5, count: 4 },
    ]);
  });
});

describe("online moments", () => {
  it("matches a saved-sample reference mean and sample variance", () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const moments = new OnlineMoments();
    for (const value of values) moments.add(value);
    const snapshot = moments.snapshot();
    expect(snapshot.mean).toBeCloseTo(5, 14);
    expect(snapshot.variance).toBeCloseTo(32 / 7, 14);
    expect(snapshot.standardDeviation).toBeCloseTo(Math.sqrt(32 / 7), 14);
    expect(snapshot.standardError).toBeCloseTo(Math.sqrt(32 / 7 / 8), 14);
    expect(snapshot.min).toBe(2);
    expect(snapshot.max).toBe(9);
  });

  it("merges disjoint online accumulators", () => {
    const all = new OnlineMoments();
    const left = new OnlineMoments();
    const right = new OnlineMoments();
    const values = [10, 11, 12, 20, 30, 31, 40];
    values.forEach((value, index) => {
      all.add(value);
      (index < 3 ? left : right).add(value);
    });
    left.merge(right);
    expect(left.snapshot().mean).toBeCloseTo(all.snapshot().mean ?? 0, 14);
    expect(left.snapshot().variance).toBeCloseTo(
      all.snapshot().variance ?? 0,
      12,
    );
    expect(left.snapshot().skewness).toBeCloseTo(
      all.snapshot().skewness ?? 0,
      12,
    );
    expect(left.snapshot().kurtosisExcess).toBeCloseTo(
      all.snapshot().kurtosisExcess ?? 0,
      12,
    );
  });
});

describe("streaming simulation statistics", () => {
  it("keeps all histogram counts equal to successful episodes", () => {
    const stats = new StreamingStats();
    for (let index = 0; index < 4; index += 1) {
      stats.add(result(index, "candidate", [140, 145, 150, 155][index] ?? 0));
    }
    const snapshot = stats.snapshot();
    const count = (entries: readonly { count: number }[]) =>
      entries.reduce((sum, entry) => sum + entry.count, 0);
    expect(count(snapshot.costHistogram)).toBe(4);
    expect(count(snapshot.resetHistogram)).toBe(4);
    expect(count(snapshot.mapCountHistogram)).toBe(4);
    expect(count(snapshot.overflowHistogram)).toBe(4);
    expect(count(snapshot.fragmentAwardHistograms[5])).toBe(4);
    expect(
      snapshot.costResetHeatmap.reduce(
        (sum, entry) => sum + entry.count,
        0,
      ),
    ).toBe(4);
    expect(snapshot.summary.mean).toBeCloseTo(147.5, 14);
    expect(snapshot.summary.mean).toBeCloseTo(
      new IntegerHistogramReference(snapshot.costHistogram).mean(),
      14,
    );
    expect(snapshot.summary.lessThan150Rate).toBe(0.5);
    expect(snapshot.summary.equalTo150Rate).toBe(0.25);
    expect(snapshot.summary.greaterThan150Rate).toBe(0.25);
    expect(snapshot.summary.quantiles.p50).toBe(145);
    expect(snapshot.summary.quantiles.p95).toBe(155);
  });

  it("records failed episodes separately from cost distributions", () => {
    const stats = new StreamingStats();
    stats.add(result(0, "candidate", 140));
    stats.add(
      result(1, "candidate", 0, {
        success: false,
        failureReason: "map_exhausted_without_reset",
      }),
    );
    const snapshot = stats.snapshot();
    expect(snapshot.summary.episodes).toBe(2);
    expect(snapshot.summary.successfulEpisodes).toBe(1);
    expect(snapshot.summary.failedEpisodes).toBe(1);
    expect(snapshot.summary.failureRate).toBe(0.5);
    expect(snapshot.costHistogram).toEqual([{ value: 140, count: 1 }]);
    expect(snapshot.failureReasons.map_exhausted_without_reset).toBe(1);
  });

  it("merges disjoint worker accumulators", () => {
    const combined = new StreamingStats();
    const left = new StreamingStats();
    const right = new StreamingStats();
    for (let index = 0; index < 10; index += 1) {
      const item = result(index, "candidate", 130 + index);
      combined.add(item);
      (index < 4 ? left : right).add(item);
    }
    left.merge(right);
    expect(left.snapshot().costHistogram).toEqual(
      combined.snapshot().costHistogram,
    );
    expect(left.snapshot().summary.mean).toBeCloseTo(
      combined.snapshot().summary.mean ?? 0,
      14,
    );
    expect(left.snapshot().summary.episodes).toBe(10);
  });
});

class IntegerHistogramReference {
  public constructor(
    private readonly entries: readonly { value: number; count: number }[],
  ) {}

  public mean(): number {
    let count = 0;
    let sum = 0;
    for (const entry of this.entries) {
      count += entry.count;
      sum += entry.value * entry.count;
    }
    return sum / count;
  }
}

describe("paired comparison", () => {
  it("accounts for wins, ties, losses, margins, and thresholds", () => {
    const comparison = new PairedComparison();
    comparison.add(result(0, "candidate", 140), result(0, "baseline", 150));
    comparison.add(result(1, "candidate", 150), result(1, "baseline", 150));
    comparison.add(result(2, "candidate", 155), result(2, "baseline", 150));
    const snapshot = comparison.snapshot();
    expect(snapshot.pairs).toBe(3);
    expect(snapshot.meanDifference).toBeCloseTo(-5 / 3, 14);
    expect(snapshot.medianDifference).toBe(0);
    expect(snapshot.candidateWinRate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.tieRate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.candidateLossRate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.averageWinningMargin).toBe(10);
    expect(snapshot.averageLosingMargin).toBe(5);
    expect(snapshot.maxWinningMargin).toBe(10);
    expect(snapshot.maxLosingMargin).toBe(5);
    expect(snapshot.candidateAbove150Rate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.candidateBehindByAtLeast5Rate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.candidateSavesAtLeast5Rate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.candidateSavesAtLeast10Rate).toBeCloseTo(1 / 3, 14);
    expect(snapshot.candidateSavesAtLeast20Rate).toBe(0);
    expect(
      snapshot.candidateWinRate +
        snapshot.tieRate +
        snapshot.candidateLossRate,
    ).toBeCloseTo(1, 14);
  });

  it("rejects non-paired episode indices", () => {
    const comparison = new PairedComparison();
    expect(() =>
      comparison.add(
        result(0, "candidate", 140),
        result(1, "baseline", 150),
      ),
    ).toThrow(/same episode index/);
  });

  it("merges paired worker ranges", () => {
    const left = new PairedComparison();
    const right = new PairedComparison();
    left.add(result(0, "candidate", 140), result(0, "baseline", 150));
    right.add(result(1, "candidate", 155), result(1, "baseline", 150));
    left.merge(right);
    const snapshot = left.snapshot();
    expect(snapshot.pairs).toBe(2);
    expect(snapshot.differenceHistogram).toEqual([
      { value: -10, count: 1 },
      { value: 5, count: 1 },
    ]);
    expect(snapshot.candidateWinRate).toBe(0.5);
    expect(snapshot.candidateLossRate).toBe(0.5);
  });
});

describe("batch runner", () => {
  it("emits every full batch and a final partial batch", () => {
    const updates: number[] = [];
    const run = runSimulation(
      {
        masterSeed: "batch-updates",
        model: "M3",
        strategy: fullClearStrategy,
        episodes: 20_001,
        batchSize: 10_000,
      },
      (progress) => updates.push(progress.completedEpisodes),
    );
    expect(updates).toEqual([10_000, 20_000, 20_001]);
    expect(run.statistics.summary.episodes).toBe(20_001);
    expect(run.statistics.costHistogram).toEqual([
      { value: 150, count: 20_001 },
    ]);
    expect(run.convergence).toHaveLength(3);
  });

  it("is independent of how contiguous ranges are batched", () => {
    const config = {
      masterSeed: "batch-invariance",
      model: "M1" as const,
      strategy: fullClearStrategy,
      episodes: 2_000,
    };
    const single = runSimulationBatch(config).snapshot();
    const chunked = new StreamingStats();
    runSimulationBatch({ ...config, episodes: 700 }, chunked);
    runSimulationBatch(
      { ...config, startEpisode: 700, episodes: 1_300 },
      chunked,
    );
    expect(chunked.snapshot()).toEqual(single);
  });

  it("shares latent maps while preserving standalone paired results", () => {
    const paired = createPairedEpisodeSimulator({
      masterSeed: "paired-cache",
      model: "M2",
      candidateStrategy: aggressiveThresholdStrategy,
      baselineStrategy: fullClearStrategy,
    })(42);
    const standaloneCandidate = runSimulationBatch({
      masterSeed: "paired-cache",
      model: "M2",
      strategy: aggressiveThresholdStrategy,
      startEpisode: 42,
      episodes: 1,
    }).snapshot();
    expect(paired.candidate.cost).toBe(
      standaloneCandidate.costHistogram[0]?.value,
    );
    expect(paired.baseline.cost).toBe(150);
  });

  it("accumulates paired batches and their comparison together", () => {
    const output = runPairedSimulationBatch({
      masterSeed: "paired-batch",
      model: "M1",
      candidateStrategy: aggressiveThresholdStrategy,
      baselineStrategy: fullClearStrategy,
      episodes: 100,
    });
    expect(output.candidateStats.episodes).toBe(100);
    expect(output.baselineStats.episodes).toBe(100);
    expect(output.comparison.snapshot().pairs).toBe(100);
    expect(output.baselineStats.snapshot().costHistogram).toEqual([
      { value: 150, count: 100 },
    ]);
  });
});
