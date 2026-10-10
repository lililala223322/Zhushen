import { MODEL_DEFINITIONS } from "../domain";
import {
  rowsToCsv,
  type CsvRow,
  type EvaluationMetadata,
  type PairedComparisonMetrics,
  type SummaryMetrics,
} from "../reports";
import type { Strategy } from "../strategies";
import type {
  AggregatedSnapshot,
  PairedComparison,
  RunPhase,
  RunProgress,
  SimulationConfig,
  StrategyDefinition,
  StrategyRuleRow,
  StrategyRuleSection,
  SummaryStats,
} from "../ui/workerTypes";

export function summaryMetricsToUi(summary: SummaryMetrics): SummaryStats {
  return {
    key: `${summary.modelId}:${summary.strategyId}`,
    strategyId: summary.strategyId,
    strategyName: summary.strategyName,
    modelId: summary.modelId,
    modelName: MODEL_DEFINITIONS[summary.modelId].name,
    episodes: summary.episodes,
    successes: summary.successes,
    failures: summary.failures,
    failureRate: summary.failureRate,
    mean: summary.mean,
    standardError: summary.standardError,
    ci95Low: summary.ci95Low,
    ci95High: summary.ci95High,
    standardDeviation: summary.standardDeviation,
    variance: summary.variance,
    minimum: summary.min,
    maximum: summary.max,
    mode: summary.mode,
    percentiles: {
      p01: summary.p01,
      p05: summary.p05,
      p10: summary.p10,
      p25: summary.p25,
      p50: summary.p50,
      p75: summary.p75,
      p90: summary.p90,
      p95: summary.p95,
      p99: summary.p99,
    },
    cvar95: summary.cvar95,
    cvar99: summary.cvar99,
    skewness: summary.skewness,
    excessKurtosis: summary.excessKurtosis,
    meanResets: summary.meanResets,
    resetP50: summary.resetP50,
    resetP95: summary.resetP95,
    meanMaps: summary.meanMaps,
    meanFragmentOverflow: summary.meanOverflow,
    belowBaselineRate: summary.probabilityLt150,
    atBaselineRate: summary.probabilityEq150,
    aboveBaselineRate: summary.probabilityGt150,
    meanSavings: summary.meanSavingsVs150,
    // Report metrics deliberately store this field in percentage points; the
    // UI protocol consistently stores rates in [0, 1].
    savingsRate: summary.meanSavingsPercentVs150 / 100,
  };
}

const FRAGMENT_STATE_LABELS = [
  "尚未取得碎片",
  "只有5",
  "只有15",
  "5和15",
  "只有30",
  "5和30",
  "15和30",
  "5、15、30全部取得",
];

function thresholdsToRules(
  thresholds: readonly number[] | undefined,
): StrategyRuleRow[] {
  return (
    thresholds?.map((maxDepth, fragmentMask) => ({
      fragmentMask,
      fragmentLabel:
        FRAGMENT_STATE_LABELS[fragmentMask] ?? `状态${fragmentMask}`,
      maxDepth,
      action:
        maxDepth === 0
          ? ("continue" as const)
          : maxDepth === 25
            ? ("reset" as const)
            : ("consider-reset" as const),
      note:
        maxDepth === 0
          ? "不主动重置"
          : maxDepth === 25
            ? "任意深度满足后请求重置"
            : `在第${maxDepth}格以内满足时请求重置`,
    })) ?? []
  );
}

