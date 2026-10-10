import {
  IntegerHistogram,
  OnlineMoments,
  SignedIntegerHistogram,
} from "../simulation";
import type { ModelId } from "../domain";
import type {
  FixedHorizonCheckpoint,
  FixedHorizonEpisodeResult,
} from "./fixedHorizon";
import type {
  ExamCurvePoint,
  ExamPairedPoint,
  ExamQuantiles,
  ExamResetConditionCell,
  ExamStrategySeries,
} from "./types";

const QUANTILES = {
  p05: 0.05,
  p25: 0.25,
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
} as const;

interface CheckpointAccumulator {
  readonly operations: number;
  readonly fragments: OnlineMoments;
  readonly fragmentHistogram: IntegerHistogram;
  readonly resets: OnlineMoments;
  readonly resetHistogram: IntegerHistogram;
  readonly strategicResets: OnlineMoments;
  readonly mapExhaustionResets: OnlineMoments;
  readonly resetRequests: OnlineMoments;
  readonly maps: OnlineMoments;
  readonly currentMapDepth: OnlineMoments;
  readonly guardBlockedResets: OnlineMoments;
  readonly fragment5Awards: OnlineMoments;
  readonly fragment15Awards: OnlineMoments;
  readonly fragment30Awards: OnlineMoments;
  readonly fragmentsByReset: OnlineMoments[];
  atLeast600: number;
  guardBlockedEpisodes: number;
  shortfallTotal: number;
  overflowTotal: number;
  correlationCount: number;
  fragmentTotal: number;
  resetTotal: number;
  fragmentSquaredTotal: number;
  resetSquaredTotal: number;
  fragmentResetProductTotal: number;
}

function createCheckpointAccumulator(
  operations: number,
  maxResets: number,
): CheckpointAccumulator {
  return {
    operations,
    fragments: new OnlineMoments(),
    fragmentHistogram: new IntegerHistogram(),
    resets: new OnlineMoments(),
    resetHistogram: new IntegerHistogram(),
    strategicResets: new OnlineMoments(),
    mapExhaustionResets: new OnlineMoments(),
    resetRequests: new OnlineMoments(),
    maps: new OnlineMoments(),
    currentMapDepth: new OnlineMoments(),
    guardBlockedResets: new OnlineMoments(),
    fragment5Awards: new OnlineMoments(),
    fragment15Awards: new OnlineMoments(),
    fragment30Awards: new OnlineMoments(),
    fragmentsByReset: Array.from(
      { length: maxResets + 1 },
      () => new OnlineMoments(),
    ),
    atLeast600: 0,
    guardBlockedEpisodes: 0,
    shortfallTotal: 0,
    overflowTotal: 0,
    correlationCount: 0,
    fragmentTotal: 0,
    resetTotal: 0,
    fragmentSquaredTotal: 0,
    resetSquaredTotal: 0,
    fragmentResetProductTotal: 0,
  };
}

function required(value: number | null, label: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`定长考试统计缺少 ${label}。`);
  }
  return value;
}

function quantiles(histogram: IntegerHistogram): ExamQuantiles {
  return Object.fromEntries(
    Object.entries(QUANTILES).map(([key, probability]) => [
      key,
      required(histogram.quantile(probability), key),
    ]),
  ) as unknown as ExamQuantiles;
}

function addCheckpoint(
  accumulator: CheckpointAccumulator,
  checkpoint: FixedHorizonCheckpoint,
): void {
  accumulator.fragments.add(checkpoint.totalFragments);
  accumulator.fragmentHistogram.add(checkpoint.totalFragments);
  accumulator.resets.add(checkpoint.resetsUsed);
  accumulator.resetHistogram.add(checkpoint.resetsUsed);
  accumulator.strategicResets.add(checkpoint.strategicResetsUsed);
  accumulator.mapExhaustionResets.add(checkpoint.mapExhaustionResetsUsed);
  accumulator.resetRequests.add(checkpoint.resetRequests);
  accumulator.maps.add(checkpoint.mapsUsed);
  accumulator.currentMapDepth.add(checkpoint.currentMapDepth);
  accumulator.guardBlockedResets.add(checkpoint.guardBlockedResets);
  accumulator.fragment5Awards.add(checkpoint.fragmentAwards[5]);
  accumulator.fragment15Awards.add(checkpoint.fragmentAwards[15]);
  accumulator.fragment30Awards.add(checkpoint.fragmentAwards[30]);
  accumulator.fragmentsByReset[checkpoint.resetsUsed]?.add(
    checkpoint.totalFragments,
  );
  accumulator.correlationCount += 1;
  accumulator.fragmentTotal += checkpoint.totalFragments;
  accumulator.resetTotal += checkpoint.resetsUsed;
  accumulator.fragmentSquaredTotal +=
    checkpoint.totalFragments * checkpoint.totalFragments;
  accumulator.resetSquaredTotal += checkpoint.resetsUsed * checkpoint.resetsUsed;
  accumulator.fragmentResetProductTotal +=
    checkpoint.totalFragments * checkpoint.resetsUsed;
  if (checkpoint.guardBlockedResets > 0) {
    accumulator.guardBlockedEpisodes += 1;
  }
  if (checkpoint.totalFragments >= 600) {
    accumulator.atLeast600 += 1;
    accumulator.overflowTotal += checkpoint.totalFragments - 600;
  } else {
    accumulator.shortfallTotal += 600 - checkpoint.totalFragments;
  }
}

