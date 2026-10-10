/// <reference lib="webworker" />

import { strToU8, zipSync } from "fflate";
import { MODEL_DEFINITIONS, type ModelId } from "../domain";
import {
  FixedHorizonExamAccumulator,
  FixedHorizonPairAccumulator,
} from "../exam/accumulator";
import {
  DEFAULT_FIXED_HORIZON_STRATEGY_IDS,
  FIXED_HORIZON_EXAM_STRATEGY_BY_ID,
  FIXED_HORIZON_WRAPPER_ALIASES,
} from "../exam/catalog";
import {
  FIXED_HORIZON_CHECKPOINT_START,
  FIXED_HORIZON_MAX_RESETS,
  FIXED_HORIZON_OPERATIONS,
  simulateFixedHorizonEpisode,
  type FixedHorizonCoreStrategyId,
  type FixedHorizonEpisodeResult,
} from "../exam/fixedHorizon";
import type {
  ExamPairedSeries,
  ExamPhase,
  ExamUiToWorkerMessage,
  ExamWorkerToUiMessage,
  FixedHorizonExamConfig,
  FixedHorizonExamSnapshot,
} from "../exam/types";
import { rowsToCsv } from "../reports/csv";
import { generateMapOrderFromHash, normalizeSeed } from "../simulation";

const workerScope = self as DedicatedWorkerGlobalScope;

interface ExamCombinationState {
  readonly key: string;
  readonly modelId: ModelId;
  readonly strategyId: FixedHorizonCoreStrategyId;
  readonly strategyName: string;
  readonly color: string;
  readonly accumulator: FixedHorizonExamAccumulator;
}

interface ExamPairState {
  readonly key: string;
  readonly modelId: ModelId;
  readonly candidate: ExamCombinationState;
  readonly baseline: ExamCombinationState;
  readonly accumulator: FixedHorizonPairAccumulator;
}

interface ExamRunContext {
  readonly runId: string;
  readonly requestId: string;
  readonly config: FixedHorizonExamConfig;
  readonly combinations: ExamCombinationState[];
  readonly pairs: ExamPairState[];
  readonly combinationsByModel: ReadonlyMap<
    ModelId,
    readonly ExamCombinationState[]
  >;
  readonly pairsByModel: ReadonlyMap<ModelId, readonly ExamPairState[]>;
  readonly startedAt: number;
  readonly totalEpisodes: number;
  readonly totalBatches: number;
  readonly seedHash: number;
  paused: boolean;
  stopped: boolean;
  discarded: boolean;
  sequence: number;
  completedEpisodes: number;
  completedBatches: number;
  nextEpisode: number;
  lastSnapshot: FixedHorizonExamSnapshot | null;
}

let activeRun: ExamRunContext | null = null;
let lastCompletedRun: ExamRunContext | null = null;

function post(message: ExamWorkerToUiMessage): void {
  workerScope.postMessage(message);
}

function delay(milliseconds = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function makeRunId(): string {
  return `mihai-exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label}必须是正整数。`);
  }
}

function validateConfig(config: FixedHorizonExamConfig): void {
  if (config.modelIds.length === 0) throw new RangeError("至少选择一个模型。");
  if (config.strategyIds.length === 0) throw new RangeError("至少选择一个策略核心。");
  if (config.horizon !== FIXED_HORIZON_OPERATIONS) {
    throw new RangeError(`当前定长考试固定为${FIXED_HORIZON_OPERATIONS}次操作。`);
  }
  if (config.checkpointStart !== FIXED_HORIZON_CHECKPOINT_START) {
    throw new RangeError(
      `当前定长考试固定从${FIXED_HORIZON_CHECKPOINT_START}次开始记录。`,
    );
  }
  if (config.maxResets !== FIXED_HORIZON_MAX_RESETS) {
    throw new RangeError(`保险口径固定为最多${FIXED_HORIZON_MAX_RESETS}次重置。`);
  }
  validatePositiveInteger(config.episodesPerCombination, "每组合局数");
  validatePositiveInteger(config.batchSize, "批次");
  if (config.masterSeed.trim().length === 0) {
    throw new RangeError("随机种子不能为空。");
  }
  for (const modelId of config.modelIds) {
    if (!(modelId in MODEL_DEFINITIONS)) {
      throw new RangeError(`未知模型：${String(modelId)}`);
    }
  }
  for (const strategyId of config.strategyIds) {
    if (!FIXED_HORIZON_EXAM_STRATEGY_BY_ID.has(strategyId as FixedHorizonCoreStrategyId)) {
      throw new RangeError(`定长考试不支持策略：${strategyId}`);
    }
  }
}

