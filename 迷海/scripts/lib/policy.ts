import { readFile } from "node:fs/promises";
import {
  createThresholdStrategy,
  type ThresholdBand,
  type ThresholdVector,
} from "../../src/strategies/thresholdPolicy";
import type { Strategy } from "../../src/strategies/types";
import type { PolicyDefinition } from "../../src/reports/types";

export const DEFAULT_THRESHOLD_VECTOR: ThresholdVector = [
  0, 2, 5, 6, 13, 14, 18, 25,
];

export interface FrozenThresholdBand {
  min: number;
  max: number;
  thresholds: number[];
}

export interface FrozenThresholdPolicy {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  thresholds: number[];
  resetBands: FrozenThresholdBand[];
  deficitBands: FrozenThresholdBand[];
  search?: {
    trainingSeed: string;
    validationSeed: string;
    trainingEpisodes: number;
    validationEpisodes: number;
    generatedAt: string;
    scopeClaim: string;
    trainingMean?: number;
    validationMean?: number;
    validationP95?: number;
    validationP99?: number;
  };
}

function normalizeThresholdVector(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length !== 8) {
    throw new Error(`${label} must be an array with masks 0 through 7.`);
  }
  return value.map((threshold, mask) => {
    if (
      typeof threshold !== "number" ||
      !Number.isSafeInteger(threshold) ||
      threshold < 0 ||
      threshold > 25
    ) {
      throw new Error(`${label}[${mask}] must be an integer in [0, 25].`);
    }
    return threshold;
  });
}

function normalizeBands(value: unknown, label: string): FrozenThresholdBand[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((candidate, index) => {
    if (candidate === null || typeof candidate !== "object") {
      throw new Error(`${label}[${index}] must be an object.`);
    }
    const band = candidate as Record<string, unknown>;
    if (
      typeof band.min !== "number" ||
      typeof band.max !== "number" ||
      !Number.isFinite(band.min) ||
      !Number.isFinite(band.max) ||
      band.min > band.max
    ) {
      throw new Error(`${label}[${index}] has invalid min/max bounds.`);
    }
    return {
      min: band.min,
      max: band.max,
      thresholds: normalizeThresholdVector(
        band.thresholds,
        `${label}[${index}].thresholds`,
      ),
    };
  });
}

export function validateFrozenPolicy(value: unknown): FrozenThresholdPolicy {
  if (value === null || typeof value !== "object") {
    throw new Error("Policy definition must be an object.");
  }
  const policy = value as Record<string, unknown>;
  if (policy.schemaVersion !== 1) throw new Error("Unsupported policy schemaVersion.");
  for (const field of ["id", "name", "description"] as const) {
    if (typeof policy[field] !== "string" || policy[field].length === 0) {
      throw new Error(`Policy ${field} must be a non-empty string.`);
    }
  }
  return {
    schemaVersion: 1,
    id: policy.id as string,
    name: policy.name as string,
    description: policy.description as string,
    thresholds: normalizeThresholdVector(policy.thresholds, "thresholds"),
    resetBands: normalizeBands(policy.resetBands ?? [], "resetBands"),
    deficitBands: normalizeBands(policy.deficitBands ?? [], "deficitBands"),
    ...(policy.search === undefined
      ? {}
      : { search: policy.search as FrozenThresholdPolicy["search"] }),
  };
}

export async function loadFrozenPolicy(path: string): Promise<FrozenThresholdPolicy> {
  return validateFrozenPolicy(JSON.parse(await readFile(path, "utf8")));
}

function toThresholdBands(bands: readonly FrozenThresholdBand[]): ThresholdBand[] {
  return bands.map((band) => ({
    min: band.min,
    max: band.max,
    thresholds: band.thresholds,
  }));
}

export function createStrategyFromFrozenPolicy(
  policy: FrozenThresholdPolicy,
): Strategy {
  return createThresholdStrategy({
    id: policy.id,
    name: policy.name,
    description: policy.description,
    thresholds: policy.thresholds,
    resetBands: toThresholdBands(policy.resetBands),
    deficitBands: toThresholdBands(policy.deficitBands),
  });
}

function readableThresholds(thresholds: readonly number[]): string {
  const labels = [
    "无额外碎片",
    "仅5",
    "仅15",
    "5+15",
    "仅30",
    "5+30",
    "15+30",
    "5+15+30",
  ];
  return thresholds
    .map((threshold, mask) => `${labels[mask] ?? `mask${mask}`}≤${threshold}格`)
    .join("；");
}

export function frozenPolicyToReportDefinition(
  policy: FrozenThresholdPolicy,
): PolicyDefinition {
  const bands: string[] = [];
  for (const band of policy.resetBands) {
    bands.push(
      `剩余重置${band.min}–${band.max}次：${readableThresholds(band.thresholds)}`,
    );
  }
  for (const band of policy.deficitBands) {
    bands.push(
      `距目标${band.min}–${band.max}碎片：${readableThresholds(band.thresholds)}`,
    );
  }
  const base = `基础阈值：${readableThresholds(policy.thresholds)}`;
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    kind: "threshold",
    parameters: {
      thresholds: policy.thresholds,
      resetBands: policy.resetBands,
      deficitBands: policy.deficitBands,
      search: policy.search,
    },
    playerRule: `${base}${bands.length > 0 ? `。分段覆盖：${bands.join("；")}` : ""}。当前组合的深度不超过阈值时请求重置，否则继续；可完成性护栏拥有最终决定权。`,
  };
}

export function strategyToReportDefinition(strategy: Strategy): PolicyDefinition {
  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description,
    kind: strategy.kind,
    parameters: strategy.definition,
    playerRule:
      strategy.kind === "full_clear"
        ? "每张地图全部打开；未达600时进入下一张。"
        : `${strategy.description} 所有重置请求仍受可完成性护栏限制。`,
  };
}
