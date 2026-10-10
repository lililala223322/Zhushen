import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { resetOn30Strategy } from "../src/strategies/fragmentBaselines";
import { simulateEpisode } from "../src/simulation/simulator";
import {
  EvaluationAccumulator,
  PairedComparisonAccumulator,
  quantileFromHistogram,
} from "../src/reports/metrics";
import { flattenObject, rowsToCsv } from "../src/reports/csv";
import type { ReportModelId } from "../src/reports/types";
import {
  booleanArgument,
  hasArgument,
  integerArgument,
  parseCliArguments,
  stringArgument,
} from "./lib/cli";
import {
  createStrategyFromFrozenPolicy,
  DEFAULT_THRESHOLD_VECTOR,
  frozenPolicyToReportDefinition,
  type FrozenThresholdBand,
  type FrozenThresholdPolicy,
} from "./lib/policy";
import { precomputeMapOrders, toObservation } from "./lib/evaluation";

const MODEL: ReportModelId = "M1";
const DEFAULT_TRAINING_SEED = "mihai-policy-training-v1";
const DEFAULT_VALIDATION_SEED = "mihai-policy-validation-v1";

interface SearchConfiguration {
  thresholds: number[];
  resetBands: FrozenThresholdBand[];
  deficitBands: FrozenThresholdBand[];
}

interface CandidateScore {
  key: string;
  label: string;
  configuration: SearchConfiguration;
  episodes: number;
  failures: number;
  mean: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  p95: number;
  p99: number;
  elapsedMilliseconds: number;
}

interface Coordinate {
  label: string;
  read(configuration: SearchConfiguration): number;
  write(configuration: SearchConfiguration, value: number): void;
}

function usage(): string {
  return `
迷海进取阈值策略搜索

用法：
  npm run optimize -- [选项]

选项：
  --train <n>             训练局数，默认 10000
  --validation <n>        验证局数，默认 50000
  --train-seed <seed>     训练种子，默认 ${DEFAULT_TRAINING_SEED}
  --validation-seed <s>   验证种子，默认 ${DEFAULT_VALIDATION_SEED}
  --rounds <n>            每个步长的坐标下降轮数，默认 1
  --step <n>              第一轮步长，默认 2；之后自动补一步长1
  --top <n>               送入独立验证集的候选数，默认 6
  --banded <bool>         搜索剩余重置分段及近目标分段，默认 true
  --out <dir>             输出目录，默认 results/optimization-<时间戳>
  --help                  显示本说明

训练与验证种子必须不同。输出策略只称为“当前阈值搜索空间内最优”。
`.trim();
}

function safeTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function cloneConfiguration(configuration: SearchConfiguration): SearchConfiguration {
  return {
    thresholds: [...configuration.thresholds],
    resetBands: configuration.resetBands.map((band) => ({
      min: band.min,
      max: band.max,
      thresholds: [...band.thresholds],
    })),
    deficitBands: configuration.deficitBands.map((band) => ({
      min: band.min,
      max: band.max,
      thresholds: [...band.thresholds],
    })),
  };
}

function configurationKey(configuration: SearchConfiguration): string {
  return JSON.stringify(configuration);
}

function policyFromConfiguration(
  configuration: SearchConfiguration,
  id = "optimized_threshold_v1",
): FrozenThresholdPolicy {
  return {
    schemaVersion: 1,
    id,
    name: "搜索得到的进取阈值策略",
    description:
      "按碎片组合、地图深度、剩余重置分段与近目标缺口分段决定是否请求重置。",
    thresholds: [...configuration.thresholds],
    resetBands: configuration.resetBands.map((band) => ({
      ...band,
      thresholds: [...band.thresholds],
    })),
    deficitBands: configuration.deficitBands.map((band) => ({
      ...band,
      thresholds: [...band.thresholds],
    })),
  };
}

function compareScores(left: CandidateScore, right: CandidateScore): number {
  return (
    left.failures - right.failures ||
    left.mean - right.mean ||
    left.p95 - right.p95 ||
    left.p99 - right.p99
  );
}

function coordinateForBase(mask: number): Coordinate {
  return {
    label: `base.mask${mask}`,
    read: (configuration) => configuration.thresholds[mask] ?? 0,
    write: (configuration, value) => {
      configuration.thresholds[mask] = value;
    },
  };
}

