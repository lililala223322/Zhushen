import type { ModelId } from "../domain/models";
import type {
  EpisodeFailureReason,
  EpisodeResult,
  FragmentValue,
} from "../domain";

const Z_95 = 1.959963984540054;

export interface HistogramEntry {
  readonly value: number;
  readonly count: number;
}

export interface CostResetCell {
  readonly cost: number;
  readonly resets: number;
  readonly count: number;
}

export class IntegerHistogram {
  private readonly counts: number[] = [];
  private countTotal = 0;
  private weightedTotal = 0;
  private minimum = Number.POSITIVE_INFINITY;
  private maximum = Number.NEGATIVE_INFINITY;

  public get size(): number {
    return this.countTotal;
  }

  public get sum(): number {
    return this.weightedTotal;
  }

  public add(value: number, count = 1): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("Histogram values must be non-negative integers.");
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError("Histogram counts must be positive integers.");
    }
    this.counts[value] = (this.counts[value] ?? 0) + count;
    this.countTotal += count;
    this.weightedTotal += value * count;
    if (value < this.minimum) this.minimum = value;
    if (value > this.maximum) this.maximum = value;
  }

  public get(value: number): number {
    return this.counts[value] ?? 0;
  }

  public entries(): HistogramEntry[] {
    if (this.countTotal === 0) return [];
    const entries: HistogramEntry[] = [];
    for (let value = this.minimum; value <= this.maximum; value += 1) {
      const count = this.counts[value] ?? 0;
      if (count > 0) entries.push({ value, count });
    }
    return entries;
  }

  public min(): number | null {
    return this.countTotal === 0 ? null : this.minimum;
  }

  public max(): number | null {
    return this.countTotal === 0 ? null : this.maximum;
  }

  public mean(): number | null {
    return this.countTotal === 0
      ? null
      : this.weightedTotal / this.countTotal;
  }

  public mode(): number | null {
    if (this.countTotal === 0) return null;
    let mode = this.minimum;
    let largestCount = -1;
    for (let value = this.minimum; value <= this.maximum; value += 1) {
      const count = this.counts[value] ?? 0;
      if (count > largestCount) {
        mode = value;
        largestCount = count;
      }
    }
    return mode;
  }

  /** Empirical nearest-rank quantile. */
  public quantile(probability: number): number | null {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("Quantile probability must be in [0, 1].");
    }
    if (this.countTotal === 0) return null;
    if (probability === 0) return this.minimum;
    const rank = Math.max(1, Math.ceil(probability * this.countTotal));
    let cumulative = 0;
    for (let value = this.minimum; value <= this.maximum; value += 1) {
      cumulative += this.counts[value] ?? 0;
      if (cumulative >= rank) return value;
    }
    return this.maximum;
  }

  /** Exact empirical mean of the worst upper `tailProbability` fraction. */
  public upperTailMean(tailProbability: number): number | null {
    if (
      !Number.isFinite(tailProbability) ||
      tailProbability <= 0 ||
      tailProbability > 1
    ) {
      throw new RangeError("tailProbability must be in (0, 1].");
    }
    if (this.countTotal === 0) return null;
    const wanted = this.countTotal * tailProbability;
    let remaining = wanted;
    let weighted = 0;
    for (
      let value = this.maximum;
      value >= this.minimum && remaining > 0;
      value -= 1
    ) {
      const take = Math.min(this.counts[value] ?? 0, remaining);
      weighted += take * value;
      remaining -= take;
    }
    return weighted / wanted;
  }

  public countLessThan(value: number): number {
    if (this.countTotal === 0 || value <= this.minimum) return 0;
    if (value > this.maximum) return this.countTotal;
    let count = 0;
    for (let cursor = this.minimum; cursor < value; cursor += 1) {
      count += this.counts[cursor] ?? 0;
    }
    return count;
  }

  public countAtMost(value: number): number {
    return this.countLessThan(value + 1);
  }

  public merge(other: IntegerHistogram): void {
    for (const entry of other.entries()) {
      this.add(entry.value, entry.count);
    }
  }
}

