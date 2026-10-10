/**
 * UI 与模拟 Worker 之间的稳定消息协议。
 *
 * UI 只消费聚合快照，不接收逐局样本；真实 Worker 可以独立演进内部实现，
 * 只需在边界处适配本文件的命令与事件。
 */

export type ModelId = "M1" | "M2" | "M3";

export type RunMode = "exploration" | "validation" | "formal";

export type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "pausing"
  | "paused"
  | "stopping"
  | "stopped"
  | "completed"
  | "error";

export type DataProvenance = "demo" | "live" | "imported";

export interface SimulationConfig {
  modelIds: ModelId[];
  strategyIds: string[];
  targetFragments: number;
  maxResets: number;
  episodesPerCombination: number;
  batchSize: number;
  masterSeed: string;
  workerCount: number;
  runMode: RunMode;
}

export type PercentileKey =
  | "p01"
  | "p05"
  | "p10"
  | "p25"
  | "p50"
  | "p75"
  | "p90"
  | "p95"
  | "p99";

export type Percentiles = Record<PercentileKey, number>;

export interface SummaryStats {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  modelName: string;
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
  minimum: number;
  maximum: number;
  mode: number;
  percentiles: Percentiles;
  cvar95: number;
  cvar99: number;
  skewness: number;
  excessKurtosis: number;
  meanResets: number;
  resetP50: number;
  resetP95: number;
  meanMaps: number;
  meanFragmentOverflow: number;
  belowBaselineRate: number;
  atBaselineRate: number;
  aboveBaselineRate: number;
  meanSavings: number;
  savingsRate: number;
}

export interface HistogramBin {
  value: number;
  count: number;
  probability: number;
}

export interface CostHistogramSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  color?: string;
  bins: HistogramBin[];
}

export interface DistributionPoint {
  cost: number;
  probability: number;
}

export interface DistributionSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  color?: string;
  cdf: DistributionPoint[];
  survival: DistributionPoint[];
}

export interface ConfidencePoint {
  episodes: number;
  mean: number;
  ci95Low: number;
  ci95High: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ConvergenceSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  color?: string;
  points: ConfidencePoint[];
}

export interface CountBin {
  value: number;
  count: number;
  probability: number;
}

export interface ResetHistogramSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  color?: string;
  bins: CountBin[];
}

export interface IntegerHistogramSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  metric: "map-count" | "fragment-overflow";
  color?: string;
  bins: CountBin[];
}

export interface HeatmapCell {
  x: number;
  y: number;
  value: number;
}

export interface CostResetHeatmap {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  costs: number[];
  resetCounts: number[];
  cells: HeatmapCell[];
}

export interface FragmentAcquisitionPoint {
  acquisitionCount: number;
  episodes: number;
  probability: number;
}

export interface FragmentAcquisitionSeries {
  key: string;
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  fragmentValue: 5 | 15 | 30;
  points: FragmentAcquisitionPoint[];
}

export interface PolicyDecisionHeatmap {
  key: string;
  strategyId: string;
  strategyName: string;
  resetBand: string;
  depths: number[];
  fragmentStates: string[];
  cells: Array<{
    depth: number;
    fragmentStateIndex: number;
    resetProbability: number;
  }>;
}

export interface BaselineBenefit {
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  meanSavings: number;
  savingsRate: number;
  winRate: number;
  tieRate: number;
  lossRate: number;
  aboveBaselineRate: number;
}

export interface PairedDifferenceBin {
  difference: number;
  count: number;
  probability: number;
}

export interface PairedComparison {
  key: string;
  candidateStrategyId: string;
  candidateStrategyName: string;
  baselineStrategyId: string;
  baselineStrategyName: string;
  modelId: ModelId;
  pairs: number;
  meanDifference: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  medianDifference: number;
  winRate: number;
  tieRate: number;
  lossRate: number;
  meanWinMargin: number;
  meanLossMargin: number;
  maximumWin: number;
  maximumLoss: number;
  p95Difference: number;
  probabilityAbove150: number;
  probabilityFiveWorse: number;
  probabilityFiveBetter: number;
  probabilityTenBetter: number;
  probabilityTwentyBetter: number;
  histogram: PairedDifferenceBin[];
}

