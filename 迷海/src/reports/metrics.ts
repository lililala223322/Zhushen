import type {
  ConvergencePoint,
  CostHistogramBin,
  EpisodeObservation,
  FragmentAcquisitionCounts,
  HistogramBin,
  JointHistogramBin,
  PairedComparisonMetrics,
  ReportModelId,
  RunDescriptor,
  SummaryMetrics,
} from "./types";

const CI_95_Z = 1.959963984540054;
const LOW_COST_THRESHOLDS = [120, 130, 140, 150] as const;

function addToHistogram(histogram: Map<number, number>, value: number): void {
  histogram.set(value, (histogram.get(value) ?? 0) + 1);
}

function sortedBins(histogram: ReadonlyMap<number, number>): HistogramBin[] {
  return [...histogram.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ value, count }));
}

function histogramCount(histogram: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const count of histogram.values()) total += count;
  return total;
}

export function quantileFromHistogram(
  histogram: ReadonlyMap<number, number>,
  probability: number,
): number {
  const count = histogramCount(histogram);
  if (count === 0) return Number.NaN;
  const bounded = Math.min(1, Math.max(0, probability));
  const rank = Math.max(1, Math.ceil(bounded * count));
  let cumulative = 0;
  for (const { value, count: binCount } of sortedBins(histogram)) {
    cumulative += binCount;
    if (cumulative >= rank) return value;
  }
  return sortedBins(histogram).at(-1)?.value ?? Number.NaN;
}

export function cvarFromHistogram(
  histogram: ReadonlyMap<number, number>,
  probability: number,
): number {
  const count = histogramCount(histogram);
  if (count === 0) return Number.NaN;
  const tailCount = Math.max(1, Math.ceil(count * (1 - probability)));
  let remaining = tailCount;
  let weightedTotal = 0;
  const bins = sortedBins(histogram);
  for (let index = bins.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const bin = bins[index];
    if (!bin) continue;
    const used = Math.min(remaining, bin.count);
    weightedTotal += used * bin.value;
    remaining -= used;
  }
  return weightedTotal / tailCount;
}

function modeFromHistogram(histogram: ReadonlyMap<number, number>): number {
  let selectedValue = Number.NaN;
  let selectedCount = -1;
  for (const [value, count] of histogram) {
    if (
      count > selectedCount ||
      (count === selectedCount && (Number.isNaN(selectedValue) || value < selectedValue))
    ) {
      selectedValue = value;
      selectedCount = count;
    }
  }
  return selectedValue;
}

function probabilityBelow(histogram: ReadonlyMap<number, number>, threshold: number): number {
  const total = histogramCount(histogram);
  if (total === 0) return Number.NaN;
  let count = 0;
  for (const [value, binCount] of histogram) {
    if (value < threshold) count += binCount;
  }
  return count / total;
}

function probabilityEqual(histogram: ReadonlyMap<number, number>, value: number): number {
  const total = histogramCount(histogram);
  return total === 0 ? Number.NaN : (histogram.get(value) ?? 0) / total;
}

function probabilityAbove(histogram: ReadonlyMap<number, number>, threshold: number): number {
  const total = histogramCount(histogram);
  if (total === 0) return Number.NaN;
  let count = 0;
  for (const [value, binCount] of histogram) {
    if (value > threshold) count += binCount;
  }
  return count / total;
}

class OnlineMoments {
  count = 0;
  mean = 0;
  m2 = 0;
  m3 = 0;
  m4 = 0;

  add(value: number): void {
    const previousCount = this.count;
    this.count += 1;
    const delta = value - this.mean;
    const deltaOverN = delta / this.count;
    const deltaOverNSquared = deltaOverN * deltaOverN;
    const term = delta * deltaOverN * previousCount;
    this.mean += deltaOverN;
    this.m4 +=
      term * deltaOverNSquared * (this.count * this.count - 3 * this.count + 3) +
      6 * deltaOverNSquared * this.m2 -
      4 * deltaOverN * this.m3;
    this.m3 += term * deltaOverN * (this.count - 2) - 3 * deltaOverN * this.m2;
    this.m2 += term;
  }

