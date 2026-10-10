import type { ModelId } from "../domain/models";
import type { EpisodeResult } from "../domain/state";
import type { Strategy } from "../strategies/types";
import { generateMapOrderFromHash } from "./mapGenerator";
import { normalizeSeed, type Seed } from "./rng";
import {
  createEpisodeSimulator,
  type EpisodeSeriesConfig,
} from "./simulator";
import {
  PairedComparison,
  StreamingStats,
  type StreamingStatsSnapshot,
} from "./streamingStats";

export const DEFAULT_BATCH_SIZE = 10_000;

export interface SimulationBatchConfig extends EpisodeSeriesConfig {
  readonly startEpisode?: number;
  readonly episodes: number;
}

export interface SimulationRunConfig extends SimulationBatchConfig {
  readonly batchSize?: number;
}

export interface ConvergencePoint {
  readonly completedEpisodes: number;
  readonly successfulEpisodes: number;
  readonly mean: number | null;
  readonly ci95Low: number | null;
  readonly ci95High: number | null;
  readonly p50: number | null;
  readonly p90: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
}

export interface SimulationProgress {
  readonly batchIndex: number;
  readonly completedEpisodes: number;
  readonly totalEpisodes: number;
  readonly startEpisode: number;
  readonly nextEpisode: number;
  readonly latestResult: EpisodeResult;
  readonly statistics: StreamingStatsSnapshot;
  readonly convergence: ConvergencePoint;
}

export interface SimulationRunResult {
  readonly accumulator: StreamingStats;
  readonly statistics: StreamingStatsSnapshot;
  readonly convergence: readonly ConvergencePoint[];
}

export interface PairedEpisodeSeriesConfig {
  readonly masterSeed: Seed;
  readonly model: ModelId;
  readonly candidateStrategy: Strategy;
  readonly baselineStrategy: Strategy;
  readonly targetFragments?: number;
  readonly maxResets?: number;
}

export interface PairedEpisodeResult {
  readonly candidate: EpisodeResult;
  readonly baseline: EpisodeResult;
}

export interface PairedBatchConfig extends PairedEpisodeSeriesConfig {
  readonly startEpisode?: number;
  readonly episodes: number;
}

export interface PairedBatchResult {
  readonly candidateStats: StreamingStats;
  readonly baselineStats: StreamingStats;
  readonly comparison: PairedComparison;
}

