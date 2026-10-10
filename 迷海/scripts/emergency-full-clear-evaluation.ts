import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { isModelId, type ModelId } from "../src/domain/models";
import type { StrategyState } from "../src/domain/state";
import {
  createFixedHorizonSimulator,
  type FixedHorizonCoreStrategyId,
  type FixedHorizonEmergencyFullClear,
} from "../src/exam/fixedHorizon";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import { EvaluationAccumulator } from "../src/reports/metrics";
import type { SummaryMetrics } from "../src/reports/types";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import {
  aggressiveThresholdStrategy,
  fullClearStrategy,
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  resetOn30Strategy,
  resetOnAllFragmentsStrategy,
  safeCreditWhitelistStrategy,
} from "../src/strategies";
import { createConservativeStrategy } from "../src/strategies/conservative";
import type { Strategy } from "../src/strategies/types";
import {
  integerArgument,
  listArgument,
  parseCliArguments,
  stringArgument,
} from "./lib/cli";
import { precomputeMapOrders, toObservation } from "./lib/evaluation";

const DEFAULT_EPISODES = 10_000;
const DEFAULT_SEED = "mihai-emergency-full-clear-explore-20260723-v1";
const CHECKPOINTS = [120, 130, 140, 150, 160, 180] as const;
const RESET_WARNINGS = [5, 7, 9, 11, 12, 13] as const;
const GUARANTEED_RESET_WARNINGS = [5, 7, 9, 11, 12] as const;
const CONFIRMATION_FIXED_IDS = new Set([
  "full_clear",
  "reset_on_all_fragments",
  "safe_credit_whitelist",
  "S01_off",
  "S01_U11",
  "S01_G150",
  "S01_G150D",
  "S01_G150D_U11",
  "S01_G150D_U12",
  "S05_G150D_U11",
  "R30_off",
  "R30_G150D",
  "R30_G150D_U11",
]);
const CONFIRMATION_TARGET_IDS = new Set([
  "full_clear",
  "reset_on_all_fragments",
  "safe_credit_whitelist",
  "optimized_threshold_v1",
  "optimized_conservative_150",
  "optimized_conservative_150_U11",
  "optimized_conservative_150_U12",
  "reset_on_30",
]);

class IntegerMetric {
  private sum = 0;
  private sumSquares = 0;
  private readonly histogram = new Map<number, number>();
  count = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;

  add(value: number): void {
    this.count += 1;
    this.sum += value;
    this.sumSquares += value * value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.histogram.set(value, (this.histogram.get(value) ?? 0) + 1);
  }

  get mean(): number {
    return this.count === 0 ? Number.NaN : this.sum / this.count;
  }

  get variance(): number {
    if (this.count <= 1) return 0;
    return (
      (this.sumSquares - (this.sum * this.sum) / this.count) /
      (this.count - 1)
    );
  }

  get standardError(): number {
    return Math.sqrt(this.variance / this.count);
  }