function correlation(accumulator: CheckpointAccumulator): number | null {
  const count = accumulator.correlationCount;
  if (count < 2) return null;
  const covarianceNumerator =
    count * accumulator.fragmentResetProductTotal -
    accumulator.fragmentTotal * accumulator.resetTotal;
  const fragmentVarianceNumerator =
    count * accumulator.fragmentSquaredTotal -
    accumulator.fragmentTotal * accumulator.fragmentTotal;
  const resetVarianceNumerator =
    count * accumulator.resetSquaredTotal -
    accumulator.resetTotal * accumulator.resetTotal;
  const denominator = Math.sqrt(
    fragmentVarianceNumerator * resetVarianceNumerator,
  );
  return denominator > 0 ? covarianceNumerator / denominator : null;
}

export interface ExamFragmentHistogramRow {
  modelId: ModelId;
  strategyId: string;
  coreStrategyId: string;
  operations: number;
  fragments: number;
  count: number;
  probability: number;
  cumulativeProbability: number;
}

export interface ExamResetDistributionRow {
  modelId: ModelId;
  strategyId: string;
  coreStrategyId: string;
  operations: number;
  resetsUsed: number;
  count: number;
  probability: number;
  cumulativeProbability: number;
}

export interface ExamPairDifferenceHistogramRow {
  operations: number;
  fragmentDifference: number;
  count: number;
  probability: number;
  cumulativeProbability: number;
}

export class FixedHorizonExamAccumulator {
  private readonly checkpoints: CheckpointAccumulator[];
  private episodesValue = 0;

  public constructor(
    public readonly modelId: ModelId,
    public readonly strategyId: string,
    public readonly coreStrategyId: string,
    public readonly strategyName: string,
    public readonly color: string,
    checkpointStart: number,
    horizon: number,
    public readonly maxResets: number,
  ) {
    this.checkpoints = Array.from(
      { length: horizon - checkpointStart + 1 },
      (_, index) =>
        createCheckpointAccumulator(checkpointStart + index, maxResets),
    );
  }

  public get episodes(): number {
    return this.episodesValue;
  }

  public add(episode: FixedHorizonEpisodeResult): void {
    if (
      episode.model !== this.modelId ||
      episode.coreStrategyId !== this.coreStrategyId
    ) {
      throw new Error("定长考试结果与累积器组合不匹配。");
    }
    if (episode.checkpoints.length !== this.checkpoints.length) {
      throw new Error("定长考试检查点数量不一致。");
    }
    for (let index = 0; index < this.checkpoints.length; index += 1) {
      const accumulator = this.checkpoints[index];
      const checkpoint = episode.checkpoints[index];
      if (!accumulator || !checkpoint) {
        throw new Error("定长考试检查点缺失。");
      }
      if (checkpoint.operations !== accumulator.operations) {
        throw new Error("定长考试检查点操作数错位。");
      }
      addCheckpoint(accumulator, checkpoint);
    }
    this.episodesValue += 1;
  }

