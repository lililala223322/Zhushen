import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  getFragmentValue,
  MAP_SIZE,
} from "../src/domain/prizePool";
import type { ModelId } from "../src/domain/models";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import { optimizedThresholdStrategy } from "../src/strategies";
import { precomputeMapOrders } from "./lib/evaluation";

const EPISODES = 10_000;
const TARGET = 600;
const MAX_RESETS = 13;
const MAX_MAPS = MAX_RESETS + 1;
const COST_CEILING = 150;
const SEED = "mihai-clairvoyant-oracle-confirm-20260723-v1";
const MODELS: readonly ModelId[] = ["M1", "M2", "M3"];
const CI95_Z = 1.959963984540054;

class IntegerMetric {
  count = 0;
  mean = 0;
  m2 = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;
  readonly histogram = new Map<number, number>();

  add(value: number): void {
    this.count += 1;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (value - this.mean);
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.histogram.set(value, (this.histogram.get(value) ?? 0) + 1);
  }

  get variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }

  get standardDeviation(): number {
    return Math.sqrt(this.variance);
  }

  get standardError(): number {
    return this.standardDeviation / Math.sqrt(this.count);
  }

  quantile(probability: number): number {
    const rank = Math.max(1, Math.ceil(probability * this.count));
    let cumulative = 0;
    for (const [value, count] of [...this.histogram.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      cumulative += count;
      if (cumulative >= rank) return value;
    }
    return this.max;
  }

  probabilityAtMost(value: number): number {
    let matches = 0;
    for (const [observed, count] of this.histogram) {
      if (observed <= value) matches += count;
    }
    return matches / this.count;
  }
}

/**
 * Impossible-information upper bound: the oracle sees all 14 complete future
 * map orders before acting and may choose one prefix of 1..25 opens from each
 * map. Every transition consumes one of the 13 reset tokens.
 */
function clairvoyantMinimumCost(
  episodeIndex: number,
  model: ModelId,
  provider: ReturnType<typeof precomputeMapOrders>["provider"],
): number {
  let current = new Int16Array(COST_CEILING + 1);
  current.fill(-1);
  current[0] = 0;
  let bestCost = COST_CEILING;

  for (let mapIndex = 0; mapIndex < MAX_MAPS; mapIndex += 1) {
    const order = provider(episodeIndex, mapIndex, model);
    const prefixYield = new Int16Array(MAP_SIZE + 1);
    for (let depth = 1; depth <= MAP_SIZE; depth += 1) {
      const categoryIndex = order[depth - 1];
      if (categoryIndex === undefined) {
        throw new Error("Oracle map is missing an item.");
      }
      prefixYield[depth] =
        (prefixYield[depth - 1] ?? 0) +
        2 +
        getFragmentValue(categoryIndex);
    }

    const next = new Int16Array(COST_CEILING + 1);
    next.fill(-1);
    for (let previousCost = 0; previousCost < bestCost; previousCost += 1) {
      const previousFragments = current[previousCost] ?? -1;
      if (previousFragments < 0) continue;
      const maximumDepth = Math.min(
        MAP_SIZE,
        bestCost - previousCost,
      );
      for (let depth = 1; depth <= maximumDepth; depth += 1) {
        const cost = previousCost + depth;
        const fragments =
          previousFragments + (prefixYield[depth] ?? 0);
        if (fragments >= TARGET) {
          bestCost = Math.min(bestCost, cost);
          break;
        }
        if (
          mapIndex + 1 < MAX_MAPS &&
          fragments > (next[cost] ?? -1)
        ) {
          next[cost] = fragments;
        }
      }
    }
    current = next;
  }
  return bestCost;
}