  get variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }

  get standardDeviation(): number {
    return Math.sqrt(this.variance);
  }

  get standardError(): number {
    return this.count > 0 ? this.standardDeviation / Math.sqrt(this.count) : Number.NaN;
  }

  get skewness(): number {
    if (this.count < 3 || this.m2 === 0) return 0;
    return (Math.sqrt(this.count) * this.m3) / this.m2 ** 1.5;
  }

  get excessKurtosis(): number {
    if (this.count < 4 || this.m2 === 0) return 0;
    return (this.count * this.m4) / (this.m2 * this.m2) - 3;
  }
}

interface FragmentAggregate {
  episodes: number;
  fragment5: number;
  fragment15: number;
  fragment30: number;
}

function emptyFragmentAggregate(): FragmentAggregate {
  return { episodes: 0, fragment5: 0, fragment15: 0, fragment30: 0 };
}

function addFragments(
  aggregate: FragmentAggregate,
  fragments: FragmentAcquisitionCounts,
): void {
  aggregate.episodes += 1;
  aggregate.fragment5 += fragments[5];
  aggregate.fragment15 += fragments[15];
  aggregate.fragment30 += fragments[30];
}

function meanFragments(aggregate: FragmentAggregate) {
  if (aggregate.episodes === 0) {
    return { fragment5: Number.NaN, fragment15: Number.NaN, fragment30: Number.NaN };
  }
  return {
    fragment5: aggregate.fragment5 / aggregate.episodes,
    fragment15: aggregate.fragment15 / aggregate.episodes,
    fragment30: aggregate.fragment30 / aggregate.episodes,
  };
}

export class EvaluationAccumulator {
  readonly descriptor: RunDescriptor;
  readonly targetFragments: number;
  readonly maxResets: number;
  readonly costHistogram = new Map<number, number>();
  readonly resetHistogram = new Map<number, number>();
  readonly mapCountHistogram = new Map<number, number>();
  readonly overflowHistogram = new Map<number, number>();
  readonly fragment5Histogram = new Map<number, number>();
  readonly fragment15Histogram = new Map<number, number>();
  readonly fragment30Histogram = new Map<number, number>();
  readonly costResetHistogram = new Map<string, number>();

  private readonly costMoments = new OnlineMoments();
  private readonly resetMoments = new OnlineMoments();
  private readonly mapMoments = new OnlineMoments();
  private readonly overflowMoments = new OnlineMoments();
  private readonly fragmentAggregate = emptyFragmentAggregate();
  private readonly lowCostFragments = new Map<number, FragmentAggregate>(
    LOW_COST_THRESHOLDS.map((threshold) => [threshold, emptyFragmentAggregate()]),
  );
  private successCount = 0;
  private failureCount = 0;

  constructor(descriptor: RunDescriptor, targetFragments = 600, maxResets = 13) {
    this.descriptor = descriptor;
    this.targetFragments = targetFragments;
    this.maxResets = maxResets;
  }

  add(observation: EpisodeObservation): void {
    if (!Number.isInteger(observation.cost) || observation.cost < 0) {
      throw new Error(`Episode cost must be a non-negative integer; got ${observation.cost}.`);
    }
    if (observation.success) this.successCount += 1;
    else this.failureCount += 1;

    const overflow = observation.finalFragments - this.targetFragments;
    this.costMoments.add(observation.cost);
    this.resetMoments.add(observation.resetsUsed);
    this.mapMoments.add(observation.mapsUsed);
    this.overflowMoments.add(overflow);
    addToHistogram(this.costHistogram, observation.cost);
    addToHistogram(this.resetHistogram, observation.resetsUsed);
    addToHistogram(this.mapCountHistogram, observation.mapsUsed);
    addToHistogram(this.overflowHistogram, overflow);
    addToHistogram(this.fragment5Histogram, observation.fragmentAwards[5]);
    addToHistogram(this.fragment15Histogram, observation.fragmentAwards[15]);
    addToHistogram(this.fragment30Histogram, observation.fragmentAwards[30]);
    const costResetKey = `${observation.cost}:${observation.resetsUsed}`;
    this.costResetHistogram.set(
      costResetKey,
      (this.costResetHistogram.get(costResetKey) ?? 0) + 1,
    );
    addFragments(this.fragmentAggregate, observation.fragmentAwards);
    for (const threshold of LOW_COST_THRESHOLDS) {
      if (observation.cost < threshold) {
        const aggregate = this.lowCostFragments.get(threshold);
        if (aggregate) addFragments(aggregate, observation.fragmentAwards);
      }
    }
  }

