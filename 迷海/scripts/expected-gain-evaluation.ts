import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ModelId } from "../src/domain/models";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import { EvaluationAccumulator } from "../src/reports/metrics";
import {
  buildCostCdfSvg,
  buildCostDistributionSvg,
} from "../src/reports/svgCharts";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import {
  expectedGainGreedyStrategy,
  gapAwareExpectedGainGreedyStrategy,
} from "../src/strategies/expectedGain";
import { optimizedThresholdStrategy } from "../src/strategies";
import type { Strategy } from "../src/strategies/types";
import { precomputeMapOrders, toObservation } from "./lib/evaluation";

const EPISODES = 100_000;
const TARGET = 600;
const MAX_RESETS = 13;
const MAX_MAPS = MAX_RESETS + 1;
const SEED = "mihai-expected-gain-independent-20260723-v1";
const MODELS: readonly ModelId[] = ["M1", "M2", "M3"];
const STRATEGIES: readonly Strategy[] = [
  optimizedThresholdStrategy,
  expectedGainGreedyStrategy,
  gapAwareExpectedGainGreedyStrategy,
];

function probabilityAtMost(
  histogram: ReadonlyMap<number, number>,
  episodes: number,
  threshold: number,
): number {
  let count = 0;
  for (const [cost, frequency] of histogram) {
    if (cost <= threshold) count += frequency;
  }
  return count / episodes;
}