function createContext(
  requestId: string,
  config: FixedHorizonExamConfig,
): ExamRunContext {
  validateConfig(config);
  const strategyIds = [...new Set(config.strategyIds)] as FixedHorizonCoreStrategyId[];
  const combinations: ExamCombinationState[] = [];
  for (const modelId of config.modelIds) {
    for (const strategyId of strategyIds) {
      const option = FIXED_HORIZON_EXAM_STRATEGY_BY_ID.get(strategyId);
      if (!option) continue;
      combinations.push({
        key: `${modelId}:${strategyId}`,
        modelId,
        strategyId,
        strategyName: option.name,
        color: option.color,
        accumulator: new FixedHorizonExamAccumulator(
          modelId,
          strategyId,
          strategyId,
          option.name,
          option.color,
          config.checkpointStart,
          config.horizon,
          config.maxResets,
        ),
      });
    }
  }

  const pairs: ExamPairState[] = [];
  for (const modelId of config.modelIds) {
    const modelRuns = combinations.filter((entry) => entry.modelId === modelId);
    const baseline =
      modelRuns.find((entry) => entry.strategyId === "aggressive_threshold") ??
      modelRuns.find((entry) => entry.strategyId === "full_clear") ??
      modelRuns[0];
    if (!baseline) continue;
    for (const candidate of modelRuns) {
      if (candidate === baseline) continue;
      pairs.push({
        key: `${modelId}:${candidate.strategyId}:vs:${baseline.strategyId}`,
        modelId,
        candidate,
        baseline,
        accumulator: new FixedHorizonPairAccumulator(
          config.checkpointStart,
          config.horizon,
        ),
      });
    }
  }

  const episodesPerModelBatch = Math.ceil(
    config.episodesPerCombination / config.batchSize,
  );
  const combinationsByModel = new Map<ModelId, ExamCombinationState[]>();
  const pairsByModel = new Map<ModelId, ExamPairState[]>();
  for (const modelId of config.modelIds) {
    combinationsByModel.set(
      modelId,
      combinations.filter((entry) => entry.modelId === modelId),
    );
    pairsByModel.set(
      modelId,
      pairs.filter((entry) => entry.modelId === modelId),
    );
  }
  return {
    runId: makeRunId(),
    requestId,
    config: {
      ...config,
      strategyIds,
    },
    combinations,
    pairs,
    combinationsByModel,
    pairsByModel,
    startedAt: performance.now(),
    totalEpisodes: config.episodesPerCombination * combinations.length,
    totalBatches: episodesPerModelBatch,
    seedHash: normalizeSeed(config.masterSeed),
    paused: false,
    stopped: false,
    discarded: false,
    sequence: 0,
    completedEpisodes: 0,
    completedBatches: 0,
    nextEpisode: 0,
    lastSnapshot: null,
  };
}

function progressFor(context: ExamRunContext) {
  const elapsedMs = Math.max(1, performance.now() - context.startedAt);
  const progress =
    context.totalEpisodes === 0
      ? 0
      : context.completedEpisodes / context.totalEpisodes;
  const episodesPerSecond = context.completedEpisodes / (elapsedMs / 1_000);
  const remaining = context.totalEpisodes - context.completedEpisodes;
  return {
    completedEpisodes: context.completedEpisodes,
    totalEpisodes: context.totalEpisodes,
    progress,
    completedBatches: context.completedBatches,
    totalBatches: context.totalBatches,
    episodesPerSecond,
    elapsedMs,
    estimatedRemainingMs:
      episodesPerSecond > 0 ? (remaining / episodesPerSecond) * 1_000 : null,
  };
}