export class SignedIntegerHistogram {
  private readonly counts = new Map<number, number>();
  private countTotal = 0;
  private minimum = Number.POSITIVE_INFINITY;
  private maximum = Number.NEGATIVE_INFINITY;

  public get size(): number {
    return this.countTotal;
  }

  public add(value: number, count = 1): void {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("Histogram values must be safe integers.");
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError("Histogram counts must be positive integers.");
    }
    this.counts.set(value, (this.counts.get(value) ?? 0) + count);
    this.countTotal += count;
    if (value < this.minimum) this.minimum = value;
    if (value > this.maximum) this.maximum = value;
  }

  public get(value: number): number {
    return this.counts.get(value) ?? 0;
  }

  public entries(): HistogramEntry[] {
    return [...this.counts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, count]) => ({ value, count }));
  }

  public min(): number | null {
    return this.countTotal === 0 ? null : this.minimum;
  }

  public max(): number | null {
    return this.countTotal === 0 ? null : this.maximum;
  }

  public quantile(probability: number): number | null {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError("Quantile probability must be in [0, 1].");
    }
    if (this.countTotal === 0) return null;
    if (probability === 0) return this.minimum;
    const rank = Math.max(1, Math.ceil(probability * this.countTotal));
    let cumulative = 0;
    for (const { value, count } of this.entries()) {
      cumulative += count;
      if (cumulative >= rank) return value;
    }
    return this.maximum;
  }

  public merge(other: SignedIntegerHistogram): void {
    for (const entry of other.entries()) this.add(entry.value, entry.count);
  }
}

export interface OnlineMomentsSnapshot {
  readonly count: number;
  readonly mean: number | null;
  readonly variance: number | null;
  readonly standardDeviation: number | null;
  readonly standardError: number | null;
  readonly ci95Low: number | null;
  readonly ci95High: number | null;
  readonly skewness: number | null;
  readonly kurtosisExcess: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

/** Pébay/Welford one-pass central moments through order four. */
export class OnlineMoments {
  private n = 0;
  private meanValue = 0;
  private m2 = 0;
  private m3 = 0;
  private m4 = 0;
  private minimum = Number.POSITIVE_INFINITY;
  private maximum = Number.NEGATIVE_INFINITY;

  public get count(): number {
    return this.n;
  }

  public add(value: number): void {
    if (!Number.isFinite(value)) {
      throw new RangeError("Online moment values must be finite.");
    }
    const previousCount = this.n;
    this.n += 1;
    const delta = value - this.meanValue;
    const deltaOverN = delta / this.n;
    const deltaOverNSquared = deltaOverN * deltaOverN;
    const term = delta * deltaOverN * previousCount;

    this.m4 +=
      term *
        deltaOverNSquared *
        (this.n * this.n - 3 * this.n + 3) +
      6 * deltaOverNSquared * this.m2 -
      4 * deltaOverN * this.m3;
    this.m3 +=
      term * deltaOverN * (this.n - 2) - 3 * deltaOverN * this.m2;
    this.m2 += term;
    this.meanValue += deltaOverN;
    if (value < this.minimum) this.minimum = value;
    if (value > this.maximum) this.maximum = value;
  }