async function main(): Promise<void> {
  const outputDirectory = resolve("results/expected-gain-greedy-v1");
  await mkdir(outputDirectory, { recursive: true });
  const summaryRows: CsvRow[] = [];
  const histogramRows: CsvRow[] = [];
  const resetRows: CsvRow[] = [];
  const costResetRows: CsvRow[] = [];
  const chartFiles: Array<{ readonly name: string; readonly content: string }> =
    [];

  for (const model of MODELS) {
    console.log(`${model}: precomputing ${EPISODES} × ${MAX_MAPS} maps`);
    const maps = precomputeMapOrders(
      SEED,
      model,
      0,
      EPISODES,
      MAX_MAPS,
    );
    const accumulators = STRATEGIES.map(
      (strategy) =>
        new EvaluationAccumulator(
          {
            strategyId: strategy.id,
            strategyName: strategy.name,
            modelId: model,
          },
          TARGET,
          MAX_RESETS,
        ),
    );
    const simulators = STRATEGIES.map((strategy) =>
      createEpisodeSimulator({
        masterSeed: SEED,
        model,
        strategy,
        targetFragments: TARGET,
        maxResets: MAX_RESETS,
        mapOrderProvider: maps.provider,
      }),
    );

    for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
      for (let strategyIndex = 0; strategyIndex < STRATEGIES.length; strategyIndex += 1) {
        const simulate = simulators[strategyIndex];
        const accumulator = accumulators[strategyIndex];
        if (simulate === undefined || accumulator === undefined) {
          throw new Error("Strategy evaluation arrays are misaligned.");
        }
        accumulator.add(toObservation(simulate(episodeIndex)));
      }
    }

    for (const accumulator of accumulators) {
      const summary = accumulator.summary();
      summaryRows.push({
        modelId: model,
        strategyId: summary.strategyId,
        strategyName: summary.strategyName,
        episodes: summary.episodes,
        meanCost: summary.mean,
        varianceCost: summary.variance,
        standardDeviationCost: summary.standardDeviation,
        standardErrorCost: summary.standardError,
        ci95LowCost: summary.ci95Low,
        ci95HighCost: summary.ci95High,
        minimumCost: summary.min,
        p01Cost: summary.p01,
        p05Cost: summary.p05,
        p10Cost: summary.p10,
        p25Cost: summary.p25,
        p50Cost: summary.p50,
        p75Cost: summary.p75,
        p90Cost: summary.p90,
        p95Cost: summary.p95,
        p99Cost: summary.p99,
        maximumCost: summary.max,
        cvar95Cost: summary.cvar95,
        cvar99Cost: summary.cvar99,
        skewnessCost: summary.skewness,
        probabilityCompleteBy120: probabilityAtMost(
          accumulator.costHistogram,
          summary.episodes,
          120,
        ),
        probabilityCompleteBy130: probabilityAtMost(
          accumulator.costHistogram,
          summary.episodes,
          130,
        ),
        probabilityCompleteBy140: probabilityAtMost(
          accumulator.costHistogram,
          summary.episodes,
          140,
        ),
        probabilityCompleteBy150: probabilityAtMost(
          accumulator.costHistogram,
          summary.episodes,
          150,
        ),
        probabilityCostAbove150: summary.probabilityGt150,
        probabilityCostAbove155: summary.probabilityGt155,
        meanResets: summary.meanResets,
        p50Resets: summary.resetP50,
        p95Resets: summary.resetP95,
        probabilityAllResetsUsed: summary.probabilityAllResetsUsed,
        meanSavingsVs150: summary.meanSavingsVs150,
        meanSavingsPercentVs150: summary.meanSavingsPercentVs150,
      });
      for (const bin of accumulator.costBins()) {
        histogramRows.push({
          modelId: model,
          strategyId: summary.strategyId,
          cost: bin.value,
          count: bin.count,
          probability: bin.probability,
          cumulativeProbability: bin.cdf,
        });
      }
      for (const bin of accumulator.resetBins()) {
        resetRows.push({
          modelId: model,
          strategyId: summary.strategyId,
          resetsUsed: bin.value,
          count: bin.count,
          probability: bin.count / summary.episodes,
        });
      }
      for (const bin of accumulator.costResetBins()) {
        costResetRows.push({
          modelId: model,
          strategyId: summary.strategyId,
          cost: bin.x,
          resetsUsed: bin.y,
          count: bin.count,
          probability: bin.count / summary.episodes,
        });
      }
    }

    const comparisonSeries = accumulators
      .filter((accumulator) =>
        [
          optimizedThresholdStrategy.id,
          gapAwareExpectedGainGreedyStrategy.id,
        ].includes(accumulator.descriptor.strategyId),
      )
      .map((accumulator) => ({
        label:
          accumulator.descriptor.strategyId ===
          optimizedThresholdStrategy.id
            ? "S01/V1"
            : "G0一步期望贪心",
        color:
          accumulator.descriptor.strategyId ===
          optimizedThresholdStrategy.id
            ? "#27d3c2"
            : "#22a6d5",
        bins: accumulator.costBins(),
      }));
    chartFiles.push(
      {
        name: `cost-pmf-${model}.svg`,
        content: buildCostDistributionSvg(model, comparisonSeries),
      },
      {
        name: `cost-cdf-${model}.svg`,
        content: buildCostCdfSvg(model, comparisonSeries),
      },
    );
  }

  await Promise.all([
    writeFile(
      resolve(outputDirectory, "summary.csv"),
      rowsToCsv(summaryRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "reset-histogram.csv"),
      rowsToCsv(resetRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "cost-reset-heatmap.csv"),
      rowsToCsv(costResetRows),
      "utf8",
    ),
    ...chartFiles.map((file) =>
      writeFile(
        resolve(outputDirectory, file.name),
        file.content,
        "utf8",
      ),
    ),
    writeFile(
      resolve(outputDirectory, "cost-histogram.csv"),
      rowsToCsv(histogramRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          runKind: "one-step-expected-gain-baseline",
          episodesPerModel: EPISODES,
          models: MODELS,
          strategies: STRATEGIES.map((strategy) => ({
            id: strategy.id,
            definition: strategy.definition,
          })),
          seed: SEED,
          targetFragments: TARGET,
          maxResets: MAX_RESETS,
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);
  console.log(`Completed: ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