  get episodes(): number {
    return this.successCount + this.failureCount;
  }

  summary(): SummaryMetrics {
    const episodes = this.episodes;
    if (episodes === 0) {
      throw new Error("Cannot summarize an empty evaluation.");
    }
    const standardError = this.costMoments.standardError;
    return {
      strategyId: this.descriptor.strategyId,
      strategyName: this.descriptor.strategyName,
      modelId: this.descriptor.modelId,
      episodes,
      successes: this.successCount,
      failures: this.failureCount,
      failureRate: this.failureCount / episodes,
      mean: this.costMoments.mean,
      standardError,
      ci95Low: this.costMoments.mean - CI_95_Z * standardError,
      ci95High: this.costMoments.mean + CI_95_Z * standardError,
      standardDeviation: this.costMoments.standardDeviation,
      variance: this.costMoments.variance,
      min: Math.min(...this.costHistogram.keys()),
      max: Math.max(...this.costHistogram.keys()),
      mode: modeFromHistogram(this.costHistogram),
      p01: quantileFromHistogram(this.costHistogram, 0.01),
      p05: quantileFromHistogram(this.costHistogram, 0.05),
      p10: quantileFromHistogram(this.costHistogram, 0.1),
      p25: quantileFromHistogram(this.costHistogram, 0.25),
      p50: quantileFromHistogram(this.costHistogram, 0.5),
      p75: quantileFromHistogram(this.costHistogram, 0.75),
      p90: quantileFromHistogram(this.costHistogram, 0.9),
      p95: quantileFromHistogram(this.costHistogram, 0.95),
      p99: quantileFromHistogram(this.costHistogram, 0.99),
      cvar95: cvarFromHistogram(this.costHistogram, 0.95),
      cvar99: cvarFromHistogram(this.costHistogram, 0.99),
      skewness: this.costMoments.skewness,
      excessKurtosis: this.costMoments.excessKurtosis,
      meanResets: this.resetMoments.mean,
      resetP50: quantileFromHistogram(this.resetHistogram, 0.5),
      resetP95: quantileFromHistogram(this.resetHistogram, 0.95),
      probabilityAllResetsUsed: (this.resetHistogram.get(this.maxResets) ?? 0) / episodes,
      meanMaps: this.mapMoments.mean,
      meanOverflow: this.overflowMoments.mean,
      probabilityLt120: probabilityBelow(this.costHistogram, 120),
      probabilityLt130: probabilityBelow(this.costHistogram, 130),
      probabilityLt140: probabilityBelow(this.costHistogram, 140),
      probabilityLt150: probabilityBelow(this.costHistogram, 150),
      probabilityEq150: probabilityEqual(this.costHistogram, 150),
      probabilityGt150: probabilityAbove(this.costHistogram, 150),
      probabilityGt155: probabilityAbove(this.costHistogram, 155),
      probabilityGt160: probabilityAbove(this.costHistogram, 160),
      meanSavingsVs150: 150 - this.costMoments.mean,
      meanSavingsPercentVs150: ((150 - this.costMoments.mean) / 150) * 100,
      fragmentAverages: meanFragments(this.fragmentAggregate),
      lowCostFragmentAverages: LOW_COST_THRESHOLDS.map((threshold) => {
        const aggregate = this.lowCostFragments.get(threshold) ?? emptyFragmentAggregate();
        return {
          label: `cost<${threshold}` as const,
          episodes: aggregate.episodes,
          ...meanFragments(aggregate),
        };
      }),
    };
  }

  costBins(): CostHistogramBin[] {
    const total = this.episodes;
    let cumulative = 0;
    return sortedBins(this.costHistogram).map(({ value, count }) => {
      cumulative += count;
      return {
        value,
        count,
        probability: count / total,
        cdf: cumulative / total,
        survival: (total - cumulative) / total,
      };
    });
  }

  resetBins(): HistogramBin[] {
    return sortedBins(this.resetHistogram);
  }

  mapCountBins(): HistogramBin[] {
    return sortedBins(this.mapCountHistogram);
  }

  overflowBins(): HistogramBin[] {
    return sortedBins(this.overflowHistogram);
  }

  fragmentBins(fragment: 5 | 15 | 30): HistogramBin[] {
    if (fragment === 5) return sortedBins(this.fragment5Histogram);
    if (fragment === 15) return sortedBins(this.fragment15Histogram);
    return sortedBins(this.fragment30Histogram);
  }

