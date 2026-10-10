import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { type ModelId } from "../src/domain/models";
import {
  createFixedHorizonSimulator,
  type FixedHorizonEmergencyFullClear,
} from "../src/exam/fixedHorizon";
import { rowsToCsv, type CsvRow } from "../src/reports/csv";
import { createEpisodeSimulator } from "../src/simulation/simulator";
import {
  optimizedConservative150Strategy,
  optimizedThresholdStrategy,
  safeCreditWhitelistStrategy,
} from "../src/strategies";
import type { Strategy } from "../src/strategies/types";
import { precomputeMapOrders } from "./lib/evaluation";

const EPISODES = 30_000;
const SEED = "mihai-emergency-full-clear-confirm-20260723-v1";
const MODELS: readonly ModelId[] = ["M1", "M2", "M3"];
const CI95_Z = 1.959963984540054;

class DifferenceMetric {
  count = 0;
  mean = 0;
  m2 = 0;
  wins = 0;
  ties = 0;
  losses = 0;

  add(value: number): void {
    this.count += 1;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (value - this.mean);
    if (value < 0) this.wins += 1;
    else if (value > 0) this.losses += 1;
    else this.ties += 1;
  }

  get variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }

  get standardError(): number {
    return Math.sqrt(this.variance / this.count);
  }

  row(
    modelId: ModelId,
    candidateId: string,
    baselineId: string,
    metric: string,
  ): CsvRow {
    return {
      modelId,
      candidateId,
      baselineId,
      metric,
      pairs: this.count,
      meanDifference: this.mean,
      varianceDifference: this.variance,
      standardError: this.standardError,
      ci95Low: this.mean - CI95_Z * this.standardError,
      ci95High: this.mean + CI95_Z * this.standardError,
      winRate: this.wins / this.count,
      tieRate: this.ties / this.count,
      lossRate: this.losses / this.count,
    };
  }
}

interface FixedCandidate {
  id: string;
  emergency?: FixedHorizonEmergencyFullClear;
}

function resetWarningWrapper(base: Strategy, afterResetsUsed: number): Strategy {
  return {
    id: `${base.id}_U${afterResetsUsed}`,
    name: `${base.name}+重置预警`,
    description: "达到固定重置次数后永久全开。",
    kind: "conservative_wrapper",
    definition: {
      type: "emergency_full_clear",
      baseStrategyId: base.id,
      afterResetsUsed,
    },
    decide: (state) =>
      state.resetsUsed >= afterResetsUsed
        ? "open"
        : base.decide(state),
  };
}

async function main(): Promise<void> {
  const outputDirectory = resolve(
    "results/emergency-warning-paired-confirmation-v2",
  );
  await mkdir(outputDirectory, { recursive: true });
  const started = performance.now();
  const fixedRows: CsvRow[] = [];
  const targetRows: CsvRow[] = [];

  const dynamicGuarantee = {
    minimumFragmentsAt: {
      operations: 150,
      fragments: 600,
      onUnsafe: "block" as const,
    },
  };
  const fixedCandidates: FixedCandidate[] = [
    { id: "S01_off" },
    { id: "S01_G150D", emergency: dynamicGuarantee },
    {
      id: "S01_G150D_U11",
      emergency: { ...dynamicGuarantee, afterResetsUsed: 11 },
    },
    {
      id: "S01_G150D_U12",
      emergency: { ...dynamicGuarantee, afterResetsUsed: 12 },
    },
    {
      id: "safe_credit_whitelist",
    },
  ];
  const fixedPairs = [
    ["S01_G150D_U11", "S01_G150D"],
    ["S01_G150D_U12", "S01_G150D"],
    ["S01_G150D_U11", "S01_off"],
    ["S01_G150D_U11", "safe_credit_whitelist"],
  ] as const;

  const s02U11 = resetWarningWrapper(
    optimizedConservative150Strategy,
    11,
  );
  const s02U12 = resetWarningWrapper(
    optimizedConservative150Strategy,
    12,
  );
  const targetCandidates = [
    optimizedThresholdStrategy,
    optimizedConservative150Strategy,
    s02U11,
    s02U12,
    safeCreditWhitelistStrategy,
  ];
  const targetPairs = [
    [s02U11.id, optimizedConservative150Strategy.id],
    [s02U12.id, optimizedConservative150Strategy.id],
    [s02U11.id, optimizedThresholdStrategy.id],
    [s02U11.id, safeCreditWhitelistStrategy.id],
  ] as const;

  for (const model of MODELS) {
    console.log(`${model}: precomputing maps`);
    const maps = precomputeMapOrders(SEED, model, 0, EPISODES, 14);
    const fixedValues = new Map<string, Int16Array>();
    for (const candidate of fixedCandidates) {
      const simulate = createFixedHorizonSimulator({
        masterSeed: SEED,
        model,
        strategyId:
          candidate.id === "safe_credit_whitelist"
            ? "safe_credit_whitelist"
            : "optimized_threshold_v1",
        emergencyFullClear: candidate.emergency,
        mapOrderProvider: maps.provider,
      });
      const values = new Int16Array(EPISODES);
      for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
        const result = simulate(episodeIndex);
        const point = result.checkpoints[150 - 80];
        if (point === undefined) throw new Error("Missing checkpoint 150.");
        values[episodeIndex] = point.totalFragments;
      }
      fixedValues.set(candidate.id, values);
    }
    for (const [candidateId, baselineId] of fixedPairs) {
      const candidate = fixedValues.get(candidateId);
      const baseline = fixedValues.get(baselineId);
      if (candidate === undefined || baseline === undefined) {
        throw new Error("Missing fixed paired values.");
      }
      const metric = new DifferenceMetric();
      for (let index = 0; index < EPISODES; index += 1) {
        metric.add((candidate[index] ?? 0) - (baseline[index] ?? 0));
      }
      // Positive means the candidate has more fragments.
      fixedRows.push(
        metric.row(model, candidateId, baselineId, "fragments_at_150"),
      );
    }

    const targetValues = new Map<string, Int16Array>();
    for (const strategy of targetCandidates) {
      const simulate = createEpisodeSimulator({
        masterSeed: SEED,
        model,
        strategy,
        targetFragments: 600,
        maxResets: 13,
        mapOrderProvider: maps.provider,
      });
      const values = new Int16Array(EPISODES);
      for (let episodeIndex = 0; episodeIndex < EPISODES; episodeIndex += 1) {
        values[episodeIndex] = simulate(episodeIndex).cost;
      }
      targetValues.set(strategy.id, values);
    }
    for (const [candidateId, baselineId] of targetPairs) {
      const candidate = targetValues.get(candidateId);
      const baseline = targetValues.get(baselineId);
      if (candidate === undefined || baseline === undefined) {
        throw new Error("Missing target paired values.");
      }
      const metric = new DifferenceMetric();
      for (let index = 0; index < EPISODES; index += 1) {
        metric.add((candidate[index] ?? 0) - (baseline[index] ?? 0));
      }
      // Negative means the candidate reaches 600 in fewer operations.
      targetRows.push(
        metric.row(model, candidateId, baselineId, "cost_to_600"),
      );
    }
  }

  const elapsedMilliseconds = performance.now() - started;
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "fixed-pairs.csv"),
      rowsToCsv(fixedRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "target-pairs.csv"),
      rowsToCsv(targetRows),
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "metadata.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          episodesPerModelPair: EPISODES,
          models: MODELS,
          seed: SEED,
          elapsedMilliseconds,
        },
        null,
        2,
      )}\n`,
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