function thresholdSections(
  definition: Readonly<Record<string, unknown>> | undefined,
): StrategyRuleSection[] {
  if (!definition) return [];
  const base = definition["thresholds"] as readonly number[] | undefined;
  const resetBands = definition["resetBands"] as
    | ReadonlyArray<{
        min: number;
        max: number;
        thresholds: readonly number[];
      }>
    | undefined;
  const deficitBands = definition["deficitBands"] as
    | ReadonlyArray<{
        min: number;
        max: number;
        thresholds: readonly number[];
      }>
    | undefined;
  const sections: StrategyRuleSection[] = [];
  if (base) {
    sections.push({
      title: "基础阈值（兜底）",
      description:
        resetBands?.length || deficitBands?.length
          ? "分段没有命中时才使用。"
          : "固定阈值，不按重置数或目标缺口变化。",
      rules: thresholdsToRules(base),
    });
  }
  for (const band of resetBands ?? []) {
    sections.push({
      title: `剩余重置 ${band.min}–${band.max} 次`,
      rules: thresholdsToRules(band.thresholds),
    });
  }
  for (const band of deficitBands ?? []) {
    sections.push({
      title: `距目标 ${band.min}–${band.max} 碎片（最高优先级）`,
      description: "命中时覆盖剩余重置分段与基础阈值。",
      rules: thresholdsToRules(band.thresholds),
    });
  }
  return sections;
}

export function strategyToUiDefinition(
  strategy: Strategy,
): StrategyDefinition {
  const baseDefinition =
    strategy.kind === "conservative_wrapper"
      ? (strategy.definition["baseStrategyDefinition"] as
          | Readonly<Record<string, unknown>>
          | undefined)
      : strategy.definition;
  const rawThresholds = baseDefinition?.["thresholds"] as
    | readonly number[]
    | undefined;
  const rules = thresholdsToRules(rawThresholds);
  const ruleSections = thresholdSections(baseDefinition);
  const kind =
    strategy.kind === "threshold" || strategy.kind === "expected_gain"
      ? "aggressive"
      : strategy.kind === "conservative_wrapper"
        ? "conservative"
        : "baseline";
  let trigger = strategy.description;
  let logic = "固定基线";
  let details: string[] = [];
  if (strategy.kind === "expected_gain") {
    const gapAware = strategy.definition["gapAware"] === true;
    const resetPremium = Number(
      strategy.definition["resetPremium"] ?? 0,
    );
    trigger =
      "逐步计算当前剩余奖池与全新地图的下一抽期望有效碎片；全新地图严格更高时请求重置。";
    logic = "一步期望收益";
    details = [
      "概率随所选M1/M2/M3模型和完整剩余库存实时更新。",
      gapAware
        ? "临近600时，每种抽取结果只计算不超过当前缺口的有效碎片。"
        : "按原始碎片收益计算，不截断超过目标的部分。",
      `新地图优势必须超过 ${resetPremium.toFixed(3)} 碎片/次；平局继续。`,
      "这是短视贪心基线，不包含未来多步价值或重置名额的影子价格。",
    ];
  } else if (strategy.kind === "threshold") {
    trigger =
      ruleSections.length > 1
        ? "按本图碎片状态与深度查阈值；剩余重置次数分段会覆盖基础阈值，距目标缺口分段拥有最高优先级。"
        : "按本图碎片状态与深度查固定阈值，当前深度不超过阈值时请求重置。";
    logic = ruleSections.length > 1 ? "分段阈值" : "固定阈值";
    details = ruleSections.map((section) => {
      const vector = section.rules.map((rule) => rule.maxDepth).join(" / ");
      return `${section.title}：${vector}`;
    });
  } else if (strategy.kind === "conservative_wrapper") {
    const hardCostLimit = Number(strategy.definition["hardCostLimit"] ?? 150);
    trigger = `先按基础策略提出重置请求；只有最坏合法抽取顺序下总操作仍不超过${hardCostLimit}时，才真正重置。`;
    logic = `${hardCostLimit}硬上限`;
    details = [
      `基础策略：${String(strategy.definition["baseStrategyId"] ?? "未知")}`,
      ...ruleSections.map((section) => {
        const vector = section.rules.map((rule) => rule.maxDepth).join(" / ");
        return `${section.title}：${vector}`;
      }),
    ];
  } else if (strategy.kind === "fragment_baseline") {
    const mode =
      strategy.definition["mode"] === "any" ? ("any" as const) : ("all" as const);
    const fragments = (
      strategy.definition["fragments"] as readonly number[] | undefined
    ) ?? [];
    const joined = fragments.join(mode === "all" ? "和" : "或");
    trigger =
      mode === "all"
        ? `同一张地图取得全部指定碎片（${joined}）后请求重置，取得顺序不限。`
        : `同一张地图取得指定碎片（${joined}）中的任意一种后请求重置。`;
    logic = mode === "all" ? "AND·全部满足" : "OR·任一满足";
    details = [
      mode === "all"
        ? "缺少任意一个指定碎片都不会触发。"
        : "不需要全部取得，任意一个首次出现即可触发。",
    ];
  } else {
    trigger = "不主动提前重置；每张地图25格全部打开后再进入下一张图。";
    logic = "固定全开";
    details = ["从0到600固定打开6张完整地图，共150次操作1。"];
  }
  const definition: StrategyDefinition = {
    id: strategy.id,
    name: strategy.name,
    shortName:
      strategy.id === "optimized_threshold_v1"
        ? "优化进取"
        : strategy.id === "expected_gain_greedy_gap"
          ? "一步期望G0"
        : strategy.id === "optimized_conservative_150"
          ? "优化保守"
          : strategy.id === "aggressive_threshold"
            ? "初始进取"
            : strategy.id === "conservative_150"
              ? "初始保守"
              : strategy.name,
    kind,
    logic,
    trigger,
    details,
    summary: `${trigger} ${strategy.description}`,
    caveat:
      kind === "aggressive"
        ? "以期望成本最低为主，少数结果可能超过150次。"
        : kind === "conservative"
          ? "目标为600碎片时，以150次硬上限换取略高的平均成本。"
          : "用于比较的基准策略。",
    rules,
    ruleSections,
    guardDescription:
      "所有主动重置都经过可完成性护栏；若剩余完整地图理论收益不足以达到目标，则继续打开。",
  };
  return definition;
}

