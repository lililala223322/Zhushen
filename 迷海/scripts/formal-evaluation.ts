import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  isModelId,
  MODEL_DEFINITIONS,
  type ModelId,
} from "../src/domain/models";
import {
  buildConvergenceSvg,
  buildCostDistributionSvg,
  buildModelSensitivitySvg,
} from "../src/reports/svgCharts";
import { buildDecisionReport } from "../src/reports/decisionReport";
import { flattenObject, rowsToCsv, type CsvRow } from "../src/reports/csv";
import {
  EvaluationAccumulator,
  PairedComparisonAccumulator,
} from "../src/reports/metrics";
import type {
  ConvergencePoint,
  EvaluationMetadata,
  PairedComparisonMetrics,
  PolicyDefinition,
  ReportModelId,
  SummaryMetrics,
} from "../src/reports/types";
import { createMapGenerator } from "../src/simulation/mapGenerator";
import { PRNG_NAME, PRNG_VERSION } from "../src/simulation/rng";
import { simulateEpisode } from "../src/simulation/simulator";
import { createConservativeStrategy } from "../src/strategies/conservative";
import {
  getStrategyById,
  STRATEGIES,
} from "../src/strategies/index";
import type { Strategy } from "../src/strategies/types";
import {
  hasArgument,
  integerArgument,
  listArgument,
  optionalStringArgument,
  parseCliArguments,
  stringArgument,
} from "./lib/cli";
import {
  createEpisodeMapCacheFromGenerator,
  toObservation,
} from "./lib/evaluation";
import {
  createStrategyFromFrozenPolicy,
  frozenPolicyToReportDefinition,
  loadFrozenPolicy,
  strategyToReportDefinition,
  type FrozenThresholdPolicy,
} from "./lib/policy";

const DEFAULT_FORMAL_SEED = "mihai-independent-formal-test-v1";
const FORMAL_MINIMUM_EPISODES = 1_000_000;
const CHART_COLORS = [
  "#175cd3",
  "#039855",
  "#f79009",
  "#d92d20",
  "#7a5af8",
  "#06aed4",
  "#667085",
] as const;

interface StrategyResolution {
  strategies: Strategy[];
  frozenPolicy?: FrozenThresholdPolicy;
}

function usage(): string {
  return `
迷海三模型正式评估与报告导出

用法：
  npm run formal -- [选项]

必要能力：
  --episodes <n>          每策略/每模型局数，默认 1000000
  --batch <n>             进度与收敛快照批次，默认 10000
  --models <M1,M2,M3>     默认 M1,M2,M3
  --strategies <ids>      默认核心四策略；逗号分隔
  --seed <seed>           正式测试主种子，默认 ${DEFAULT_FORMAL_SEED}

其他选项：
  --policy <json>         optimize-policy.ts 产出的 optimized-policy.json
  --target <n>            目标碎片，默认 600
  --max-resets <n>        最大重置，默认 13
  --out <dir>             输出目录，默认 results/formal-<时间戳>
  --help                  显示本说明

传入 --policy 后可在策略列表使用 optimized 和
optimized_conservative_150。未指定 --strategies 时会自动评估它们。
低于 ${FORMAL_MINIMUM_EPISODES.toLocaleString("en-US")} 局会运行，但元数据标记为 validation，
不能作为 goal.md 定义的正式最终证据。
`.trim();
}

function safeTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function uniqueById(strategies: readonly Strategy[]): Strategy[] {
  const seen = new Set<string>();
  const unique: Strategy[] = [];
  for (const strategy of strategies) {
    if (!seen.has(strategy.id)) {
      unique.push(strategy);
      seen.add(strategy.id);
    }
  }
  return unique;
}

