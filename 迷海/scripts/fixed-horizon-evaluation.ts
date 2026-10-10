import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { isModelId, type ModelId } from "../src/domain/models";
import {
  FixedHorizonExamAccumulator,
  FixedHorizonPairAccumulator,
} from "../src/exam/accumulator";
import {
  FIXED_HORIZON_CHECKPOINT_START,
  FIXED_HORIZON_CORE_BY_STRATEGY_ID,
  FIXED_HORIZON_MAX_RESETS,
  FIXED_HORIZON_OPERATIONS,
  simulateFixedHorizonEpisode,
  type FixedHorizonCoreStrategyId,
  type FixedHorizonEpisodeResult,
  type FixedHorizonMapOrderProvider,
  type FixedHorizonStrategyId,
} from "../src/exam/fixedHorizon";
import type {
  ExamPairedSeries,
  ExamProgress,
  ExamResetConditionCell,
  ExamStrategySeries,
  FixedHorizonExamConfig,
  FixedHorizonExamSnapshot,
} from "../src/exam/types";
import {
  flattenObject,
  rowsToCsv,
  type CsvRow,
} from "../src/reports/csv";
import {
  generateMapOrderFromHash,
  normalizeSeed,
  PRNG_NAME,
  PRNG_VERSION,
} from "../src/simulation";
import { getStrategyById } from "../src/strategies";
import {
  hasArgument,
  integerArgument,
  listArgument,
  optionalStringArgument,
  parseCliArguments,
  stringArgument,
} from "./lib/cli";

const DEFAULT_EPISODES = 100_000;
const DEFAULT_BATCH_SIZE = 10_000;
const DEFAULT_SEED = "mihai-fixed-horizon-exam-v1";
const DEFAULT_STRATEGY_IDS: readonly FixedHorizonCoreStrategyId[] = [
  "optimized_threshold_v1",
  "aggressive_threshold",
  "reset_on_30",
  "full_clear",
];
const STRATEGY_COLORS = [
  "#0f766e",
  "#e11d48",
  "#2563eb",
  "#64748b",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#4d7c0f",
  "#be123c",
  "#4338ca",
  "#047857",
  "#a16207",
  "#c026d3",
  "#0369a1",
  "#65a30d",
  "#9333ea",
] as const;

interface ExamStrategyOption {
  readonly id: FixedHorizonCoreStrategyId;
  readonly name: string;
  readonly color: string;
}

const FIXED_HORIZON_EXAM_CORE_IDS = [
  ...new Set(Object.values(FIXED_HORIZON_CORE_BY_STRATEGY_ID)),
] as FixedHorizonCoreStrategyId[];
const FIXED_HORIZON_EXAM_CORE_ID_SET = new Set(
  FIXED_HORIZON_EXAM_CORE_IDS,
);
const WRAPPER_ALIASES = [
  {
    wrapperId: "optimized_conservative_150",
    wrapperCode: "S02",
    coreId: "optimized_threshold_v1",
    explanation:
      "S02的150硬上限依赖600目标；目标移除后，其采集核心与S01核心相同。",
  },
  {
    wrapperId: "conservative_150",
    wrapperCode: "S16",
    coreId: "aggressive_threshold",
    explanation:
      "S16的150硬上限依赖600目标；目标移除后，其采集核心与S05核心相同。",
  },
] as const;

interface ExamCombination {
  readonly modelId: ModelId;
  readonly option: ExamStrategyOption;
  readonly accumulator: FixedHorizonExamAccumulator;
}

interface ExamPair {
  readonly modelId: ModelId;
  readonly candidate: ExamCombination;
  readonly baseline: ExamCombination;
  readonly accumulator: FixedHorizonPairAccumulator;
}

function usage(): string {
  const coreIds = FIXED_HORIZON_EXAM_CORE_IDS.join(", ");
  return `
迷海80–180次操作定长考试

用法：
  npm run exam -- [选项]

选项：
  --episodes <n>          每策略/每模型局数，默认 ${DEFAULT_EPISODES}
  --batch <n>             进度更新批次，默认 ${DEFAULT_BATCH_SIZE}
  --models <M1,M2,M3>     逗号分隔，默认 M1,M2,M3
  --strategies <ids>      逗号分隔，默认 S01核心、S05、S03、全开
  --baseline <id>         配对比较基线；默认优先S05，其次全开
  --seed <seed>           主种子，默认 ${DEFAULT_SEED}
  --out <dir>             输出目录，默认 results/fixed-horizon-<时间戳>
  --help                  显示本说明

可评分的独立策略核心：
  ${coreIds}

兼容输入 optimized_conservative_150（S02）和 conservative_150（S16），
但会分别投影为 optimized_threshold_v1（S01核心）和
aggressive_threshold（S05核心），不会伪装成独立考试策略。
`.trim();
}

function safeTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function gitCommit(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

async function applicationVersion(): Promise<string | undefined> {
  try {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string"
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

function coreForStrategyId(value: string): FixedHorizonCoreStrategyId {
  if (!Object.hasOwn(FIXED_HORIZON_CORE_BY_STRATEGY_ID, value)) {
    throw new Error(
      `定长考试不支持策略“${value}”。可用核心：${[
        ...FIXED_HORIZON_EXAM_CORE_IDS,
      ].join(", ")}。`,
    );
  }
  const core =
    FIXED_HORIZON_CORE_BY_STRATEGY_ID[value as FixedHorizonStrategyId];
  if (!FIXED_HORIZON_EXAM_CORE_ID_SET.has(core)) {
    throw new Error(`策略“${value}”投影到未知考试核心“${core}”。`);
  }
  return core;
}

function uniqueCores(strategyIds: readonly string[]): FixedHorizonCoreStrategyId[] {
  return [...new Set(strategyIds.map(coreForStrategyId))];
}

function optionForStrategy(
  strategyId: FixedHorizonCoreStrategyId,
  index: number,
): ExamStrategyOption {
  const strategy = getStrategyById(strategyId);
  return {
    id: strategyId,
    name:
      strategyId === "optimized_threshold_v1"
        ? "S01核心·重置分段阈值"
        : strategy.name,
    color: STRATEGY_COLORS[index % STRATEGY_COLORS.length] ?? "#475467",
  };
}

function combinationKey(modelId: ModelId, strategyId: string): string {
  return `${modelId}:${strategyId}`;
}

function pairKey(
  modelId: ModelId,
  candidateId: string,
  baselineId: string,
): string {
  return `${modelId}:${candidateId}:vs:${baselineId}`;
}

function makeMapOrderProvider(
  seedHash: number,
  episodeIndex: number,
  modelId: ModelId,
): FixedHorizonMapOrderProvider {
  const cache = new Map<number, Uint8Array>();
  return (_episodeIndex, mapIndex) => {
    let order = cache.get(mapIndex);
    if (order === undefined) {
      order = generateMapOrderFromHash(
        seedHash,
        episodeIndex,
        mapIndex,
        modelId,
      );
      cache.set(mapIndex, order);
    }
    return order;
  };
}

function curveRows(series: readonly ExamStrategySeries[]): CsvRow[] {
  return series.flatMap((entry) =>
    entry.points.map((point) => {
      const { quantiles, ...scalars } = point;
      return {
        modelId: entry.modelId,
        strategyId: entry.strategyId,
        coreStrategyId: entry.coreStrategyId,
        strategyName: entry.strategyName,
        direction: "higher_is_better",
        ...scalars,
        ...quantiles,
      };
    }),
  );
}

function conditionalRows(
  cells: readonly ExamResetConditionCell[],
): CsvRow[] {
  return cells.map((cell) => ({
    modelId: cell.modelId,
    strategyId: cell.strategyId,
    coreStrategyId: cell.coreStrategyId,
    operations: cell.operations,
    resetsUsed: cell.resetsUsed,
    episodes: cell.episodes,
    stateProbability: cell.probability,
    meanFragments: cell.meanFragments,
    varianceFragments: cell.varianceFragments,
  }));
}

function pairedRows(series: readonly ExamPairedSeries[]): CsvRow[] {
  return series.flatMap((entry) =>
    entry.points.map((point) => ({
      modelId: entry.modelId,
      candidateStrategyId: entry.candidateStrategyId,
      candidateStrategyName: entry.candidateStrategyName,
      baselineStrategyId: entry.baselineStrategyId,
      baselineStrategyName: entry.baselineStrategyName,
      direction: "candidate_minus_baseline; higher_is_better",
      ...point,
    })),
  );
}

function buildMarkdownReport(
  series: readonly ExamStrategySeries[],
  config: FixedHorizonExamConfig,
  baselineStrategyId: FixedHorizonCoreStrategyId,
): string {
  const checkpoints = [80, 100, 120, 140, 150, 160, 180];
  const rows: string[] = [];
  for (const modelId of config.modelIds) {
    for (const operations of checkpoints) {
      const modelPoints = series
        .filter((entry) => entry.modelId === modelId)
        .flatMap((entry) => {
          const point = entry.points.find(
            (candidate) => candidate.operations === operations,
          );
          return point ? [{ entry, point }] : [];
        })
        .sort(
          (left, right) =>
            right.point.meanFragments - left.point.meanFragments,
        );
      const baselineMean = modelPoints.find(
        ({ entry }) => entry.strategyId === baselineStrategyId,
      )?.point.meanFragments;
      modelPoints.forEach(({ entry, point }, index) => {
        const delta =
          baselineMean === undefined
            ? "—"
            : (point.meanFragments - baselineMean).toFixed(3);
        rows.push(
          `| ${modelId} | ${operations} | ${index + 1} | ${entry.strategyName} | ${point.meanFragments.toFixed(3)} | ${point.varianceFragments.toFixed(2)} | ${point.quantiles.p05} | ${point.quantiles.p50} | ${point.quantiles.p95} | ${(point.probabilityAtLeast600 * 100).toFixed(2)}% | ${point.meanResets.toFixed(3)} | ${delta} |`,
        );
      });
    }
  }
  return `# 迷海80–180次定长考试

每局固定执行180次操作，并在80–180的每个整数点记录累计成绩。600只是评分线，不会导致提前停止。

- 模型：${config.modelIds.join("、")}（均为假设模型）
- 每策略/模型：${config.episodesPerCombination.toLocaleString("zh-CN")}局
- 随机种子：\`${config.masterSeed}\`
- 最多重置：${config.maxResets}次
- 完成护栏：\`O + 25 × R ≥ ${config.horizon}\`
- 策略投影：S01移除600缺口层；S02=S01核心；S16=S05核心
- 配对基线：\`${baselineStrategyId}\`
- 配对差方向：候选碎片−基线碎片，正数更好

## 关键检查点排名

| 模型 | 操作1 | 名次 | 策略核心 | 平均碎片 | 方差 | P05 | P50 | P95 | ≥600 | 平均重置 | 相对基线均值差 |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

## 阅读边界

按重置次数分组的成绩是观察性条件统计，不代表“多重置一次”造成的因果收益。完整101点统计、完整碎片分布、重置分布、条件统计和同地图配对差见同目录CSV/JSON。
`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  if (hasArgument(cli, "help")) {
    console.log(usage());
    return;
  }

  const episodes = integerArgument(cli, "episodes", DEFAULT_EPISODES);
  const batchSize = integerArgument(cli, "batch", DEFAULT_BATCH_SIZE);
  const seed = stringArgument(cli, "seed", DEFAULT_SEED);
  if (seed.trim().length === 0) throw new Error("--seed 不能为空。");

  const modelIds: ModelId[] = [
    ...new Set(
      listArgument(cli, "models", ["M1", "M2", "M3"]).map(
        (model): ModelId => {
          if (!isModelId(model)) throw new Error(`未知模型“${model}”。`);
          return model;
        },
      ),
    ),
  ];
  const requestedStrategyIds = listArgument(
    cli,
    "strategies",
    DEFAULT_STRATEGY_IDS,
  );
  const strategyIds = uniqueCores(requestedStrategyIds);
  if (strategyIds.length === 0) throw new Error("至少需要一个策略核心。");

  const explicitBaseline = optionalStringArgument(cli, "baseline");
  const baselineStrategyId =
    explicitBaseline === undefined
      ? strategyIds.find((id) => id === "aggressive_threshold") ??
        strategyIds.find((id) => id === "full_clear") ??
        strategyIds[0]
      : coreForStrategyId(explicitBaseline);
  if (
    baselineStrategyId === undefined ||
    !strategyIds.includes(baselineStrategyId)
  ) {
    throw new Error("--baseline 必须包含在 --strategies 投影后的策略核心中。");
  }

  const outputDirectory = resolve(
    stringArgument(
      cli,
      "out",
      `results/fixed-horizon-${safeTimestamp()}`,
    ),
  );
  await mkdir(outputDirectory, { recursive: true });

  const config: FixedHorizonExamConfig = {
    modelIds,
    strategyIds,
    episodesPerCombination: episodes,
    batchSize,
    masterSeed: seed,
    horizon: FIXED_HORIZON_OPERATIONS,
    checkpointStart: FIXED_HORIZON_CHECKPOINT_START,
    maxResets: FIXED_HORIZON_MAX_RESETS,
  };
  const combinations = new Map<string, ExamCombination>();
  for (const modelId of modelIds) {
    for (const [strategyIndex, strategyId] of strategyIds.entries()) {
      const option = optionForStrategy(strategyId, strategyIndex);
      combinations.set(combinationKey(modelId, strategyId), {
        modelId,
        option,
        accumulator: new FixedHorizonExamAccumulator(
          modelId,
          strategyId,
          strategyId,
          option.name,
          option.color,
          FIXED_HORIZON_CHECKPOINT_START,
          FIXED_HORIZON_OPERATIONS,
          FIXED_HORIZON_MAX_RESETS,
        ),
      });
    }
  }

  const pairs = new Map<string, ExamPair>();
  for (const modelId of modelIds) {
    const baseline = combinations.get(
      combinationKey(modelId, baselineStrategyId),
    );
    if (baseline === undefined) throw new Error("缺少配对基线累积器。");
    for (const strategyId of strategyIds) {
      if (strategyId === baselineStrategyId) continue;
      const candidate = combinations.get(
        combinationKey(modelId, strategyId),
      );
      if (candidate === undefined) throw new Error("缺少候选累积器。");
      pairs.set(pairKey(modelId, strategyId, baselineStrategyId), {
        modelId,
        candidate,
        baseline,
        accumulator: new FixedHorizonPairAccumulator(
          FIXED_HORIZON_CHECKPOINT_START,
          FIXED_HORIZON_OPERATIONS,
        ),
      });
    }
  }

  const startedAt = new Date();
  const started = performance.now();
  const seedHash = normalizeSeed(seed);
  let completedStrategyEpisodes = 0;
  let completedBatches = 0;

  for (const modelId of modelIds) {
    const modelStarted = performance.now();
    for (let batchStart = 0; batchStart < episodes; batchStart += batchSize) {
      const batchEnd = Math.min(episodes, batchStart + batchSize);
      for (
        let episodeIndex = batchStart;
        episodeIndex < batchEnd;
        episodeIndex += 1
      ) {
        const mapOrderProvider = makeMapOrderProvider(
          seedHash,
          episodeIndex,
          modelId,
        );
        const results = new Map<
          FixedHorizonCoreStrategyId,
          FixedHorizonEpisodeResult
        >();
        for (const strategyId of strategyIds) {
          const result = simulateFixedHorizonEpisode({
            masterSeed: seed,
            episodeIndex,
            model: modelId,
            strategyId,
            mapOrderProvider,
          });
          const combination = combinations.get(
            combinationKey(modelId, strategyId),
          );
          if (combination === undefined) {
            throw new Error("缺少定长考试组合。");
          }
          combination.accumulator.add(result);
          results.set(strategyId, result);
          completedStrategyEpisodes += 1;
        }
        const baseline = results.get(baselineStrategyId);
        if (baseline === undefined) throw new Error("缺少本局基线结果。");
        for (const strategyId of strategyIds) {
          if (strategyId === baselineStrategyId) continue;
          const candidate = results.get(strategyId);
          const pair = pairs.get(
            pairKey(modelId, strategyId, baselineStrategyId),
          );
          if (candidate === undefined || pair === undefined) {
            throw new Error("缺少本局配对结果。");
          }
          pair.accumulator.add(candidate, baseline);
        }
      }
      completedBatches += 1;
      const elapsedSeconds = Math.max(
        0.001,
        (performance.now() - modelStarted) / 1_000,
      );
      const episodeRate = batchEnd / elapsedSeconds;
      console.log(
        `${modelId}: ${batchEnd.toLocaleString("en-US")}/${episodes.toLocaleString("en-US")}局 ` +
          `(${((batchEnd / episodes) * 100).toFixed(1)}%)，` +
          `${Math.round(episodeRate).toLocaleString("en-US")}底层局/秒`,
      );
    }
  }

  const elapsedMs = performance.now() - started;
  const generatedAt = new Date().toISOString();
  const series = [...combinations.values()].map((entry) =>
    entry.accumulator.curve(),
  );
  const conditionalResetCells = [...combinations.values()].flatMap((entry) =>
    entry.accumulator.conditionalResetCells(),
  );
  const pairedSeries: ExamPairedSeries[] = [...pairs.values()].map((pair) => ({
    key: pairKey(
      pair.modelId,
      pair.candidate.option.id,
      pair.baseline.option.id,
    ),
    modelId: pair.modelId,
    candidateStrategyId: pair.candidate.option.id,
    candidateStrategyName: pair.candidate.option.name,
    baselineStrategyId: pair.baseline.option.id,
    baselineStrategyName: pair.baseline.option.name,
    points: pair.accumulator.points(),
  }));

  const totalStrategyEpisodes = episodes * modelIds.length * strategyIds.length;
  const totalBatches = Math.ceil(episodes / batchSize) * modelIds.length;
  const progress: ExamProgress = {
    completedEpisodes: completedStrategyEpisodes,
    totalEpisodes: totalStrategyEpisodes,
    progress:
      totalStrategyEpisodes === 0
        ? 0
        : completedStrategyEpisodes / totalStrategyEpisodes,
    completedBatches,
    totalBatches,
    episodesPerSecond:
      completedStrategyEpisodes / Math.max(0.001, elapsedMs / 1_000),
    elapsedMs,
    estimatedRemainingMs: 0,
  };
  const warnings = [
    "定长考试衡量固定操作数下的碎片成绩，不替代达到600所需成本的原达标赛。",
    "S01考试核心移除了距600缺口层；S02与S01核心相同，S16与S05核心相同，因此包装层不重复计分。",
    `主动重置统一受 O + 25 × R ≥ ${FIXED_HORIZON_OPERATIONS} 的考试可完成护栏约束。`,
    "按重置次数分组的碎片均值是观察性条件统计，不能解释为重置本身的因果收益。",
    "M1、M2、M3均为未知真实抽取机制的假设模型。",
  ];
  const runId = `mihai-exam-cli-${startedAt
    .toISOString()
    .replace(/[^0-9A-Za-z]/gu, "-")}`;
  const snapshot: FixedHorizonExamSnapshot = {
    schemaVersion: 1,
    runId,
    sequence: completedBatches,
    generatedAt,
    phase: "completed",
    config,
    progress,
    series,
    conditionalResetCells,
    pairedSeries,
    warnings,
  };

  const outputFiles = [
    "exam-metadata.json",
    "exam-metadata.csv",
    "exam-snapshot.json",
    "exam-operation-curve.json",
    "exam-operation-curve.csv",
    "exam-fragments-by-reset.json",
    "exam-fragments-by-reset.csv",
    "exam-paired-vs-baseline.json",
    "exam-paired-vs-baseline.csv",
    "exam-fragment-histograms.csv",
    "exam-reset-distributions.csv",
    "exam-paired-difference-histograms.csv",
    "exam-strategy-aliases.json",
    "exam-report.md",
  ];
  const requestedProjections = requestedStrategyIds.map((requestedId) => ({
    requestedId,
    coreStrategyId: coreForStrategyId(requestedId),
  }));
  const metadata = {
    schemaVersion: 1,
    runKind: "fixed-horizon-exam",
    generatedAt,
    startedAt: startedAt.toISOString(),
    completedAt: generatedAt,
    masterSeed: seed,
    prng: `${PRNG_NAME} v${PRNG_VERSION}`,
    episodesPerStrategyModel: episodes,
    batchSize,
    models: modelIds,
    requestedStrategies: requestedStrategyIds,
    requestedStrategyProjections: requestedProjections,
    evaluatedCoreStrategies: strategyIds,
    pairedBaselineCoreStrategy: baselineStrategyId,
    checkpointStart: FIXED_HORIZON_CHECKPOINT_START,
    horizon: FIXED_HORIZON_OPERATIONS,
    checkpointTiming:
      "after operation N reward, before the reset decision that can affect N+1",
    maxResets: FIXED_HORIZON_MAX_RESETS,
    fragmentTargetConstraint: null,
    resetGuard:
      `operations + 25 * resetsRemaining >= ${FIXED_HORIZON_OPERATIONS}`,
    policyProjection:
      "target-free core; S01 drops deficit band; S02=S01 core; S16=S05 core",
    pairedDifference:
      "candidate fragments - baseline fragments; positive is better",
    completedStrategyEpisodes,
    elapsedMs,
    runtime: `Node ${process.version}`,
    command: process.argv.join(" "),
    applicationVersion: await applicationVersion(),
    gitCommit: gitCommit(),
    outputFiles,
    warnings,
  };

  const curve = curveRows(series);
  const conditional = conditionalRows(conditionalResetCells);
  const paired = pairedRows(pairedSeries);
  const fragmentHistograms = [...combinations.values()].flatMap((entry) =>
    entry.accumulator.fragmentHistogramRows().map((row) => ({ ...row })),
  );
  const resetDistributions = [...combinations.values()].flatMap((entry) =>
    entry.accumulator.resetDistributionRows().map((row) => ({ ...row })),
  );
  const pairedHistograms = [...pairs.values()].flatMap((pair) =>
    pair.accumulator.differenceHistogramRows().map((row) => ({
      modelId: pair.modelId,
      candidateStrategyId: pair.candidate.option.id,
      baselineStrategyId: pair.baseline.option.id,
      direction: "candidate_minus_baseline; higher_is_better",
      ...row,
    })),
  );
  await Promise.all([
    writeJson(resolve(outputDirectory, "exam-metadata.json"), metadata),
    writeFile(
      resolve(outputDirectory, "exam-metadata.csv"),
      rowsToCsv([
        flattenObject(metadata as unknown as Record<string, unknown>),
      ]),
      "utf8",
    ),
    writeJson(resolve(outputDirectory, "exam-snapshot.json"), snapshot),
    writeJson(resolve(outputDirectory, "exam-operation-curve.json"), series),
    writeFile(
      resolve(outputDirectory, "exam-operation-curve.csv"),
      rowsToCsv(curve),
      "utf8",
    ),
    writeJson(
      resolve(outputDirectory, "exam-fragments-by-reset.json"),
      conditionalResetCells,
    ),
    writeFile(
      resolve(outputDirectory, "exam-fragments-by-reset.csv"),
      rowsToCsv(conditional),
      "utf8",
    ),
    writeJson(
      resolve(outputDirectory, "exam-paired-vs-baseline.json"),
      pairedSeries,
    ),
    writeFile(
      resolve(outputDirectory, "exam-paired-vs-baseline.csv"),
      rowsToCsv(paired, [
        "modelId",
        "candidateStrategyId",
        "candidateStrategyName",
        "baselineStrategyId",
        "baselineStrategyName",
        "direction",
        "operations",
        "pairs",
        "meanFragmentDifference",
        "varianceFragmentDifference",
        "standardDeviationFragmentDifference",
        "standardError",
        "ci95Low",
        "ci95High",
        "minimumFragmentDifference",
        "maximumFragmentDifference",
        "p05FragmentDifference",
        "p50FragmentDifference",
        "p95FragmentDifference",
        "winRate",
        "tieRate",
        "lossRate",
      ]),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "exam-fragment-histograms.csv"),
      rowsToCsv(fragmentHistograms),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "exam-reset-distributions.csv"),
      rowsToCsv(resetDistributions),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "exam-paired-difference-histograms.csv"),
      rowsToCsv(pairedHistograms),
      "utf8",
    ),
    writeJson(resolve(outputDirectory, "exam-strategy-aliases.json"), {
      aliases: WRAPPER_ALIASES,
      requestedProjections,
      evaluatedCoreStrategies: strategyIds,
    }),
    writeFile(
      resolve(outputDirectory, "exam-report.md"),
      buildMarkdownReport(series, config, baselineStrategyId),
      "utf8",
    ),
  ]);

  console.log(`\n定长考试完成：${outputDirectory}`);
  console.log(
    `耗时 ${(elapsedMs / 1_000).toFixed(1)}秒；` +
      `${episodes.toLocaleString("en-US")}局/策略/模型；` +
      `配对基线 ${baselineStrategyId}。`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