  public merge(other: OnlineMoments): void {
    if (other.n === 0) return;
    if (this.n === 0) {
      this.n = other.n;
      this.meanValue = other.meanValue;
      this.m2 = other.m2;
      this.m3 = other.m3;
      this.m4 = other.m4;
      this.minimum = other.minimum;
      this.maximum = other.maximum;
      return;
    }

    const leftN = this.n;
    const rightN = other.n;
    const combinedN = leftN + rightN;
    const delta = other.meanValue - this.meanValue;
    const delta2 = delta * delta;
    const delta3 = delta2 * delta;
    const delta4 = delta3 * delta;
    const leftM2 = this.m2;
    const leftM3 = this.m3;
    const rightM2 = other.m2;
    const rightM3 = other.m3;

    this.m4 =
      this.m4 +
      other.m4 +
      (delta4 *
        leftN *
        rightN *
        (leftN * leftN - leftN * rightN + rightN * rightN)) /
        (combinedN * combinedN * combinedN) +
      (6 * delta2 * (leftN * leftN * rightM2 + rightN * rightN * leftM2)) /
        (combinedN * combinedN) +
      (4 * delta * (leftN * rightM3 - rightN * leftM3)) / combinedN;
    this.m3 =
      leftM3 +
      rightM3 +
      (delta3 * leftN * rightN * (leftN - rightN)) /
        (combinedN * combinedN) +
      (3 * delta * (leftN * rightM2 - rightN * leftM2)) / combinedN;
    this.m2 =
      leftM2 + rightM2 + (delta2 * leftN * rightN) / combinedN;
    this.meanValue =
      (leftN * this.meanValue + rightN * other.meanValue) / combinedN;
    this.n = combinedN;
    this.minimum = Math.min(this.minimum, other.minimum);
    this.maximum = Math.max(this.maximum, other.maximum);
  }

  public snapshot(): OnlineMomentsSnapshot {
    if (this.n === 0) {
      return {
        count: 0,
        mean: null,
        variance: null,
        standardDeviation: null,
        standardError: null,
        ci95Low: null,
        ci95High: null,
        skewness: null,
        kurtosisExcess: null,
        min: null,
        max: null,
      };
    }
    const variance = this.n > 1 ? this.m2 / (this.n - 1) : 0;
    const standardDeviation = Math.sqrt(Math.max(0, variance));
    const standardError = standardDeviation / Math.sqrt(this.n);
    const skewness =
      this.n > 2 && this.m2 > 0
        ? (Math.sqrt(this.n) * this.m3) / this.m2 ** 1.5
        : 0;
    const kurtosisExcess =
      this.n > 3 && this.m2 > 0
        ? (this.n * this.m4) / (this.m2 * this.m2) - 3
        : 0;
    return {
      count: this.n,
      mean: this.meanValue,
      variance,
      standardDeviation,
      standardError,
      ci95Low: this.meanValue - Z_95 * standardError,
      ci95High: this.meanValue + Z_95 * standardError,
      skewness,
      kurtosisExcess,
      min: this.minimum,
      max: this.maximum,
    };
  }
}

export const SUMMARY_QUANTILES = Object.freeze({
  p01: 0.01,
  p05: 0.05,
  p10: 0.1,
  p25: 0.25,
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
});

export type SummaryQuantileKey = keyof typeof SUMMARY_QUANTILES;

export interface StreamingSummary {
  readonly strategyId: string | null;
  readonly model: ModelId | null;
  readonly episodes: number;
  readonly successfulEpisodes: number;
  readonly failedEpisodes: number;
  readonly failureRate: number;
  readonly mean: number | null;
  readonly standardError: number | null;
  readonly ci95Low: number | null;
  readonly ci95High: number | null;
  readonly standardDeviation: number | null;
  readonly variance: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly mode: number | null;
  readonly quantiles: Readonly<Record<SummaryQuantileKey, number | null>>;
  readonly cvar95: number | null;
  readonly cvar99: number | null;
  readonly skewness: number | null;
  readonly kurtosisExcess: number | null;
  readonly averageResets: number | null;
  readonly resetP50: number | null;
  readonly resetP95: number | null;
  readonly averageMaps: number | null;
  readonly averageOverflow: number | null;
  readonly averageFragmentAwards: Readonly<Record<FragmentValue, number | null>>;
  readonly lessThan150Rate: number;
  readonly equalTo150Rate: number;
  readonly greaterThan150Rate: number;
  readonly averageSavingsVs150: number | null;
  readonly averageSavingsPercentVs150: number | null;
}

export interface StreamingStatsSnapshot {
  readonly summary: StreamingSummary;
  readonly costHistogram: readonly HistogramEntry[];
  readonly resetHistogram: readonly HistogramEntry[];
  readonly mapCountHistogram: readonly HistogramEntry[];
  readonly overflowHistogram: readonly HistogramEntry[];
  readonly fragmentAwardHistograms: Readonly<
    Record<FragmentValue, readonly HistogramEntry[]>
  >;
  readonly costResetHeatmap: readonly CostResetCell[];
  readonly failureReasons: Readonly<
    Partial<Record<EpisodeFailureReason, number>>
  >;
}

export class StreamingStats {
  public readonly costHistogram = new IntegerHistogram();
  public readonly resetHistogram = new IntegerHistogram();
  public readonly mapCountHistogram = new IntegerHistogram();
  public readonly overflowHistogram = new IntegerHistogram();
  public readonly fragmentAwardHistograms: Record<
    FragmentValue,
    IntegerHistogram
  > = {
    5: new IntegerHistogram(),
    15: new IntegerHistogram(),
    30: new IntegerHistogram(),
  };