async function resolveStrategies(
  requestedIds: readonly string[],
  policyPath: string | undefined,
): Promise<StrategyResolution> {
  const frozenPolicy =
    policyPath === undefined ? undefined : await loadFrozenPolicy(policyPath);
  const optimized =
    frozenPolicy === undefined
      ? undefined
      : createStrategyFromFrozenPolicy(frozenPolicy);
  const optimizedConservative =
    optimized === undefined
      ? undefined
      : createConservativeStrategy(optimized, 150, {
          id: "optimized_conservative_150",
          name: "优化策略的保守150版",
        });
  const resolved = requestedIds.map((id): Strategy => {
    if (id === "optimized") {
      if (!optimized) throw new Error("--strategies optimized requires --policy.");
      return optimized;
    }
    if (id === "optimized_conservative_150") {
      if (!optimizedConservative) {
        throw new Error(
          "--strategies optimized_conservative_150 requires --policy.",
        );
      }
      return optimizedConservative;
    }
    if (optimized && id === optimized.id) return optimized;
    try {
      return getStrategyById(id);
    } catch {
      const registered = STRATEGIES.map((strategy) => strategy.id).join(", ");
      throw new Error(
        `Unknown strategy "${id}". Registered: ${registered}; policy aliases: optimized, optimized_conservative_150.`,
      );
    }
  });
  return { strategies: uniqueById(resolved), ...(frozenPolicy ? { frozenPolicy } : {}) };
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
    const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string"
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

function accumulatorKey(model: ModelId, strategyId: string): string {
  return `${model}:${strategyId}`;
}

function pairKey(model: ModelId, candidateId: string, baselineId: string): string {
  return `${model}:${candidateId}:${baselineId}`;
}

function chartSafe(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/gu, "_");
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  if (hasArgument(cli, "help")) {
    console.log(usage());
    return;
  }

  const episodes = integerArgument(cli, "episodes", FORMAL_MINIMUM_EPISODES);
  const batchSize = integerArgument(cli, "batch", 10_000);
  const targetFragments = integerArgument(cli, "target", 600);
  const maxResets = integerArgument(cli, "max-resets", 13, 0);
  const seed = stringArgument(cli, "seed", DEFAULT_FORMAL_SEED);
  const modelStrings = listArgument(cli, "models", ["M1", "M2", "M3"]);
  const models = modelStrings.map((model): ModelId => {
    if (!isModelId(model)) throw new Error(`Unknown model "${model}".`);
    return model;
  });
  const policyPath = optionalStringArgument(cli, "policy");
  const defaultStrategyIds =
    policyPath === undefined
      ? [
          "full_clear",
          "reset_on_30",
          "aggressive_threshold",
          "conservative_150",
        ]
      : [
          "full_clear",
          "reset_on_30",
          "optimized",
          "optimized_conservative_150",
        ];
  const requestedStrategyIds = listArgument(
    cli,
    "strategies",
    defaultStrategyIds,
  );
  const { strategies, frozenPolicy } = await resolveStrategies(
    requestedStrategyIds,
    policyPath,
  );
  if (strategies.length < 1) throw new Error("At least one strategy is required.");

  const outputDirectory = resolve(
    stringArgument(
      cli,
      "out",
      `results/${episodes >= FORMAL_MINIMUM_EPISODES ? "formal" : "validation"}-${safeTimestamp()}`,
    ),
  );
  const chartsDirectory = resolve(outputDirectory, "charts");
  await mkdir(chartsDirectory, { recursive: true });
  if (episodes < FORMAL_MINIMUM_EPISODES) {
    console.warn(
      `警告：${episodes.toLocaleString("en-US")}局低于正式最低要求 ${FORMAL_MINIMUM_EPISODES.toLocaleString("en-US")}；本次标记为 validation。`,
    );
  }

  const startedAt = new Date();
  const started = performance.now();
  const accumulators = new Map<string, EvaluationAccumulator>();
  const pairedAccumulators = new Map<string, PairedComparisonAccumulator>();
  const convergence: ConvergencePoint[] = [];
  const primaryStrategy =
    strategies.find(
      (strategy) =>
        strategy.id === frozenPolicy?.id ||
        strategy.id === "aggressive_threshold",
    ) ??
    strategies.find((strategy) => strategy.id !== "full_clear") ??
    strategies[0];
  if (!primaryStrategy) throw new Error("Unable to choose a primary strategy.");

  for (const model of models) {
    for (const strategy of strategies) {
      accumulators.set(
        accumulatorKey(model, strategy.id),
        new EvaluationAccumulator(
          {
            strategyId: strategy.id,
            strategyName: strategy.name,
            modelId: model as ReportModelId,
          },
          targetFragments,
          maxResets,
        ),
      );
    }
    for (const baseline of strategies) {
      if (baseline.id === primaryStrategy.id) continue;
      pairedAccumulators.set(
        pairKey(model, primaryStrategy.id, baseline.id),
        new PairedComparisonAccumulator(
          primaryStrategy.id,
          baseline.id,
          model as ReportModelId,
        ),
      );
    }

    const generateMap = createMapGenerator(seed, model);
    const modelStarted = performance.now();
    for (let batchStart = 0; batchStart < episodes; batchStart += batchSize) {
      const batchEnd = Math.min(episodes, batchStart + batchSize);
      for (let episodeIndex = batchStart; episodeIndex < batchEnd; episodeIndex += 1) {
        const mapOrderProvider = createEpisodeMapCacheFromGenerator(
          generateMap,
          model,
          episodeIndex,
        );
        const episodeCosts = new Map<string, number>();
        for (const strategy of strategies) {
          const result = simulateEpisode({
            masterSeed: seed,
            episodeIndex,
            model,
            strategy,
            targetFragments,
            maxResets,
            mapOrderProvider,
          });
          const accumulator = accumulators.get(
            accumulatorKey(model, strategy.id),
          );
          if (!accumulator) throw new Error("Missing evaluation accumulator.");
          accumulator.add(toObservation(result));
          episodeCosts.set(strategy.id, result.cost);
        }
        const primaryCost = episodeCosts.get(primaryStrategy.id);
        if (primaryCost === undefined) throw new Error("Missing primary strategy cost.");
        for (const baseline of strategies) {
          if (baseline.id === primaryStrategy.id) continue;
          const baselineCost = episodeCosts.get(baseline.id);
          const paired = pairedAccumulators.get(
            pairKey(model, primaryStrategy.id, baseline.id),
          );
          if (baselineCost === undefined || !paired) {
            throw new Error("Missing paired comparison state.");
          }
          paired.add(primaryCost, baselineCost);
        }
      }
      for (const strategy of strategies) {
        const accumulator = accumulators.get(
          accumulatorKey(model, strategy.id),
        );
        if (accumulator) convergence.push(accumulator.convergencePoint());
      }
      const completed = batchEnd;
      const elapsedSeconds = (performance.now() - modelStarted) / 1_000;
      const rate = completed / Math.max(elapsedSeconds, 0.001);
      console.log(
        `${model}: ${completed.toLocaleString("en-US")}/${episodes.toLocaleString("en-US")}局 (${((completed / episodes) * 100).toFixed(1)}%)，${Math.round(rate).toLocaleString("en-US")}局/秒`,
      );
    }
  }

  const summaries = [...accumulators.values()].map((accumulator) =>
    accumulator.summary(),
  );
  const comparisons = [...pairedAccumulators.values()].map((accumulator) =>
    accumulator.summary(),
  );
  const policies: PolicyDefinition[] = strategies.map((strategy) =>
    frozenPolicy && strategy.id === frozenPolicy.id
      ? frozenPolicyToReportDefinition(frozenPolicy)
      : strategyToReportDefinition(strategy),
  );
  const elapsedMilliseconds = performance.now() - started;
  const metadata: EvaluationMetadata & {
    formalMinimumEpisodes: number;
    meetsFormalSampleRequirement: boolean;
    workerCount: number;
    startedAt: string;
    completedAt: string;
  } = {
    generatedAt: new Date().toISOString(),
    runKind:
      episodes >= FORMAL_MINIMUM_EPISODES ? "formal-test" : "validation",
    masterSeed: seed,
    prng: `${PRNG_NAME} v${PRNG_VERSION}`,
    episodesPerStrategyModel: episodes,
    batchSize,
    targetFragments,
    maxResets,
    models: models as ReportModelId[],
    strategies: strategies.map((strategy) => strategy.id),
    applicationVersion: await applicationVersion(),
    gitCommit: gitCommit(),
    runtime: `Node ${process.version}`,
    command: process.argv.join(" "),
    elapsedMilliseconds,
    formalMinimumEpisodes: FORMAL_MINIMUM_EPISODES,
    meetsFormalSampleRequirement: episodes >= FORMAL_MINIMUM_EPISODES,
    workerCount: 1,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
  };

  const summaryRows = summaries.map((summary) =>
    flattenObject(summary as unknown as Record<string, unknown>),
  );
  const costHistogramRows: CsvRow[] = [];
  const cdfRows: CsvRow[] = [];
  const resetHistogramRows: CsvRow[] = [];
  const mapHistogramRows: CsvRow[] = [];
  const overflowRows: CsvRow[] = [];
  const fragmentRows: CsvRow[] = [];
  const heatmapRows: CsvRow[] = [];
  for (const accumulator of accumulators.values()) {
    const prefix = {
      modelId: accumulator.descriptor.modelId,
      strategyId: accumulator.descriptor.strategyId,
      strategyName: accumulator.descriptor.strategyName,
    };
    for (const bin of accumulator.costBins()) {
      costHistogramRows.push({
        ...prefix,
        cost: bin.value,
        count: bin.count,
        probability: bin.probability,
      });
      cdfRows.push({
        ...prefix,
        cost: bin.value,
        cdf: bin.cdf,
        survival: bin.survival,
      });
    }
    for (const bin of accumulator.resetBins()) {
      resetHistogramRows.push({
        ...prefix,
        resetsUsed: bin.value,
        count: bin.count,
        probability: bin.count / accumulator.episodes,
      });
    }
    for (const bin of accumulator.mapCountBins()) {
      mapHistogramRows.push({
        ...prefix,
        mapsUsed: bin.value,
        count: bin.count,
        probability: bin.count / accumulator.episodes,
      });
    }
    for (const bin of accumulator.overflowBins()) {
      overflowRows.push({
        ...prefix,
        overflowFragments: bin.value,
        count: bin.count,
        probability: bin.count / accumulator.episodes,
      });
    }
    for (const fragment of [5, 15, 30] as const) {
      for (const bin of accumulator.fragmentBins(fragment)) {
        fragmentRows.push({
          ...prefix,
          recordType: "histogram",
          fragmentValue: fragment,
          acquisitions: bin.value,
          count: bin.count,
          probability: bin.count / accumulator.episodes,
        });
      }
    }
    const summary = accumulator.summary();
    for (const lowCost of summary.lowCostFragmentAverages) {
      fragmentRows.push({
        ...prefix,
        recordType: "low_cost_average",
        costSegment: lowCost.label,
        episodes: lowCost.episodes,
        meanFragment5: lowCost.fragment5,
        meanFragment15: lowCost.fragment15,
        meanFragment30: lowCost.fragment30,
      });
    }
    for (const bin of accumulator.costResetBins()) {
      heatmapRows.push({
        ...prefix,
        cost: bin.x,
        resetsUsed: bin.y,
        count: bin.count,
        probability: bin.count / accumulator.episodes,
      });
    }
  }
  const pairedRows = comparisons.map((comparison) =>
    flattenObject(comparison as unknown as Record<string, unknown>),
  );
  const pairedDifferenceRows: CsvRow[] = [];
  for (const accumulator of pairedAccumulators.values()) {
    for (const [difference, count] of [...accumulator.differenceHistogram.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      pairedDifferenceRows.push({
        modelId: accumulator.modelId,
        candidateStrategyId: accumulator.candidateStrategyId,
        baselineStrategyId: accumulator.baselineStrategyId,
        difference,
        count,
        probability: count / episodes,
      });
    }
  }

  const chartFiles: string[] = [];
  const colorByStrategy: Record<string, string> = {};
  strategies.forEach((strategy, index) => {
    colorByStrategy[strategy.id] = CHART_COLORS[index % CHART_COLORS.length] ?? "#344054";
  });
  for (const model of models) {
    const distributionFile = `charts/cost-distribution-${model}.svg`;
    const convergenceFile = `charts/mean-convergence-${model}.svg`;
    const distributionSvg = buildCostDistributionSvg(
      `${MODEL_DEFINITIONS[model].name}`,
      strategies.map((strategy) => {
        const accumulator = accumulators.get(
          accumulatorKey(model, strategy.id),
        );
        if (!accumulator) throw new Error("Missing chart accumulator.");
        return {
          label: strategy.name,
          color: colorByStrategy[strategy.id] ?? "#344054",
          bins: accumulator.costBins(),
        };
      }),
    );
    const convergenceSvg = buildConvergenceSvg(
      MODEL_DEFINITIONS[model].name,
      convergence.filter((point) => point.modelId === model),
      colorByStrategy,
    );
    await Promise.all([
      writeFile(resolve(outputDirectory, distributionFile), distributionSvg, "utf8"),
      writeFile(resolve(outputDirectory, convergenceFile), convergenceSvg, "utf8"),
    ]);
    chartFiles.push(distributionFile, convergenceFile);
  }
  const sensitivityFile = `charts/model-sensitivity-${chartSafe(primaryStrategy.id)}.svg`;
  await writeFile(
    resolve(outputDirectory, sensitivityFile),
    buildModelSensitivitySvg(primaryStrategy.id, summaries),
    "utf8",
  );
  chartFiles.push(sensitivityFile);

  const requiredDataFiles = [
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
    "report.md",
  ];
  const extraDataFiles = [
    "overflow-histogram.csv",
    "cost-reset-heatmap.csv",
    "paired-difference-histogram.csv",
    ...chartFiles,
  ];
  let report = buildDecisionReport({
    metadata,
    summaries,
    comparisons,
    policies,
    dataFiles: [...requiredDataFiles, ...extraDataFiles],
  });
  report += `\n## 静态决策图\n\n${models
    .map(
      (model) =>
        `### ${model} 成本分布\n\n![${model} 成本分布](charts/cost-distribution-${model}.svg)\n\n![${model} 均值收敛](charts/mean-convergence-${model}.svg)`,
    )
    .join("\n\n")}\n\n### 主策略模型敏感性\n\n![模型敏感性](${sensitivityFile})\n`;

  await Promise.all([
    writeFile(
      resolve(outputDirectory, "run-metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    ),
    writeFile(resolve(outputDirectory, "summary.csv"), rowsToCsv(summaryRows), "utf8"),
    writeFile(
      resolve(outputDirectory, "summary.json"),
      `${JSON.stringify({ metadata, summaries, comparisons, convergence }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "cost-histogram.csv"),
      rowsToCsv(costHistogramRows),
      "utf8",
    ),
    writeFile(resolve(outputDirectory, "cdf.csv"), rowsToCsv(cdfRows), "utf8"),
    writeFile(
      resolve(outputDirectory, "reset-histogram.csv"),
      rowsToCsv(resetHistogramRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "map-count-histogram.csv"),
      rowsToCsv(mapHistogramRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "overflow-histogram.csv"),
      rowsToCsv(overflowRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "fragment-acquisition.csv"),
      rowsToCsv(fragmentRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "cost-reset-heatmap.csv"),
      rowsToCsv(heatmapRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "paired-comparisons.csv"),
      rowsToCsv(pairedRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "paired-difference-histogram.csv"),
      rowsToCsv(pairedDifferenceRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "convergence.csv"),
      rowsToCsv(
        convergence.map((point) =>
          flattenObject(point as unknown as Record<string, unknown>),
        ),
      ),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "policy-definition.json"),
      `${JSON.stringify(policies, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "model-definition.json"),
      `${JSON.stringify(MODEL_DEFINITIONS, null, 2)}\n`,
      "utf8",
    ),
    writeFile(resolve(outputDirectory, "report.md"), report, "utf8"),
  ]);

  console.log(`\n评估完成：${outputDirectory}`);
  console.log(
    `耗时 ${(elapsedMilliseconds / 1_000).toFixed(1)}秒；主策略 ${primaryStrategy.id}。`,
  );
  const failed = summaries.filter((summary) => summary.failures > 0);
  if (failed.length > 0) {
    console.error(
      `发现失败局：${failed.map((summary) => `${summary.modelId}/${summary.strategyId}=${summary.failures}`).join(", ")}`,
    );
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