  public curve(): ExamStrategySeries {
    let previousMean: number | null = null;
    const points: ExamCurvePoint[] = this.checkpoints.map((entry) => {
      const fragments = entry.fragments.snapshot();
      const resets = entry.resets.snapshot();
      const maps = entry.maps.snapshot();
      const currentMapDepth = entry.currentMapDepth.snapshot();
      const guardBlocks = entry.guardBlockedResets.snapshot();
      const strategicResets = entry.strategicResets.snapshot();
      const mapExhaustionResets = entry.mapExhaustionResets.snapshot();
      const resetRequests = entry.resetRequests.snapshot();
      const fragment5 = entry.fragment5Awards.snapshot();
      const fragment15 = entry.fragment15Awards.snapshot();
      const fragment30 = entry.fragment30Awards.snapshot();
      const count = fragments.count;
      const meanFragments = required(fragments.mean, "平均碎片");
      const marginalMeanFragments =
        previousMean === null ? null : meanFragments - previousMean;
      previousMean = meanFragments;
      return {
        operations: entry.operations,
        episodes: count,
        meanFragments,
        varianceFragments: required(fragments.variance, "碎片方差"),
        standardDeviationFragments: required(
          fragments.standardDeviation,
          "碎片标准差",
        ),
        skewnessFragments: required(fragments.skewness, "碎片偏度"),
        kurtosisExcessFragments: required(
          fragments.kurtosisExcess,
          "碎片超额峰度",
        ),
        coefficientOfVariationFragments:
          meanFragments === 0
            ? 0
            : required(fragments.standardDeviation, "碎片标准差") /
              meanFragments,
        standardErrorFragments: required(
          fragments.standardError,
          "碎片标准误",
        ),
        ci95LowFragments: required(fragments.ci95Low, "碎片置信区间下界"),
        ci95HighFragments: required(fragments.ci95High, "碎片置信区间上界"),
        minimumFragments: required(fragments.min, "最小碎片"),
        maximumFragments: required(fragments.max, "最大碎片"),
        quantiles: quantiles(entry.fragmentHistogram),
        probabilityAtLeast600: count === 0 ? 0 : entry.atLeast600 / count,
        meanShortfallTo600: count === 0 ? 0 : entry.shortfallTotal / count,
        meanOverflowAbove600: count === 0 ? 0 : entry.overflowTotal / count,
        meanBonusFragments: meanFragments - entry.operations * 2,
        fragmentsPerOperation: meanFragments / entry.operations,
        marginalMeanFragments,
        meanResets: required(resets.mean, "平均重置"),
        varianceResets: required(resets.variance, "重置方差"),
        minimumResets: required(resets.min, "最小重置"),
        maximumResets: required(resets.max, "最大重置"),
        resetP05: required(entry.resetHistogram.quantile(0.05), "重置P05"),
        resetP25: required(entry.resetHistogram.quantile(0.25), "重置P25"),
        resetP50: required(entry.resetHistogram.quantile(0.5), "重置P50"),
        resetP75: required(entry.resetHistogram.quantile(0.75), "重置P75"),
        resetP95: required(entry.resetHistogram.quantile(0.95), "重置P95"),
        probabilityNoResetsUsed:
          count === 0 ? 0 : entry.resetHistogram.get(0) / count,
        probabilityAllResetsUsed:
          count === 0 ? 0 : entry.resetHistogram.get(this.maxResets) / count,
        meanStrategicResets: required(
          strategicResets.mean,
          "平均战略重置",
        ),
        meanMapExhaustionResets: required(
          mapExhaustionResets.mean,
          "平均自然重置",
        ),
        meanResetRequests: required(resetRequests.mean, "平均重置请求"),
        meanMaps: required(maps.mean, "平均地图数"),
        meanCurrentMapDepth: required(currentMapDepth.mean, "平均当前地图深度"),
        meanGuardBlockedResets: required(guardBlocks.mean, "护栏阻止次数"),
        probabilityGuardBlocked:
          count === 0 ? 0 : entry.guardBlockedEpisodes / count,
        fragmentsResetCorrelation: correlation(entry),
        meanFragment5Awards: required(fragment5.mean, "5碎片次数"),
        meanFragment15Awards: required(fragment15.mean, "15碎片次数"),
        meanFragment30Awards: required(fragment30.mean, "30碎片次数"),
      };
    });
    return {
      key: `${this.modelId}:${this.coreStrategyId}`,
      modelId: this.modelId,
      strategyId: this.strategyId,
      coreStrategyId: this.coreStrategyId,
      strategyName: this.strategyName,
      color: this.color,
      episodes: this.episodesValue,
      points,
    };
  }

  public conditionalResetCells(): ExamResetConditionCell[] {
    return this.checkpoints.flatMap((entry) => {
      const checkpointEpisodes = entry.fragments.count;
      return entry.fragmentsByReset.flatMap((moments, resetsUsed) => {
        const snapshot = moments.snapshot();
        if (snapshot.count === 0) return [];
        return [
          {
            modelId: this.modelId,
            strategyId: this.strategyId,
            coreStrategyId: this.coreStrategyId,
            operations: entry.operations,
            resetsUsed,
            episodes: snapshot.count,
            probability:
              checkpointEpisodes === 0 ? 0 : snapshot.count / checkpointEpisodes,
            meanFragments: required(snapshot.mean, "条件平均碎片"),
            varianceFragments: required(snapshot.variance, "条件碎片方差"),
          },
        ];
      });
    });
  }