function createSnapshot(
  context: ExamRunContext,
  phase: ExamPhase,
): FixedHorizonExamSnapshot {
  const series = context.combinations
    .filter((entry) => entry.accumulator.episodes > 0)
    .map((entry) => entry.accumulator.curve());
  const conditionalResetCells = context.combinations
    .filter((entry) => entry.accumulator.episodes > 0)
    .flatMap((entry) => entry.accumulator.conditionalResetCells());
  const pairedSeries: ExamPairedSeries[] = context.pairs
    .filter((pair) => pair.candidate.accumulator.episodes > 0)
    .map((pair) => ({
      key: pair.key,
      modelId: pair.modelId,
      candidateStrategyId: pair.candidate.strategyId,
      candidateStrategyName: pair.candidate.strategyName,
      baselineStrategyId: pair.baseline.strategyId,
      baselineStrategyName: pair.baseline.strategyName,
      points: pair.accumulator.points(),
    }));
  context.sequence += 1;
  const snapshot: FixedHorizonExamSnapshot = {
    schemaVersion: 1,
    runId: context.runId,
    sequence: context.sequence,
    generatedAt: new Date().toISOString(),
    phase,
    config: context.config,
    progress: progressFor(context),
    series,
    conditionalResetCells,
    pairedSeries,
    warnings: [
      "定长考试衡量固定操作数下的碎片成绩，不替代达到600所需成本的原达标赛。",
      "S01考试核心移除了距600缺口层；S02与S01核心相同，S16与S05核心相同，因此安全包装层不重复计分。",
      `主动重置统一受 O + 25 × R ≥ ${FIXED_HORIZON_OPERATIONS} 的考试可完成护栏约束。`,
      "按重置次数分组的碎片均值是观察性条件统计，不能解释为重置本身的因果收益。",
      "M1、M2、M3仍是假设模型，不代表已识别真实游戏机制。",
    ],
  };
  context.lastSnapshot = snapshot;
  return snapshot;
}

function mapOrdersFor(
  context: ExamRunContext,
  episodeIndex: number,
  modelId: ModelId,
) {
  const cache = new Map<number, Uint8Array>();
  return (
    _episodeIndex: number,
    mapIndex: number,
    _model: ModelId,
  ): Uint8Array => {
    let order = cache.get(mapIndex);
    if (!order) {
      order = generateMapOrderFromHash(
        context.seedHash,
        episodeIndex,
        mapIndex,
        modelId,
      );
      cache.set(mapIndex, order);
    }
    return order;
  };
}