  costResetBins(): JointHistogramBin[] {
    return [...this.costResetHistogram.entries()]
      .map(([key, count]) => {
        const [xText = "0", yText = "0"] = key.split(":");
        return { x: Number(xText), y: Number(yText), count };
      })
      .sort((left, right) => left.x - right.x || left.y - right.y);
  }

  convergencePoint(): ConvergencePoint {
    const summary = this.summary();
    return {
      strategyId: summary.strategyId,
      modelId: summary.modelId,
      episodes: summary.episodes,
      mean: summary.mean,
      ci95Low: summary.ci95Low,
      ci95High: summary.ci95High,
      p50: summary.p50,
      p90: summary.p90,
      p95: summary.p95,
      p99: summary.p99,
    };
  }
}

export class PairedComparisonAccumulator {
  readonly candidateStrategyId: string;
  readonly baselineStrategyId: string;
  readonly modelId: ReportModelId;
  readonly differenceHistogram = new Map<number, number>();

  private readonly moments = new OnlineMoments();
  private wins = 0;
  private ties = 0;
  private losses = 0;
  private winningMarginTotal = 0;
  private losingMarginTotal = 0;
  private candidateGt150 = 0;
  private worseByAtLeast1 = 0;
  private betterByAtLeast5 = 0;
  private betterByAtLeast10 = 0;
  private betterByAtLeast20 = 0;
  private maxSaving = 0;
  private maxLoss = 0;

  constructor(
    candidateStrategyId: string,
    baselineStrategyId: string,
    modelId: ReportModelId,
  ) {
    this.candidateStrategyId = candidateStrategyId;
    this.baselineStrategyId = baselineStrategyId;
    this.modelId = modelId;
  }

  add(candidateCost: number, baselineCost: number): void {
    const difference = candidateCost - baselineCost;
    this.moments.add(difference);
    addToHistogram(this.differenceHistogram, difference);
    if (difference < 0) {
      this.wins += 1;
      this.winningMarginTotal += -difference;
      this.maxSaving = Math.max(this.maxSaving, -difference);
    } else if (difference > 0) {
      this.losses += 1;
      this.losingMarginTotal += difference;
      this.maxLoss = Math.max(this.maxLoss, difference);
    } else {
      this.ties += 1;
    }
    if (candidateCost > 150) this.candidateGt150 += 1;
    if (difference >= 1) this.worseByAtLeast1 += 1;
    if (difference <= -5) this.betterByAtLeast5 += 1;
    if (difference <= -10) this.betterByAtLeast10 += 1;
    if (difference <= -20) this.betterByAtLeast20 += 1;
  }

  summary(): PairedComparisonMetrics {
    const episodes = this.moments.count;
    if (episodes === 0) throw new Error("Cannot summarize an empty paired comparison.");
    const standardError = this.moments.standardError;
    return {
      candidateStrategyId: this.candidateStrategyId,
      baselineStrategyId: this.baselineStrategyId,
      modelId: this.modelId,
      episodes,
      meanDifference: this.moments.mean,
      standardError,
      ci95Low: this.moments.mean - CI_95_Z * standardError,
      ci95High: this.moments.mean + CI_95_Z * standardError,
      medianDifference: quantileFromHistogram(this.differenceHistogram, 0.5),
      p95Difference: quantileFromHistogram(this.differenceHistogram, 0.95),
      winRate: this.wins / episodes,
      tieRate: this.ties / episodes,
      lossRate: this.losses / episodes,
      meanWinningMargin: this.wins === 0 ? 0 : this.winningMarginTotal / this.wins,
      meanLosingMargin: this.losses === 0 ? 0 : this.losingMarginTotal / this.losses,
      maxObservedSaving: this.maxSaving,
      maxObservedLoss: this.maxLoss,
      probabilityCostGt150: this.candidateGt150 / episodes,
      probabilityWorseByAtLeast1: this.worseByAtLeast1 / episodes,
      probabilityBetterByAtLeast5: this.betterByAtLeast5 / episodes,
      probabilityBetterByAtLeast10: this.betterByAtLeast10 / episodes,
      probabilityBetterByAtLeast20: this.betterByAtLeast20 / episodes,
    };
  }
}