export interface SensitivityMetric {
  strategyId: string;
  strategyName: string;
  modelId: ModelId;
  modelName: string;
  mean: number;
  p95: number;
  p99: number;
  aboveBaselineRate: number;
}

export interface StrategyRuleRow {
  fragmentMask: number;
  fragmentLabel: string;
  maxDepth: number;
  action: "continue" | "consider-reset" | "reset";
  note?: string;
}

export interface StrategyRuleSection {
  title: string;
  description?: string;
  rules: StrategyRuleRow[];
}

export interface StrategyDefinition {
  id: string;
  code?: string;
  name: string;
  shortName: string;
  kind: "baseline" | "aggressive" | "conservative";
  group?: string;
  logic?: string;
  trigger?: string;
  details?: string[];
  summary: string;
  caveat: string;
  rules: StrategyRuleRow[];
  ruleSections?: StrategyRuleSection[];
  guardDescription: string;
}

export interface RunProgress {
  completedEpisodes: number;
  totalEpisodes: number;
  progress: number;
  currentBatch: number;
  totalBatches: number;
  episodesPerSecond: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  activeWorkers: number;
  stageLabel: string;
}

export interface AggregatedSnapshot {
  schemaVersion: 1;
  runId: string;
  sequence: number;
  generatedAt: string;
  provenance: DataProvenance;
  phase: RunPhase;
  config: SimulationConfig;
  progress: RunProgress;
  summaries: SummaryStats[];
  costHistograms: CostHistogramSeries[];
  distributions: DistributionSeries[];
  convergence: ConvergenceSeries[];
  resetHistograms: ResetHistogramSeries[];
  integerHistograms: IntegerHistogramSeries[];
  costResetHeatmaps: CostResetHeatmap[];
  fragmentAcquisitions: FragmentAcquisitionSeries[];
  policyDecisionHeatmaps: PolicyDecisionHeatmap[];
  pairedComparisons: PairedComparison[];
  sensitivity: SensitivityMetric[];
  baselineBenefits: BaselineBenefit[];
  strategyDefinitions: StrategyDefinition[];
  warnings: string[];
}

export type UiToWorkerMessage =
  | {
      type: "start";
      requestId: string;
      config: SimulationConfig;
    }
  | {
      type: "pause";
      requestId: string;
      runId: string;
    }
  | {
      type: "resume";
      requestId: string;
      runId: string;
    }
  | {
      type: "stop";
      requestId: string;
      runId: string;
    }
  | {
      type: "reset";
      requestId: string;
    }
  | {
      type: "export";
      requestId: string;
      runId: string;
      format: "zip" | "json" | "csv";
    };

export type WorkerToUiMessage =
  | {
      type: "ready";
      workerVersion: string;
      workerCount: number;
    }
  | {
      type: "status";
      runId: string;
      phase: RunPhase;
      message?: string;
    }
  | {
      type: "snapshot";
      snapshot: AggregatedSnapshot;
    }
  | {
      type: "complete";
      snapshot: AggregatedSnapshot;
    }
  | {
      type: "export-ready";
      requestId: string;
      runId: string;
      filename: string;
      mimeType: string;
      payload: Uint8Array | string;
    }
  | {
      type: "error";
      requestId?: string;
      runId?: string;
      code: string;
      message: string;
      recoverable: boolean;
      details?: string;
    };

export interface SimulationPort {
  postMessage(message: UiToWorkerMessage): void;
  subscribe(listener: (message: WorkerToUiMessage) => void): () => void;
  terminate?(): void;
}

export function createWorkerPort(worker: Worker): SimulationPort {
  return {
    postMessage(message) {
      worker.postMessage(message);
    },
    subscribe(listener) {
      const handleMessage = (event: MessageEvent<WorkerToUiMessage>) => {
        listener(event.data);
      };
      worker.addEventListener("message", handleMessage);
      return () => worker.removeEventListener("message", handleMessage);
    },
    terminate() {
      worker.terminate();
    },
  };
}

export function isWorkerToUiMessage(value: unknown): value is WorkerToUiMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return (
    type === "ready" ||
    type === "status" ||
    type === "snapshot" ||
    type === "complete" ||
    type === "export-ready" ||
    type === "error"
  );
}