  private readonly costMoments = new OnlineMoments();
  private readonly resetMoments = new OnlineMoments();
  private readonly mapMoments = new OnlineMoments();
  private readonly overflowMoments = new OnlineMoments();
  private readonly fragmentMoments: Record<FragmentValue, OnlineMoments> = {
    5: new OnlineMoments(),
    15: new OnlineMoments(),
    30: new OnlineMoments(),
  };
  private readonly costResetCounts = new Map<string, number>();
  private readonly failureCounts: Partial<Record<EpisodeFailureReason, number>> =
    {};
  private strategyId: string | null = null;
  private model: ModelId | null = null;
  private totalEpisodes = 0;
  private successes = 0;
  private failures = 0;

  public add(result: EpisodeResult): void {
    if (this.strategyId === null) {
      this.strategyId = result.strategyId;
      this.model = result.model;
    } else if (
      this.strategyId !== result.strategyId ||
      this.model !== result.model
    ) {
      throw new Error(
        "A StreamingStats instance may contain only one strategy/model pair.",
      );
    }
    this.totalEpisodes += 1;
    if (!result.success) {
      this.failures += 1;
      if (result.failureReason !== undefined) {
        this.failureCounts[result.failureReason] =
          (this.failureCounts[result.failureReason] ?? 0) + 1;
      }
      return;
    }

    this.successes += 1;
    this.costHistogram.add(result.cost);
    this.resetHistogram.add(result.resetsUsed);
    this.mapCountHistogram.add(result.mapsUsed);
    this.overflowHistogram.add(result.overflow);
    this.costMoments.add(result.cost);
    this.resetMoments.add(result.resetsUsed);
    this.mapMoments.add(result.mapsUsed);
    this.overflowMoments.add(result.overflow);

    for (const value of [5, 15, 30] as const) {
      const count = result.fragmentAwards[value];
      this.fragmentAwardHistograms[value].add(count);
      this.fragmentMoments[value].add(count);
    }
    const heatmapKey = `${result.cost}:${result.resetsUsed}`;
    this.costResetCounts.set(
      heatmapKey,
      (this.costResetCounts.get(heatmapKey) ?? 0) + 1,
    );
  }

  public get episodes(): number {
    return this.totalEpisodes;
  }

  public get successfulEpisodes(): number {
    return this.successes;
  }

  public get failedEpisodes(): number {
    return this.failures;
  }