export interface ProgressInput {
  readonly completedEpisodes: number;
  readonly totalEpisodes: number;
  readonly completedBatches: number;
  readonly totalBatches: number;
  readonly elapsedMs: number;
  readonly phase: RunPhase;
  readonly runMode: SimulationConfig["runMode"];
}

export function totalCombinationBatches(
  episodesPerCombination: number,
  batchSize: number,
  combinations: number,
): number {
  if (
    !Number.isSafeInteger(episodesPerCombination) ||
    episodesPerCombination <= 0 ||
    !Number.isSafeInteger(batchSize) ||
    batchSize <= 0 ||
    !Number.isSafeInteger(combinations) ||
    combinations < 0
  ) {
    throw new RangeError("Batch inputs must be valid safe integers.");
  }
  return Math.ceil(episodesPerCombination / batchSize) * combinations;
}

export function buildRunProgress(input: ProgressInput): RunProgress {
  const elapsedMs = Math.max(1, input.elapsedMs);
  const rate = input.completedEpisodes / (elapsedMs / 1_000);
  const remaining = Math.max(
    0,
    input.totalEpisodes - input.completedEpisodes,
  );
  return {
    completedEpisodes: input.completedEpisodes,
    totalEpisodes: input.totalEpisodes,
    progress:
      input.totalEpisodes === 0
        ? 0
        : input.completedEpisodes / input.totalEpisodes,
    currentBatch: Math.min(input.completedBatches, input.totalBatches),
    totalBatches: input.totalBatches,
    episodesPerSecond: rate,
    elapsedMs,
    estimatedRemainingMs:
      rate > 0 && remaining > 0 ? (remaining / rate) * 1_000 : null,
    activeWorkers: input.phase === "running" ? 1 : 0,
    stageLabel:
      input.runMode === "formal"
        ? "独立正式评估"
        : input.runMode === "validation"
          ? "验证集评估"
          : "探索模拟",
  };
}

export function countRateAtLeast(
  histogram: ReadonlyMap<number, number>,
  threshold: number,
  total: number,
): number {
  if (total <= 0) return 0;
  let count = 0;
  for (const [value, frequency] of histogram) {
    if (value >= threshold) count += frequency;
  }
  return count / total;
}

export interface PairedUiInput {
  readonly key: string;
  readonly summary: PairedComparisonMetrics;
  readonly candidateName: string;
  readonly baselineName: string;
  readonly differenceHistogram: ReadonlyMap<number, number>;
}

