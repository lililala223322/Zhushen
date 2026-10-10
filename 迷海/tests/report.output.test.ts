import { describe, expect, it } from "vitest";
import { rowsToCsv } from "../src/reports/csv";
import { buildDecisionReport } from "../src/reports/decisionReport";
import {
  buildCostCdfSvg,
  buildCostDistributionSvg,
  buildModelSensitivitySvg,
} from "../src/reports/svgCharts";
import type {
  DecisionReportInput,
  PairedComparisonMetrics,
  SummaryMetrics,
} from "../src/reports/types";

function summary(
  strategyId: string,
  modelId: "M1" | "M2" | "M3",
  mean: number,
): SummaryMetrics {
  return {
    strategyId,
    strategyName: strategyId,
    modelId,
    episodes: 1_000_000,
    successes: 1_000_000,
    failures: 0,
    failureRate: 0,
    mean,
    standardError: 0.01,
    ci95Low: mean - 0.02,
    ci95High: mean + 0.02,
    standardDeviation: 7,
    variance: 49,
    min: 100,
    max: 160,
    mode: 138,
    p01: 112,
    p05: 120,
    p10: 126,
    p25: 132,
    p50: 138,
    p75: 143,
    p90: 147,
    p95: 149,
    p99: 153,
    cvar95: 152,
    cvar99: 156,
    skewness: 0,
    excessKurtosis: 0,
    meanResets: 10,
    resetP50: 10,
    resetP95: 13,
    probabilityAllResetsUsed: 0.1,
    meanMaps: 10,
    meanOverflow: 5,
    probabilityLt120: 0.04,
    probabilityLt130: 0.15,
    probabilityLt140: 0.6,
    probabilityLt150: 0.96,
    probabilityEq150: 0.01,
    probabilityGt150: 0.03,
    probabilityGt155: 0.005,
    probabilityGt160: 0,
    meanSavingsVs150: 150 - mean,
    meanSavingsPercentVs150: ((150 - mean) / 150) * 100,
    fragmentAverages: { fragment5: 5, fragment15: 5, fragment30: 5 },
    lowCostFragmentAverages: [
      {
        label: "cost<120",
        episodes: 40_000,
        fragment5: 5,
        fragment15: 5,
        fragment30: 5,
      },
      {
        label: "cost<130",
        episodes: 150_000,
        fragment5: 5,
        fragment15: 5,
        fragment30: 5,
      },
      {
        label: "cost<140",
        episodes: 600_000,
        fragment5: 5,
        fragment15: 5,
        fragment30: 5,
      },
      {
        label: "cost<150",
        episodes: 960_000,
        fragment5: 5,
        fragment15: 5,
        fragment30: 5,
      },
    ],
  };
}

function comparison(candidate: string, baseline: string): PairedComparisonMetrics {
  return {
    candidateStrategyId: candidate,
    baselineStrategyId: baseline,
    modelId: "M1",
    episodes: 1_000_000,
    meanDifference: -12,
    standardError: 0.01,
    ci95Low: -12.02,
    ci95High: -11.98,
    medianDifference: -12,
    p95Difference: 0,
    winRate: 0.8,
    tieRate: 0.1,
    lossRate: 0.1,
    meanWinningMargin: 15,
    meanLosingMargin: 4,
    maxObservedSaving: 50,
    maxObservedLoss: 10,
    probabilityCostGt150: 0.03,
    probabilityWorseByAtLeast1: 0.1,
    probabilityBetterByAtLeast5: 0.75,
    probabilityBetterByAtLeast10: 0.6,
    probabilityBetterByAtLeast20: 0.2,
  };
}

describe("report output", () => {
  it("escapes CSV values and keeps explicit columns", () => {
    const csv = rowsToCsv(
      [{ name: 'a,"b"', value: 2 }],
      ["name", "value"],
    );
    expect(csv).toBe('name,value\n"a,""b""",2\n');
  });

  it("generates a decision-focused report with scope caveats and data index", () => {
    const input: DecisionReportInput = {
      metadata: {
        generatedAt: "2026-07-23T00:00:00.000Z",
        runKind: "formal-test",
        masterSeed: "formal-v1",
        prng: "test",
        episodesPerStrategyModel: 1_000_000,
        batchSize: 10_000,
        targetFragments: 600,
        maxResets: 13,
        models: ["M1", "M2", "M3"],
        strategies: ["aggressive", "full_clear"],
      },
      summaries: [
        summary("aggressive", "M1", 138),
        summary("aggressive", "M2", 140),
        summary("aggressive", "M3", 120),
        summary("full_clear", "M1", 150),
      ],
      comparisons: [
        comparison("aggressive", "full_clear"),
        comparison("aggressive", "reset_on_30"),
      ],
      policies: [
        {
          id: "aggressive",
          name: "进取阈值",
          description: "阈值策略",
          parameters: { thresholds: [0, 2, 5, 6, 13, 14, 18, 25] },
          playerRule: "按碎片组合查深度阈值。",
        },
      ],
      dataFiles: ["summary.csv", "summary.json"],
    };

    const report = buildDecisionReport(input);
    expect(report).toContain("当前已搜索候选空间内最优");
    expect(report).toContain("平均节省 **12.000 次");
    expect(report).toContain("M2: 均值/P95/P99");
    expect(report).toContain("`summary.csv`");
    expect(report).toContain('"runKind": "formal-test"');
  });

  it("exports self-contained SVG decision charts", () => {
    const distribution = buildCostDistributionSvg("M1", [
      {
        label: "进取",
        color: "#175cd3",
        bins: [
          { value: 138, count: 10, probability: 0.5, cdf: 0.5, survival: 0.5 },
          { value: 150, count: 10, probability: 0.5, cdf: 1, survival: 0 },
        ],
      },
    ]);
    const sensitivity = buildModelSensitivitySvg("aggressive", [
      summary("aggressive", "M1", 138),
      summary("aggressive", "M2", 140),
      summary("aggressive", "M3", 120),
    ]);
    expect(distribution).toContain("<svg");
    expect(distribution).toContain("150基线");
    expect(distribution).toContain("模拟落入次数");
    const cdf = buildCostCdfSvg("M1", [
      {
        label: "进取",
        color: "#175cd3",
        bins: [
          { value: 120, count: 4 },
          { value: 150, count: 6 },
        ],
      },
    ]);
    expect(cdf).toContain("累计概率 P(成本≤x)");
    expect(cdf).toContain("120目标");
    expect(cdf).toContain("150基线");
    expect(sensitivity).toContain("模型敏感性");
    expect(sensitivity).toContain("M3");
  });
});