  quantile(probability: number): number {
    if (this.count === 0) return Number.NaN;
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
}

interface FixedVariant {
  id: string;
  name: string;
  baseId: FixedHorizonCoreStrategyId;
  emergency?: FixedHorizonEmergencyFullClear;
}

interface FixedVariantAccumulator {
  scores: Map<number, IntegerMetric>;
  resets: Map<number, IntegerMetric>;
  atLeast600: Map<number, number>;
  activations: number;
  activationsBy150: number;
  activationOperation: IntegerMetric;
  activationResetsUsed: IntegerMetric;
}

function makeFixedAccumulator(): FixedVariantAccumulator {
  return {
    scores: new Map(CHECKPOINTS.map((operation) => [operation, new IntegerMetric()])),
    resets: new Map(CHECKPOINTS.map((operation) => [operation, new IntegerMetric()])),
    atLeast600: new Map(CHECKPOINTS.map((operation) => [operation, 0])),
    activations: 0,
    activationsBy150: 0,
    activationOperation: new IntegerMetric(),
    activationResetsUsed: new IntegerMetric(),
  };
}

function fixedVariants(): FixedVariant[] {
  const variants: FixedVariant[] = [
    {
      id: "full_clear",
      name: "全开",
      baseId: "full_clear",
    },
    {
      id: "reset_on_all_fragments",
      name: "集齐三种后重置",
      baseId: "reset_on_all_fragments",
    },
    {
      id: "safe_credit_whitelist",
      name: "150保底安全白名单",
      baseId: "safe_credit_whitelist",
    },
  ];
  const bases: Array<{
    id: FixedHorizonCoreStrategyId;
    code: string;
    name: string;
  }> = [
    {
      id: "optimized_threshold_v1",
      code: "S01",
      name: "S01核心",
    },
    {
      id: "aggressive_threshold",
      code: "S05",
      name: "S05核心",
    },
    {
      id: "reset_on_30",
      code: "R30",
      name: "取得30后重置",
    },
  ];
  for (const base of bases) {
    variants.push({
      id: `${base.code}_off`,
      name: base.name,
      baseId: base.id,
    });
    variants.push({
      id: `${base.code}_G150`,
      name: `${base.name}+150保底信用护栏`,
      baseId: base.id,
      emergency: {
        minimumFragmentsAt: { operations: 150, fragments: 600 },
      },
    });
    variants.push({
      id: `${base.code}_G150D`,
      name: `${base.name}+150动态信用护栏`,
      baseId: base.id,
      emergency: {
        minimumFragmentsAt: {
          operations: 150,
          fragments: 600,
          onUnsafe: "block",
        },
      },
    });
    for (const warning of RESET_WARNINGS) {
      variants.push({
        id: `${base.code}_U${warning}`,
        name: `${base.name}+已重置${warning}次后全开`,
        baseId: base.id,
        emergency: { afterResetsUsed: warning },
      });
    }
    for (const warning of GUARANTEED_RESET_WARNINGS) {
      variants.push({
        id: `${base.code}_G150_U${warning}`,
        name: `${base.name}+150信用护栏+已重置${warning}次后全开`,
        baseId: base.id,
        emergency: {
          afterResetsUsed: warning,
          minimumFragmentsAt: { operations: 150, fragments: 600 },
        },
      });
      variants.push({
        id: `${base.code}_G150D_U${warning}`,
        name: `${base.name}+150动态信用护栏+已重置${warning}次后全开`,
        baseId: base.id,
        emergency: {
          afterResetsUsed: warning,
          minimumFragmentsAt: {
            operations: 150,
            fragments: 600,
            onUnsafe: "block",
          },
        },
      });
    }
  }
  return variants;
}

function createResetWarningWrapper(
  base: Strategy,
  afterResetsUsed: number,
): Strategy {
  return Object.freeze({
    id: `${base.id}_U${afterResetsUsed}`,
    name: `${base.name}+已重置${afterResetsUsed}次后全开`,
    description:
      `沿用“${base.name}”，累计重置达到${afterResetsUsed}次后永久停止提前重置。`,
    kind: "conservative_wrapper",
    definition: Object.freeze({
      type: "emergency_full_clear",
      baseStrategyId: base.id,
      afterResetsUsed,
    }),
    decide: (state: StrategyState) =>
      state.resetsUsed >= afterResetsUsed
        ? "open"
        : base.decide(state),
  });
}

function targetVariants(): Strategy[] {
  const bases = [
    optimizedThresholdStrategy,
    optimizedConservative150Strategy,
    aggressiveThresholdStrategy,
    resetOn30Strategy,
  ];
  return [
    fullClearStrategy,
    resetOnAllFragmentsStrategy,
    safeCreditWhitelistStrategy,
    optimizedThresholdStrategy,
    optimizedConservative150Strategy,
    aggressiveThresholdStrategy,
    createConservativeStrategy(aggressiveThresholdStrategy, 150, {
      id: "conservative_150_experiment",
      name: "S05保守150",
    }),
    resetOn30Strategy,
    ...bases.flatMap((base) =>
      RESET_WARNINGS.map((warning) =>
        createResetWarningWrapper(base, warning),
      ),
    ),
  ];
}

function pairedRows(
  model: ModelId,
  valuesByVariant: Map<string, Int16Array>,
  baselineFor: (variantId: string) => string | undefined,
  valueLabel: string,
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const [variantId, values] of valuesByVariant) {
    const baselineId = baselineFor(variantId);
    if (baselineId === undefined || baselineId === variantId) continue;
    const baseline = valuesByVariant.get(baselineId);
    if (baseline === undefined || baseline.length !== values.length) continue;
    const difference = new IntegerMetric();
    let wins = 0;
    let ties = 0;
    let losses = 0;
    for (let index = 0; index < values.length; index += 1) {
      const delta = (values[index] ?? 0) - (baseline[index] ?? 0);
      difference.add(delta);
      if (delta > 0) wins += 1;
      else if (delta < 0) losses += 1;
      else ties += 1;
    }
    rows.push({
      modelId: model,
      variantId,
      baselineId,
      value: valueLabel,
      pairs: difference.count,
      meanDifference: difference.mean,
      standardError: difference.standardError,
      ci95Low: difference.mean - 1.959963984540054 * difference.standardError,
      ci95High: difference.mean + 1.959963984540054 * difference.standardError,
      p05Difference: difference.quantile(0.05),
      p50Difference: difference.quantile(0.5),
      p95Difference: difference.quantile(0.95),
      winRate: wins / difference.count,
      tieRate: ties / difference.count,
      lossRate: losses / difference.count,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const cli = parseCliArguments(process.argv.slice(2));
  const episodes = integerArgument(cli, "episodes", DEFAULT_EPISODES);
  const seed = stringArgument(cli, "seed", DEFAULT_SEED);
  const outputDirectory = resolve(
    stringArgument(
      cli,
      "out",
      `results/emergency-full-clear-${episodes}`,
    ),
  );
  const profile = stringArgument(cli, "profile", "exploration");
  if (profile !== "exploration" && profile !== "confirmation") {
    throw new RangeError('--profile must be "exploration" or "confirmation".');
  }
  const models = listArgument(cli, "models", ["M1", "M2", "M3"]).map(
    (value): ModelId => {
      if (!isModelId(value)) throw new RangeError(`Unknown model ${value}.`);
      return value;
    },
  );
  await mkdir(outputDirectory, { recursive: true });

  const started = performance.now();
  const fixedRows: CsvRow[] = [];
  const fixedPairRows: CsvRow[] = [];
  const targetRows: CsvRow[] = [];
  const targetPairRows: CsvRow[] = [];
  const fixed = fixedVariants().filter(
    (variant) =>
      profile === "exploration" ||
      CONFIRMATION_FIXED_IDS.has(variant.id),
  );
  const target = targetVariants().filter(
    (strategy) =>
      profile === "exploration" ||
      CONFIRMATION_TARGET_IDS.has(strategy.id),
  );

  for (const model of models) {
    console.log(`${model}: precomputing ${episodes.toLocaleString("en-US")} episode maps`);
    const maps = precomputeMapOrders(
      seed,
      model,
      0,
      episodes,
      14,
    );

    const fixedScores150 = new Map<string, Int16Array>();
    for (let variantIndex = 0; variantIndex < fixed.length; variantIndex += 1) {
      const variant = fixed[variantIndex];
      if (variant === undefined) continue;
      const simulate = createFixedHorizonSimulator({
        masterSeed: seed,
        model,
        strategyId: variant.baseId,
        emergencyFullClear: variant.emergency,
        mapOrderProvider: maps.provider,
      });
      const accumulator = makeFixedAccumulator();
      const score150 = new Int16Array(episodes);
      for (let episodeIndex = 0; episodeIndex < episodes; episodeIndex += 1) {
        const result = simulate(episodeIndex);
        for (const operation of CHECKPOINTS) {
          const point = result.checkpoints[operation - 80];
          if (point === undefined) {
            throw new Error(`Missing fixed checkpoint ${operation}.`);
          }
          accumulator.scores.get(operation)?.add(point.totalFragments);
          accumulator.resets.get(operation)?.add(point.resetsUsed);
          if (point.totalFragments >= 600) {
            accumulator.atLeast600.set(
              operation,
              (accumulator.atLeast600.get(operation) ?? 0) + 1,
            );
          }
          if (operation === 150) {
            score150[episodeIndex] = point.totalFragments;
          }
        }
        if (result.emergencyFullClear.activated) {
          accumulator.activations += 1;
          const operation = result.emergencyFullClear.operation;
          const resetsUsed = result.emergencyFullClear.resetsUsed;
          if (operation !== null) {
            accumulator.activationOperation.add(operation);
            if (operation <= 150) accumulator.activationsBy150 += 1;
          }
          if (resetsUsed !== null) {
            accumulator.activationResetsUsed.add(resetsUsed);
          }
        }
      }
      fixedScores150.set(variant.id, score150);
      for (const operation of CHECKPOINTS) {
        const scores = accumulator.scores.get(operation);
        const resets = accumulator.resets.get(operation);
        if (scores === undefined || resets === undefined) continue;
        fixedRows.push({
          modelId: model,
          variantId: variant.id,
          variantName: variant.name,
          baseId: variant.baseId,
          emergencyRule: JSON.stringify(variant.emergency ?? null),
          operations: operation,
          episodes,
          meanFragments: scores.mean,
          varianceFragments: scores.variance,
          standardDeviationFragments: Math.sqrt(scores.variance),
          standardErrorFragments: scores.standardError,
          ci95LowFragments:
            scores.mean - 1.959963984540054 * scores.standardError,
          ci95HighFragments:
            scores.mean + 1.959963984540054 * scores.standardError,
          minimumFragments: scores.min,
          p05Fragments: scores.quantile(0.05),
          p50Fragments: scores.quantile(0.5),
          p95Fragments: scores.quantile(0.95),
          maximumFragments: scores.max,
          probabilityAtLeast600:
            (accumulator.atLeast600.get(operation) ?? 0) / episodes,
          meanResets: resets.mean,
          resetP50: resets.quantile(0.5),
          resetP95: resets.quantile(0.95),
          emergencyActivationRate: accumulator.activations / episodes,
          emergencyActivationBy150Rate:
            accumulator.activationsBy150 / episodes,
          emergencyOperationP10:
            accumulator.activationOperation.count === 0
              ? null
              : accumulator.activationOperation.quantile(0.1),
          emergencyOperationP50:
            accumulator.activationOperation.count === 0
              ? null
              : accumulator.activationOperation.quantile(0.5),
          emergencyOperationP90:
            accumulator.activationOperation.count === 0
              ? null
              : accumulator.activationOperation.quantile(0.9),
          emergencyResetsUsedMean:
            accumulator.activationResetsUsed.count === 0
              ? null
              : accumulator.activationResetsUsed.mean,
        });
      }
      console.log(
        `${model}: fixed ${variantIndex + 1}/${fixed.length} ${variant.id}`,
      );
    }
    fixedPairRows.push(
      ...pairedRows(
        model,
        fixedScores150,
        (variantId) => {
          if (variantId.startsWith("S01_")) return "S01_off";
          if (variantId.startsWith("S05_")) return "S05_off";
          if (variantId.startsWith("R30_")) return "R30_off";
          return "S01_off";
        },
        "fragments_at_150",
      ),
    );

    const targetCosts = new Map<string, Int16Array>();
    for (let strategyIndex = 0; strategyIndex < target.length; strategyIndex += 1) {
      const strategy = target[strategyIndex];
      if (strategy === undefined) continue;
      const simulate = createEpisodeSimulator({
        masterSeed: seed,
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
      const costs = new Int16Array(episodes);
      for (let episodeIndex = 0; episodeIndex < episodes; episodeIndex += 1) {
        const result = simulate(episodeIndex);
        accumulator.add(toObservation(result));
        costs[episodeIndex] = result.cost;
      }
      targetCosts.set(strategy.id, costs);
      const summary: SummaryMetrics = accumulator.summary();
      targetRows.push({
        ...summary,
        fragmentAverages: JSON.stringify(summary.fragmentAverages),
        lowCostFragmentAverages: JSON.stringify(
          summary.lowCostFragmentAverages,
        ),
      });
      console.log(
        `${model}: target ${strategyIndex + 1}/${target.length} ${strategy.id}`,
      );
    }
    targetPairRows.push(
      ...pairedRows(
        model,
        targetCosts,
        (variantId) => {
          if (variantId.startsWith("optimized_threshold_v1_U")) {
            return "optimized_threshold_v1";
          }
          if (variantId.startsWith("optimized_conservative_150_U")) {
            return "optimized_conservative_150";
          }
          if (variantId.startsWith("aggressive_threshold_U")) {
            return "aggressive_threshold";
          }
          if (variantId.startsWith("reset_on_30_U")) {
            return "reset_on_30";
          }
          return "optimized_threshold_v1";
        },
        "cost_to_600",
      ),
    );
  }

  const elapsedMilliseconds = performance.now() - started;
  const metadata = {
    generatedAt: new Date().toISOString(),
    seed,
    profile,
    episodesPerCombination: episodes,
    models,
    fixedVariants: fixed,
    targetStrategies: target.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      definition: strategy.definition,
    })),
    elapsedMilliseconds,
  };
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "fixed-summary.csv"),
      rowsToCsv(fixedRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "fixed-paired-at-150.csv"),
      rowsToCsv(fixedPairRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "target-summary.csv"),
      rowsToCsv(targetRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "target-paired.csv"),
      rowsToCsv(targetPairRows),
      "utf8",
    ),
  ]);
  console.log(
    `Completed in ${(elapsedMilliseconds / 1_000).toFixed(1)}s: ${outputDirectory}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
