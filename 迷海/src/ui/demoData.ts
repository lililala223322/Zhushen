import type {
  AggregatedSnapshot,
  BaselineBenefit,
  ConfidencePoint,
  CostHistogramSeries,
  CountBin,
  DistributionPoint,
  DistributionSeries,
  FragmentAcquisitionSeries,
  HistogramBin,
  IntegerHistogramSeries,
  ModelId,
  PairedComparison,
  PolicyDecisionHeatmap,
  ResetHistogramSeries,
  SensitivityMetric,
  SimulationConfig,
  SummaryStats,
} from "./workerTypes";
import {
  STRATEGY_DEFINITIONS as COMPLETE_STRATEGY_DEFINITIONS,
  STRATEGY_OPTIONS as COMPLETE_STRATEGY_OPTIONS,
} from "./strategyCatalog";

export const MODEL_OPTIONS = [
  {
    id: "M1" as const,
    name: "M1 类别权重",
    shortName: "M1",
    description: "类别耗尽后重归一化 · 主模型",
  },
  {
    id: "M2" as const,
    name: "M2 每份带权",
    shortName: "M2",
    description: "库存份数乘以类别权重",
  },
  {
    id: "M3" as const,
    name: "M3 均匀洗牌",
    shortName: "M3",
    description: "25 件物品等概率随机排列",
  },
];

export {
  COMPLETE_STRATEGY_DEFINITIONS as STRATEGY_DEFINITIONS,
  COMPLETE_STRATEGY_OPTIONS as STRATEGY_OPTIONS,
};

export const DEFAULT_CONFIG: SimulationConfig = {
  modelIds: ["M1"],
  strategyIds: [
    "optimized_threshold_v1",
    "optimized_conservative_150",
    "reset_on_30",
    "full_clear",
  ],
  targetFragments: 600,
  maxResets: 13,
  episodesPerCombination: 1_000_000,
  batchSize: 10_000,
  masterSeed: "MIHAI-FORMAL-2026",
  workerCount: 1,
  runMode: "formal",
};

interface DemoPerformance {
  mean: number;
  sd: number;
  p95: number;
  p99: number;
  resets: number;
}

const PERFORMANCE: Record<
  ModelId,
  Partial<Record<string, DemoPerformance>>
> = {
  M1: {
    optimized_threshold_v1: { mean: 137.456947, sd: 7.351587, p95: 148, p99: 151, resets: 8.002262 },
    expected_gain_greedy_gap: { mean: 138.31398, sd: 7.29574, p95: 149, p99: 153, resets: 9.04259 },
    optimized_conservative_150: { mean: 139.285387, sd: 7.223167, p95: 150, p99: 150, resets: 7.303055 },
    aggressive_threshold: { mean: 137.54, sd: 7.34, p95: 148, p99: 151, resets: 10.6 },
    conservative_150: { mean: 139.3, sd: 7.2, p95: 150, p99: 150, resets: 9.9 },
    reset_on_30: { mean: 140.652941, sd: 8.035036, p95: 153, p99: 158, resets: 7.237386 },
    full_clear: { mean: 150, sd: 0, p95: 150, p99: 150, resets: 5 },
  },
  M2: {
    optimized_threshold_v1: { mean: 139.641648, sd: 6.913069, p95: 150, p99: 153, resets: 7.66728 },
    expected_gain_greedy_gap: { mean: 140.42382, sd: 6.899675, p95: 150, p99: 153, resets: 8.62315 },
    optimized_conservative_150: { mean: 141.433789, sd: 6.63211, p95: 150, p99: 150, resets: 7.016054 },
    aggressive_threshold: { mean: 139.69, sd: 6.7, p95: 150, p99: 152, resets: 10.4 },
    conservative_150: { mean: 141.1, sd: 6.3, p95: 150, p99: 150, resets: 9.7 },
    reset_on_30: { mean: 143.151431, sd: 7.67171, p95: 155, p99: 158, resets: 7.125681 },
    full_clear: { mean: 150, sd: 0, p95: 150, p99: 150, resets: 5 },
  },
  M3: {
    optimized_threshold_v1: { mean: 119.17602, sd: 9.956886, p95: 135, p99: 140, resets: 10.508392 },
    expected_gain_greedy_gap: { mean: 119.64939, sd: 9.637133, p95: 135, p99: 140, resets: 11.43511 },
    optimized_conservative_150: { mean: 122.31391, sd: 10.439928, p95: 139, p99: 145, resets: 9.576316 },
    aggressive_threshold: { mean: 119.34, sd: 9.6, p95: 135, p99: 140, resets: 11.3 },
    conservative_150: { mean: 124.7, sd: 9.1, p95: 140, p99: 146, resets: 10.6 },
    reset_on_30: { mean: 120.799309, sd: 10.66475, p95: 138, p99: 143, resets: 8.635156 },
    full_clear: { mean: 150, sd: 0, p95: 150, p99: 150, resets: 5 },
  },
};

