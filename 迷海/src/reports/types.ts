export type ReportModelId = "M1" | "M2" | "M3";

export interface FragmentAcquisitionCounts {
  5: number;
  15: number;
  30: number;
}

export interface EpisodeObservation {
  cost: number;
  success: boolean;
  resetsUsed: number;
  mapsUsed: number;
  finalFragments: number;
  fragmentAwards: FragmentAcquisitionCounts;
}

export interface HistogramBin {
  value: number;
  count: number;
}

export interface JointHistogramBin {
  x: number;
  y: number;
  count: number;
}

export interface CostHistogramBin extends HistogramBin {
  probability: number;
  cdf: number;
  survival: number;
}

export interface FragmentAverages {
  fragment5: number;
  fragment15: number;
  fragment30: number;
}

export interface LowCostFragmentAverages extends FragmentAverages {
  label: "cost<120" | "cost<130" | "cost<140" | "cost<150";
  episodes: number;
}

export interface SummaryMetrics {
  strategyId: string;
  strategyName: string;
  modelId: ReportModelId;
  episodes: number;
  successes: number;
  failures: number;
  failureRate: number;
  mean: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  standardDeviation: number;
  variance: number;
  min: number;
  max: number;
  mode: number;
  p01: number;
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  cvar95: number;
  cvar99: number;
  skewness: number;
  excessKurtosis: number;
  meanResets: number;
  resetP50: number;
  resetP95: number;
  probabilityAllResetsUsed: number;
  meanMaps: number;
  meanOverflow: number;
  probabilityLt120: number;
  probabilityLt130: number;
  probabilityLt140: number;
  probabilityLt150: number;
  probabilityEq150: number;
  probabilityGt150: number;
  probabilityGt155: number;
  probabilityGt160: number;
  meanSavingsVs150: number;
  meanSavingsPercentVs150: number;
  fragmentAverages: FragmentAverages;
  lowCostFragmentAverages: LowCostFragmentAverages[];
}

export interface ConvergencePoint {
  strategyId: string;
  modelId: ReportModelId;
  episodes: number;
  mean: number;
  ci95Low: number;
  ci95High: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface PairedComparisonMetrics {
  candidateStrategyId: string;
  baselineStrategyId: string;
  modelId: ReportModelId;
  episodes: number;
  meanDifference: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  medianDifference: number;
  p95Difference: number;
  winRate: number;
  tieRate: number;
  lossRate: number;
  meanWinningMargin: number;
  meanLosingMargin: number;
  maxObservedSaving: number;
  maxObservedLoss: number;
  probabilityCostGt150: number;
  probabilityWorseByAtLeast1: number;
  probabilityBetterByAtLeast5: number;
  probabilityBetterByAtLeast10: number;
  probabilityBetterByAtLeast20: number;
}

export interface RunDescriptor {
  strategyId: string;
  strategyName: string;
  modelId: ReportModelId;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  kind?: string;
  parameters?: unknown;
  playerRule?: string;
}

export interface EvaluationMetadata {
  generatedAt: string;
  runKind: "training" | "validation" | "formal-test";
  masterSeed: string;
  prng: string;
  episodesPerStrategyModel: number;
  batchSize: number;
  targetFragments: number;
  maxResets: number;
  models: ReportModelId[];
  strategies: string[];
  applicationVersion?: string;
  gitCommit?: string;
  runtime?: string;
  command?: string;
  elapsedMilliseconds?: number;
}

export interface DecisionReportInput {
  metadata: EvaluationMetadata;
  summaries: SummaryMetrics[];
  comparisons: PairedComparisonMetrics[];
  policies: PolicyDefinition[];
  dataFiles: string[];
}