function coordinateForResetBand(bandIndex: number, mask: number): Coordinate {
  return {
    label: `resetBand${bandIndex}.mask${mask}`,
    read: (configuration) =>
      configuration.resetBands[bandIndex]?.thresholds[mask] ?? 0,
    write: (configuration, value) => {
      const band = configuration.resetBands[bandIndex];
      if (!band) throw new Error(`Missing reset band ${bandIndex}.`);
      band.thresholds[mask] = value;
    },
  };
}

function coordinateForDeficitBand(bandIndex: number, mask: number): Coordinate {
  return {
    label: `deficitBand${bandIndex}.mask${mask}`,
    read: (configuration) =>
      configuration.deficitBands[bandIndex]?.thresholds[mask] ?? 0,
    write: (configuration, value) => {
      const band = configuration.deficitBands[bandIndex];
      if (!band) throw new Error(`Missing deficit band ${bandIndex}.`);
      band.thresholds[mask] = value;
    },
  };
}

function buildPolicyMarkdown(
  policy: FrozenThresholdPolicy,
  training: CandidateScore,
  validation: CandidateScore,
  baselineComparison: ReturnType<PairedComparisonAccumulator["summary"]>,
): string {
  const labels = [
    "尚无额外碎片",
    "仅5",
    "仅15",
    "5+15",
    "仅30",
    "5+30",
    "15+30",
    "5+15+30",
  ];
  const table = (thresholds: readonly number[]) =>
    [
      "| 当前地图碎片状态 | 最深重置格数 |",
      "|---|---:|",
      ...thresholds.map(
        (threshold, mask) => `| ${labels[mask] ?? mask} | ${threshold} |`,
      ),
    ].join("\n");
  const bandSections = [
    ...policy.resetBands.map(
      (band) =>
        `### 剩余重置 ${band.min}–${band.max} 次\n\n${table(band.thresholds)}`,
    ),
    ...policy.deficitBands.map(
      (band) =>
        `### 距目标 ${band.min}–${band.max} 碎片\n\n${table(band.thresholds)}`,
    ),
  ];
  return `# 进取阈值策略（独立验证后冻结）

> 仅声明为当前坐标下降搜索空间内最优，不声明全局最优。

## 使用规则

每次打开格子后，记录当前地图取得的5/15/30碎片奖组合和已开格数。先按剩余重置次数选择分段；若距600仅剩近目标缺口分段，则该分段覆盖前者。已开格数不超过表中阈值时请求重置，否则继续打开。任何重置请求都必须通过可完成性护栏。

## 基础阈值

${table(policy.thresholds)}

${bandSections.join("\n\n")}

## 独立数据

- 训练：${training.episodes.toLocaleString("en-US")}局，均值 ${training.mean.toFixed(4)}，P95/P99 ${training.p95}/${training.p99}。
- 验证：${validation.episodes.toLocaleString("en-US")}局，均值 ${validation.mean.toFixed(4)}（95% CI ${validation.ci95Low.toFixed(4)}–${validation.ci95High.toFixed(4)}），P95/P99 ${validation.p95}/${validation.p99}。
- 相对抽到30即重置：平均差 ${baselineComparison.meanDifference.toFixed(4)}（候选−基线，95% CI ${baselineComparison.ci95Low.toFixed(4)}–${baselineComparison.ci95High.toFixed(4)}）；负值代表更省。
- 验证失败局：${validation.failures}。
`;
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  if (hasArgument(cli, "help")) {
    console.log(usage());
    return;
  }

  const trainingEpisodes = integerArgument(cli, "train", 10_000);
  const validationEpisodes = integerArgument(cli, "validation", 50_000);
  const trainingSeed = stringArgument(cli, "train-seed", DEFAULT_TRAINING_SEED);
  const validationSeed = stringArgument(
    cli,
    "validation-seed",
    DEFAULT_VALIDATION_SEED,
  );
  const rounds = integerArgument(cli, "rounds", 1);
  const initialStep = integerArgument(cli, "step", 2);
  const topCount = integerArgument(cli, "top", 6);
  const banded = booleanArgument(cli, "banded", true);
  const outputDirectory = resolve(
    stringArgument(cli, "out", `results/optimization-${safeTimestamp()}`),
  );
  if (trainingSeed === validationSeed) {
    throw new Error("Training and validation seeds must be different.");
  }
  await mkdir(outputDirectory, { recursive: true });

  const started = performance.now();
  console.log(
    `预生成训练地图：M1，${trainingEpisodes.toLocaleString("en-US")}局，种子 ${trainingSeed}`,
  );
  const trainingMaps = precomputeMapOrders(
    trainingSeed,
    MODEL,
    0,
    trainingEpisodes,
    14,
    (completed) =>
      console.log(`  训练地图 ${completed.toLocaleString("en-US")}/${trainingEpisodes.toLocaleString("en-US")}`),
  );

  const cache = new Map<string, CandidateScore>();
  const history: CandidateScore[] = [];
  let evaluationNumber = 0;
  const evaluateTraining = (
    configuration: SearchConfiguration,
    label: string,
  ): CandidateScore => {
    const key = configurationKey(configuration);
    const cached = cache.get(key);
    if (cached) return cached;
    evaluationNumber += 1;
    const evaluationStarted = performance.now();
    const policy = policyFromConfiguration(configuration, `search_candidate`);
    const strategy = createStrategyFromFrozenPolicy(policy);
    let failures = 0;
    let sum = 0;
    let sumSquares = 0;
    const histogram = new Map<number, number>();
    for (let episodeIndex = 0; episodeIndex < trainingEpisodes; episodeIndex += 1) {
      const result = simulateEpisode({
        masterSeed: trainingSeed,
        episodeIndex,
        model: MODEL,
        strategy,
        mapOrderProvider: trainingMaps.provider,
      });
      if (!result.success) failures += 1;
      sum += result.cost;
      sumSquares += result.cost * result.cost;
      histogram.set(result.cost, (histogram.get(result.cost) ?? 0) + 1);
    }
    const mean = sum / trainingEpisodes;
    const variance =
      trainingEpisodes > 1
        ? (sumSquares - trainingEpisodes * mean * mean) /
          (trainingEpisodes - 1)
        : 0;
    const standardError = Math.sqrt(Math.max(0, variance)) / Math.sqrt(trainingEpisodes);
    const score: CandidateScore = {
      key,
      label,
      configuration: cloneConfiguration(configuration),
      episodes: trainingEpisodes,
      failures,
      mean,
      standardError,
      ci95Low: mean - 1.959963984540054 * standardError,
      ci95High: mean + 1.959963984540054 * standardError,
      p95: quantileFromHistogram(histogram, 0.95),
      p99: quantileFromHistogram(histogram, 0.99),
      elapsedMilliseconds: performance.now() - evaluationStarted,
    };
    cache.set(key, score);
    history.push(score);
    console.log(
      `  #${evaluationNumber} ${label}: mean=${score.mean.toFixed(4)}, P95=${score.p95}, P99=${score.p99}, failures=${score.failures}`,
    );
    return score;
  };

  let current: SearchConfiguration = {
    thresholds: [...DEFAULT_THRESHOLD_VECTOR],
    resetBands: [],
    deficitBands: [],
  };
  let currentScore = evaluateTraining(current, "initial");

  const searchCoordinates = (
    phase: string,
    coordinates: readonly Coordinate[],
  ): void => {
    const steps = initialStep === 1 ? [1] : [initialStep, 1];
    for (const step of steps) {
      for (let round = 0; round < rounds; round += 1) {
        let changed = false;
        for (const coordinate of coordinates) {
          const oldValue = coordinate.read(current);
          let bestConfiguration = current;
          let bestScore = currentScore;
          for (const candidateValue of new Set([
            Math.max(0, oldValue - step),
            Math.min(25, oldValue + step),
          ])) {
            if (candidateValue === oldValue) continue;
            const candidate = cloneConfiguration(current);
            coordinate.write(candidate, candidateValue);
            const score = evaluateTraining(
              candidate,
              `${phase}.${coordinate.label}.${oldValue}->${candidateValue}`,
            );
            if (compareScores(score, bestScore) < 0) {
              bestConfiguration = candidate;
              bestScore = score;
            }
          }
          if (bestConfiguration !== current) {
            current = bestConfiguration;
            currentScore = bestScore;
            changed = true;
          }
        }
        if (!changed) break;
      }
    }
  };

  searchCoordinates(
    "base",
    Array.from({ length: 7 }, (_, index) => coordinateForBase(index + 1)),
  );

  if (banded) {
    current = {
      ...cloneConfiguration(current),
      resetBands: [
        { min: 1, max: 2, thresholds: [...current.thresholds] },
        { min: 3, max: 5, thresholds: [...current.thresholds] },
        { min: 6, max: 9, thresholds: [...current.thresholds] },
        { min: 10, max: 13, thresholds: [...current.thresholds] },
      ],
    };
    currentScore = evaluateTraining(current, "reset-bands.initial");
    const resetCoordinates = current.resetBands.flatMap((_, bandIndex) =>
      Array.from({ length: 7 }, (_, index) =>
        coordinateForResetBand(bandIndex, index + 1),
      ),
    );
    searchCoordinates("reset-bands", resetCoordinates);

    current = {
      ...cloneConfiguration(current),
      deficitBands: [
        { min: 1, max: 100, thresholds: [...current.thresholds] },
      ],
    };
    currentScore = evaluateTraining(current, "near-target.initial");
    searchCoordinates(
      "near-target",
      Array.from({ length: 7 }, (_, index) =>
        coordinateForDeficitBand(0, index + 1),
      ),
    );
  }

  const uniqueRanked = [...cache.values()].sort(compareScores);
  const finalists = uniqueRanked.slice(0, Math.min(topCount, uniqueRanked.length));
  console.log(
    `预生成验证地图：M1，${validationEpisodes.toLocaleString("en-US")}局，种子 ${validationSeed}`,
  );
  const validationMaps = precomputeMapOrders(
    validationSeed,
    MODEL,
    0,
    validationEpisodes,
    14,
    (completed) =>
      console.log(`  验证地图 ${completed.toLocaleString("en-US")}/${validationEpisodes.toLocaleString("en-US")}`),
  );

  const validationScores: CandidateScore[] = [];
  for (const [index, finalist] of finalists.entries()) {
    const evaluationStarted = performance.now();
    const strategy = createStrategyFromFrozenPolicy(
      policyFromConfiguration(finalist.configuration, "validation_candidate"),
    );
    let failures = 0;
    let sum = 0;
    let sumSquares = 0;
    const histogram = new Map<number, number>();
    for (let episodeIndex = 0; episodeIndex < validationEpisodes; episodeIndex += 1) {
      const result = simulateEpisode({
        masterSeed: validationSeed,
        episodeIndex,
        model: MODEL,
        strategy,
        mapOrderProvider: validationMaps.provider,
      });
      if (!result.success) failures += 1;
      sum += result.cost;
      sumSquares += result.cost * result.cost;
      histogram.set(result.cost, (histogram.get(result.cost) ?? 0) + 1);
    }
    const mean = sum / validationEpisodes;
    const variance =
      validationEpisodes > 1
        ? (sumSquares - validationEpisodes * mean * mean) /
          (validationEpisodes - 1)
        : 0;
    const standardError =
      Math.sqrt(Math.max(0, variance)) / Math.sqrt(validationEpisodes);
    const validationScore: CandidateScore = {
      key: finalist.key,
      label: `validation-finalist-${index + 1}`,
      configuration: cloneConfiguration(finalist.configuration),
      episodes: validationEpisodes,
      failures,
      mean,
      standardError,
      ci95Low: mean - 1.959963984540054 * standardError,
      ci95High: mean + 1.959963984540054 * standardError,
      p95: quantileFromHistogram(histogram, 0.95),
      p99: quantileFromHistogram(histogram, 0.99),
      elapsedMilliseconds: performance.now() - evaluationStarted,
    };
    validationScores.push(validationScore);
    console.log(
      `  验证候选${index + 1}: mean=${mean.toFixed(4)}, P95=${validationScore.p95}, P99=${validationScore.p99}, failures=${failures}`,
    );
  }
  validationScores.sort(compareScores);
  const selectedValidation = validationScores[0];
  if (!selectedValidation) throw new Error("No candidate reached validation.");
  const selectedTraining = cache.get(selectedValidation.key);
  if (!selectedTraining) throw new Error("Selected validation candidate lost training metadata.");

  const selectedPolicy = policyFromConfiguration(selectedValidation.configuration);
  selectedPolicy.search = {
    trainingSeed,
    validationSeed,
    trainingEpisodes,
    validationEpisodes,
    generatedAt: new Date().toISOString(),
    scopeClaim: "best in the evaluated coordinate-descent threshold candidates",
    trainingMean: selectedTraining.mean,
    validationMean: selectedValidation.mean,
    validationP95: selectedValidation.p95,
    validationP99: selectedValidation.p99,
  };

  const candidateStrategy = createStrategyFromFrozenPolicy(selectedPolicy);
  const candidateAccumulator = new EvaluationAccumulator(
    {
      strategyId: candidateStrategy.id,
      strategyName: candidateStrategy.name,
      modelId: MODEL,
    },
    600,
    13,
  );
  const baselineAccumulator = new EvaluationAccumulator(
    {
      strategyId: resetOn30Strategy.id,
      strategyName: resetOn30Strategy.name,
      modelId: MODEL,
    },
    600,
    13,
  );
  const paired = new PairedComparisonAccumulator(
    candidateStrategy.id,
    resetOn30Strategy.id,
    MODEL,
  );
  for (let episodeIndex = 0; episodeIndex < validationEpisodes; episodeIndex += 1) {
    const candidateResult = simulateEpisode({
      masterSeed: validationSeed,
      episodeIndex,
      model: MODEL,
      strategy: candidateStrategy,
      mapOrderProvider: validationMaps.provider,
    });
    const baselineResult = simulateEpisode({
      masterSeed: validationSeed,
      episodeIndex,
      model: MODEL,
      strategy: resetOn30Strategy,
      mapOrderProvider: validationMaps.provider,
    });
    candidateAccumulator.add(toObservation(candidateResult));
    baselineAccumulator.add(toObservation(baselineResult));
    paired.add(candidateResult.cost, baselineResult.cost);
  }
  const pairedSummary = paired.summary();
  const selectedSummary = candidateAccumulator.summary();
  const baselineSummary = baselineAccumulator.summary();
  if (selectedSummary.failureRate !== 0) {
    throw new Error("Selected policy produced failures on validation data.");
  }

  const elapsedMilliseconds = performance.now() - started;
  const metadata = {
    runKind: "policy-optimization",
    generatedAt: new Date().toISOString(),
    model: MODEL,
    trainingSeed,
    validationSeed,
    trainingEpisodes,
    validationEpisodes,
    banded,
    rounds,
    initialStep,
    finalists: finalists.length,
    evaluatedUniqueCandidates: cache.size,
    elapsedMilliseconds,
    scopeClaim: "current searched threshold space only; not global optimum",
  };

  const candidateRows = [
    ...history.map((score) => ({
      dataset: "training",
      label: score.label,
      key: score.key,
      episodes: score.episodes,
      failures: score.failures,
      mean: score.mean,
      standardError: score.standardError,
      ci95Low: score.ci95Low,
      ci95High: score.ci95High,
      p95: score.p95,
      p99: score.p99,
      elapsedMilliseconds: score.elapsedMilliseconds,
    })),
    ...validationScores.map((score) => ({
      dataset: "validation",
      label: score.label,
      key: score.key,
      episodes: score.episodes,
      failures: score.failures,
      mean: score.mean,
      standardError: score.standardError,
      ci95Low: score.ci95Low,
      ci95High: score.ci95High,
      p95: score.p95,
      p99: score.p99,
      elapsedMilliseconds: score.elapsedMilliseconds,
    })),
  ];
  const report = buildPolicyMarkdown(
    selectedPolicy,
    selectedTraining,
    selectedValidation,
    pairedSummary,
  );
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "optimization-metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "optimized-policy.json"),
      `${JSON.stringify(selectedPolicy, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "policy-definition.json"),
      `${JSON.stringify(frozenPolicyToReportDefinition(selectedPolicy), null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "search-history.json"),
      `${JSON.stringify({ metadata, training: history, validation: validationScores }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "candidates.csv"),
      rowsToCsv(candidateRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "validation-summary.csv"),
      rowsToCsv([
        flattenObject(selectedSummary as unknown as Record<string, unknown>),
        flattenObject(baselineSummary as unknown as Record<string, unknown>),
      ]),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "paired-vs-reset-on-30.csv"),
      rowsToCsv([
        flattenObject(pairedSummary as unknown as Record<string, unknown>),
      ]),
      "utf8",
    ),
    writeFile(resolve(outputDirectory, "report.md"), report, "utf8"),
  ]);

  console.log(`\n已冻结策略：${resolve(outputDirectory, "optimized-policy.json")}`);
  console.log(
    `验证均值 ${selectedSummary.mean.toFixed(4)}；相对 reset_on_30 平均差 ${pairedSummary.meanDifference.toFixed(4)}（95% CI ${pairedSummary.ci95Low.toFixed(4)}–${pairedSummary.ci95High.toFixed(4)}）。`,
  );
  if (pairedSummary.ci95High >= 0) {
    console.warn("警告：验证集上相对 reset_on_30 的均值优势尚未达到95%统计可区分。");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