async function run(context: ExamRunContext): Promise<void> {
  post({
    type: "status",
    runId: context.runId,
    phase: "running",
    message: "定长考试已启动；每个批次完成后更新80–180次成绩曲线。",
  });
  try {
    while (
      !context.stopped &&
      context.nextEpisode < context.config.episodesPerCombination
    ) {
      while (context.paused && !context.stopped) await delay(40);
      if (context.stopped) break;
      const end = Math.min(
        context.config.episodesPerCombination,
        context.nextEpisode + context.config.batchSize,
      );
      const batchStart = context.nextEpisode;
      let processedTo = batchStart;
      for (
        let episodeIndex = batchStart;
        episodeIndex < end;
        episodeIndex += 1
      ) {
        if (context.stopped) break;
        for (const modelId of context.config.modelIds) {
          const provider = mapOrdersFor(context, episodeIndex, modelId);
          const modelRuns = context.combinationsByModel.get(modelId) ?? [];
          const results = new Map<string, FixedHorizonEpisodeResult>();
          for (const combination of modelRuns) {
            const result = simulateFixedHorizonEpisode({
              masterSeed: context.config.masterSeed,
              episodeIndex,
              model: modelId,
              strategyId: combination.strategyId,
              mapOrderProvider: provider,
            });
            combination.accumulator.add(result);
            results.set(combination.strategyId, result);
            context.completedEpisodes += 1;
          }
          for (const pair of context.pairsByModel.get(modelId) ?? []) {
            const candidate = results.get(pair.candidate.strategyId);
            const baseline = results.get(pair.baseline.strategyId);
            if (candidate && baseline) {
              pair.accumulator.add(candidate, baseline);
            }
          }
        }
        processedTo = episodeIndex + 1;
        if ((processedTo - batchStart) % 250 === 0) {
          await delay(0);
          while (context.paused && !context.stopped) await delay(40);
        }
      }
      context.nextEpisode = processedTo;
      if (processedTo === end) context.completedBatches += 1;
      post({ type: "snapshot", snapshot: createSnapshot(context, "running") });
      await delay(0);
    }

    if (context.stopped) {
      if (context.discarded) {
        post({
          type: "status",
          runId: context.runId,
          phase: "stopped",
          message: "定长考试结果已清空。",
        });
        return;
      }
      const snapshot = createSnapshot(context, "stopped");
      lastCompletedRun = context;
      post({ type: "snapshot", snapshot });
      return;
    }
    const snapshot = createSnapshot(context, "completed");
    lastCompletedRun = context;
    post({ type: "complete", snapshot });
  } catch (error) {
    post({
      type: "error",
      requestId: context.requestId,
      runId: context.runId,
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
  } finally {
    if (activeRun === context) activeRun = null;
  }
}

function curveRows(context: ExamRunContext) {
  return context.combinations.flatMap((entry) =>
    entry.accumulator.curve().points.map((point) => {
      const { quantiles, ...metrics } = point;
      return {
        model: entry.modelId,
        strategy: entry.strategyId,
        coreStrategy: entry.strategyId,
        direction: "higher_is_better",
        ...metrics,
        ...quantiles,
      };
    }),
  );
}

function conditionalRows(context: ExamRunContext) {
  return context.combinations.flatMap((entry) =>
    entry.accumulator.conditionalResetCells().map((cell) => ({
      model: cell.modelId,
      strategy: cell.strategyId,
      operations: cell.operations,
      resetsUsed: cell.resetsUsed,
      episodes: cell.episodes,
      stateProbability: cell.probability,
      meanFragments: cell.meanFragments,
      varianceFragments: cell.varianceFragments,
    })),
  );
}

function pairedRows(context: ExamRunContext) {
  return context.pairs.flatMap((pair) =>
    pair.accumulator.points().map((point) => ({
      model: pair.modelId,
      candidateStrategy: pair.candidate.strategyId,
      baselineStrategy: pair.baseline.strategyId,
      direction: "higher_is_better",
      ...point,
    })),
  );
}

function fragmentHistogramRows(context: ExamRunContext) {
  return context.combinations.flatMap((entry) =>
    entry.accumulator.fragmentHistogramRows(),
  );
}

function resetDistributionRows(context: ExamRunContext) {
  return context.combinations.flatMap((entry) =>
    entry.accumulator.resetDistributionRows(),
  );
}

function pairedHistogramRows(context: ExamRunContext) {
  return context.pairs.flatMap((pair) =>
    pair.accumulator.differenceHistogramRows().map((row) => ({
      model: pair.modelId,
      candidateStrategy: pair.candidate.strategyId,
      baselineStrategy: pair.baseline.strategyId,
      direction: "candidate_minus_baseline",
      ...row,
    })),
  );
}

function metadata(context: ExamRunContext) {
  return {
    schemaVersion: 1,
    runKind: "fixed-horizon-exam",
    generatedAt: new Date().toISOString(),
    masterSeed: context.config.masterSeed,
    models: context.config.modelIds,
    strategies: context.config.strategyIds,
    episodesPerCombination: context.config.episodesPerCombination,
    batchSize: context.config.batchSize,
    checkpointStart: context.config.checkpointStart,
    horizon: context.config.horizon,
    checkpointTiming:
      "after operation N reward, before the reset decision that can affect N+1",
    maxResets: context.config.maxResets,
    resetGuard: `operations + 25 * resetsRemaining >= ${context.config.horizon}`,
    policyProjection:
      "target-free core; S01 drops deficit band; S02=S01 core; S16=S05 core",
    differenceDirection: "candidate - baseline; positive is better",
    completedEpisodes: context.completedEpisodes,
    elapsedMs: performance.now() - context.startedAt,
  };
}

function buildReport(context: ExamRunContext): string {
  const checkpointOperations = new Set([80, 100, 120, 140, 150, 160, 180]);
  const rows = context.combinations.flatMap((entry) =>
    entry.accumulator
      .curve()
      .points.filter((point) => checkpointOperations.has(point.operations))
      .map((point) => ({
        model: entry.modelId,
        strategy: entry.strategyName,
        operations: point.operations,
        mean: point.meanFragments.toFixed(3),
        p05: point.quantiles.p05,
        median: point.quantiles.p50,
        p95: point.quantiles.p95,
        pass: `${(point.probabilityAtLeast600 * 100).toFixed(2)}%`,
        resets: point.meanResets.toFixed(3),
      })),
  );
  const table = rows
    .map(
      (row) =>
        `| ${row.model} | ${row.strategy} | ${row.operations} | ${row.mean} | ${row.p05} | ${row.median} | ${row.p95} | ${row.pass} | ${row.resets} |`,
    )
    .join("\n");
  return `# 迷海定长考试报告

本报告衡量同一局在固定操作数下的累计碎片成绩。每局跑满180次，80–180是同一条轨迹的连续检查点；600只是评分线，不会让模拟提前终止。

- 策略投影：S01移除“距600缺口”层；S02=S01核心；S16=S05核心。
- 重置上限：13次。
- 完成护栏：\`O + 25 × R ≥ 180\`。
- 配对差方向：候选碎片 − 基线碎片，正数更好。
- 模型：${context.config.modelIds.join("、")}（均为假设模型）。
- 每组合样本：${context.config.episodesPerCombination.toLocaleString("zh-CN")}局。
- 随机种子：\`${context.config.masterSeed}\`。

## 关键检查点

| 模型 | 策略 | 操作1 | 平均碎片 | P05 | P50 | P95 | ≥600 | 平均重置 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
${table}

完整101点曲线、条件重置统计、碎片/重置完整分布和配对差分布见同一压缩包内CSV。
`;
}

function exportFiles(context: ExamRunContext): Record<string, string> {
  const snapshot =
    context.lastSnapshot ?? createSnapshot(context, "stopped");
  return {
    "exam-metadata.json": `${JSON.stringify(metadata(context), null, 2)}\n`,
    "exam-snapshot.json": `${JSON.stringify(snapshot, null, 2)}\n`,
    "exam-operation-curve.csv": rowsToCsv(curveRows(context)),
    "exam-fragments-by-reset.csv": rowsToCsv(conditionalRows(context)),
    "exam-paired-vs-baseline.csv": rowsToCsv(pairedRows(context)),
    "exam-fragment-histograms.csv": rowsToCsv(
      fragmentHistogramRows(context).map((row) => ({ ...row })),
    ),
    "exam-reset-distributions.csv": rowsToCsv(
      resetDistributionRows(context).map((row) => ({ ...row })),
    ),
    "exam-paired-difference-histograms.csv": rowsToCsv(
      pairedHistogramRows(context),
    ),
    "exam-report.md": buildReport(context),
    "exam-strategy-aliases.json": `${JSON.stringify(
      {
        aliases: FIXED_HORIZON_WRAPPER_ALIASES,
        distinctCoreStrategies: DEFAULT_FIXED_HORIZON_STRATEGY_IDS,
      },
      null,
      2,
    )}\n`,
  };
}

function handleExport(
  message: Extract<ExamUiToWorkerMessage, { type: "export" }>,
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
      message: "没有找到可导出的定长考试运行。",
      recoverable: true,
    });
    return;
  }
  const files = exportFiles(context);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (message.format === "json") {
    post({
      type: "export-ready",
      requestId: message.requestId,
      runId: context.runId,
      filename: `mihai-exam-${timestamp}.json`,
      mimeType: "application/json;charset=utf-8",
      payload: files["exam-snapshot.json"] ?? "{}",
    });
    return;
  }
  if (message.format === "csv") {
    post({
      type: "export-ready",
      requestId: message.requestId,
      runId: context.runId,
      filename: `mihai-exam-curve-${timestamp}.csv`,
      mimeType: "text/csv;charset=utf-8",
      payload: files["exam-operation-curve.csv"] ?? "",
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
    filename: `mihai-exam-${timestamp}.zip`,
    mimeType: "application/zip",
    payload: zipped,
  });
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<ExamUiToWorkerMessage>) => {
    const message = event.data;
    if (message.type === "start") {
      if (activeRun) {
        post({
          type: "error",
          requestId: message.requestId,
          runId: activeRun.runId,
          message: "已有定长考试正在运行。",
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
          message: "正在初始化定长考试统计器。",
        });
        void run(context);
      } catch (error) {
        post({
          type: "error",
          requestId: message.requestId,
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
      return;
    }
    if (message.type === "pause" && activeRun?.runId === message.runId) {
      activeRun.paused = true;
      post({ type: "status", runId: message.runId, phase: "paused" });
      return;
    }
    if (message.type === "resume" && activeRun?.runId === message.runId) {
      activeRun.paused = false;
      post({ type: "status", runId: message.runId, phase: "running" });
      return;
    }
    if (message.type === "stop" && activeRun?.runId === message.runId) {
      activeRun.stopped = true;
      activeRun.paused = false;
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
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
    }
  },
);
