/// <reference lib="webworker" />

import { strToU8, zipSync } from "fflate";
import {
  FULL_MAP_YIELD,
  MODEL_DEFINITIONS,
  type EpisodeResult,
  type ModelId,
} from "../domain";
import {
  buildDecisionReport,
  EvaluationAccumulator,
  PairedComparisonAccumulator,
  type ConvergencePoint as ReportConvergencePoint,
  type EvaluationMetadata,
} from "../reports";
import { createEpisodeSimulator } from "../simulation/simulator";
import {
  getStrategyById,
  STRATEGIES,
  type Strategy,
} from "../strategies";
import type {
  AggregatedSnapshot,
  ConfidencePoint,
  ConvergenceSeries,
  CostHistogramSeries,
  DistributionSeries,
  ResetHistogramSeries,
  SensitivityMetric,
  SimulationConfig,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "../ui/workerTypes";
import {
  buildRunProgress,
  countRateAtLeast,
  EXPORTED_FILE_NAMES,
  pairedMetricsToUi,
  serializeExportFiles,
  strategyToUiDefinition,
  summaryMetricsToUi,
  totalCombinationBatches,
} from "./workerAdapter";

const workerScope = self as DedicatedWorkerGlobalScope;
const WORKER_VERSION = "1.0.0";

interface CombinationState {
  readonly key: string;
  readonly model: ModelId;
  readonly strategy: Strategy;
  readonly simulate: (episodeIndex: number) => EpisodeResult;
  readonly accumulator: EvaluationAccumulator;
  readonly costs: Uint16Array;
  readonly convergence: ConfidencePoint[];
  completed: number;
}

interface PairState {
  readonly key: string;
  readonly candidate: CombinationState;
  readonly baseline: CombinationState;
  readonly accumulator: PairedComparisonAccumulator;
  compared: number;
}

interface RunContext {
  readonly runId: string;
  readonly requestId: string;
  readonly config: SimulationConfig;
  readonly combinations: CombinationState[];
  readonly pairs: PairState[];
  readonly startedAt: number;
  readonly totalEpisodes: number;
  readonly totalBatches: number;
  paused: boolean;
  stopped: boolean;
  discarded: boolean;
  sequence: number;
  completedBatches: number;
  completedEpisodes: number;
  lastSnapshot: AggregatedSnapshot | null;
}

let activeRun: RunContext | null = null;
let lastCompletedRun: RunContext | null = null;

function post(message: WorkerToUiMessage): void {
  workerScope.postMessage(message);
}

function delay(milliseconds = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function makeRunId(): string {
  return `mihai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} 必须是正整数。`);
  }
}

function validateConfig(config: SimulationConfig): void {
  if (config.modelIds.length === 0) {
    throw new RangeError("至少选择一个抽奖模型。");
  }
  if (config.strategyIds.length === 0) {
    throw new RangeError("至少选择一个策略。");
  }
  assertPositiveInteger(config.targetFragments, "目标碎片");
  if (!Number.isSafeInteger(config.maxResets) || config.maxResets < 0) {
    throw new RangeError("重置上限必须是非负整数。");
  }
  if (config.maxResets > 13) {
    throw new RangeError("本任务按保险口径最多允许13次重置。");
  }
  const maximumFragments =
    (config.maxResets + 1) * FULL_MAP_YIELD;
  if (config.targetFragments > maximumFragments) {
    throw new RangeError(
      `当前重置上限最多保证获得${maximumFragments}碎片，目标不可达。`,
    );
  }
  assertPositiveInteger(config.episodesPerCombination, "每组合模拟局数");
  assertPositiveInteger(config.batchSize, "更新批次");
  assertPositiveInteger(config.workerCount, "Worker 数量");
  for (const model of config.modelIds) {
    if (!(model in MODEL_DEFINITIONS)) {
      throw new RangeError(`未知模型：${model}`);
    }
  }
  for (const strategyId of config.strategyIds) {
    getStrategyById(strategyId);
  }
}

