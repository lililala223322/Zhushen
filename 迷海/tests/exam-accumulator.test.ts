import { describe, expect, it } from "vitest";

import {
  FixedHorizonExamAccumulator,
  FixedHorizonPairAccumulator,
} from "../src/exam/accumulator";
import {
  simulateFixedHorizonEpisode,
  type FixedHorizonEpisodeResult,
} from "../src/exam/fixedHorizon";

function pointAt(
  accumulator: FixedHorizonExamAccumulator,
  operations: number,
) {
  const point = accumulator.curve().points[operations - 80];
  expect(point?.operations).toBe(operations);
  if (point === undefined) {
    throw new Error(`Missing aggregate checkpoint ${operations}.`);
  }
  return point;
}

function sampleVariance(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    values.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) /
    (values.length - 1)
  );
}

function simulate(
  strategyId:
    | "full_clear"
    | "aggressive_threshold"
    | "optimized_threshold_v1",
  episodeIndex: number,
): FixedHorizonEpisodeResult {
  return simulateFixedHorizonEpisode({
    masterSeed: "exam-accumulator-regression",
    episodeIndex,
    model: "M1",
    strategyId,
  });
}

describe("fixed-horizon exam accumulator", () => {
  it("preserves the full-clear deterministic score and reset benchmarks", () => {
    const accumulator = new FixedHorizonExamAccumulator(
      "M1",
      "full_clear",
      "full_clear",
      "全部打开",
      "#64748b",
      80,
      180,
      13,
    );
    for (let episodeIndex = 0; episodeIndex < 24; episodeIndex += 1) {
      accumulator.add(simulate("full_clear", episodeIndex));
    }

    const expected = [
      { operations: 100, fragments: 400, resets: 3 },
      { operations: 125, fragments: 500, resets: 4 },
      { operations: 150, fragments: 600, resets: 5 },
      { operations: 175, fragments: 700, resets: 6 },
    ] as const;

    for (const benchmark of expected) {
      const point = pointAt(accumulator, benchmark.operations);
      expect(point.episodes).toBe(24);
      expect(point.meanFragments).toBe(benchmark.fragments);
      expect(point.varianceFragments).toBe(0);
      expect(point.standardDeviationFragments).toBe(0);
      expect(point.standardErrorFragments).toBe(0);
      expect(point.ci95LowFragments).toBe(benchmark.fragments);
      expect(point.ci95HighFragments).toBe(benchmark.fragments);
      expect(point.minimumFragments).toBe(benchmark.fragments);
      expect(point.maximumFragments).toBe(benchmark.fragments);
      expect(point.quantiles).toEqual({
        p05: benchmark.fragments,
        p25: benchmark.fragments,
        p50: benchmark.fragments,
        p75: benchmark.fragments,
        p90: benchmark.fragments,
        p95: benchmark.fragments,
        p99: benchmark.fragments,
      });
      expect(point.meanResets).toBe(benchmark.resets);
      expect(point.varianceResets).toBe(0);
      expect(point.resetP50).toBe(benchmark.resets);
      expect(point.resetP95).toBe(benchmark.resets);
      expect(point.meanMaps).toBe(benchmark.resets + 1);
    }
  });

  it("computes the >=600 pass curve and shortfall/overflow at the boundary", () => {
    const accumulator = new FixedHorizonExamAccumulator(
      "M1",
      "full_clear",
      "full_clear",
      "全部打开",
      "#64748b",
      80,
      180,
      13,
    );
    for (let episodeIndex = 0; episodeIndex < 12; episodeIndex += 1) {
      accumulator.add(simulate("full_clear", episodeIndex));
    }

    expect(pointAt(accumulator, 125)).toMatchObject({
      probabilityAtLeast600: 0,
      meanShortfallTo600: 100,
      meanOverflowAbove600: 0,
    });
    expect(pointAt(accumulator, 149).probabilityAtLeast600).toBe(0);
    expect(pointAt(accumulator, 150)).toMatchObject({
      probabilityAtLeast600: 1,
      meanShortfallTo600: 0,
      meanOverflowAbove600: 0,
    });
    expect(pointAt(accumulator, 175)).toMatchObject({
      probabilityAtLeast600: 1,
      meanShortfallTo600: 0,
      meanOverflowAbove600: 100,
    });
  });

  it("reports an exact zero paired difference for identical score paths", () => {
    const paired = new FixedHorizonPairAccumulator(80, 180);
    for (let episodeIndex = 0; episodeIndex < 16; episodeIndex += 1) {
      const episode = simulate("optimized_threshold_v1", episodeIndex);
      paired.add(episode, episode);
    }

    const points = paired.points();
    expect(points).toHaveLength(101);
    for (const point of points) {
      expect(point.pairs).toBe(16);
      expect(point.meanFragmentDifference).toBe(0);
      expect(point.standardError).toBe(0);
      expect(point.ci95Low).toBe(0);
      expect(point.ci95High).toBe(0);
      expect(point.winRate).toBe(0);
      expect(point.tieRate).toBe(1);
      expect(point.lossRate).toBe(0);
    }
  });

  it("aggregates conditional fragment scores by the observed reset count", () => {
    const accumulator = new FixedHorizonExamAccumulator(
      "M1",
      "aggressive_threshold",
      "aggressive_threshold",
      "S05固定阈值",
      "#ef8354",
      80,
      180,
      13,
    );
    const episodes = Array.from({ length: 96 }, (_, episodeIndex) =>
      simulate("aggressive_threshold", episodeIndex),
    );
    for (const episode of episodes) accumulator.add(episode);

    const rawGroups = new Map<number, number[]>();
    for (const episode of episodes) {
      const checkpoint = episode.checkpoints[100 - 80];
      if (checkpoint === undefined) {
        throw new Error("Missing raw operation-100 checkpoint.");
      }
      const values = rawGroups.get(checkpoint.resetsUsed) ?? [];
      values.push(checkpoint.totalFragments);
      rawGroups.set(checkpoint.resetsUsed, values);
    }

    const cells = accumulator
      .conditionalResetCells()
      .filter((cell) => cell.operations === 100);
    expect(cells).toHaveLength(rawGroups.size);
    expect(
      cells.reduce((sum, cell) => sum + cell.episodes, 0),
    ).toBe(episodes.length);
    expect(
      cells.reduce((sum, cell) => sum + cell.probability, 0),
    ).toBeCloseTo(1, 14);

    for (const [resetsUsed, fragments] of rawGroups) {
      const cell = cells.find(
        (candidate) => candidate.resetsUsed === resetsUsed,
      );
      expect(cell, `missing reset bucket ${resetsUsed}`).toBeDefined();
      expect(cell).toMatchObject({
        modelId: "M1",
        strategyId: "aggressive_threshold",
        coreStrategyId: "aggressive_threshold",
        operations: 100,
        resetsUsed,
        episodes: fragments.length,
      });
      expect(cell?.probability).toBeCloseTo(
        fragments.length / episodes.length,
        14,
      );
      expect(cell?.meanFragments).toBeCloseTo(
        fragments.reduce((sum, value) => sum + value, 0) /
          fragments.length,
        12,
      );
      expect(cell?.varianceFragments).toBeCloseTo(
        sampleVariance(fragments),
        12,
      );
    }
  });
});