export function pairedMetricsToUi(input: PairedUiInput): PairedComparison {
  const { summary } = input;
  const total = summary.episodes;
  return {
    key: input.key,
    candidateStrategyId: summary.candidateStrategyId,
    candidateStrategyName: input.candidateName,
    baselineStrategyId: summary.baselineStrategyId,
    baselineStrategyName: input.baselineName,
    modelId: summary.modelId,
    pairs: total,
    meanDifference: summary.meanDifference,
    standardError: summary.standardError,
    ci95Low: summary.ci95Low,
    ci95High: summary.ci95High,
    medianDifference: summary.medianDifference,
    winRate: summary.winRate,
    tieRate: summary.tieRate,
    lossRate: summary.lossRate,
    meanWinMargin: summary.meanWinningMargin,
    meanLossMargin: summary.meanLosingMargin,
    maximumWin: summary.maxObservedSaving,
    maximumLoss: summary.maxObservedLoss,
    p95Difference: summary.p95Difference,
    probabilityAbove150: summary.probabilityCostGt150,
    probabilityFiveWorse: countRateAtLeast(
      input.differenceHistogram,
      5,
      total,
    ),
    probabilityFiveBetter: summary.probabilityBetterByAtLeast5,
    probabilityTenBetter: summary.probabilityBetterByAtLeast10,
    probabilityTwentyBetter: summary.probabilityBetterByAtLeast20,
    histogram: [...input.differenceHistogram.entries()]
      .sort(([left], [right]) => left - right)
      .map(([difference, count]) => ({
        difference,
        count,
        probability: total === 0 ? 0 : count / total,
      })),
  };
}

export interface ExportRows {
  readonly summary: readonly CsvRow[];
  readonly cost: readonly CsvRow[];
  readonly cdf: readonly CsvRow[];
  readonly reset: readonly CsvRow[];
  readonly mapCount: readonly CsvRow[];
  readonly fragmentAcquisition: readonly CsvRow[];
  readonly pairedComparison: readonly CsvRow[];
  readonly convergence: readonly CsvRow[];
}

export interface ExportSerializationInput {
  readonly metadata: EvaluationMetadata;
  readonly summaries: readonly SummaryMetrics[];
  readonly policies: readonly unknown[];
  readonly modelDefinitions: readonly unknown[];
  readonly snapshot: AggregatedSnapshot;
  readonly rows: ExportRows;
  readonly report: string;
}

export const EXPORTED_FILE_NAMES = Object.freeze([
  "run-metadata.json",
  "summary.csv",
  "summary.json",
  "cost-histogram.csv",
  "cdf.csv",
  "reset-histogram.csv",
  "map-count-histogram.csv",
  "fragment-acquisition.csv",
  "paired-comparisons.csv",
  "convergence.csv",
  "policy-definition.json",
  "model-definition.json",
  "snapshot.json",
  "report.md",
]);

/** Pure, deterministic serialization before timestamping/zipping. */
export function serializeExportFiles(
  input: ExportSerializationInput,
): Record<string, string> {
  return {
    "run-metadata.json": JSON.stringify(input.metadata, null, 2),
    "summary.csv": rowsToCsv(input.rows.summary),
    "summary.json": JSON.stringify(input.summaries, null, 2),
    "cost-histogram.csv": rowsToCsv(input.rows.cost),
    "cdf.csv": rowsToCsv(input.rows.cdf),
    "reset-histogram.csv": rowsToCsv(input.rows.reset),
    "map-count-histogram.csv": rowsToCsv(input.rows.mapCount),
    "fragment-acquisition.csv": rowsToCsv(
      input.rows.fragmentAcquisition,
    ),
    "paired-comparisons.csv": rowsToCsv(input.rows.pairedComparison),
    "convergence.csv": rowsToCsv(input.rows.convergence),
    "policy-definition.json": JSON.stringify(input.policies, null, 2),
    "model-definition.json": JSON.stringify(
      input.modelDefinitions,
      null,
      2,
    ),
    "snapshot.json": JSON.stringify(input.snapshot, null, 2),
    "report.md": input.report,
  };
}