function createContext(
  requestId: string,
  config: SimulationConfig,
): RunContext {
  validateConfig(config);
  const combinations: CombinationState[] = [];
  for (const model of config.modelIds) {
    for (const strategyId of config.strategyIds) {
      const strategy = getStrategyById(strategyId);
      const key = `${model}:${strategy.id}`;
      combinations.push({
        key,
        model,
        strategy,
        simulate: createEpisodeSimulator({
          masterSeed: config.masterSeed,
          model,
          strategy,
          targetFragments: config.targetFragments,
          maxResets: config.maxResets,
        }),
        accumulator: new EvaluationAccumulator(
          {
            modelId: model,
            strategyId: strategy.id,
            strategyName: strategy.name,
          },
          config.targetFragments,
          config.maxResets,
        ),
        costs: new Uint16Array(config.episodesPerCombination),
        convergence: [],
        completed: 0,
      });
    }
  }

  const pairs: PairState[] = [];
  for (const model of config.modelIds) {
    const modelRuns = combinations.filter((entry) => entry.model === model);
    const baseline =
      modelRuns.find((entry) => entry.strategy.id === "full_clear") ??
      modelRuns[0];
    if (!baseline) continue;
    for (const candidate of modelRuns) {
      if (candidate === baseline) continue;
      pairs.push({
        key: `${model}:${candidate.strategy.id}:vs:${baseline.strategy.id}`,
        candidate,
        baseline,
        accumulator: new PairedComparisonAccumulator(
          candidate.strategy.id,
          baseline.strategy.id,
          model,
        ),
        compared: 0,
      });
    }
  }

  return {
    runId: makeRunId(),
    requestId,
    config,
    combinations,
    pairs,
    startedAt: performance.now(),
    totalEpisodes: config.episodesPerCombination * combinations.length,
    totalBatches: totalCombinationBatches(
      config.episodesPerCombination,
      config.batchSize,
      combinations.length,
    ),
    paused: false,
    stopped: false,
    discarded: false,
    sequence: 0,
    completedBatches: 0,
    completedEpisodes: 0,
    lastSnapshot: null,
  };
}

function updatePairs(context: RunContext): void {
  for (const pair of context.pairs) {
    const available = Math.min(
      pair.candidate.completed,
      pair.baseline.completed,
    );
    while (pair.compared < available) {
      const index = pair.compared;
      pair.accumulator.add(
        pair.candidate.costs[index] ?? 0,
        pair.baseline.costs[index] ?? 0,
      );
      pair.compared += 1;
    }
  }
}