const STRATEGY_COLORS = new Map(
  COMPLETE_STRATEGY_OPTIONS.map((strategy) => [strategy.id, strategy.color]),
);

function modelName(modelId: ModelId) {
  return MODEL_OPTIONS.find((model) => model.id === modelId)?.name ?? modelId;
}

function strategyName(strategyId: string) {
  return COMPLETE_STRATEGY_OPTIONS.find(
    (strategy) => strategy.id === strategyId,
  )?.name ?? strategyId;
}

function normalWeight(value: number, mean: number, sd: number) {
  if (sd === 0) {
    return value === mean ? 1 : 0;
  }
  const z = (value - mean) / sd;
  return Math.exp(-0.5 * z * z);
}

function allocateCounts(weights: number[], episodes: number) {
  if (episodes <= 0) {
    return weights.map(() => 0);
  }
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const raw = weights.map((weight) => (weight / totalWeight) * episodes);
  const counts = raw.map(Math.floor);
  let remainder = episodes - counts.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index += 1) {
    const target = order[index % order.length];
    if (target) {
      counts[target.index] = (counts[target.index] ?? 0) + 1;
    }
  }
  return counts;
}

function createCostBins(
  strategyId: string,
  modelId: ModelId,
  episodes: number,
): HistogramBin[] {
  const metric = PERFORMANCE[modelId][strategyId];
  if (!metric) {
    return [];
  }
  const values = Array.from({ length: 76 }, (_, index) => 100 + index);
  const weights = values.map((value) => {
    if (strategyId === "full_clear") {
      return value === 150 ? 1 : 0;
    }
    const base = normalWeight(value, metric.mean, metric.sd);
    const rightTail = value > metric.mean ? 1 + (value - metric.mean) * 0.012 : 1;
    return base * rightTail;
  });
  const counts = allocateCounts(weights, episodes);
  return values.map((value, index) => ({
    value,
    count: counts[index] ?? 0,
    probability: episodes > 0 ? (counts[index] ?? 0) / episodes : 0,
  }));
}

function distributionFromBins(bins: HistogramBin[]): {
  cdf: DistributionPoint[];
  survival: DistributionPoint[];
} {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  let cumulative = 0;
  const cdf = bins.map((bin) => {
    cumulative += bin.count;
    return {
      cost: bin.value,
      probability: total > 0 ? cumulative / total : 0,
    };
  });
  return {
    cdf,
    survival: cdf.map((point) => ({
      cost: point.cost,
      probability: Math.max(0, 1 - point.probability),
    })),
  };
}

function quantileApprox(mean: number, sd: number, z: number) {
  return Math.round(mean + sd * z);
}

