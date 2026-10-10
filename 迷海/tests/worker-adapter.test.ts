import { describe, expect, it } from "vitest";

import {
  EvaluationAccumulator,
  PairedComparisonAccumulator,
  type EvaluationMetadata,
} from "../src/reports";
import {
  aggressiveThresholdStrategy,
  conservative150Strategy,
  gapAwareExpectedGainGreedyStrategy,
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  resetOn5And15Strategy,
  resetOn5Or15Strategy,
  STRATEGIES,
} from "../src/strategies";
import { STRATEGY_OPTIONS } from "../src/ui/strategyCatalog";
import type { AggregatedSnapshot } from "../src/ui/workerTypes";
import {
  buildRunProgress,
  EXPORTED_FILE_NAMES,
  pairedMetricsToUi,
  serializeExportFiles,
  strategyToUiDefinition,
  summaryMetricsToUi,
  totalCombinationBatches,
} from "../src/workers/workerAdapter";

describe("worker snapshot adapter", () => {
  it("maps report percentages back to UI rates without a 100x error", () => {
    const accumulator = new EvaluationAccumulator({
      modelId: "M1",
      strategyId: "candidate",
      strategyName: "候选",
    });
    for (const [index, cost] of [135, 140, 145, 150].entries()) {
      accumulator.add({
        cost,
        success: true,
        resetsUsed: index,
        mapsUsed: index + 1,
        finalFragments: 600,
        fragmentAwards: { 5: 1, 15: 1, 30: 1 },
      });
    }
    const report = accumulator.summary();
    const ui = summaryMetricsToUi(report);
    expect(report.mean).toBe(142.5);
    expect(report.meanSavingsPercentVs150).toBe(5);
    expect(ui.meanSavings).toBe(7.5);
    expect(ui.savingsRate).toBe(0.05);
    expect(ui.percentiles.p50).toBe(report.p50);
    expect(ui.minimum).toBe(report.min);
    expect(ui.maximum).toBe(report.max);
  });

  it("maps the five-worse field to differences >=5, not >=1", () => {
    const accumulator = new PairedComparisonAccumulator(
      "candidate",
      "baseline",
      "M1",
    );
    accumulator.add(151, 150); // +1: worse, but not five worse
    accumulator.add(155, 150); // +5
    accumulator.add(160, 150); // +10
    accumulator.add(140, 150); // -10
    const summary = accumulator.summary();
    expect(summary.probabilityWorseByAtLeast1).toBe(0.75);
    const ui = pairedMetricsToUi({
      key: "M1:candidate:vs:baseline",
      summary,
      candidateName: "候选",
      baselineName: "基线",
      differenceHistogram: accumulator.differenceHistogram,
    });
    expect(ui.probabilityFiveWorse).toBe(0.5);
    expect(ui.probabilityFiveBetter).toBe(0.25);
    expect(ui.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    expect(ui.winRate + ui.tieRate + ui.lossRate).toBeCloseTo(1, 14);
  });

  it("exports threshold and conservative rules with the correct caveat", () => {
    const aggressive = strategyToUiDefinition(
      aggressiveThresholdStrategy,
    );
    expect(aggressive.kind).toBe("aggressive");
    expect(aggressive.rules).toHaveLength(8);
    expect(aggressive.rules[1]).toMatchObject({
      fragmentMask: 1,
      maxDepth: 2,
      action: "consider-reset",
    });
    const conservative = strategyToUiDefinition(conservative150Strategy);
    expect(conservative.kind).toBe("conservative");
    expect(conservative.rules).toHaveLength(8);
    expect(conservative.caveat).toContain("目标为600碎片时");
  });

  it("recognizes the frozen optimized strategy and its conservative wrapper", () => {
    const optimized = strategyToUiDefinition(optimizedThresholdStrategy);
    expect(optimized.shortName).toBe("优化进取");
    expect(optimized.kind).toBe("aggressive");
    expect(optimized.rules.map((rule) => rule.maxDepth)).toEqual([
      0, 2, 5, 8, 12, 15, 20, 25,
    ]);
    expect(optimized.ruleSections).toHaveLength(6);
    expect(
      optimized.ruleSections?.at(-1)?.rules.map((rule) => rule.maxDepth),
    ).toEqual([0, 1, 4, 7, 11, 14, 19, 25]);
    expect(optimized.ruleSections?.at(-1)?.title).toContain("最高优先级");
    const conservative = strategyToUiDefinition(
      optimizedConservative150Strategy,
    );
    expect(conservative.shortName).toBe("优化保守");
    expect(conservative.kind).toBe("conservative");
    expect(conservative.rules).toEqual(optimized.rules);
    expect(conservative.ruleSections).toEqual(optimized.ruleSections);
    expect(conservative.trigger).toContain("150");
    expect(STRATEGIES.map((strategy) => strategy.id)).toContain(
      "optimized_threshold_v1",
    );
    expect(STRATEGIES.map((strategy) => strategy.id)).toContain(
      "optimized_conservative_150",
    );
  });

  it("keeps AND and OR fragment rules explicit", () => {
    const all = strategyToUiDefinition(resetOn5And15Strategy);
    const any = strategyToUiDefinition(resetOn5Or15Strategy);
    expect(all.logic).toBe("AND·全部满足");
    expect(all.trigger).toContain("全部指定碎片");
    expect(any.logic).toBe("OR·任一满足");
    expect(any.trigger).toContain("任意一种");
  });

  it("describes expected-gain greediness without pretending it is a threshold table", () => {
    const greedy = strategyToUiDefinition(
      gapAwareExpectedGainGreedyStrategy,
    );
    expect(greedy.shortName).toBe("一步期望G0");
    expect(greedy.kind).toBe("aggressive");
    expect(greedy.logic).toBe("一步期望收益");
    expect(greedy.trigger).toContain("下一抽期望有效碎片");
    expect((greedy.details ?? []).join(" ")).toContain(
      "重置名额的影子价格",
    );
    expect(greedy.rules).toEqual([]);
  });

  it("exposes every registered strategy in the UI catalog", () => {
    expect(STRATEGY_OPTIONS).toHaveLength(18);
    expect(new Set(STRATEGY_OPTIONS.map((strategy) => strategy.code)).size).toBe(
      18,
    );
    expect(
      STRATEGY_OPTIONS.find(
        (strategy) => strategy.id === "aggressive_threshold",
      )?.code,
    ).toBe("S05");
    expect(
      STRATEGY_OPTIONS.find(
        (strategy) => strategy.id === "expected_gain_greedy_gap",
      )?.code,
    ).toBe("S18");
    expect(STRATEGY_OPTIONS.map((strategy) => strategy.id).sort()).toEqual(
      STRATEGIES.map((strategy) => strategy.id).sort(),
    );
  });
});

describe("worker batch progress", () => {
  it("counts a final partial batch separately for every combination", () => {
    expect(totalCombinationBatches(25_001, 10_000, 2)).toBe(6);
    expect(totalCombinationBatches(1_000, 10_000, 3)).toBe(3);
  });

  it("uses completed batch updates rather than dividing aggregate episodes", () => {
    const progress = buildRunProgress({
      completedEpisodes: 25_001,
      totalEpisodes: 50_002,
      completedBatches: 3,
      totalBatches: 6,
      elapsedMs: 1_000,
      phase: "running",
      runMode: "formal",
    });
    expect(progress.progress).toBe(0.5);
    expect(progress.currentBatch).toBe(3);
    expect(progress.totalBatches).toBe(6);
    expect(progress.episodesPerSecond).toBe(25_001);
    expect(progress.activeWorkers).toBe(1);
    expect(progress.stageLabel).toBe("独立正式评估");
  });
});

describe("worker export serialization", () => {
  it("produces every documented file deterministically", () => {
    const metadata: EvaluationMetadata = {
      generatedAt: "2026-07-23T00:00:00.000Z",
      runKind: "formal-test",
      masterSeed: "export-test",
      prng: "mulberry32-v1",
      episodesPerStrategyModel: 10_000,
      batchSize: 10_000,
      targetFragments: 600,
      maxResets: 13,
      models: ["M1"],
      strategies: ["full_clear"],
    };
    const snapshot = {
      schemaVersion: 1,
      runId: "run-test",
      sequence: 1,
      generatedAt: metadata.generatedAt,
      provenance: "live",
      phase: "completed",
    } as AggregatedSnapshot;
    const input = {
      metadata,
      summaries: [],
      policies: [{ id: "full_clear" }],
      modelDefinitions: [{ id: "M1" }],
      snapshot,
      rows: {
        summary: [{ model: "M1", strategy: "full_clear", mean: 150 }],
        cost: [{ model: "M1", strategy: "full_clear", cost: 150, count: 1 }],
        cdf: [{ model: "M1", strategy: "full_clear", cost: 150, cdf: 1 }],
        reset: [{ model: "M1", strategy: "full_clear", resets: 5, count: 1 }],
        mapCount: [{ model: "M1", strategy: "full_clear", maps: 6, count: 1 }],
        fragmentAcquisition: [
          { model: "M1", strategy: "full_clear", fragment: 30, awards: 6 },
        ],
        pairedComparison: [],
        convergence: [{ model: "M1", strategy: "full_clear", episodes: 1 }],
      },
      report: "# 决策报告\n",
    } as const;
    const first = serializeExportFiles(input);
    const second = serializeExportFiles(input);
    expect(Object.keys(first).sort()).toEqual(
      [...EXPORTED_FILE_NAMES].sort(),
    );
    expect(second).toEqual(first);
    expect(JSON.parse(first["run-metadata.json"] ?? "{}")).toMatchObject({
      masterSeed: "export-test",
      targetFragments: 600,
    });
    expect(JSON.parse(first["snapshot.json"] ?? "{}")).toMatchObject({
      runId: "run-test",
      phase: "completed",
    });
    expect(first["summary.csv"]).toContain(
      "model,strategy,mean\nM1,full_clear,150",
    );
    expect(first["report.md"]).toBe("# 决策报告\n");
  });
});