  /** Combines a disjoint worker/range accumulator without replaying episodes. */
  public merge(other: StreamingStats): void {
    if (other.totalEpisodes === 0) return;
    if (this.totalEpisodes === 0) {
      this.strategyId = other.strategyId;
      this.model = other.model;
    } else if (
      this.strategyId !== other.strategyId ||
      this.model !== other.model
    ) {
      throw new Error(
        "Only accumulators for the same strategy/model pair can be merged.",
      );
    }

    this.totalEpisodes += other.totalEpisodes;
    this.successes += other.successes;
    this.failures += other.failures;
    this.costHistogram.merge(other.costHistogram);
    this.resetHistogram.merge(other.resetHistogram);
    this.mapCountHistogram.merge(other.mapCountHistogram);
    this.overflowHistogram.merge(other.overflowHistogram);
    this.costMoments.merge(other.costMoments);
    this.resetMoments.merge(other.resetMoments);
    this.mapMoments.merge(other.mapMoments);
    this.overflowMoments.merge(other.overflowMoments);
    for (const value of [5, 15, 30] as const) {
      this.fragmentAwardHistograms[value].merge(
        other.fragmentAwardHistograms[value],
      );
      this.fragmentMoments[value].merge(other.fragmentMoments[value]);
    }
    for (const [key, count] of other.costResetCounts) {
      this.costResetCounts.set(
        key,
        (this.costResetCounts.get(key) ?? 0) + count,
      );
    }
    for (const [reason, count] of Object.entries(other.failureCounts) as [
      EpisodeFailureReason,
      number,
    ][]) {
      this.failureCounts[reason] =
        (this.failureCounts[reason] ?? 0) + count;
    }
  }

  public snapshot(): StreamingStatsSnapshot {
    const cost = this.costMoments.snapshot();
    const reset = this.resetMoments.snapshot();
    const maps = this.mapMoments.snapshot();
    const overflow = this.overflowMoments.snapshot();
    const quantiles = Object.fromEntries(
      Object.entries(SUMMARY_QUANTILES).map(([key, probability]) => [
        key,
        this.costHistogram.quantile(probability),
      ]),
    ) as unknown as Record<SummaryQuantileKey, number | null>;
    const denominator = this.successes;
    const lessThan150 = this.costHistogram.countLessThan(150);
    const equalTo150 = this.costHistogram.get(150);
    const greaterThan150 = denominator - lessThan150 - equalTo150;
    const mean = cost.mean;

    const costResetHeatmap = [...this.costResetCounts.entries()]
      .map(([key, count]) => {
        const [costText = "0", resetsText = "0"] = key.split(":");
        return {
          cost: Number(costText),
          resets: Number(resetsText),
          count,
        };
      })
      .sort(
        (left, right) =>
          left.cost - right.cost || left.resets - right.resets,
      );

    return {
      summary: {
        strategyId: this.strategyId,
        model: this.model,
        episodes: this.totalEpisodes,
        successfulEpisodes: this.successes,
        failedEpisodes: this.failures,
        failureRate:
          this.totalEpisodes === 0 ? 0 : this.failures / this.totalEpisodes,
        mean,
        standardError: cost.standardError,
        ci95Low: cost.ci95Low,
        ci95High: cost.ci95High,
        standardDeviation: cost.standardDeviation,
        variance: cost.variance,
        min: this.costHistogram.min(),
        max: this.costHistogram.max(),
        mode: this.costHistogram.mode(),
        quantiles,
        cvar95: this.costHistogram.upperTailMean(0.05),
        cvar99: this.costHistogram.upperTailMean(0.01),
        skewness: cost.skewness,
        kurtosisExcess: cost.kurtosisExcess,
        averageResets: reset.mean,
        resetP50: this.resetHistogram.quantile(0.5),
        resetP95: this.resetHistogram.quantile(0.95),
        averageMaps: maps.mean,
        averageOverflow: overflow.mean,
        averageFragmentAwards: {
          5: this.fragmentMoments[5].snapshot().mean,
          15: this.fragmentMoments[15].snapshot().mean,
          30: this.fragmentMoments[30].snapshot().mean,
        },
        lessThan150Rate: denominator === 0 ? 0 : lessThan150 / denominator,
        equalTo150Rate: denominator === 0 ? 0 : equalTo150 / denominator,
        greaterThan150Rate:
          denominator === 0 ? 0 : greaterThan150 / denominator,
        averageSavingsVs150: mean === null ? null : 150 - mean,
        averageSavingsPercentVs150:
          mean === null ? null : ((150 - mean) / 150) * 100,
      },
      costHistogram: this.costHistogram.entries(),
      resetHistogram: this.resetHistogram.entries(),
      mapCountHistogram: this.mapCountHistogram.entries(),
      overflowHistogram: this.overflowHistogram.entries(),
      fragmentAwardHistograms: {
        5: this.fragmentAwardHistograms[5].entries(),
        15: this.fragmentAwardHistograms[15].entries(),
        30: this.fragmentAwardHistograms[30].entries(),
      },
      costResetHeatmap,
      failureReasons: { ...this.failureCounts },
    };
  }
}

export interface PairedComparisonSnapshot {
  readonly candidateStrategyId: string | null;
  readonly baselineStrategyId: string | null;
  readonly model: ModelId | null;
  readonly pairs: number;
  readonly failedPairs: number;
  readonly meanDifference: number | null;
  readonly standardError: number | null;
  readonly ci95Low: number | null;
  readonly ci95High: number | null;
  readonly medianDifference: number | null;
  readonly p95Difference: number | null;
  readonly marginalP95Difference: number | null;
  readonly candidateWinRate: number;
  readonly tieRate: number;
  readonly candidateLossRate: number;
  readonly averageWinningMargin: number | null;
  readonly averageLosingMargin: number | null;
  readonly maxWinningMargin: number | null;
  readonly maxLosingMargin: number | null;
  readonly candidateAbove150Rate: number;
  readonly candidateBehindByAtLeast5Rate: number;
  readonly candidateSavesAtLeast5Rate: number;
  readonly candidateSavesAtLeast10Rate: number;
  readonly candidateSavesAtLeast20Rate: number;
  readonly differenceHistogram: readonly HistogramEntry[];
}

export class PairedComparison {
  public readonly differenceHistogram = new SignedIntegerHistogram();