function validateBatchRange(
  startEpisode: number,
  episodes: number,
  batchSize?: number,
): void {
  if (!Number.isSafeInteger(startEpisode) || startEpisode < 0) {
    throw new RangeError("startEpisode must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(episodes) || episodes <= 0) {
    throw new RangeError("episodes must be a positive safe integer.");
  }
  if (
    batchSize !== undefined &&
    (!Number.isSafeInteger(batchSize) || batchSize <= 0)
  ) {
    throw new RangeError("batchSize must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(startEpisode + episodes)) {
    throw new RangeError("Episode range exceeds safe integer precision.");
  }
}

export function convergencePointFromSnapshot(
  completedEpisodes: number,
  snapshot: StreamingStatsSnapshot,
): ConvergencePoint {
  return {
    completedEpisodes,
    successfulEpisodes: snapshot.summary.successfulEpisodes,
    mean: snapshot.summary.mean,
    ci95Low: snapshot.summary.ci95Low,
    ci95High: snapshot.summary.ci95High,
    p50: snapshot.summary.quantiles.p50,
    p90: snapshot.summary.quantiles.p90,
    p95: snapshot.summary.quantiles.p95,
    p99: snapshot.summary.quantiles.p99,
  };
}

/**
 * Builds both policies on one latent map cache. It is statistically equivalent
 * to two independent simulateEpisode calls with the same coordinates, but each
 * complete map order is generated at most once per pair.
 */
export function createPairedEpisodeSimulator(
  config: PairedEpisodeSeriesConfig,
): (episodeIndex: number) => PairedEpisodeResult {
  const masterSeedHash = normalizeSeed(config.masterSeed);
  let cachedEpisode = -1;
  let cachedMaps: Uint8Array[] = [];
  const sharedMapProvider = (
    episodeIndex: number,
    mapIndex: number,
    model: ModelId,
  ): Uint8Array => {
    if (episodeIndex !== cachedEpisode) {
      cachedEpisode = episodeIndex;
      cachedMaps = [];
    }
    let order = cachedMaps[mapIndex];
    if (order === undefined) {
      order = generateMapOrderFromHash(
        masterSeedHash,
        episodeIndex,
        mapIndex,
        model,
      );
      cachedMaps[mapIndex] = order;
    }
    return order;
  };
  const common = {
    masterSeed: config.masterSeed,
    model: config.model,
    targetFragments: config.targetFragments,
    maxResets: config.maxResets,
    mapOrderProvider: sharedMapProvider,
  };
  const simulateCandidate = createEpisodeSimulator({
    ...common,
    strategy: config.candidateStrategy,
  });
  const simulateBaseline = createEpisodeSimulator({
    ...common,
    strategy: config.baselineStrategy,
  });
  return (episodeIndex) => ({
    candidate: simulateCandidate(episodeIndex),
    baseline: simulateBaseline(episodeIndex),
  });
}

/**
 * Runs one contiguous range into an optional existing accumulator. This is the
 * primitive a Worker should call for each 10,000-episode chunk.
 */
export function runSimulationBatch(
  config: SimulationBatchConfig,
  accumulator = new StreamingStats(),
): StreamingStats {
  const startEpisode = config.startEpisode ?? 0;
  validateBatchRange(startEpisode, config.episodes);
  const simulate = createEpisodeSimulator(config);
  const endEpisode = startEpisode + config.episodes;
  for (
    let episodeIndex = startEpisode;
    episodeIndex < endEpisode;
    episodeIndex += 1
  ) {
    accumulator.add(simulate(episodeIndex));
  }
  return accumulator;
}

export function runPairedSimulationBatch(
  config: PairedBatchConfig,
  accumulators: PairedBatchResult = {
    candidateStats: new StreamingStats(),
    baselineStats: new StreamingStats(),
    comparison: new PairedComparison(),
  },
): PairedBatchResult {
  const startEpisode = config.startEpisode ?? 0;
  validateBatchRange(startEpisode, config.episodes);
  const simulatePair = createPairedEpisodeSimulator(config);
  const endEpisode = startEpisode + config.episodes;
  for (
    let episodeIndex = startEpisode;
    episodeIndex < endEpisode;
    episodeIndex += 1
  ) {
    const pair = simulatePair(episodeIndex);
    accumulators.candidateStats.add(pair.candidate);
    accumulators.baselineStats.add(pair.baseline);
    accumulators.comparison.add(pair.candidate, pair.baseline);
  }
  return accumulators;
}

/**
 * Convenience synchronous runner. It emits exactly once per full batch and
 * once for a final partial batch, so 25,001 episodes at 10,000 gives 3 updates.
 */
export function runSimulation(
  config: SimulationRunConfig,
  onProgress?: (progress: SimulationProgress) => void,
  accumulator = new StreamingStats(),
): SimulationRunResult {
  const startEpisode = config.startEpisode ?? 0;
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  validateBatchRange(startEpisode, config.episodes, batchSize);
  const simulate = createEpisodeSimulator(config);
  const convergence: ConvergencePoint[] = [];
  let completed = 0;
  let batchIndex = 0;
  let latestResult: EpisodeResult | null = null;

  while (completed < config.episodes) {
    const currentBatchSize = Math.min(batchSize, config.episodes - completed);
    for (let offset = 0; offset < currentBatchSize; offset += 1) {
      latestResult = simulate(startEpisode + completed + offset);
      accumulator.add(latestResult);
    }
    completed += currentBatchSize;
    batchIndex += 1;
    const statistics = accumulator.snapshot();
    const point = convergencePointFromSnapshot(completed, statistics);
    convergence.push(point);
    if (onProgress !== undefined && latestResult !== null) {
      onProgress({
        batchIndex,
        completedEpisodes: completed,
        totalEpisodes: config.episodes,
        startEpisode,
        nextEpisode: startEpisode + completed,
        latestResult,
        statistics,
        convergence: point,
      });
    }
  }

  return {
    accumulator,
    statistics: accumulator.snapshot(),
    convergence,
  };
}
