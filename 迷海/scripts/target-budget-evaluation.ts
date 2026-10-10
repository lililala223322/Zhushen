import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ModelId } from "../src/domain/models";
import type { StrategyState } from "../src/domain/state";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import { EvaluationAccumulator } from "../src/reports/metrics";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import {
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  resetOn30Strategy,
  safeCreditWhitelistStrategy,
} from "../src/strategies";
import type { Strategy } from "../src/strategies/types";
import { precomputeMapOrders, toObservation } from "./lib/evaluation";

const EPISODES = 50_000;
const SEED = "mihai-emergency-full-clear-confirm-20260723-v1";
const MODELS: readonly ModelId[] = ["M1", "M2", "M3"];

function resetWarningWrapper(
  base: Strategy,
  afterResetsUsed: number,
): Strategy {
  return {
    id: `${base.id}_U${afterResetsUsed}`,
    name: `${base.name}+已重置${afterResetsUsed}次后全开`,
    description: "达到重置预警后永久停止提前重置。",
    kind: "conservative_wrapper",
    definition: {
      type: "emergency_full_clear",
      baseStrategyId: base.id,
      afterResetsUsed,
    },
    decide: (state: StrategyState) =>
      state.resetsUsed >= afterResetsUsed
        ? "open"
        : base.decide(state),
  };
}

async function main(): Promise<void> {
  const outputDirectory = resolve("results/target-budget-confirmation-v1");
  await mkdir(outputDirectory, { recursive: true });
  const strategies = [
    optimizedThresholdStrategy,
    optimizedConservative150Strategy,
    resetWarningWrapper(optimizedConservative150Strategy, 11),
    resetWarningWrapper(optimizedConservative150Strategy, 12),
    resetOn30Strategy,
    safeCreditWhitelistStrategy,
  ];
  const summaryRows: CsvRow[] = [];
  const cdfRows: CsvRow[] = [];

  for (const model of MODELS) {
    console.log(`${model}: precomputing maps`);
    const maps = precomputeMapOrders(SEED, model, 0, EPISODES, 14);
    for (const strategy of strategies) {
      const simulate = createEpisodeSimulator({
        masterSeed: SEED,
        model,
        strategy,
        targetFragments: 600,
        maxResets: 13,
        mapOrderProvider: maps.provider,
      });
      const accumulator = new EvaluationAccumulator(
        {
          strategyId: strategy.id,
          strategyName: strategy.name,
          modelId: model,
        },
        600,
        13,
      );
      let completedBy120 = 0;
      let completedExactly120 = 0;
      for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
        const result = simulate(episodeIndex);
        accumulator.add(toObservation(result));
        if (result.cost <= 120) completedBy120 += 1;
        if (result.cost === 120) completedExactly120 += 1;
      }
      const summary = accumulator.summary();
      summaryRows.push({
        modelId: model,
        strategyId: strategy.id,
        strategyName: strategy.name,
        episodes: EPISODES,
        meanCost: summary.mean,
        varianceCost: summary.variance,
        standardDeviationCost: summary.standardDeviation,
        ci95LowCost: summary.ci95Low,
        ci95HighCost: summary.ci95High,
        minimumCost: summary.min,
        p05Cost: summary.p05,
        p25Cost: summary.p25,
        p50Cost: summary.p50,
        p75Cost: summary.p75,
        p90Cost: summary.p90,
        p95Cost: summary.p95,
        p99Cost: summary.p99,
        maximumCost: summary.max,
        probabilityCompleteBefore120: summary.probabilityLt120,
        probabilityCompleteExactly120: completedExactly120 / EPISODES,
        probabilityCompleteBy120: completedBy120 / EPISODES,
        probabilityOver150: summary.probabilityGt150,
        meanResets: summary.meanResets,
        resetP50: summary.resetP50,
        resetP95: summary.resetP95,
      });
      for (const bin of accumulator.costBins()) {
        cdfRows.push({
          modelId: model,
          strategyId: strategy.id,
          cost: bin.value,
          count: bin.count,
          probability: bin.probability,
          cumulativeProbability: bin.cdf,
          survivalProbability: bin.survival,
        });
      }
    }
  }

  await Promise.all([
    writeFile(
      resolve(outputDirectory, "summary.csv"),
      rowsToCsv(summaryRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "cost-cdf.csv"),
      rowsToCsv(cdfRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          seed: SEED,
          episodesPerStrategyModel: EPISODES,
          models: MODELS,
          strategies: strategies.map((strategy) => ({
            id: strategy.id,
            name: strategy.name,
            definition: strategy.definition,
          })),
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