function makeSummary(
  strategyId: string,
  modelId: ModelId,
  episodes: number,
): SummaryStats {
  const metric = PERFORMANCE[modelId][strategyId];
  if (!metric) {
    return {
      key: `${modelId}:${strategyId}`,
      strategyId,
      strategyName: strategyName(strategyId),
      modelId,
      modelName: modelName(modelId),
      episodes: 0,
      successes: 0,
      failures: 0,
      failureRate: 0,
      mean: 0,
      standardError: 0,
      ci95Low: 0,
      ci95High: 0,
      standardDeviation: 0,
      variance: 0,
      minimum: 0,
      maximum: 0,
      mode: 0,
      percentiles: {
        p01: 0,
        p05: 0,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
      cvar95: 0,
      cvar99: 0,
      skewness: 0,
      excessKurtosis: 0,
      meanResets: 0,
      resetP50: 0,
      resetP95: 0,
      meanMaps: 0,
      meanFragmentOverflow: 0,
      belowBaselineRate: 0,
      atBaselineRate: 0,
      aboveBaselineRate: 0,
      meanSavings: 0,
      savingsRate: 0,
    };
  }
  const se = episodes > 0 ? metric.sd / Math.sqrt(episodes) : 0;
  const belowBaselineRate =
    strategyId === "full_clear"
      ? 0
      : Math.max(0, Math.min(0.99, 0.5 + (150 - metric.mean) / Math.max(8, metric.sd * 3)));
  const aboveBaselineRate =
    strategyId === "full_clear"
      ? 0
      : Math.max(0.0001, Math.min(0.25, (metric.p99 - 150 + 1) * 0.012));
  return {
    key: `${modelId}:${strategyId}`,
    strategyId,
    strategyName: strategyName(strategyId),
    modelId,
    modelName: modelName(modelId),
    episodes,
    successes: episodes,
    failures: 0,
    failureRate: 0,
    mean: metric.mean,
    standardError: se,
    ci95Low: metric.mean - 1.96 * se,
    ci95High: metric.mean + 1.96 * se,
    standardDeviation: metric.sd,
    variance: metric.sd ** 2,
    minimum: strategyId === "full_clear" ? 150 : Math.max(80, quantileApprox(metric.mean, metric.sd, -3.2)),
    maximum: strategyId === "full_clear" ? 150 : quantileApprox(metric.mean, metric.sd, 3.8),
    mode: Math.round(metric.mean),
    percentiles: {
      p01: quantileApprox(metric.mean, metric.sd, -2.1),
      p05: quantileApprox(metric.mean, metric.sd, -1.55),
      p10: quantileApprox(metric.mean, metric.sd, -1.2),
      p25: quantileApprox(metric.mean, metric.sd, -0.65),
      p50: Math.round(metric.mean + 0.3),
      p75: quantileApprox(metric.mean, metric.sd, 0.7),
      p90: quantileApprox(metric.mean, metric.sd, 1.25),
      p95: metric.p95,
      p99: metric.p99,
    },
    cvar95: metric.p95 + Math.max(0, metric.sd * 0.7),
    cvar99: metric.p99 + Math.max(0, metric.sd * 0.45),
    skewness: strategyId === "full_clear" ? 0 : 0.18,
    excessKurtosis: strategyId === "full_clear" ? 0 : -0.12,
    meanResets: metric.resets,
    resetP50: Math.round(metric.resets),
    resetP95: strategyId === "full_clear" ? 5 : 13,
    meanMaps: metric.resets + 1,
    meanFragmentOverflow: strategyId === "full_clear" ? 0 : 7.8,
    belowBaselineRate,
    atBaselineRate: strategyId === "full_clear" ? 1 : Math.max(0, 1 - belowBaselineRate - aboveBaselineRate),
    aboveBaselineRate,
    meanSavings: 150 - metric.mean,
    savingsRate: (150 - metric.mean) / 150,
  };
}

function makeConvergence(
  strategyId: string,
  modelId: ModelId,
  episodes: number,
  batchSize: number,
): ConfidencePoint[] {
  const metric = PERFORMANCE[modelId][strategyId];
  if (!metric || episodes <= 0) {
    return [];
  }
  const points: ConfidencePoint[] = [];
  const step = Math.max(batchSize, Math.ceil(episodes / 24 / batchSize) * batchSize);
  for (let n = Math.min(batchSize, episodes); n <= episodes; n += step) {
    const wobble = strategyId === "full_clear" ? 0 : (Math.sin(n / 31_000) * metric.sd) / Math.sqrt(n / 240);
    const mean = metric.mean + wobble;
    const halfWidth = episodes > 0 ? (1.96 * metric.sd) / Math.sqrt(n) : 0;
    points.push({
      episodes: n,
      mean,
      ci95Low: mean - halfWidth,
      ci95High: mean + halfWidth,
      p50: Math.round(mean),
      p90: quantileApprox(mean, metric.sd, 1.25),
      p95: metric.p95,
      p99: metric.p99,
    });
  }
  if (points.at(-1)?.episodes !== episodes) {
    const halfWidth = (1.96 * metric.sd) / Math.sqrt(episodes);
    points.push({
      episodes,
      mean: metric.mean,
      ci95Low: metric.mean - halfWidth,
      ci95High: metric.mean + halfWidth,
      p50: Math.round(metric.mean),
      p90: quantileApprox(metric.mean, metric.sd, 1.25),
      p95: metric.p95,
      p99: metric.p99,
    });
  }
  return points;
}

function makeCountBins(mean: number, episodes: number, min: number, max: number): CountBin[] {
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const weights = values.map((value) => normalWeight(value, mean, Math.max(1.1, (max - min) / 7)));
  const counts = allocateCounts(weights, episodes);
  return values.map((value, index) => ({
    value,
    count: counts[index] ?? 0,
    probability: episodes > 0 ? (counts[index] ?? 0) / episodes : 0,
  }));
}

function makePairedComparison(
  strategyId: string,
  modelId: ModelId,
  episodes: number,
): PairedComparison {
  const metric = PERFORMANCE[modelId][strategyId];
  if (!metric) {
    return {
      key: `${modelId}:${strategyId}:full_clear`,
      candidateStrategyId: strategyId,
      candidateStrategyName: strategyName(strategyId),
      baselineStrategyId: "full_clear",
      baselineStrategyName: "全开基线",
      modelId,
      pairs: 0,
      meanDifference: 0,
      standardError: 0,
      ci95Low: 0,
      ci95High: 0,
      medianDifference: 0,
      winRate: 0,
      tieRate: 0,
      lossRate: 0,
      meanWinMargin: 0,
      meanLossMargin: 0,
      maximumWin: 0,
      maximumLoss: 0,
      p95Difference: 0,
      probabilityAbove150: 0,
      probabilityFiveWorse: 0,
      probabilityFiveBetter: 0,
      probabilityTenBetter: 0,
      probabilityTwentyBetter: 0,
      histogram: [],
    };
  }
  const meanDifference = metric.mean - 150;
  const differences = Array.from({ length: 61 }, (_, index) => -45 + index);
  const weights = differences.map((difference) =>
    normalWeight(difference, meanDifference, Math.max(1, metric.sd)),
  );
  const counts = allocateCounts(weights, episodes);
  const se = episodes > 0 ? metric.sd / Math.sqrt(episodes) : 0;
  const winRate = Math.min(0.99, 0.5 + (150 - metric.mean) / Math.max(8, metric.sd * 3));
  const tieRate = strategyId === "full_clear" ? 1 : 0.04;
  return {
    key: `${modelId}:${strategyId}:full_clear`,
    candidateStrategyId: strategyId,
    candidateStrategyName: strategyName(strategyId),
    baselineStrategyId: "full_clear",
    baselineStrategyName: "全开基线",
    modelId,
    pairs: episodes,
    meanDifference,
    standardError: se,
    ci95Low: meanDifference - 1.96 * se,
    ci95High: meanDifference + 1.96 * se,
    medianDifference: Math.round(meanDifference),
    winRate,
    tieRate,
    lossRate: Math.max(0, 1 - winRate - tieRate),
    meanWinMargin: Math.abs(meanDifference) + 4.2,
    meanLossMargin: 4.8,
    maximumWin: Math.max(0, Math.round(150 - (metric.mean - metric.sd * 3))),
    maximumLoss: Math.max(0, Math.round(metric.mean + metric.sd * 3 - 150)),
    p95Difference: metric.p95 - 150,
    probabilityAbove150: Math.max(0, (metric.p99 - 150) * 0.012),
    probabilityFiveWorse: Math.max(0, (metric.p99 - 155) * 0.004),
    probabilityFiveBetter: Math.min(0.95, winRate * 0.86),
    probabilityTenBetter: Math.min(0.9, winRate * 0.65),
    probabilityTwentyBetter: Math.min(0.7, winRate * 0.28),
    histogram: differences.map((difference, index) => ({
      difference,
      count: counts[index] ?? 0,
      probability: episodes > 0 ? (counts[index] ?? 0) / episodes : 0,
    })),
  };
}

function makeFragmentAcquisition(
  strategyId: string,
  modelId: ModelId,
  episodes: number,
  fragmentValue: 5 | 15 | 30,
): FragmentAcquisitionSeries {
  const performance = PERFORMANCE[modelId][strategyId];
  if (!performance) {
    return {
      key: `${modelId}:${strategyId}:fragment-${fragmentValue}`,
      strategyId,
      strategyName: strategyName(strategyId),
      modelId,
      fragmentValue,
      points: [],
    };
  }
  const meanMaps = performance.resets + 1;
  const factor = fragmentValue === 30 ? 0.79 : fragmentValue === 15 ? 0.72 : 0.68;
  const mean = meanMaps * factor;
  const values = Array.from({ length: 15 }, (_, index) => index);
  const weights = values.map((value) => normalWeight(value, mean, 1.9));
  const counts = allocateCounts(weights, episodes);
  return {
    key: `${modelId}:${strategyId}:fragment-${fragmentValue}`,
    strategyId,
    strategyName: strategyName(strategyId),
    modelId,
    fragmentValue,
    points: values.map((acquisitionCount, index) => ({
      acquisitionCount,
      episodes: counts[index] ?? 0,
      probability: episodes > 0 ? (counts[index] ?? 0) / episodes : 0,
    })),
  };
}

function makePolicyHeatmap(): PolicyDecisionHeatmap {
  const definition = COMPLETE_STRATEGY_DEFINITIONS[0];
  const fragmentStates = definition?.rules.map((rule) => rule.fragmentLabel) ?? [];
  const depths = Array.from({ length: 25 }, (_, index) => index + 1);
  const cells = definition?.rules.flatMap((rule, fragmentStateIndex) =>
    depths.map((depth) => ({
      depth,
      fragmentStateIndex,
      resetProbability:
        rule.action === "reset"
          ? 1
          : rule.action === "continue"
            ? 0
            : depth <= rule.maxDepth
              ? 1
              : 0,
    })),
  ) ?? [];
  return {
    key: "optimized_threshold_v1:base",
    strategyId: "optimized_threshold_v1",
    strategyName: "优化进取阈值 v1",
    resetBand: "基础阈值（分段覆盖前）",
    depths,
    fragmentStates,
    cells,
  };
}

function makeBaselineBenefit(summary: SummaryStats): BaselineBenefit {
  return {
    strategyId: summary.strategyId,
    strategyName: summary.strategyName,
    modelId: summary.modelId,
    meanSavings: summary.meanSavings,
    savingsRate: summary.savingsRate,
    winRate: summary.belowBaselineRate,
    tieRate: summary.atBaselineRate,
    lossRate: summary.aboveBaselineRate,
    aboveBaselineRate: summary.aboveBaselineRate,
  };
}

function performanceFor(modelId: ModelId, strategyId: string) {
  return PERFORMANCE[modelId][strategyId];
}

export function createDemoSnapshot(
  config: SimulationConfig,
  completedEpisodes: number,
  phase: AggregatedSnapshot["phase"] = "idle",
  sequence = 0,
): AggregatedSnapshot {
  const combinations = Math.max(1, config.modelIds.length * config.strategyIds.length);
  const totalEpisodes = config.episodesPerCombination * combinations;
  const cappedCompleted = Math.max(0, Math.min(completedEpisodes, totalEpisodes));
  const perCombinationEpisodes = Math.min(
    config.episodesPerCombination,
    Math.floor(cappedCompleted / combinations),
  );
  const summaries: SummaryStats[] = [];
  const costHistograms: CostHistogramSeries[] = [];
  const distributions: DistributionSeries[] = [];
  const resetHistograms: ResetHistogramSeries[] = [];
  const integerHistograms: IntegerHistogramSeries[] = [];
  const fragmentAcquisitions: FragmentAcquisitionSeries[] = [];
  const sensitivity: SensitivityMetric[] = [];

  for (const modelId of config.modelIds) {
    for (const strategyId of config.strategyIds) {
      const color = STRATEGY_COLORS.get(strategyId) ?? "#27d3c2";
      const summary = makeSummary(strategyId, modelId, perCombinationEpisodes);
      const bins = createCostBins(strategyId, modelId, perCombinationEpisodes);
      const distribution = distributionFromBins(bins);
      const performance = performanceFor(modelId, strategyId);
      summaries.push(summary);
      costHistograms.push({
        key: summary.key,
        strategyId,
        strategyName: summary.strategyName,
        modelId,
        color,
        bins,
      });
      distributions.push({
        key: summary.key,
        strategyId,
        strategyName: summary.strategyName,
        modelId,
        color,
        cdf: distribution.cdf,
        survival: distribution.survival,
      });
      resetHistograms.push({
        key: summary.key,
        strategyId,
        strategyName: summary.strategyName,
        modelId,
        color,
        bins: performance
          ? makeCountBins(performance.resets, perCombinationEpisodes, 0, 13)
          : [],
      });
      integerHistograms.push(
        {
          key: `${summary.key}:maps`,
          strategyId,
          strategyName: summary.strategyName,
          modelId,
          metric: "map-count",
          color,
          bins: performance
            ? makeCountBins(performance.resets + 1, perCombinationEpisodes, 4, 15)
            : [],
        },
        {
          key: `${summary.key}:overflow`,
          strategyId,
          strategyName: summary.strategyName,
          modelId,
          metric: "fragment-overflow",
          color,
          bins: performance
            ? makeCountBins(
                strategyId === "full_clear" ? 0 : 8,
                perCombinationEpisodes,
                0,
                30,
              )
            : [],
        },
      );
      for (const fragmentValue of [5, 15, 30] as const) {
        fragmentAcquisitions.push(
          makeFragmentAcquisition(strategyId, modelId, perCombinationEpisodes, fragmentValue),
        );
      }
      if (performance) {
        sensitivity.push({
          strategyId,
          strategyName: summary.strategyName,
          modelId,
          modelName: summary.modelName,
          mean: summary.mean,
          p95: summary.percentiles.p95,
          p99: summary.percentiles.p99,
          aboveBaselineRate: summary.aboveBaselineRate,
        });
      }
    }
  }

  const primaryStrategies = config.strategyIds.filter((id) => id !== "full_clear");
  const pairedComparisons = config.modelIds.flatMap((modelId) =>
    primaryStrategies.map((strategyId) =>
      makePairedComparison(strategyId, modelId, perCombinationEpisodes),
    ),
  );
  const convergence = config.modelIds.flatMap((modelId) =>
    config.strategyIds.map((strategyId) => ({
      key: `${modelId}:${strategyId}`,
      strategyId,
      strategyName: strategyName(strategyId),
      modelId,
      color: STRATEGY_COLORS.get(strategyId),
      points: makeConvergence(
        strategyId,
        modelId,
        perCombinationEpisodes,
        config.batchSize,
      ),
    })),
  );

  const primaryModel = config.modelIds[0] ?? "M1";
  const primaryStrategy =
    config.strategyIds.find((strategy) => strategy !== "full_clear") ??
    config.strategyIds[0] ??
    "optimized_threshold_v1";
  const costValues = Array.from({ length: 12 }, (_, index) => 105 + index * 5);
  const resetValues = Array.from({ length: 14 }, (_, index) => index);
  const primaryPerformance = performanceFor(primaryModel, primaryStrategy);
  const heatmapCells = costValues.flatMap((cost, x) =>
    resetValues.map((resetCount, y) => ({
      x,
      y,
      value: primaryPerformance
        ? perCombinationEpisodes *
          normalWeight(cost, primaryPerformance.mean, primaryPerformance.sd) *
          normalWeight(resetCount, primaryPerformance.resets, 2.1) *
          0.045
        : 0,
    })),
  );

  const elapsedMs =
    phase === "idle" || cappedCompleted === 0 ? 0 : Math.max(450, (cappedCompleted / 180_000) * 1000);
  const episodesPerSecond = elapsedMs > 0 ? cappedCompleted / (elapsedMs / 1000) : 0;
  const remainingEpisodes = Math.max(0, totalEpisodes - cappedCompleted);
  const totalBatches = Math.ceil(totalEpisodes / Math.max(1, config.batchSize * combinations));

  return {
    schemaVersion: 1,
    runId: "demo-preview",
    sequence,
    generatedAt: new Date().toISOString(),
    provenance: "demo",
    phase,
    config,
    progress: {
      completedEpisodes: cappedCompleted,
      totalEpisodes,
      progress: totalEpisodes > 0 ? cappedCompleted / totalEpisodes : 0,
      currentBatch: Math.ceil(
        cappedCompleted / Math.max(1, config.batchSize * combinations),
      ),
      totalBatches,
      episodesPerSecond,
      elapsedMs,
      estimatedRemainingMs:
        episodesPerSecond > 0 ? (remainingEpisodes / episodesPerSecond) * 1000 : null,
      activeWorkers: phase === "running" ? config.workerCount : 0,
      stageLabel: config.runMode === "formal" ? "正式评估" : config.runMode === "validation" ? "验证" : "探索",
    },
    summaries,
    costHistograms,
    distributions,
    convergence,
    resetHistograms,
    integerHistograms,
    costResetHeatmaps: primaryPerformance
      ? [
          {
            key: `${primaryModel}:${primaryStrategy}:cost-reset`,
            strategyId: primaryStrategy,
            strategyName: strategyName(primaryStrategy),
            modelId: primaryModel,
            costs: costValues,
            resetCounts: resetValues,
            cells: heatmapCells,
          },
        ]
      : [],
    fragmentAcquisitions,
    policyDecisionHeatmaps: [makePolicyHeatmap()],
    pairedComparisons,
    sensitivity,
    baselineBenefits: summaries.map(makeBaselineBenefit),
    strategyDefinitions: COMPLETE_STRATEGY_DEFINITIONS,
    warnings: [
      "当前为界面演示数据，仅用于检查图表与交互；不得用于游戏决策。",
      "M1/M2/M3 均为未获游戏公司证实的假设模型。",
      ...config.strategyIds
        .filter((strategyId) =>
          config.modelIds.some(
            (modelId) => PERFORMANCE[modelId][strategyId] === undefined,
          ),
        )
        .map(
          (strategyId) =>
            `${strategyName(strategyId)}没有预计算演示成绩，当前显示0样本；启动真实模拟后更新。`,
        ),
    ],
  };
}
