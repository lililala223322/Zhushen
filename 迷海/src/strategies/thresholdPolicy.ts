import type { FragmentMask } from "../domain/prizePool";
import type { StrategyState } from "../domain/state";
import type { Strategy } from "./types";

export type ThresholdVector = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const INITIAL_THRESHOLDS: ThresholdVector = Object.freeze([
  0, // no bonus fragment
  2, // 5
  5, // 15
  6, // 5 + 15
  13, // 30
  14, // 5 + 30
  18, // 15 + 30
  25, // 5 + 15 + 30
]);

/**
 * Frozen after the M1 training/independent-validation search recorded in
 * results/optimization-v1/optimized-policy.json. Keep these constants in sync
 * with that artifact so the browser and formal runner execute the same policy.
 */
export const OPTIMIZED_THRESHOLDS_V1: ThresholdVector = Object.freeze([
  0, 2, 5, 8, 12, 15, 20, 25,
]);

export type ThresholdInput =
  | readonly number[]
  | Readonly<Partial<Record<FragmentMask, number>>>;

export interface ThresholdBand {
  readonly min: number;
  readonly max: number;
  readonly thresholds: ThresholdInput;
}

export interface ThresholdStrategyOptions {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly thresholds?: ThresholdInput;
  /** First matching band overrides the base thresholds. */
  readonly resetBands?: readonly ThresholdBand[];
  /** Uses targetFragments - totalFragments; applied after resetBands. */
  readonly deficitBands?: readonly ThresholdBand[];
}

export const OPTIMIZED_RESET_BANDS_V1: readonly ThresholdBand[] =
  Object.freeze([
    Object.freeze({
      min: 1,
      max: 2,
      thresholds: Object.freeze([0, 3, 4, 7, 12, 16, 20, 25]),
    }),
    Object.freeze({
      min: 3,
      max: 5,
      thresholds: Object.freeze([0, 2, 4, 7, 11, 14, 18, 25]),
    }),
    Object.freeze({
      min: 6,
      max: 9,
      thresholds: Object.freeze([0, 2, 5, 8, 12, 15, 20, 25]),
    }),
    Object.freeze({
      min: 10,
      max: 13,
      thresholds: Object.freeze([0, 1, 5, 8, 13, 15, 20, 25]),
    }),
  ]);

export const OPTIMIZED_DEFICIT_BANDS_V1: readonly ThresholdBand[] =
  Object.freeze([
    Object.freeze({
      min: 1,
      max: 100,
      thresholds: Object.freeze([0, 1, 4, 7, 11, 14, 19, 25]),
    }),
  ]);

function normalizeThresholds(
  input: ThresholdInput | undefined,
  fallback: ThresholdVector = INITIAL_THRESHOLDS,
): ThresholdVector {
  const values = [...fallback];
  if (input !== undefined) {
    if (Array.isArray(input)) {
      if (input.length !== 8) {
        throw new RangeError("Threshold arrays must contain masks 0 through 7.");
      }
      for (let mask = 0; mask < 8; mask += 1) {
        values[mask] = input[mask] ?? fallback[mask];
      }
    } else {
      for (let mask = 0; mask < 8; mask += 1) {
        const candidate = (input as Readonly<Record<number, number>>)[mask];
        if (candidate !== undefined) {
          values[mask] = candidate;
        }
      }
    }
  }
  for (const threshold of values) {
    if (
      threshold === undefined ||
      !Number.isSafeInteger(threshold) ||
      threshold < 0 ||
      threshold > 25
    ) {
      throw new RangeError("Every threshold must be an integer in [0, 25].");
    }
  }
  return Object.freeze(values) as unknown as ThresholdVector;
}

interface NormalizedThresholdBand {
  readonly min: number;
  readonly max: number;
  readonly thresholds: ThresholdVector;
}

function normalizeBands(
  bands: readonly ThresholdBand[] | undefined,
): readonly NormalizedThresholdBand[] {
  if (bands === undefined) return Object.freeze([]);
  return Object.freeze(
    bands.map((band) => {
      if (
        !Number.isFinite(band.min) ||
        !Number.isFinite(band.max) ||
        band.min > band.max
      ) {
        throw new RangeError("Threshold band bounds must be finite and min <= max.");
      }
      return Object.freeze({
        min: band.min,
        max: band.max,
        thresholds: normalizeThresholds(band.thresholds),
      });
    }),
  );
}

function thresholdsForState(
  state: StrategyState,
  base: ThresholdVector,
  resetBands: readonly NormalizedThresholdBand[],
  deficitBands: readonly NormalizedThresholdBand[],
): ThresholdVector {
  let selected = base;
  const resetBand = resetBands.find(
    (band) =>
      state.resetsRemaining >= band.min && state.resetsRemaining <= band.max,
  );
  if (resetBand !== undefined) selected = resetBand.thresholds;
  const deficit = state.targetFragments - state.totalFragments;
  const deficitBand = deficitBands.find(
    (band) => deficit >= band.min && deficit <= band.max,
  );
  if (deficitBand !== undefined) selected = deficitBand.thresholds;
  return selected;
}

export function createThresholdStrategy(
  options: ThresholdStrategyOptions = {},
): Strategy {
  const thresholds = normalizeThresholds(options.thresholds);
  const resetBands = normalizeBands(options.resetBands);
  const deficitBands = normalizeBands(options.deficitBands);
  const id = options.id ?? "aggressive_threshold";
  return Object.freeze({
    id,
    name: options.name ?? "进取型碎片状态阈值",
    description:
      options.description ??
      "按当前地图已取得的碎片组合及深度阈值请求重置。",
    kind: "threshold",
    definition: Object.freeze({
      type: "threshold",
      thresholds,
      resetBands,
      deficitBands,
    }),
    decide: (state) => {
      const selected = thresholdsForState(
        state,
        thresholds,
        resetBands,
        deficitBands,
      );
      const threshold = selected[state.fragmentMask] ?? 0;
      return threshold > 0 && state.depth <= threshold ? "reset" : "open";
    },
  } satisfies Strategy);
}

export const aggressiveThresholdStrategy = createThresholdStrategy();

export const optimizedThresholdStrategy = createThresholdStrategy({
  id: "optimized_threshold_v1",
  name: "搜索得到的进取阈值策略",
  description:
    "按碎片组合、地图深度、剩余重置分段与近目标缺口分段决定是否请求重置。",
  thresholds: OPTIMIZED_THRESHOLDS_V1,
  resetBands: OPTIMIZED_RESET_BANDS_V1,
  deficitBands: OPTIMIZED_DEFICIT_BANDS_V1,
});