  private readonly differences = new OnlineMoments();
  private readonly candidateCosts = new IntegerHistogram();
  private readonly baselineCosts = new IntegerHistogram();
  private candidateStrategyId: string | null = null;
  private baselineStrategyId: string | null = null;
  private model: ModelId | null = null;
  private pairCount = 0;
  private failedPairCount = 0;
  private wins = 0;
  private ties = 0;
  private losses = 0;
  private winningMarginTotal = 0;
  private losingMarginTotal = 0;
  private maxWinningMarginValue = 0;
  private maxLosingMarginValue = 0;
  private candidateAbove150 = 0;
  private candidateBehindByAtLeast5 = 0;
  private savesAtLeast5 = 0;
  private savesAtLeast10 = 0;
  private savesAtLeast20 = 0;

  public add(candidate: EpisodeResult, baseline: EpisodeResult): void {
    if (
      candidate.episodeIndex !== baseline.episodeIndex ||
      candidate.model !== baseline.model
    ) {
      throw new Error(
        "Paired results must share the same episode index and model.",
      );
    }
    if (this.candidateStrategyId === null) {
      this.candidateStrategyId = candidate.strategyId;
      this.baselineStrategyId = baseline.strategyId;
      this.model = candidate.model;
    } else if (
      this.candidateStrategyId !== candidate.strategyId ||
      this.baselineStrategyId !== baseline.strategyId ||
      this.model !== candidate.model
    ) {
      throw new Error(
        "A PairedComparison may contain only one candidate/baseline/model tuple.",
      );
    }
    if (!candidate.success || !baseline.success) {
      this.failedPairCount += 1;
      return;
    }

    this.pairCount += 1;
    const difference = candidate.cost - baseline.cost;
    this.differenceHistogram.add(difference);
    this.differences.add(difference);
    this.candidateCosts.add(candidate.cost);
    this.baselineCosts.add(baseline.cost);

    if (difference < 0) {
      const margin = -difference;
      this.wins += 1;
      this.winningMarginTotal += margin;
      this.maxWinningMarginValue = Math.max(
        this.maxWinningMarginValue,
        margin,
      );
    } else if (difference > 0) {
      this.losses += 1;
      this.losingMarginTotal += difference;
      this.maxLosingMarginValue = Math.max(
        this.maxLosingMarginValue,
        difference,
      );
    } else {
      this.ties += 1;
    }

    if (candidate.cost > 150) this.candidateAbove150 += 1;
    if (difference >= 5) this.candidateBehindByAtLeast5 += 1;
    if (difference <= -5) this.savesAtLeast5 += 1;
    if (difference <= -10) this.savesAtLeast10 += 1;
    if (difference <= -20) this.savesAtLeast20 += 1;
  }

