import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildM3BellmanSolver } from "../src/optimization/m3Bellman";
import type { StrategyState } from "../src/domain/state";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import {
  EvaluationAccumulator,
  PairedComparisonAccumulator,
} from "../src/reports/metrics";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import { gapAwareExpectedGainGreedyStrategy } from "../src/strategies/expectedGain";
import { optimizedThresholdStrategy } from "../src/strategies";
import type { Strategy } from "../src/strategies/types";
import { precomputeMapOrders, toObservation } from "./lib/evaluation";

const EPISODES = 100_000;
const TARGET = 600;
const MAX_RESETS = 13;
const MAX_MAPS = MAX_RESETS + 1;
const MODEL = "M3" as const;
const SEED = "mihai-m3-bellman-confirmation-20260723-v1";

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
  const outputDirectory = resolve("results/m3-bellman-confirmation-v1");
  await mkdir(outputDirectory, { recursive: true });

  const solver = buildM3BellmanSolver({
    targetFragments: TARGET,
    maxResets: MAX_RESETS,
  });
  const bellmanStrategy: Strategy = Object.freeze({
    id: "m3_bellman_optimal",
    name: "M3 Bellman在线最优",
    description:
      "按剩余缺口、剩余重置及当前地图库存查询精确Bellman最小期望成本。",
    kind: "threshold",
    definition: Object.freeze({
      logic: "exact_stochastic_shortest_path",
      model: MODEL,
      state:
        "gap × resetsRemaining × ordinaryRemaining × remainingFragmentMask",
      theoreticalExpectedCost: solver.initialExpectedOperations,
    }),
    decide: (state: StrategyState) => solver.decide(state),
  });
  const strategies: readonly Strategy[] = [
    optimizedThresholdStrategy,
    gapAwareExpectedGainGreedyStrategy,
    bellmanStrategy,
  ];

  console.log(`${MODEL}: precomputing ${EPISODES} × ${MAX_MAPS} maps`);
  const maps = precomputeMapOrders(
    SEED,
    MODEL,
    0,
    EPISODES,
    MAX_MAPS,
  );
  const accumulators = new Map<string, EvaluationAccumulator>();
  const simulators = new Map<string, ReturnType<typeof createEpisodeSimulator>>();
  for (const strategy of strategies) {
    accumulators.set(
      strategy.id,
      new EvaluationAccumulator(
        {
          strategyId: strategy.id,
          strategyName: strategy.name,
          modelId: MODEL,
        },
        TARGET,
        MAX_RESETS,
      ),
    );
    simulators.set(
      strategy.id,
      createEpisodeSimulator({
        masterSeed: SEED,
        model: MODEL,
        strategy,
        targetFragments: TARGET,
        maxResets: MAX_RESETS,
        mapOrderProvider: maps.provider,
      }),
    );
  }
  const paired = new PairedComparisonAccumulator(
    bellmanStrategy.id,
    optimizedThresholdStrategy.id,
    MODEL,
  );

  for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
    const costs = new Map<string, number>();
    for (const strategy of strategies) {
      const simulate = simulators.get(strategy.id);
      const accumulator = accumulators.get(strategy.id);
      if (simulate === undefined || accumulator === undefined) {
        throw new Error(`Missing evaluator for ${strategy.id}.`);
      }
      const result = simulate(episodeIndex);
      accumulator.add(toObservation(result));
      costs.set(strategy.id, result.cost);
    }
    const bellmanCost = costs.get(bellmanStrategy.id);
    const s01Cost = costs.get(optimizedThresholdStrategy.id);
    if (bellmanCost === undefined || s01Cost === undefined) {
      throw new Error("Missing paired cost.");
    }
    paired.add(bellmanCost, s01Cost);
  }

  const summaryRows: CsvRow[] = [];
  const histogramRows: CsvRow[] = [];
  for (const strategy of strategies) {
    const accumulator = accumulators.get(strategy.id);
    if (accumulator === undefined) throw new Error("Missing accumulator.");
    const summary = accumulator.summary();
    summaryRows.push({
      modelId: MODEL,
      strategyId: strategy.id,
      strategyName: strategy.name,
      episodes: summary.episodes,
      theoreticalMeanCost:
        strategy.id === bellmanStrategy.id
          ? solver.initialExpectedOperations
          : "",
      simulatedMeanCost: summary.mean,
      standardDeviationCost: summary.standardDeviation,
      standardErrorCost: summary.standardError,
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
      meanResets: summary.meanResets,
      probabilityAllResetsUsed: summary.probabilityAllResetsUsed,
    });
    for (const bin of accumulator.costBins()) {
      histogramRows.push({
        modelId: MODEL,
        strategyId: strategy.id,
        cost: bin.value,
        count: bin.count,
        probability: bin.probability,
        cumulativeProbability: bin.cdf,
      });
    }
  }
  const pairedSummary = paired.summary();
  const resetLimitRows: CsvRow[] = [];
  for (let resetsRemaining = 0; resetsRemaining <= MAX_RESETS; resetsRemaining += 1) {
    const expectedCost = solver.value({
      gap: TARGET,
      resetsRemaining,
      ordinaryRemaining: 22,
      remainingFragmentMask: 7,
    });
    resetLimitRows.push({
      maxResets: resetsRemaining,
      maximumMaps: resetsRemaining + 1,
      expectedOptimalCost: Number.isFinite(expectedCost)
        ? expectedCost
        : "unreachable",
    });
  }

  await Promise.all([
    writeFile(
      resolve(outputDirectory, "summary.csv"),
      rowsToCsv(summaryRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "cost-histogram.csv"),
      rowsToCsv(histogramRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "paired-bellman-vs-s01.json"),
      `${JSON.stringify(pairedSummary, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "reset-limit-curve.csv"),
      rowsToCsv(resetLimitRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          runKind: "exact-m3-bellman-confirmation",
          episodes: EPISODES,
          model: MODEL,
          strategies: strategies.map((strategy) => strategy.id),
          seed: SEED,
          targetFragments: TARGET,
          maxResets: MAX_RESETS,
          theoreticalOptimalExpectedCost:
            solver.initialExpectedOperations,
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);
  console.log(
    `Theory=${solver.initialExpectedOperations}; completed: ${outputDirectory}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
