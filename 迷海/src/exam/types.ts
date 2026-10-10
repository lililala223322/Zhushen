import type { ModelId } from "../domain";

export const FIXED_EXAM_HORIZON = 180;
export const FIXED_EXAM_CHECKPOINT_START = 80;
export const FIXED_EXAM_MAX_RESETS = 13;

export type ExamPhase =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "completed"
  | "error";

export interface FixedHorizonExamConfig {
  modelIds: ModelId[];
  strategyIds: string[];
  episodesPerCombination: number;
  batchSize: number;
  masterSeed: string;
  horizon: number;
  checkpointStart: number;
  maxResets: number;
}

export interface FixedHorizonCheckpoint {
  operations: number;
  fragments: number;
  resetsUsed: number;
  mapsUsed: number;
  guardBlockedResets: number;
  fragment5Awards: number;
  fragment15Awards: number;
  fragment30Awards: number;
}

export interface FixedHorizonEpisode {
  episodeIndex: number;
  modelId: ModelId;
  strategyId: string;
  coreStrategyId: string;
  checkpoints: FixedHorizonCheckpoint[];
}

export interface ExamQuantiles {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ExamCurvePoint {
  operations: number;
  episodes: number;
  meanFragments: number;
  varianceFragments: number;
  standardDeviationFragments: number;
  skewnessFragments: number;
  kurtosisExcessFragments: number;
  coefficientOfVariationFragments: number;
  standardErrorFragments: number;
  ci95LowFragments: number;
  ci95HighFragments: number;
  minimumFragments: number;
  maximumFragments: number;
  quantiles: ExamQuantiles;
  probabilityAtLeast600: number;
  meanShortfallTo600: number;
  meanOverflowAbove600: number;
  meanBonusFragments: number;
  fragmentsPerOperation: number;
  marginalMeanFragments: number | null;
  meanResets: number;
  varianceResets: number;
  minimumResets: number;
  maximumResets: number;
  resetP05: number;
  resetP25: number;
  resetP50: number;
  resetP75: number;
  resetP95: number;
  probabilityNoResetsUsed: number;
  probabilityAllResetsUsed: number;
  meanStrategicResets: number;
  meanMapExhaustionResets: number;
  meanResetRequests: number;
  meanMaps: number;
  meanCurrentMapDepth: number;
  meanGuardBlockedResets: number;
  probabilityGuardBlocked: number;
  fragmentsResetCorrelation: number | null;
  meanFragment5Awards: number;
  meanFragment15Awards: number;
  meanFragment30Awards: number;
}

export interface ExamStrategySeries {
  key: string;
  modelId: ModelId;
  strategyId: string;
  coreStrategyId: string;
  strategyName: string;
  color: string;
  episodes: number;
  points: ExamCurvePoint[];
}

export interface ExamResetConditionCell {
  modelId: ModelId;
  strategyId: string;
  coreStrategyId: string;
  operations: number;
  resetsUsed: number;
  episodes: number;
  probability: number;
  meanFragments: number;
  varianceFragments: number;
}

export interface ExamPairedPoint {
  operations: number;
  pairs: number;
  meanFragmentDifference: number;
  varianceFragmentDifference: number;
  standardDeviationFragmentDifference: number;
  standardError: number;
  ci95Low: number;
  ci95High: number;
  minimumFragmentDifference: number;
  maximumFragmentDifference: number;
  p05FragmentDifference: number;
  p50FragmentDifference: number;
  p95FragmentDifference: number;
  winRate: number;
  tieRate: number;
  lossRate: number;
}

export interface ExamPairedSeries {
  key: string;
  modelId: ModelId;
  candidateStrategyId: string;
  candidateStrategyName: string;
  baselineStrategyId: string;
  baselineStrategyName: string;
  points: ExamPairedPoint[];
}

export interface ExamProgress {
  completedEpisodes: number;
  totalEpisodes: number;
  progress: number;
  completedBatches: number;
  totalBatches: number;
  episodesPerSecond: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
}

export interface FixedHorizonExamSnapshot {
  schemaVersion: 1;
  runId: string;
  sequence: number;
  generatedAt: string;
  phase: ExamPhase;
  config: FixedHorizonExamConfig;
  progress: ExamProgress;
  series: ExamStrategySeries[];
  conditionalResetCells: ExamResetConditionCell[];
  pairedSeries: ExamPairedSeries[];
  warnings: string[];
}

export type ExamUiToWorkerMessage =
  | {
      type: "start";
      requestId: string;
      config: FixedHorizonExamConfig;
    }
  | {
      type: "pause" | "resume" | "stop";
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
      format: "json" | "csv" | "zip";
    };

export type ExamWorkerToUiMessage =
  | {
      type: "status";
      runId: string;
      phase: ExamPhase;
      message?: string;
    }
  | {
      type: "snapshot" | "complete";
      snapshot: FixedHorizonExamSnapshot;
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
      message: string;
      recoverable: boolean;
    };