function createSnapshot(
  context: RunContext,
  phase: AggregatedSnapshot["phase"],
): AggregatedSnapshot {
  const now = performance.now();
  const elapsedMs = Math.max(1, now - context.startedAt);
  const summaries = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => entry.accumulator.summary());

  const costHistograms: CostHistogramSeries[] = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => ({
      key: entry.key,
      strategyId: entry.strategy.id,
      strategyName: entry.strategy.name,
      modelId: entry.model,
      bins: entry.accumulator.costBins().map(({ value, count, probability }) => ({
        value,
        count,
        probability,
      })),
    }));

  const distributions: DistributionSeries[] = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => {
      const bins = entry.accumulator.costBins();
      return {
        key: entry.key,
        strategyId: entry.strategy.id,
        strategyName: entry.strategy.name,
        modelId: entry.model,
        cdf: bins.map((bin) => ({
          cost: bin.value,
          probability: bin.cdf,
        })),
        survival: bins.map((bin) => ({
          cost: bin.value,
          probability: bin.survival,
        })),
      };
    });

  const convergence: ConvergenceSeries[] = context.combinations
    .filter((entry) => entry.convergence.length > 0)
    .map((entry) => ({
      key: entry.key,
      strategyId: entry.strategy.id,
      strategyName: entry.strategy.name,
      modelId: entry.model,
      points: entry.convergence,
    }));

  const resetHistograms: ResetHistogramSeries[] = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => ({
      key: entry.key,
      strategyId: entry.strategy.id,
      strategyName: entry.strategy.name,
      modelId: entry.model,
      bins: entry.accumulator.resetBins().map(({ value, count }) => ({
        value,
        count,
        probability: count / entry.completed,
      })),
    }));

  const integerHistograms = context.combinations
    .filter((entry) => entry.completed > 0)
    .flatMap((entry) => [
      {
        key: `${entry.key}:map-count`,
        strategyId: entry.strategy.id,
        strategyName: entry.strategy.name,
        modelId: entry.model,
        metric: "map-count" as const,
        bins: entry.accumulator.mapCountBins().map(({ value, count }) => ({
          value,
          count,
          probability: count / entry.completed,
        })),
      },
      {
        key: `${entry.key}:fragment-overflow`,
        strategyId: entry.strategy.id,
        strategyName: entry.strategy.name,
        modelId: entry.model,
        metric: "fragment-overflow" as const,
        bins: entry.accumulator.overflowBins().map(({ value, count }) => ({
          value,
          count,
          probability: count / entry.completed,
        })),
      },
    ]);

  const costResetHeatmaps = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => {
      const parsed = entry.accumulator
        .costResetBins()
        .map(({ x, y, count }) => ({ x, y, value: count }));
      return {
        key: entry.key,
        strategyId: entry.strategy.id,
        strategyName: entry.strategy.name,
        modelId: entry.model,
        costs: [...new Set(parsed.map((cell) => cell.x))].sort(
          (left, right) => left - right,
        ),
        resetCounts: [...new Set(parsed.map((cell) => cell.y))].sort(
          (left, right) => left - right,
        ),
        cells: parsed,
      };
    });

  const fragmentAcquisitions = context.combinations
    .filter((entry) => entry.completed > 0)
    .flatMap((entry) =>
      ([5, 15, 30] as const).map((fragmentValue) => ({
        key: `${entry.key}:fragment-${fragmentValue}`,
        strategyId: entry.strategy.id,
        strategyName: entry.strategy.name,
        modelId: entry.model,
        fragmentValue,
        points: entry.accumulator.fragmentBins(fragmentValue).map((bin) => ({
          acquisitionCount: bin.value,
          episodes: bin.count,
          probability: bin.count / entry.completed,
        })),
      })),
    );

  const policyDecisionHeatmaps = context.combinations
    .map((entry) => entry.strategy)
    .filter(
      (strategy, index, all) =>
        all.findIndex((candidate) => candidate.id === strategy.id) === index,
    )
    .flatMap((strategy) => {
      const definition = strategyToUiDefinition(strategy);
      if (definition.rules.length === 0) return [];
      const depths = Array.from({ length: 25 }, (_, index) => index + 1);
      const sections =
        definition.ruleSections?.length
          ? definition.ruleSections
          : [
              {
                title: "固定阈值（可完成性护栏前）",
                rules: definition.rules,
              },
            ];
      return sections.map((section, sectionIndex) => ({
          key: `${strategy.id}:${sectionIndex}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          resetBand: section.title,
          depths,
          fragmentStates: section.rules.map(
            (rule) => rule.fragmentLabel,
          ),
          cells: section.rules.flatMap((rule, fragmentStateIndex) =>
            depths.map((depth) => ({
              depth,
              fragmentStateIndex,
              resetProbability:
                rule.maxDepth > 0 && depth <= rule.maxDepth ? 1 : 0,
            })),
          ),
        }));
    });

  const pairedComparisons = context.pairs
    .filter((pair) => pair.compared > 0)
    .map((pair) => {
      const summary = pair.accumulator.summary();
      return pairedMetricsToUi({
        key: pair.key,
        summary,
        candidateName: pair.candidate.strategy.name,
        baselineName: pair.baseline.strategy.name,
        differenceHistogram: pair.accumulator.differenceHistogram,
      });
    });

  const sensitivity: SensitivityMetric[] = summaries.map((summary) => ({
    strategyId: summary.strategyId,
    strategyName: summary.strategyName,
    modelId: summary.modelId,
    modelName: MODEL_DEFINITIONS[summary.modelId].name,
    mean: summary.mean,
    p95: summary.p95,
    p99: summary.p99,
    aboveBaselineRate: summary.probabilityGt150,
  }));

  const baselineBenefits = pairedComparisons.map((comparison) => {
    const summary = summaries.find(
      (candidate) =>
        candidate.modelId === comparison.modelId &&
        candidate.strategyId === comparison.candidateStrategyId,
    );
    return {
      strategyId: comparison.candidateStrategyId,
      strategyName: comparison.candidateStrategyName,
      modelId: comparison.modelId,
      meanSavings: summary?.meanSavingsVs150 ?? -comparison.meanDifference,
      savingsRate: (summary?.meanSavingsPercentVs150 ?? 0) / 100,
      winRate: comparison.winRate,
      tieRate: comparison.tieRate,
      lossRate: comparison.lossRate,
      aboveBaselineRate: comparison.probabilityAbove150,
    };
  });

  context.sequence += 1;
  const snapshot: AggregatedSnapshot = {
    schemaVersion: 1,
    runId: context.runId,
    sequence: context.sequence,
    generatedAt: new Date().toISOString(),
    provenance: "live",
    phase,
    config: context.config,
    progress: buildRunProgress({
      completedEpisodes: context.completedEpisodes,
      totalEpisodes: context.totalEpisodes,
      completedBatches: context.completedBatches,
      totalBatches: context.totalBatches,
      elapsedMs,
      phase,
      runMode: context.config.runMode,
    }),
    summaries: summaries.map(summaryMetricsToUi),
    costHistograms,
    distributions,
    convergence,
    resetHistograms,
    integerHistograms,
    costResetHeatmaps,
    fragmentAcquisitions,
    policyDecisionHeatmaps,
    pairedComparisons,
    sensitivity,
    baselineBenefits,
    strategyDefinitions: context.combinations
      .map((entry) => entry.strategy)
      .filter(
        (strategy, index, all) =>
          all.findIndex((candidate) => candidate.id === strategy.id) === index,
      )
      .map(strategyToUiDefinition),
    warnings: [
      "M1、M2、M3均为假设模型，结果不能证明游戏公司的内部抽取算法。",
      ...(context.config.workerCount > 1
        ? [
            `当前版本由1个后台模拟 Worker 确定性执行；配置中的 ${context.config.workerCount} 个 Worker 仅保留为后续并行扩展参数。`,
          ]
        : []),
      ...(context.config.runMode !== "formal"
        ? ["当前不是独立正式评估，结果可用于探索但不应单独作为最终结论。"]
        : []),
    ],
  };
  context.lastSnapshot = snapshot;
  return snapshot;
}

async function run(context: RunContext): Promise<void> {
  post({
    type: "status",
    runId: context.runId,
    phase: "running",
    message: "模拟核心已启动，图表将在每个批次后更新。",
  });

  try {
    while (!context.stopped) {
      let progressed = false;
      for (const combination of context.combinations) {
        if (context.stopped) break;
        while (context.paused && !context.stopped) {
          await delay(40);
        }
        if (context.stopped) break;
        if (combination.completed >= context.config.episodesPerCombination) {
          continue;
        }
        progressed = true;
        const start = combination.completed;
        const end = Math.min(
          context.config.episodesPerCombination,
          start + context.config.batchSize,
        );
        for (let episodeIndex = start; episodeIndex < end; episodeIndex += 1) {
          const result = combination.simulate(episodeIndex);
          if (!result.success) {
            throw new Error(
              `${combination.key} 第${episodeIndex}局未能完成：${result.failureReason ?? "unknown"}`,
            );
          }
          combination.accumulator.add(result);
          combination.costs[episodeIndex] = result.cost;
        }
        const added = end - start;
        combination.completed = end;
        context.completedEpisodes += added;
        context.completedBatches += 1;
        const point: ReportConvergencePoint =
          combination.accumulator.convergencePoint();
        combination.convergence.push({
          episodes: point.episodes,
          mean: point.mean,
          ci95Low: point.ci95Low,
          ci95High: point.ci95High,
          p50: point.p50,
          p90: point.p90,
          p95: point.p95,
          p99: point.p99,
        });
        updatePairs(context);
        post({
          type: "snapshot",
          snapshot: createSnapshot(context, "running"),
        });
        // Give pause/stop messages and the browser event loop a chance to run.
        await delay(0);
      }
      if (!progressed) break;
    }

    if (context.stopped) {
      if (context.discarded) {
        post({
          type: "status",
          runId: context.runId,
          phase: "stopped",
          message: "模拟及其聚合结果已清空。",
        });
        return;
      }
      post({
        type: "status",
        runId: context.runId,
        phase: "stopped",
        message: "模拟已停止，当前聚合结果仍可导出。",
      });
      const snapshot = createSnapshot(context, "stopped");
      post({ type: "snapshot", snapshot });
      lastCompletedRun = context;
      return;
    }

    const snapshot = createSnapshot(context, "completed");
    lastCompletedRun = context;
    post({ type: "complete", snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({
      type: "error",
      requestId: context.requestId,
      runId: context.runId,
      code: "SIMULATION_FAILED",
      message,
      recoverable: true,
    });
  } finally {
    if (activeRun === context) activeRun = null;
  }
}

function metadataFor(context: RunContext): EvaluationMetadata {
  return {
    generatedAt: new Date().toISOString(),
    runKind:
      context.config.runMode === "formal"
        ? "formal-test"
        : context.config.runMode === "validation"
          ? "validation"
          : "training",
    masterSeed: context.config.masterSeed,
    prng: "mulberry32-v1 + deterministic episode/map/model seed derivation",
    episodesPerStrategyModel: context.config.episodesPerCombination,
    batchSize: context.config.batchSize,
    targetFragments: context.config.targetFragments,
    maxResets: context.config.maxResets,
    models: context.config.modelIds,
    strategies: context.config.strategyIds,
    applicationVersion: WORKER_VERSION,
    runtime: "Web Worker",
    elapsedMilliseconds: performance.now() - context.startedAt,
  };
}

function buildExportFiles(context: RunContext): Record<string, string> {
  const snapshot =
    context.lastSnapshot ?? createSnapshot(context, "stopped");
  const summaries = context.combinations
    .filter((entry) => entry.completed > 0)
    .map((entry) => entry.accumulator.summary());
  const comparisons = context.pairs
    .filter((pair) => pair.compared > 0)
    .map((pair) => pair.accumulator.summary());
  const metadata = metadataFor(context);
  const policies = context.combinations
    .map((entry) => entry.strategy)
    .filter(
      (strategy, index, all) =>
        all.findIndex((candidate) => candidate.id === strategy.id) === index,
    )
    .map((strategy) => {
      const uiDefinition = strategyToUiDefinition(strategy);
      const schedules =
        uiDefinition.ruleSections
          ?.map(
            (section) =>
              `${section.title}：${section.rules
                .map((rule) => rule.maxDepth)
                .join("/")}`,
          )
          .join("；") ?? "";
      return {
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        kind: strategy.kind,
        parameters: strategy.definition,
        playerRule: [
          uiDefinition.trigger,
          schedules,
          uiDefinition.guardDescription,
        ]
          .filter(Boolean)
          .join("；"),
      };
    });

  const summaryRows = summaries.map((summary) => ({
    model: summary.modelId,
    strategy: summary.strategyId,
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
    min: summary.min,
    mode: summary.mode,
    p01: summary.p01,
    p05: summary.p05,
    p10: summary.p10,
    p25: summary.p25,
    p50: summary.p50,
    p75: summary.p75,
    p90: summary.p90,
    p95: summary.p95,
    p99: summary.p99,
    max: summary.max,
    cvar95: summary.cvar95,
    cvar99: summary.cvar99,
    skewness: summary.skewness,
    excessKurtosis: summary.excessKurtosis,
    meanResets: summary.meanResets,
    resetP50: summary.resetP50,
    resetP95: summary.resetP95,
    probabilityAllResetsUsed: summary.probabilityAllResetsUsed,
    meanMaps: summary.meanMaps,
    meanOverflow: summary.meanOverflow,
    probabilityLt120: summary.probabilityLt120,
    probabilityLt130: summary.probabilityLt130,
    probabilityLt140: summary.probabilityLt140,
    probabilityLt150: summary.probabilityLt150,
    probabilityEq150: summary.probabilityEq150,
    probabilityGt150: summary.probabilityGt150,
    probabilityGt155: summary.probabilityGt155,
    probabilityGt160: summary.probabilityGt160,
    meanSavingsVs150: summary.meanSavingsVs150,
    meanSavingsPercentVs150: summary.meanSavingsPercentVs150,
    meanFragment5Awards: summary.fragmentAverages.fragment5,
    meanFragment15Awards: summary.fragmentAverages.fragment15,
    meanFragment30Awards: summary.fragmentAverages.fragment30,
  }));
  const costRows = context.combinations.flatMap((entry) =>
    entry.accumulator.costBins().map((bin) => ({
      model: entry.model,
      strategy: entry.strategy.id,
      cost: bin.value,
      count: bin.count,
      probability: bin.probability,
      cdf: bin.cdf,
      survival: bin.survival,
    })),
  );
  const resetRows = context.combinations.flatMap((entry) =>
    entry.accumulator.resetBins().map((bin) => ({
      model: entry.model,
      strategy: entry.strategy.id,
      resets: bin.value,
      count: bin.count,
      probability: bin.count / Math.max(1, entry.completed),
    })),
  );
  const mapRows = context.combinations.flatMap((entry) =>
    entry.accumulator.mapCountBins().map((bin) => ({
      model: entry.model,
      strategy: entry.strategy.id,
      maps: bin.value,
      count: bin.count,
      probability: bin.count / Math.max(1, entry.completed),
    })),
  );
  const fragmentRows = context.combinations.flatMap((entry) =>
    ([5, 15, 30] as const).flatMap((fragment) =>
      entry.accumulator.fragmentBins(fragment).map((bin) => ({
        model: entry.model,
        strategy: entry.strategy.id,
        fragment,
        awards: bin.value,
        count: bin.count,
        probability: bin.count / Math.max(1, entry.completed),
      })),
    ),
  );
  const convergenceRows = context.combinations.flatMap((entry) =>
    entry.convergence.map((point) => ({
      model: entry.model,
      strategy: entry.strategy.id,
      ...point,
    })),
  );
  const comparisonRows = context.pairs
    .filter((pair) => pair.compared > 0)
    .map((pair) => ({
      ...pair.accumulator.summary(),
      probabilityWorseByAtLeast5: countRateAtLeast(
        pair.accumulator.differenceHistogram,
        5,
        pair.compared,
      ),
    }));
  const dataFiles = [...EXPORTED_FILE_NAMES];
  const report = buildDecisionReport({
    metadata,
    summaries,
    comparisons,
    policies,
    dataFiles,
  });
  return serializeExportFiles({
    metadata,
    summaries,
    policies,
    modelDefinitions: context.config.modelIds.map(
      (id) => MODEL_DEFINITIONS[id],
    ),
    snapshot,
    rows: {
      summary: summaryRows,
      cost: costRows,
      cdf: costRows.map(({ model, strategy, cost, cdf, survival }) => ({
        model,
        strategy,
        cost,
        cdf,
        survival,
      })),
      reset: resetRows,
      mapCount: mapRows,
      fragmentAcquisition: fragmentRows,
      pairedComparison: comparisonRows,
      convergence: convergenceRows,
    },
    report,
  });
}

function handleExport(
  message: Extract<UiToWorkerMessage, { type: "export" }>,
): void {
  const context =
    activeRun?.runId === message.runId
      ? activeRun
      : lastCompletedRun?.runId === message.runId
        ? lastCompletedRun
        : null;
  if (!context) {
    post({
      type: "error",
      requestId: message.requestId,
      runId: message.runId,
      code: "RUN_NOT_FOUND",
      message: "没有找到可导出的运行。",
      recoverable: true,
    });
    return;
  }
  const files = buildExportFiles(context);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (message.format === "json") {
    post({
      type: "export-ready",
      requestId: message.requestId,
      runId: context.runId,
      filename: `mihai-${timestamp}.json`,
      mimeType: "application/json;charset=utf-8",
      payload: files["snapshot.json"] ?? "{}",
    });
    return;
  }
  if (message.format === "csv") {
    post({
      type: "export-ready",
      requestId: message.requestId,
      runId: context.runId,
      filename: `mihai-summary-${timestamp}.csv`,
      mimeType: "text/csv;charset=utf-8",
      payload: files["summary.csv"] ?? "",
    });
    return;
  }
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
    ),
    { level: 6 },
  );
  post({
    type: "export-ready",
    requestId: message.requestId,
    runId: context.runId,
    filename: `mihai-results-${timestamp}.zip`,
    mimeType: "application/zip",
    payload: zipped,
  });
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<UiToWorkerMessage>) => {
    const message = event.data;
    if (message.type === "start") {
      if (activeRun) {
        post({
          type: "error",
          requestId: message.requestId,
          runId: activeRun.runId,
          code: "RUN_ALREADY_ACTIVE",
          message: "已有模拟正在运行，请先停止或等待完成。",
          recoverable: true,
        });
        return;
      }
      try {
        const context = createContext(message.requestId, message.config);
        activeRun = context;
        post({
          type: "status",
          runId: context.runId,
          phase: "starting",
          message: "正在初始化确定性地图流与统计器。",
        });
        void run(context);
      } catch (error) {
        post({
          type: "error",
          requestId: message.requestId,
          code: "INVALID_CONFIG",
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
      return;
    }

    if (message.type === "pause") {
      if (activeRun?.runId === message.runId) {
        activeRun.paused = true;
        post({
          type: "status",
          runId: activeRun.runId,
          phase: "paused",
          message: "已在当前批次边界暂停。",
        });
      }
      return;
    }

    if (message.type === "resume") {
      if (activeRun?.runId === message.runId) {
        activeRun.paused = false;
        post({
          type: "status",
          runId: activeRun.runId,
          phase: "running",
          message: "模拟已继续。",
        });
      }
      return;
    }

    if (message.type === "stop") {
      if (activeRun?.runId === message.runId) {
        activeRun.stopped = true;
        activeRun.paused = false;
      }
      return;
    }

    if (message.type === "reset") {
      if (activeRun) {
        activeRun.stopped = true;
        activeRun.paused = false;
        activeRun.discarded = true;
      }
      lastCompletedRun = null;
      return;
    }

    if (message.type === "export") {
      try {
        handleExport(message);
      } catch (error) {
        post({
          type: "error",
          requestId: message.requestId,
          runId: message.runId,
          code: "EXPORT_FAILED",
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
    }
  },
);

post({ type: "ready", workerVersion: WORKER_VERSION, workerCount: 1 });

// Keep the complete registry discoverable in development builds.
void STRATEGIES;