async function main(): Promise<void> {
  const outputDirectory = resolve(
    "results/clairvoyant-oracle-confirmation-v1",
  );
  await mkdir(outputDirectory, { recursive: true });
  const summaryRows: CsvRow[] = [];
  const histogramRows: CsvRow[] = [];

  for (const model of MODELS) {
    console.log(`${model}: precomputing ${EPISODES} × ${MAX_MAPS} maps`);
    const maps = precomputeMapOrders(
      SEED,
      model,
      0,
      EPISODES,
      MAX_MAPS,
    );
    const simulateS01 = createEpisodeSimulator({
      masterSeed: SEED,
      model,
      strategy: optimizedThresholdStrategy,
      targetFragments: TARGET,
      maxResets: MAX_RESETS,
      mapOrderProvider: maps.provider,
    });
    const oracleCosts = new IntegerMetric();
    const s01Costs = new IntegerMetric();
    const pairedGap = new IntegerMetric();

    for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
      const oracleCost = clairvoyantMinimumCost(
        episodeIndex,
        model,
        maps.provider,
      );
      const s01Cost = simulateS01(episodeIndex).cost;
      if (oracleCost > s01Cost) {
        throw new Error(
          `Oracle invariant failed at ${model}/${episodeIndex}: ${oracleCost} > ${s01Cost}.`,
        );
      }
      oracleCosts.add(oracleCost);
      s01Costs.add(s01Cost);
      pairedGap.add(s01Cost - oracleCost);
    }

    for (const [strategyId, metric] of [
      ["clairvoyant_oracle", oracleCosts],
      ["optimized_threshold_v1", s01Costs],
    ] as const) {
      summaryRows.push({
        modelId: model,
        strategyId,
        episodes: metric.count,
        meanCost: metric.mean,
        varianceCost: metric.variance,
        standardDeviationCost: metric.standardDeviation,
        standardErrorCost: metric.standardError,
        ci95LowCost: metric.mean - CI95_Z * metric.standardError,
        ci95HighCost: metric.mean + CI95_Z * metric.standardError,
        minimumCost: metric.min,
        p05Cost: metric.quantile(0.05),
        p25Cost: metric.quantile(0.25),
        p50Cost: metric.quantile(0.5),
        p75Cost: metric.quantile(0.75),
        p90Cost: metric.quantile(0.9),
        p95Cost: metric.quantile(0.95),
        p99Cost: metric.quantile(0.99),
        maximumCost: metric.max,
        probabilityCompleteBy120: metric.probabilityAtMost(120),
        probabilityCompleteBy125: metric.probabilityAtMost(125),
        probabilityCompleteBy130: metric.probabilityAtMost(130),
        probabilityCompleteBy140: metric.probabilityAtMost(140),
        probabilityCompleteBy150: metric.probabilityAtMost(150),
      });
      for (const [cost, count] of [...metric.histogram.entries()].sort(
        ([left], [right]) => left - right,
      )) {
        histogramRows.push({
          modelId: model,
          strategyId,
          cost,
          count,
          probability: count / metric.count,
        });
      }
    }
    summaryRows.push({
      modelId: model,
      strategyId: "paired_s01_minus_oracle",
      episodes: pairedGap.count,
      meanCost: pairedGap.mean,
      varianceCost: pairedGap.variance,
      standardDeviationCost: pairedGap.standardDeviation,
      standardErrorCost: pairedGap.standardError,
      ci95LowCost: pairedGap.mean - CI95_Z * pairedGap.standardError,
      ci95HighCost: pairedGap.mean + CI95_Z * pairedGap.standardError,
      minimumCost: pairedGap.min,
      p05Cost: pairedGap.quantile(0.05),
      p25Cost: pairedGap.quantile(0.25),
      p50Cost: pairedGap.quantile(0.5),
      p75Cost: pairedGap.quantile(0.75),
      p90Cost: pairedGap.quantile(0.9),
      p95Cost: pairedGap.quantile(0.95),
      p99Cost: pairedGap.quantile(0.99),
      maximumCost: pairedGap.max,
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
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          runKind: "impossible-information-upper-bound",
          episodesPerModel: EPISODES,
          models: MODELS,
          seed: SEED,
          targetFragments: TARGET,
          maxResets: MAX_RESETS,
          oracleDefinition:
            "Sees all 14 future complete map orders and chooses each discarded prefix length from 1 through 25.",
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