  /** Combines disjoint paired episode ranges. */
  public merge(other: PairedComparison): void {
    if (other.pairCount === 0 && other.failedPairCount === 0) return;
    if (this.pairCount === 0 && this.failedPairCount === 0) {
      this.candidateStrategyId = other.candidateStrategyId;
      this.baselineStrategyId = other.baselineStrategyId;
      this.model = other.model;
    } else if (
      this.candidateStrategyId !== other.candidateStrategyId ||
      this.baselineStrategyId !== other.baselineStrategyId ||
      this.model !== other.model
    ) {
      throw new Error(
        "Only matching candidate/baseline/model comparisons can be merged.",
      );
    }
    this.pairCount += other.pairCount;
    this.failedPairCount += other.failedPairCount;
    this.differenceHistogram.merge(other.differenceHistogram);
    this.differences.merge(other.differences);
    this.candidateCosts.merge(other.candidateCosts);
    this.baselineCosts.merge(other.baselineCosts);
    this.wins += other.wins;
    this.ties += other.ties;
    this.losses += other.losses;
    this.winningMarginTotal += other.winningMarginTotal;
    this.losingMarginTotal += other.losingMarginTotal;
    this.maxWinningMarginValue = Math.max(
      this.maxWinningMarginValue,
      other.maxWinningMarginValue,
    );
    this.maxLosingMarginValue = Math.max(
      this.maxLosingMarginValue,
      other.maxLosingMarginValue,
    );
    this.candidateAbove150 += other.candidateAbove150;
    this.candidateBehindByAtLeast5 += other.candidateBehindByAtLeast5;
    this.savesAtLeast5 += other.savesAtLeast5;
    this.savesAtLeast10 += other.savesAtLeast10;
    this.savesAtLeast20 += other.savesAtLeast20;
  }

  public snapshot(): PairedComparisonSnapshot {
    const moments = this.differences.snapshot();
    const denominator = this.pairCount;
    const rate = (count: number): number =>
      denominator === 0 ? 0 : count / denominator;
    const candidateP95 = this.candidateCosts.quantile(0.95);
    const baselineP95 = this.baselineCosts.quantile(0.95);
    return {
      candidateStrategyId: this.candidateStrategyId,
      baselineStrategyId: this.baselineStrategyId,
      model: this.model,
      pairs: this.pairCount,
      failedPairs: this.failedPairCount,
      meanDifference: moments.mean,
      standardError: moments.standardError,
      ci95Low: moments.ci95Low,
      ci95High: moments.ci95High,
      medianDifference: this.differenceHistogram.quantile(0.5),
      p95Difference: this.differenceHistogram.quantile(0.95),
      marginalP95Difference:
        candidateP95 === null || baselineP95 === null
          ? null
          : candidateP95 - baselineP95,
      candidateWinRate: rate(this.wins),
      tieRate: rate(this.ties),
      candidateLossRate: rate(this.losses),
      averageWinningMargin:
        this.wins === 0 ? null : this.winningMarginTotal / this.wins,
      averageLosingMargin:
        this.losses === 0 ? null : this.losingMarginTotal / this.losses,
      maxWinningMargin:
        this.wins === 0 ? null : this.maxWinningMarginValue,
      maxLosingMargin:
        this.losses === 0 ? null : this.maxLosingMarginValue,
      candidateAbove150Rate: rate(this.candidateAbove150),
      candidateBehindByAtLeast5Rate: rate(
        this.candidateBehindByAtLeast5,
      ),
      candidateSavesAtLeast5Rate: rate(this.savesAtLeast5),
      candidateSavesAtLeast10Rate: rate(this.savesAtLeast10),
      candidateSavesAtLeast20Rate: rate(this.savesAtLeast20),
      differenceHistogram: this.differenceHistogram.entries(),
    };
  }
}