  public fragmentHistogramRows(): ExamFragmentHistogramRow[] {
    return this.checkpoints.flatMap((entry) => {
      const total = entry.fragmentHistogram.size;
      let cumulative = 0;
      return entry.fragmentHistogram.entries().map(({ value, count }) => {
        cumulative += count;
        return {
          modelId: this.modelId,
          strategyId: this.strategyId,
          coreStrategyId: this.coreStrategyId,
          operations: entry.operations,
          fragments: value,
          count,
          probability: total === 0 ? 0 : count / total,
          cumulativeProbability: total === 0 ? 0 : cumulative / total,
        };
      });
    });
  }

  public resetDistributionRows(): ExamResetDistributionRow[] {
    return this.checkpoints.flatMap((entry) => {
      const total = entry.resetHistogram.size;
      let cumulative = 0;
      return entry.resetHistogram.entries().map(({ value, count }) => {
        cumulative += count;
        return {
          modelId: this.modelId,
          strategyId: this.strategyId,
          coreStrategyId: this.coreStrategyId,
          operations: entry.operations,
          resetsUsed: value,
          count,
          probability: total === 0 ? 0 : count / total,
          cumulativeProbability: total === 0 ? 0 : cumulative / total,
        };
      });
    });
  }
}

interface PairCheckpointAccumulator {
  readonly operations: number;
  readonly differences: OnlineMoments;
  readonly histogram: SignedIntegerHistogram;
  wins: number;
  ties: number;
  losses: number;
}

export class FixedHorizonPairAccumulator {
  private readonly checkpoints: PairCheckpointAccumulator[];

  public constructor(
    checkpointStart: number,
    horizon: number,
  ) {
    this.checkpoints = Array.from(
      { length: horizon - checkpointStart + 1 },
      (_, index) => ({
        operations: checkpointStart + index,
        differences: new OnlineMoments(),
        histogram: new SignedIntegerHistogram(),
        wins: 0,
        ties: 0,
        losses: 0,
      }),
    );
  }

  public add(
    candidate: FixedHorizonEpisodeResult,
    baseline: FixedHorizonEpisodeResult,
  ): void {
    if (candidate.checkpoints.length !== baseline.checkpoints.length) {
      throw new Error("配对定长考试检查点数量不一致。");
    }
    for (let index = 0; index < this.checkpoints.length; index += 1) {
      const accumulator = this.checkpoints[index];
      const candidatePoint = candidate.checkpoints[index];
      const baselinePoint = baseline.checkpoints[index];
      if (!accumulator || !candidatePoint || !baselinePoint) {
        throw new Error("配对定长考试检查点缺失。");
      }
      const difference =
        candidatePoint.totalFragments - baselinePoint.totalFragments;
      accumulator.differences.add(difference);
      accumulator.histogram.add(difference);
      if (difference > 0) accumulator.wins += 1;
      else if (difference < 0) accumulator.losses += 1;
      else accumulator.ties += 1;
    }
  }

  public points(): ExamPairedPoint[] {
    return this.checkpoints.map((entry) => {
      const difference = entry.differences.snapshot();
      const pairs = difference.count;
      return {
        operations: entry.operations,
        pairs,
        meanFragmentDifference: required(difference.mean, "配对平均碎片差"),
        varianceFragmentDifference: required(
          difference.variance,
          "配对碎片差方差",
        ),
        standardDeviationFragmentDifference: required(
          difference.standardDeviation,
          "配对碎片差标准差",
        ),
        standardError: required(difference.standardError, "配对标准误"),
        ci95Low: required(difference.ci95Low, "配对置信区间下界"),
        ci95High: required(difference.ci95High, "配对置信区间上界"),
        minimumFragmentDifference: required(difference.min, "配对碎片差最小值"),
        maximumFragmentDifference: required(difference.max, "配对碎片差最大值"),
        p05FragmentDifference: required(
          entry.histogram.quantile(0.05),
          "配对碎片差P05",
        ),
        p50FragmentDifference: required(
          entry.histogram.quantile(0.5),
          "配对碎片差P50",
        ),
        p95FragmentDifference: required(
          entry.histogram.quantile(0.95),
          "配对碎片差P95",
        ),
        winRate: pairs === 0 ? 0 : entry.wins / pairs,
        tieRate: pairs === 0 ? 0 : entry.ties / pairs,
        lossRate: pairs === 0 ? 0 : entry.losses / pairs,
      };
    });
  }

  public differenceHistogramRows(): ExamPairDifferenceHistogramRow[] {
    return this.checkpoints.flatMap((entry) => {
      const total = entry.histogram.size;
      let cumulative = 0;
      return entry.histogram.entries().map(({ value, count }) => {
        cumulative += count;
        return {
          operations: entry.operations,
          fragmentDifference: value,
          count,
          probability: total === 0 ? 0 : count / total,
          cumulativeProbability: total === 0 ? 0 : cumulative / total,
        };
      });
    });
  }
}
